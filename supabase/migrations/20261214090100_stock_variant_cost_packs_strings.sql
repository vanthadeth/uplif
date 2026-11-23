-- Strings for variant cost, variant packs and carton size/weight. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.pack.measure', 'Size and weight', 4700),
  ('sk.pack.length', 'Length (cm)', 4701),
  ('sk.pack.width', 'Width (cm)', 4702),
  ('sk.pack.height', 'Height (cm)', 4703),
  ('sk.pack.gross', 'Gross weight (kg)', 4704),
  ('sk.pack.net', 'Net weight (kg)', 4705),
  ('sk.pack.netOver', 'Net weight cannot be more than gross weight.', 4706),
  ('sk.pack.measureInvalid', 'Sizes and weights must be numbers of 0 or more.', 4707),
  ('sk.var.cost', 'Cost', 4710),
  ('sk.var.costHint', 'Leave empty to use the item cost.', 4711),
  ('sk.var.ownPacks', 'Own packs', 4712),
  ('sk.var.ownPacksHint', 'Off: this variant uses the item packs.', 4713),
  ('sk.var.usesItem', 'Uses the item', 4714)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.pack.measure', 'ទំហំ និងទម្ងន់'),
  ('sk.pack.length', 'បណ្តោយ (សង់ទីម៉ែត្រ)'),
  ('sk.pack.width', 'ទទឹង (សង់ទីម៉ែត្រ)'),
  ('sk.pack.height', 'កម្ពស់ (សង់ទីម៉ែត្រ)'),
  ('sk.pack.gross', 'ទម្ងន់សរុប GW (គីឡូក្រាម)'),
  ('sk.pack.net', 'ទម្ងន់សុទ្ធ NW (គីឡូក្រាម)'),
  ('sk.pack.netOver', 'ទម្ងន់សុទ្ធមិនអាចលើសទម្ងន់សរុបទេ។'),
  ('sk.pack.measureInvalid', 'ទំហំ និងទម្ងន់ត្រូវជាលេខ ០ ឬច្រើនជាងនេះ។'),
  ('sk.var.cost', 'តម្លៃដើម'),
  ('sk.var.costHint', 'ទុកទទេ ដើម្បីប្រើតម្លៃដើមរបស់ទំនិញ។'),
  ('sk.var.ownPacks', 'កញ្ចប់ផ្ទាល់ខ្លួន'),
  ('sk.var.ownPacksHint', 'បិទ៖ ជម្រើសនេះប្រើកញ្ចប់របស់ទំនិញ។'),
  ('sk.var.usesItem', 'ប្រើតាមទំនិញ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
