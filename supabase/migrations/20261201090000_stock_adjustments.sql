-- A user without the permission got NULL (not false) from stock_can_move(), and "if not NULL" does not raise.
-- Return a real boolean so every guard that uses it refuses.
create or replace function app.stock_can_move() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.is_active_member()
      and app.module_enabled(app.company_id(), 'inventory')
      and app.permission_scope('stock.movement.create') = 'company',
    false)
$$;

-- Stock: adjustments. You say what you counted; the system works out the difference against what it thought you had
-- and writes that difference to the ledger with a reason (count, damage, loss, found, other). Same append-only ledger
-- and the same permission as receiving.
-- Fix found while testing decreases: Postgres checks the proposed row of an INSERT ... ON CONFLICT against the
-- qty >= 0 rule before it looks for the existing row, so any negative change failed. Make sure the row exists with
-- zero first, then add the change to it; the rule still stops the total going below zero.
create or replace function app.apply_ledger_line() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stock_balances (company_id, location_id, variant_id, qty)
  values (new.company_id, new.location_id, new.variant_id, 0)
  on conflict (location_id, variant_id) do nothing;
  update public.stock_balances set qty = qty + new.qty_delta, updated_at = now()
  where location_id = new.location_id and variant_id = new.variant_id;
  return new;
end $$;

alter table public.stock_movements
  add column reason text check (reason is null or reason in ('count', 'damage', 'loss', 'found', 'other'));

-- p_lines: [{"variant_id": "...", "counted": 18}]. Each variant may appear once. A line that matches what the system
-- already has is skipped; if nothing changes at all the whole request is refused with no_change.
create function public.adjust_stock(p_request_id uuid, p_location_id uuid, p_reason text, p_note text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  mid uuid;
  line jsonb;
  v uuid;
  q numeric;
  cur numeric;
  seen uuid[] := '{}';
  changed int := 0;
begin
  if not app.stock_can_move() then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into mid from public.stock_movements where company_id = cid and request_id = p_request_id;
  if mid is not null then return mid; end if;
  if p_reason is null or p_reason not in ('count', 'damage', 'loss', 'found', 'other') then raise exception 'reason_invalid' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.locations where company_id = cid and id = p_location_id and is_active) then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'no_lines' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'too_many_lines' using errcode = 'P0001'; end if;

  insert into public.stock_movements (company_id, kind, location_id, reason, note, request_id, created_by)
  values (cid, 'adjust', p_location_id, p_reason, nullif(btrim(p_note), ''), p_request_id, app.membership_id())
  returning id into mid;

  for line in select value from jsonb_array_elements(p_lines) loop
    begin
      v := (line ->> 'variant_id')::uuid;
      q := (line ->> 'counted')::numeric;
    exception when others then
      raise exception 'line_invalid' using errcode = 'P0001';
    end;
    if q is null or q < 0 or q > 1000000000 or v is null or v = any (seen)
       or not exists (select 1 from public.item_variants iv join public.items i on i.id = iv.item_id
                      where iv.company_id = cid and iv.id = v and i.kind = 'stocked') then
      raise exception 'line_invalid' using errcode = 'P0001';
    end if;
    seen := seen || v;
    select qty into cur from public.stock_balances where location_id = p_location_id and variant_id = v for update;
    cur := coalesce(cur, 0);
    if q <> cur then
      insert into public.stock_ledger (company_id, movement_id, location_id, variant_id, qty_delta) values (cid, mid, p_location_id, v, q - cur);
      changed := changed + 1;
    end if;
  end loop;
  if changed = 0 then raise exception 'no_change' using errcode = 'P0001'; end if;
  return mid;
end $$;
revoke all on function public.adjust_stock(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.adjust_stock(uuid, uuid, text, text, jsonb) to authenticated;
