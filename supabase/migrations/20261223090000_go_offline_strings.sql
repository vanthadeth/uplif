-- Strings for UPLIF Go offline use (saved copies, waiting notes and customers). Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('go.off.saved', 'No signal. Showing what this phone saved at {time}.', 2300),
  ('go.ob.offline', 'No signal. Notes and photos you add are saved on this phone and sent when the signal is back.', 2301),
  ('go.ob.waiting', '{n} waiting to send', 2302),
  ('go.ob.send', 'Send now', 2303),
  ('go.ob.sent', '{n} sent', 2304),
  ('go.ob.pending', 'Waiting to send', 2305),
  ('go.ob.notSent', 'Not sent', 2306),
  ('go.ob.retry', 'Try again', 2307),
  ('go.ob.remove', 'Remove', 2308),
  ('go.ob.customerRefused', 'The server did not accept this customer.', 2309),
  ('go.form.savedOffline', 'Saved on this phone. It will send when the signal is back.', 2310),
  ('go.off.nothingTitle', 'Nothing saved on this phone yet', 2311),
  ('go.off.nothingBody', 'Open this screen once with a signal. It will be here next time, even without one.', 2312),
  ('go.off.needSignalTitle', 'This screen needs a signal', 2313),
  ('go.off.needSignalBody', 'Customers you opened before are still available. Come back online for everything else.', 2314),
  ('go.off.toCustomers', 'Go to customers', 2315),
  ('go.off.notReadyTitle', 'Open UPLIF Go with a signal first', 2316),
  ('go.off.notReadyBody', 'The app saves your customers on this phone the first time you open it online.', 2317)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('go.off.saved', 'គ្មានអ៊ីនធឺណិត។ កំពុងបង្ហាញអ្វីដែលទូរសព្ទនេះបានរក្សាទុកនៅម៉ោង {time}។'),
  ('go.ob.offline', 'គ្មានអ៊ីនធឺណិត។ កំណត់ចំណាំ និងរូបថតដែលអ្នកបន្ថែមត្រូវបានរក្សាទុកក្នុងទូរសព្ទ ហើយនឹងផ្ញើនៅពេលមានអ៊ីនធឺណិតវិញ។'),
  ('go.ob.waiting', 'កំពុងរង់ចាំផ្ញើ {n}'),
  ('go.ob.send', 'ផ្ញើឥឡូវនេះ'),
  ('go.ob.sent', 'បានផ្ញើ {n}'),
  ('go.ob.pending', 'កំពុងរង់ចាំផ្ញើ'),
  ('go.ob.notSent', 'មិនទាន់បានផ្ញើ'),
  ('go.ob.retry', 'ព្យាយាមម្តងទៀត'),
  ('go.ob.remove', 'លុប'),
  ('go.ob.customerRefused', 'ម៉ាស៊ីនមេមិនបានទទួលអតិថិជននេះទេ។'),
  ('go.form.savedOffline', 'បានរក្សាទុកក្នុងទូរសព្ទ។ នឹងផ្ញើនៅពេលមានអ៊ីនធឺណិតវិញ។'),
  ('go.off.nothingTitle', 'មិនទាន់មានអ្វីរក្សាទុកក្នុងទូរសព្ទនេះទេ'),
  ('go.off.nothingBody', 'សូមបើកអេក្រង់នេះម្តងពេលមានអ៊ីនធឺណិត។ លើកក្រោយវានឹងនៅទីនេះ ទោះគ្មានអ៊ីនធឺណិតក៏ដោយ។'),
  ('go.off.needSignalTitle', 'អេក្រង់នេះត្រូវការអ៊ីនធឺណិត'),
  ('go.off.needSignalBody', 'អតិថិជនដែលអ្នកបានបើកពីមុននៅតែអាចមើលបាន។ សូមត្រឡប់មកវិញពេលមានអ៊ីនធឺណិតសម្រាប់ផ្នែកផ្សេងទៀត។'),
  ('go.off.toCustomers', 'ទៅអតិថិជន'),
  ('go.off.notReadyTitle', 'សូមបើក UPLIF Go ពេលមានអ៊ីនធឺណិតជាមុនសិន'),
  ('go.off.notReadyBody', 'កម្មវិធីរក្សាទុកអតិថិជនរបស់អ្នកក្នុងទូរសព្ទនេះ នៅពេលអ្នកបើកវាលើកដំបូងពេលមានអ៊ីនធឺណិត។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
