-- Strings for the payslip reviews card on Today and the payslip print button in Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('tm.today.reviews', 'Payslip reviews waiting', 4318),
  ('tm.today.reviewsOpen', 'Answer in Payroll', 4319),
  ('st.pay.print', 'Print or save as PDF', 4320)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('tm.today.reviews', 'ការសុំពិនិត្យប័ណ្ណបើកប្រាក់ខែដែលកំពុងរង់ចាំ'),
  ('tm.today.reviewsOpen', 'ឆ្លើយនៅក្នុងប្រាក់ខែ'),
  ('st.pay.print', 'បោះពុម្ព ឬរក្សាទុកជា PDF')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
