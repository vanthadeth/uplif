-- Stock: transfers between locations, in two steps. The sender sends: the stock leaves the sending location at once and
-- shows as "in transit". The receiver confirms: the stock enters the receiving location, and any shortage is recorded.
-- A sent transfer that has not arrived can be cancelled, which puts the stock back where it came from.
-- Everything goes through the same append-only ledger; nothing here edits stock directly.
create table public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  from_location_id uuid not null,
  to_location_id uuid not null,
  status text not null default 'sent' check (status in ('sent', 'received', 'cancelled')),
  note text check (note is null or length(note) <= 500),
  request_id uuid not null,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  closed_by uuid,
  closed_at timestamptz,
  unique (company_id, id),
  unique (company_id, request_id),
  check (from_location_id <> to_location_id),
  foreign key (company_id, from_location_id) references public.locations (company_id, id),
  foreign key (company_id, to_location_id) references public.locations (company_id, id)
);
create index stock_transfers_company_status on public.stock_transfers (company_id, status, sent_at desc);

create table public.stock_transfer_lines (
  transfer_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  variant_id uuid not null,
  qty_sent numeric(14, 3) not null check (qty_sent > 0),
  qty_received numeric(14, 3) check (qty_received is null or (qty_received >= 0 and qty_received <= qty_sent)),
  primary key (transfer_id, variant_id),
  foreign key (company_id, transfer_id) references public.stock_transfers (company_id, id),
  foreign key (company_id, variant_id) references public.item_variants (company_id, id)
);

-- Each ledger movement made by a transfer says which transfer and which step.
alter table public.stock_movements
  add column transfer_id uuid,
  add column transfer_step text check (transfer_step is null or transfer_step in ('send', 'receive', 'cancel')),
  add foreign key (company_id, transfer_id) references public.stock_transfers (company_id, id);
create index stock_movements_transfer on public.stock_movements (transfer_id) where transfer_id is not null;

alter table public.stock_transfers enable row level security;
alter table public.stock_transfers force row level security;
alter table public.stock_transfer_lines enable row level security;
alter table public.stock_transfer_lines force row level security;
create policy stock_transfers_select on public.stock_transfers for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
create policy stock_transfer_lines_select on public.stock_transfer_lines for select to authenticated
  using (company_id = (select app.company_id()) and (select app.stock_can_read()));
grant select on public.stock_transfers, public.stock_transfer_lines to authenticated;
create trigger audit_stock_transfers after insert or update on public.stock_transfers for each row execute function app.audit_row();

