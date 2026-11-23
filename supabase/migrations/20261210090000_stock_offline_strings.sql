-- Strings for the Stock app: saving work on the phone without signal. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.ob.saved', 'No signal. Saved on this phone, it will be sent when you are back online.', 4300),
  ('sk.ob.offline', 'No signal. You can keep working, changes are saved on this phone.', 4301),
  ('sk.ob.waiting', '{n} waiting to be sent', 4302),
  ('sk.ob.send', 'Send now', 4303),
  ('sk.ob.sent', '{n} saved changes were sent.', 4304),
  ('sk.ob.refused', 'The server did not accept this one', 4305),
  ('sk.ob.remove', 'Remove', 4306),
  ('sk.ob.k.receive', 'Receive stock', 4307),
  ('sk.ob.k.adjust', 'Adjustment', 4308),
  ('sk.ob.k.count', 'Stock count', 4309),
  ('sk.ob.k.transfer', 'Transfer', 4310),
  ('sk.ob.k.arrival', 'Transfer arrival', 4311)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.ob.saved', 'គ្មានអ៊ីនធឺណិត។ បានរក្សាទុកក្នុងទូរសព្ទនេះ ហើយនឹងផ្ញើនៅពេលមានអ៊ីនធឺណិតវិញ។'),
  ('sk.ob.offline', 'គ្មានអ៊ីនធឺណិត។ អ្នកអាចបន្តធ្វើការបាន ការផ្លាស់ប្តូរត្រូវបានរក្សាទុកក្នុងទូរសព្ទនេះ។'),
  ('sk.ob.waiting', 'កំពុងរង់ចាំផ្ញើ {n}'),
  ('sk.ob.send', 'ផ្ញើឥឡូវនេះ'),
  ('sk.ob.sent', 'បានផ្ញើការផ្លាស់ប្តូរដែលបានរក្សាទុក {n}។'),
  ('sk.ob.refused', 'ម៉ាស៊ីនមេមិនទទួលយកការនេះទេ'),
  ('sk.ob.remove', 'ដកចេញ'),
  ('sk.ob.k.receive', 'ទទួលស្តុក'),
  ('sk.ob.k.adjust', 'ការកែតម្រូវ'),
  ('sk.ob.k.count', 'ការរាប់ស្តុក'),
  ('sk.ob.k.transfer', 'ការផ្ទេរ'),
  ('sk.ob.k.arrival', 'ការមកដល់នៃការផ្ទេរ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
