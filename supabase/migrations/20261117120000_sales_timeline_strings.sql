-- Strings for UPLIF Go slice 2 (customer conversation and inbox). Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('go.conv.tabConversation', 'Conversation', 2208),
  ('go.conv.tabDetails', 'Details', 2209),
  ('go.conv.empty', 'No notes yet', 2210),
  ('go.conv.emptyBody', 'Write what you learned from the customer. Your manager can reply here.', 2211),
  ('go.conv.writeNote', 'Write a note', 2212),
  ('go.conv.writeComment', 'Write a comment as manager', 2213),
  ('go.conv.addPhoto', 'Add photo', 2214),
  ('go.conv.send', 'Send', 2215),
  ('go.conv.removePhoto', 'Remove photo', 2216),
  ('go.conv.noteFrom', 'Note · {name}', 2217),
  ('go.conv.managerFrom', '{name} · Manager', 2218),
  ('go.conv.you', 'You', 2219),
  ('go.conv.sendFailed', 'The note was not sent. Check your connection and try again.', 2220),
  ('go.conv.loadMore', 'Show earlier', 2221),
  ('go.conv.asNote', 'Note', 2222),
  ('go.conv.asComment', 'Manager comment', 2223),
  ('go.conv.today', 'Today', 2224),
  ('go.conv.call', 'Call {name}', 2225),
  ('go.inbox.emptyTitle', 'No conversations yet', 2226),
  ('go.inbox.emptyBody', 'Notes and replies from your manager will show here. Open a customer to write the first note.', 2227),
  ('go.inbox.loadError', 'The inbox did not load', 2228),
  ('go.inbox.unread', 'New', 2229),
  ('go.inbox.photo', 'Photo', 2230),
  ('go.inbox.youPrefix', 'You: ', 2231),
  ('go.inbox.managerPrefix', '{name}: ', 2232)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('go.conv.tabConversation', 'ការសន្ទនា'),
  ('go.conv.tabDetails', 'ព័ត៌មានលម្អិត'),
  ('go.conv.empty', 'មិនទាន់មានកំណត់ចំណាំ'),
  ('go.conv.writeNote', 'សរសេរកំណត់ចំណាំ'),
  ('go.conv.writeComment', 'សរសេរមតិជាអ្នកគ្រប់គ្រង'),
  ('go.conv.addPhoto', 'បន្ថែមរូបថត'),
  ('go.conv.send', 'ផ្ញើ'),
  ('go.conv.you', 'អ្នក'),
  ('go.conv.asNote', 'កំណត់ចំណាំ'),
  ('go.conv.asComment', 'មតិអ្នកគ្រប់គ្រង'),
  ('go.conv.today', 'ថ្ងៃនេះ'),
  ('go.inbox.emptyTitle', 'មិនទាន់មានការសន្ទនា'),
  ('go.inbox.unread', 'ថ្មី'),
  ('go.inbox.photo', 'រូបថត'),
  ('go.inbox.youPrefix', 'អ្នក៖ ')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
