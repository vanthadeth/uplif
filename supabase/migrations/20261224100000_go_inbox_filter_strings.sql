-- Strings for the UPLIF Go inbox search and filters. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('go.inbox.search', 'Search customers and notes', 2800),
  ('go.inbox.fAll', 'All', 2801),
  ('go.inbox.fManager', 'Manager', 2802),
  ('go.inbox.fVisits', 'Visits', 2803),
  ('go.inbox.fCalls', 'Calls', 2804),
  ('go.inbox.noMatch', 'Nothing matches. Try another word or filter.', 2805)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('go.inbox.search', 'ស្វែងរកអតិថិជន និងកំណត់ចំណាំ'),
  ('go.inbox.fAll', 'ទាំងអស់'),
  ('go.inbox.fManager', 'អ្នកគ្រប់គ្រង'),
  ('go.inbox.fVisits', 'ការជួប'),
  ('go.inbox.fCalls', 'ការហៅ'),
  ('go.inbox.noMatch', 'រកមិនឃើញទេ។ សូមសាកពាក្យ ឬតម្រងផ្សេង។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
