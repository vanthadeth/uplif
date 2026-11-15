-- Strings for the UPLIF Time day detail sheet. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('tm.day.firstIn', 'First clock-in', 4093),
  ('tm.day.lastOut', 'Last clock-out', 4094),
  ('tm.day.late', 'Late', 4095),
  ('tm.day.early', 'Left early', 4096),
  ('tm.day.worked', 'Worked', 4097),
  ('tm.day.overtime', 'Overtime', 4098),
  ('tm.day.flagged', 'Needs a look: a clock event was flagged.', 4099),
  ('tm.day.none', 'No clock-in', 4100),
  ('tm.day.close', 'Close', 4101),
  ('tm.day.error', 'Could not load this day.', 4102),
  ('tm.day.min', '{n} min', 4103)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('tm.day.firstIn', 'ចុចចូលដំបូង'),
  ('tm.day.lastOut', 'ចុចចេញចុងក្រោយ'),
  ('tm.day.late', 'យឺត'),
  ('tm.day.early', 'ចេញមុនម៉ោង'),
  ('tm.day.worked', 'ម៉ោងធ្វើការ'),
  ('tm.day.overtime', 'ម៉ោងបន្ថែម'),
  ('tm.day.flagged', 'ត្រូវពិនិត្យ៖ ព្រឹត្តិការណ៍ចុចត្រូវបានដាក់សញ្ញា។'),
  ('tm.day.none', 'មិនមានការចុចចូល'),
  ('tm.day.close', 'បិទ'),
  ('tm.day.error', 'មិនអាចផ្ទុកថ្ងៃនេះបានទេ។'),
  ('tm.day.min', '{n} នាទី')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
