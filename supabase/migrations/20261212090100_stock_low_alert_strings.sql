-- String for the low-stock notification in UPLIF Me. Khmer entry is a machine draft for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.notif.low_stock', '{item} is low: {qty} {unit} left (reorder at {level}).', 4500)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.notif.low_stock', '{item} ជិតអស់៖ នៅសល់ {qty} {unit} (បញ្ជាទិញម្តងទៀតនៅ {level})។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
