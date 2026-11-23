-- Strings for exchange rates in Time settings. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('tm.pr.rates', 'Exchange rates', 4321),
  ('tm.pr.rates.hint', '1 unit of the currency equals this many units of your home currency, from the date given. New payslips use the latest rate.', 4322),
  ('tm.pr.rates.currency', 'Currency (3 letters)', 4323),
  ('tm.pr.rates.rate', 'Rate', 4324),
  ('tm.pr.rates.from', 'From', 4325),
  ('tm.pr.rates.add', 'Add rate', 4326),
  ('tm.pr.rates.empty', 'No rates yet. Payslips in other currencies show no home value until you add one.', 4327),
  ('tm.pr.rates.remove', 'Remove', 4328),
  ('tm.pr.rates.bad', 'Check the currency code, the rate and the date.', 4329)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('tm.pr.rates', 'អត្រាប្តូរប្រាក់'),
  ('tm.pr.rates.hint', 'រូបិយប័ណ្ណ ១ ស្មើនឹងចំនួនរូបិយប័ណ្ណមូលដ្ឋានរបស់អ្នកដែលបានបញ្ជាក់ ចាប់ពីកាលបរិច្ឆេទដែលបានផ្តល់។ ប័ណ្ណបើកប្រាក់ខែថ្មីប្រើអត្រាចុងក្រោយ។'),
  ('tm.pr.rates.currency', 'រូបិយប័ណ្ណ (អក្សរ ៣)'),
  ('tm.pr.rates.rate', 'អត្រា'),
  ('tm.pr.rates.from', 'ចាប់ពី'),
  ('tm.pr.rates.add', 'បន្ថែមអត្រា'),
  ('tm.pr.rates.empty', 'មិនទាន់មានអត្រាទេ។ ប័ណ្ណបើកប្រាក់ខែជារូបិយប័ណ្ណផ្សេងនឹងមិនបង្ហាញតម្លៃមូលដ្ឋានទេ រហូតដល់អ្នកបន្ថែម។'),
  ('tm.pr.rates.remove', 'លុប'),
  ('tm.pr.rates.bad', 'សូមពិនិត្យលេខកូដរូបិយប័ណ្ណ អត្រា និងកាលបរិច្ឆេទ។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
