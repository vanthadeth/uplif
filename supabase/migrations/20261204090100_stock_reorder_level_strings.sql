-- Strings for the Stock app: reorder level and low stock. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.item.reorder', 'Reorder level', 3700),
  ('sk.item.reorderHint', 'Show Low on the stock levels screen when the stock of this item falls to this number or below. Leave empty for no alert.', 3701),
  ('sk.item.reorderInvalid', 'Type a reorder level of 0 or more.', 3702),
  ('sk.lv.low', 'Low', 3703),
  ('sk.lv.out', 'Out of stock', 3704),
  ('sk.lv.lowOnly', 'Low stock only', 3705),
  ('sk.lv.reorderAt', 'Reorder at {qty} {unit}', 3706),
  ('sk.lv.noLow', 'Nothing is low on stock.', 3707)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.item.reorder', 'កម្រិតបញ្ជាទិញម្តងទៀត'),
  ('sk.item.reorderHint', 'បង្ហាញ ជិតអស់ នៅលើអេក្រង់កម្រិតស្តុក ពេលស្តុកទំនិញនេះធ្លាក់ដល់ចំនួននេះ ឬទាបជាង។ ទុកទទេប្រសិនបើមិនចង់ឱ្យមានការជូនដំណឹង។'),
  ('sk.item.reorderInvalid', 'សូមវាយកម្រិតបញ្ជាទិញម្តងទៀត គឺ 0 ឬច្រើនជាង។'),
  ('sk.lv.low', 'ជិតអស់'),
  ('sk.lv.out', 'អស់ស្តុក'),
  ('sk.lv.lowOnly', 'តែស្តុកជិតអស់'),
  ('sk.lv.reorderAt', 'បញ្ជាទិញនៅ {qty} {unit}'),
  ('sk.lv.noLow', 'គ្មានអ្វីជិតអស់ស្តុកទេ។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