-- ---------- send ----------
-- p_lines: [{"variant_id": "...", "qty": 5}]. Same request id again returns the first transfer.
create function public.send_transfer(p_request_id uuid, p_from uuid, p_to uuid, p_note text, p_lines jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  tid uuid;
  mid uuid;
  line jsonb;
  v uuid;
  q numeric;
  seen uuid[] := '{}';
begin
  if app.stock_can_move() is not true then raise exception 'Not allowed' using errcode = '42501'; end if;
  select id into tid from public.stock_transfers where company_id = cid and request_id = p_request_id;
  if tid is not null then return tid; end if;
  if p_from is null or p_to is null or p_from = p_to then raise exception 'same_location' using errcode = 'P0001'; end if;
  if (select count(*) from public.locations where company_id = cid and is_active and id in (p_from, p_to)) <> 2 then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'no_lines' using errcode = 'P0001'; end if;
  if jsonb_array_length(p_lines) > 200 then raise exception 'too_many_lines' using errcode = 'P0001'; end if;

  insert into public.stock_transfers (company_id, from_location_id, to_location_id, note, request_id, sent_by)
  values (cid, p_from, p_to, nullif(btrim(p_note), ''), p_request_id, app.membership_id())
  returning id into tid;
  insert into public.stock_movements (company_id, kind, location_id, request_id, created_by, transfer_id, transfer_step)
  values (cid, 'transfer', p_from, gen_random_uuid(), app.membership_id(), tid, 'send')
  returning id into mid;

  for line in select value from jsonb_array_elements(p_lines) loop
    begin
      v := (line ->> 'variant_id')::uuid;
      q := (line ->> 'qty')::numeric;
    exception when others then
      raise exception 'line_invalid' using errcode = 'P0001';
    end;
    if q is null or q <= 0 or q > 1000000000 or v is null or v = any (seen)
       or not exists (select 1 from public.item_variants iv join public.items i on i.id = iv.item_id
                      where iv.company_id = cid and iv.id = v and iv.is_active and i.is_active and i.kind = 'stocked') then
      raise exception 'line_invalid' using errcode = 'P0001';
    end if;
    seen := seen || v;
    insert into public.stock_transfer_lines (transfer_id, company_id, variant_id, qty_sent) values (tid, cid, v, q);
    begin
      insert into public.stock_ledger (company_id, movement_id, location_id, variant_id, qty_delta) values (cid, mid, p_from, v, -q);
    exception when check_violation then
      raise exception 'insufficient_stock' using errcode = 'P0001';
    end;
  end loop;
  return tid;
end $$;
revoke all on function public.send_transfer(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.send_transfer(uuid, uuid, uuid, text, jsonb) to authenticated;

-- ---------- receive ----------
-- p_lines is optional: [{"variant_id": "...", "received": 4}]. Without it everything that was sent is received.
-- Received may be less than sent (a shortage); the difference is not added anywhere and stays on the line.
create function public.receive_transfer(p_transfer_id uuid, p_lines jsonb default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  t public.stock_transfers;
  mid uuid;
  l public.stock_transfer_lines;
  got numeric;
  given jsonb;
  cnt int;
begin
  if app.stock_can_move() is not true then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into t from public.stock_transfers where company_id = cid and id = p_transfer_id for update;
  if not found then raise exception 'transfer_not_found' using errcode = 'P0001'; end if;
  if t.status <> 'sent' then raise exception 'transfer_closed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.locations where company_id = cid and id = t.to_location_id and is_active) then
    raise exception 'location_invalid' using errcode = 'P0001';
  end if;
  if p_lines is not null then
    if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'line_invalid' using errcode = 'P0001'; end if;
    select count(*) into cnt from jsonb_array_elements(p_lines) e
      where not exists (select 1 from public.stock_transfer_lines x where x.transfer_id = t.id and x.variant_id::text = e.value ->> 'variant_id');
    if cnt > 0 then raise exception 'line_invalid' using errcode = 'P0001'; end if;
  end if;

  insert into public.stock_movements (company_id, kind, location_id, request_id, created_by, transfer_id, transfer_step)
  values (cid, 'transfer', t.to_location_id, gen_random_uuid(), app.membership_id(), t.id, 'receive')
  returning id into mid;

  for l in select * from public.stock_transfer_lines where transfer_id = t.id loop
    got := l.qty_sent;
    if p_lines is not null then
      select e.value into given from jsonb_array_elements(p_lines) e where e.value ->> 'variant_id' = l.variant_id::text limit 1;
      if given is not null then
        begin
          got := (given ->> 'received')::numeric;
        exception when others then
          raise exception 'line_invalid' using errcode = 'P0001';
        end;
      end if;
    end if;
    if got is null or got < 0 or got > l.qty_sent then raise exception 'line_invalid' using errcode = 'P0001'; end if;
    update public.stock_transfer_lines set qty_received = got where transfer_id = l.transfer_id and variant_id = l.variant_id;
    if got > 0 then
      insert into public.stock_ledger (company_id, movement_id, location_id, variant_id, qty_delta) values (cid, mid, t.to_location_id, l.variant_id, got);
    end if;
  end loop;
  update public.stock_transfers set status = 'received', closed_by = app.membership_id(), closed_at = now() where id = t.id;
  return t.id;
end $$;
revoke all on function public.receive_transfer(uuid, jsonb) from public, anon;
grant execute on function public.receive_transfer(uuid, jsonb) to authenticated;

-- ---------- cancel ----------
create function public.cancel_transfer(p_transfer_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  cid uuid := app.company_id();
  t public.stock_transfers;
  mid uuid;
  l public.stock_transfer_lines;
begin
  if app.stock_can_move() is not true then raise exception 'Not allowed' using errcode = '42501'; end if;
  select * into t from public.stock_transfers where company_id = cid and id = p_transfer_id for update;
  if not found then raise exception 'transfer_not_found' using errcode = 'P0001'; end if;
  if t.status <> 'sent' then raise exception 'transfer_closed' using errcode = 'P0001'; end if;
  insert into public.stock_movements (company_id, kind, location_id, request_id, created_by, transfer_id, transfer_step)
  values (cid, 'transfer', t.from_location_id, gen_random_uuid(), app.membership_id(), t.id, 'cancel')
  returning id into mid;
  for l in select * from public.stock_transfer_lines where transfer_id = t.id loop
    insert into public.stock_ledger (company_id, movement_id, location_id, variant_id, qty_delta) values (cid, mid, t.from_location_id, l.variant_id, l.qty_sent);
  end loop;
  update public.stock_transfers set status = 'cancelled', closed_by = app.membership_id(), closed_at = now() where id = t.id;
  return t.id;
end $$;
revoke all on function public.cancel_transfer(uuid) from public, anon;
grant execute on function public.cancel_transfer(uuid) to authenticated;
