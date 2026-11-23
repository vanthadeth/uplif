-- Strings for the Stock app: item cost. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.cost.label', 'Cost price', 3200),
  ('sk.cost.hint', 'What you pay for one unit, in {currency}. Only people allowed to see cost can see this.', 3201),
  ('sk.cost.invalid', 'Type a cost of 0 or more.', 3202),
  ('sk.cost.margin', 'Profit on each sale: {amount} ({percent}%)', 3203),
  ('sk.cost.loss', 'Selling below cost: {amount} lost on each sale', 3204)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.cost.label', 'តម្លៃដើម'),
  ('sk.cost.hint', 'អ្វីដែលអ្នកបង់សម្រាប់មួយឯកតា គិតជា {currency}។ មានតែអ្នកដែលមានសិទ្ធិមើលតម្លៃដើមប៉ុណ្ណោះដែលអាចឃើញ។'),
  ('sk.cost.invalid', 'សូមវាយតម្លៃដើមចាប់ពី ០ ឡើងទៅ។'),
  ('sk.cost.margin', 'ប្រាក់ចំណេញរាល់ការលក់៖ {amount} ({percent}%)'),
  ('sk.cost.loss', 'លក់ក្រោមតម្លៃដើម៖ ខាត {amount} រាល់ការលក់')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
