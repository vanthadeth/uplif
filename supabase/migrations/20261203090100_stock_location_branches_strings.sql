-- Strings for the Stock app: location branches. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('sk.loc.branch', 'Branch', 3600),
  ('sk.loc.noBranch', 'Whole company (no branch)', 3601),
  ('sk.loc.branchHint', 'Staff of a branch can only move stock at their own branch. A location with no branch is for the whole company, and only company-wide roles can move its stock.', 3602),
  ('sk.mv.noWritable', 'You cannot move stock at any location. Ask an owner or admin to link your role to a branch with locations.', 3603)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('sk.loc.branch', 'សាខា'),
  ('sk.loc.noBranch', 'ក្រុមហ៊ុនទាំងមូល (គ្មានសាខា)'),
  ('sk.loc.branchHint', 'បុគ្គលិកសាខាអាចផ្លាស់ទីស្តុកបានតែនៅសាខារបស់ខ្លួនប៉ុណ្ណោះ។ ទីតាំងដែលគ្មានសាខាគឺសម្រាប់ក្រុមហ៊ុនទាំងមូល ហើយមានតែតួនាទីទូទាំងក្រុមហ៊ុនទេដែលអាចផ្លាស់ទីស្តុករបស់វា។'),
  ('sk.mv.noWritable', 'អ្នកមិនអាចផ្លាស់ទីស្តុកនៅទីតាំងណាមួយទេ។ សូមសួរម្ចាស់ ឬអ្នកគ្រប់គ្រង ឱ្យភ្ជាប់តួនាទីរបស់អ្នកទៅសាខាដែលមានទីតាំង។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
