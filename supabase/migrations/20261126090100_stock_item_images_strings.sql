-- Strings for the Stock app: item pictures. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.pics.title', 'Pictures', 2900),
  ('sk.pics.open', 'Pictures: {name}', 2901),
  ('sk.pics.add', 'Add pictures', 2902),
  ('sk.pics.count', '{n} of {max} pictures', 2903),
  ('sk.pics.main', 'Main', 2904),
  ('sk.pics.makeMain', 'Make main', 2905),
  ('sk.pics.remove', 'Remove picture', 2906),
  ('sk.pics.empty', 'No pictures yet', 2907),
  ('sk.pics.emptyBody', 'Add photos so people can recognise the item. The main picture shows first.', 2908),
  ('sk.pics.roEmpty', 'This item has no pictures.', 2909),
  ('sk.pics.limit', 'You can add up to {max} pictures to one item.', 2910),
  ('sk.pics.uploadError', 'A picture could not be added. Try again.', 2911),
  ('sk.pics.removed', 'Picture removed.', 2912),
  ('sk.pics.mainSet', 'Main picture changed.', 2913)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.pics.title', 'រូបភាព'),
  ('sk.pics.open', 'រូបភាព៖ {name}'),
  ('sk.pics.add', 'បន្ថែមរូបភាព'),
  ('sk.pics.count', 'រូបភាព {n} ក្នុងចំណោម {max}'),
  ('sk.pics.main', 'ចម្បង'),
  ('sk.pics.makeMain', 'ធ្វើជារូបចម្បង'),
  ('sk.pics.remove', 'លុបរូបភាព'),
  ('sk.pics.empty', 'មិនទាន់មានរូបភាពទេ'),
  ('sk.pics.emptyBody', 'បន្ថែមរូបថត ដើម្បីឱ្យមនុស្សស្គាល់ទំនិញ។ រូបចម្បងបង្ហាញមុនគេ។'),
  ('sk.pics.roEmpty', 'ទំនិញនេះមិនមានរូបភាពទេ។'),
  ('sk.pics.limit', 'អ្នកអាចបន្ថែមរូបភាពបានរហូតដល់ {max} សម្រាប់ទំនិញមួយ។'),
  ('sk.pics.uploadError', 'មិនអាចបន្ថែមរូបភាពបានទេ។ សូមព្យាយាមម្តងទៀត។'),
  ('sk.pics.removed', 'បានលុបរូបភាព។'),
  ('sk.pics.mainSet', 'បានប្តូររូបភាពចម្បង។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
