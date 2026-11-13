-- Strings for the console Corrections page. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('nav.corrections', 'Corrections', 1721),
  ('am.title', 'Attendance corrections', 1722),
  ('am.subtitle', 'Staff ask to add a missing clock-in or clock-out. Approving adds the time to their day, marked as amended.', 1723),
  ('am.tabs', 'Request status', 1724),
  ('am.tab.pending', 'Waiting', 1725),
  ('am.tab.approved', 'Approved', 1726),
  ('am.tab.rejected', 'Not approved', 1727),
  ('am.empty.pending', 'No corrections waiting', 1728),
  ('am.empty.pendingBody', 'New requests from your team appear here.', 1729),
  ('am.empty.other', 'Nothing here yet.', 1730),
  ('am.approve', 'Approve', 1731),
  ('am.reject', 'Reject', 1732),
  ('am.decide.title', 'Decide on this correction', 1733),
  ('am.note', 'Note to the employee (optional)', 1734),
  ('am.approved', 'Correction approved.', 1735),
  ('am.rejected', 'Correction rejected.', 1736),
  ('am.err.already', 'Someone already decided this request.', 1737),
  ('am.in', 'In {t}', 1738),
  ('am.out', 'Out {t}', 1739),
  ('am.reason', 'Reason: {reason}', 1740),
  ('am.decisionNote', 'Note: {note}', 1741)
on conflict (key) do update set source_text = excluded.source_text, position = excluded.position, updated_at = now();

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('nav.corrections', 'ការកែតម្រូវ'),
  ('am.title', 'ការកែតម្រូវវត្តមាន'),
  ('am.subtitle', 'បុគ្គលិកស្នើសុំបន្ថែមម៉ោងចូល ឬចេញដែលភ្លេច។ ការអនុម័តនឹងបន្ថែមម៉ោងទៅថ្ងៃរបស់ពួកគេ ដោយសម្គាល់ថាបានកែតម្រូវ។'),
  ('am.tabs', 'ស្ថានភាពសំណើ'),
  ('am.tab.pending', 'កំពុងរង់ចាំ'),
  ('am.tab.approved', 'បានអនុម័ត'),
  ('am.tab.rejected', 'មិនបានអនុម័ត'),
  ('am.empty.pending', 'គ្មានការកែតម្រូវកំពុងរង់ចាំទេ'),
  ('am.empty.pendingBody', 'សំណើថ្មីពីក្រុមរបស់អ្នកនឹងបង្ហាញនៅទីនេះ។'),
  ('am.empty.other', 'មិនទាន់មានអ្វីនៅទីនេះទេ។'),
  ('am.approve', 'អនុម័ត'),
  ('am.reject', 'បដិសេធ'),
  ('am.decide.title', 'សម្រេចលើការកែតម្រូវនេះ'),
  ('am.note', 'កំណត់ចំណាំជូនបុគ្គលិក (មិនបង្ខំ)'),
  ('am.approved', 'បានអនុម័តការកែតម្រូវ។'),
  ('am.rejected', 'បានបដិសេធការកែតម្រូវ។'),
  ('am.err.already', 'មានអ្នកសម្រេចលើសំណើនេះរួចហើយ។'),
  ('am.in', 'ចូល {t}'),
  ('am.out', 'ចេញ {t}'),
  ('am.reason', 'មូលហេតុ៖ {reason}'),
  ('am.decisionNote', 'កំណត់ចំណាំ៖ {note}')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
