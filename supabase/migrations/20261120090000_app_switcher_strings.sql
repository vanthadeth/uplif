-- Strings for the apps switcher (shared component). Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sw.apps', 'Apps', 2151),
  ('sw.core', 'Core', 2152),
  ('sw.modules', 'Modules', 2153),
  ('sw.company', 'Company', 2154),
  ('sw.switchCompany', 'Switch company', 2155),
  ('sw.current', 'Current', 2156),
  ('sw.soon', 'Coming soon', 2157),
  ('sw.premium', 'Premium', 2158),
  ('sw.addon', 'Add-on', 2159),
  ('sw.close', 'Close', 2160),
  ('sw.back', 'Back', 2161),
  ('sw.seePlans', 'See plans', 2162),
  ('sw.askOwner', 'Ask an owner to add it', 2163),
  ('sw.hint', 'Point at an app to see what it does.', 2164),
  ('sw.lockedPremium', 'Included in the Premium plan.', 2165),
  ('sw.lockedAddon', 'Available as an add-on.', 2166),
  ('sw.noApps', 'No apps available', 2167),
  ('sw.noAppsBody', 'Your access to this company is paused. Ask an owner or admin to restore your role, or switch to another company.', 2168),
  ('sw.loading', 'Loading apps', 2169)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sw.apps', 'កម្មវិធី'),
  ('sw.core', 'មូលដ្ឋាន'),
  ('sw.modules', 'ម៉ូឌុល'),
  ('sw.company', 'ក្រុមហ៊ុន'),
  ('sw.switchCompany', 'ប្តូរក្រុមហ៊ុន'),
  ('sw.current', 'កំពុងប្រើ'),
  ('sw.soon', 'ឆាប់ៗនេះ'),
  ('sw.premium', 'Premium'),
  ('sw.addon', 'កម្មវិធីបន្ថែម'),
  ('sw.close', 'បិទ'),
  ('sw.back', 'ថយក្រោយ'),
  ('sw.seePlans', 'មើលគម្រោង'),
  ('sw.askOwner', 'សូមស្នើម្ចាស់ឱ្យបន្ថែម'),
  ('sw.hint', 'ដាក់ព្រួញលើកម្មវិធី ដើម្បីមើលថាវាធ្វើអ្វី។'),
  ('sw.lockedPremium', 'រួមបញ្ចូលក្នុងគម្រោង Premium។'),
  ('sw.lockedAddon', 'អាចបន្ថែមជាកម្មវិធីបន្ថែម។'),
  ('sw.noApps', 'មិនមានកម្មវិធីទេ'),
  ('sw.noAppsBody', 'ការចូលប្រើរបស់អ្នកក្នុងក្រុមហ៊ុននេះត្រូវបានផ្អាក។ សូមស្នើម្ចាស់ ឬអ្នកគ្រប់គ្រងឱ្យស្ដារតួនាទីរបស់អ្នកវិញ ឬប្តូរទៅក្រុមហ៊ុនផ្សេង។'),
  ('sw.loading', 'កំពុងផ្ទុកកម្មវិធី')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
