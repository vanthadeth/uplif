-- Suppliers get a second contact number. Locations get a map position (latitude and longitude, both or neither).
alter table public.suppliers add column phone2 text check (phone2 is null or length(phone2) <= 40);
grant insert (phone2), update (phone2) on public.suppliers to authenticated;

alter table public.locations
  add column latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  add column longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  add constraint locations_geo_both check ((latitude is null) = (longitude is null));
grant insert (latitude, longitude), update (latitude, longitude) on public.locations to authenticated;
