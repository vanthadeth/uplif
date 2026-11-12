-- Strings for attendance corrections in UPLIF Me. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('st.amend.ask', 'Ask for a correction', 1742),
  ('st.amend.title', 'Correction for {date}', 1743),
  ('st.amend.hint', 'Tell us the time that should count. Your manager approves it, then the day updates.', 1744),
  ('st.amend.in', 'Clock-in time', 1745),
  ('st.amend.out', 'Clock-out time', 1746),
  ('st.amend.reason', 'Why? (required)', 1747),
  ('st.amend.send', 'Send request', 1748),
  ('st.amend.sent', 'Request sent to your manager.', 1749),
  ('st.amend.list', 'Correction requests', 1750),
  ('st.amend.inAt', 'In {t}', 1751),
  ('st.amend.outAt', 'Out {t}', 1752),
  ('st.amend.status.pending', 'Waiting', 1753),
  ('st.amend.status.approved', 'Approved', 1754),
  ('st.amend.status.rejected', 'Not approved', 1755),
  ('st.amend.status.cancelled', 'Cancelled', 1756),
  ('st.amend.cancel', 'Cancel request', 1757),
  ('st.amend.cancelled', 'Request cancelled.', 1758),
  ('st.amend.note', 'Note: {note}', 1759),
  ('st.amend.err.need', 'Enter at least one time and a reason.', 1760),
  ('st.amend.err.order', 'The clock-out must be after the clock-in.', 1761),
  ('st.amend.err.open', 'You already have a request waiting for this day.', 1762),
  ('st.amend.err.generic', 'Could not send the request. Try again.', 1763)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.amend.ask', 'ស្នើសុំការកែតម្រូវ'),
  ('st.amend.title', 'ការកែតម្រូវសម្រាប់ {date}'),
  ('st.amend.hint', 'សូមប្រាប់ម៉ោងដែលត្រូវរាប់។ អ្នកគ្រប់គ្រងនឹងអនុម័ត បន្ទាប់មកថ្ងៃនឹងធ្វើបច្ចុប្បន្នភាព។'),
  ('st.amend.in', 'ម៉ោងចូល'),
  ('st.amend.out', 'ម៉ោងចេញ'),
  ('st.amend.reason', 'ហេតុអ្វី? (ចាំបាច់)'),
  ('st.amend.send', 'ផ្ញើសំណើ'),
  ('st.amend.sent', 'បានផ្ញើសំណើទៅអ្នកគ្រប់គ្រងរបស់អ្នក។'),
  ('st.amend.list', 'សំណើកែតម្រូវ'),
  ('st.amend.inAt', 'ចូល {t}'),
  ('st.amend.outAt', 'ចេញ {t}'),
  ('st.amend.status.pending', 'កំពុងរង់ចាំ'),
  ('st.amend.status.approved', 'បានអនុម័ត'),
  ('st.amend.status.rejected', 'មិនបានអនុម័ត'),
  ('st.amend.status.cancelled', 'បានបោះបង់'),
  ('st.amend.cancel', 'បោះបង់សំណើ'),
  ('st.amend.cancelled', 'បានបោះបង់សំណើ។'),
  ('st.amend.note', 'កំណត់ចំណាំ៖ {note}'),
  ('st.amend.err.need', 'សូមបញ្ចូលយ៉ាងហោចណាស់ម៉ោងមួយ និងមូលហេតុ។'),
  ('st.amend.err.order', 'ម៉ោងចេញត្រូវនៅក្រោយម៉ោងចូល។'),
  ('st.amend.err.open', 'អ្នកមានសំណើកំពុងរង់ចាំសម្រាប់ថ្ងៃនេះរួចហើយ។'),
  ('st.amend.err.generic', 'មិនអាចផ្ញើសំណើបានទេ។ សូមព្យាយាមម្តងទៀត។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
