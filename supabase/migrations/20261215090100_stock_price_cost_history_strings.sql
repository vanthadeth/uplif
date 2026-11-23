-- Strings for the price and cost history. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.hist.title', 'Price and cost history', 4720),
  ('sk.hist.price', 'Selling price', 4721),
  ('sk.hist.cost', 'Cost', 4722),
  ('sk.hist.empty', 'No changes yet', 4723),
  ('sk.hist.emptyBody', 'Changes are recorded from now on.', 4724),
  ('sk.hist.loadError', 'Could not load the history.', 4725),
  ('sk.hist.wholeItem', 'Whole item', 4726),
  ('sk.hist.itemPrice', 'Item price', 4727),
  ('sk.hist.removed', 'Removed', 4728),
  ('sk.hist.open', 'Price and cost history', 4729)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.hist.title', 'ប្រវត្តិតម្លៃលក់ និងតម្លៃដើម'),
  ('sk.hist.price', 'តម្លៃលក់'),
  ('sk.hist.cost', 'តម្លៃដើម'),
  ('sk.hist.empty', 'មិនទាន់មានការផ្លាស់ប្តូរទេ'),
  ('sk.hist.emptyBody', 'ការផ្លាស់ប្តូរត្រូវបានកត់ត្រាចាប់ពីពេលនេះទៅ។'),
  ('sk.hist.loadError', 'មិនអាចផ្ទុកប្រវត្តិបានទេ។'),
  ('sk.hist.wholeItem', 'ទំនិញទាំងមូល'),
  ('sk.hist.itemPrice', 'តម្លៃទំនិញ'),
  ('sk.hist.removed', 'បានដកចេញ'),
  ('sk.hist.open', 'ប្រវត្តិតម្លៃលក់ និងតម្លៃដើម')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
