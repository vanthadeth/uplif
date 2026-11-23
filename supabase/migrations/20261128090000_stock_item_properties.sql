-- Stock: item properties. Choices the customer makes that are NOT counted in stock (sweetness, ice, topping, colour).
-- Free text per item, stored on the item as a list of groups:
--   [{ "name": "Sweetness", "name_local": null, "selection": "one"|"many", "required": true,
--      "options": [{ "name": "Less sugar", "name_local": null, "extra_charge": 0 }] }]
create or replace function app.valid_item_properties(p jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare g jsonb; o jsonb;
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 20 or pg_column_size(p) > 12000 then return false; end if;
  for g in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(g) is distinct from 'object'
       or jsonb_typeof(g -> 'name') is distinct from 'string' or btrim(g ->> 'name') = ''
       or (g ->> 'selection') is null or (g ->> 'selection') not in ('one', 'many')
       or jsonb_typeof(g -> 'required') is distinct from 'boolean'
       or jsonb_typeof(g -> 'options') is distinct from 'array'
       or jsonb_array_length(g -> 'options') not between 1 and 30 then return false; end if;
    for o in select value from jsonb_array_elements(g -> 'options') loop
      if jsonb_typeof(o) is distinct from 'object'
         or jsonb_typeof(o -> 'name') is distinct from 'string' or btrim(o ->> 'name') = ''
         or jsonb_typeof(o -> 'extra_charge') is distinct from 'number' or (o ->> 'extra_charge')::numeric < 0 then return false; end if;
    end loop;
  end loop;
  return true;
end $$;

alter table public.items add column properties jsonb not null default '[]'
  check (app.valid_item_properties(properties));

grant insert (properties), update (properties) on public.items to authenticated;
