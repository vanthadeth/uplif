-- More strings for the landing page (log in / create account, steps, closing panel). Khmer entries are machine drafts.
insert into public.i18n_strings (key, source_text, position) values
  ('lp.nav.logIn', 'Log in', 2139),
  ('lp.nav.create', 'Create account', 2140),
  ('lp.cta.create', 'Create free account', 2141),
  ('lp.steps.title', 'Up and running in three steps', 2142),
  ('lp.steps.1.title', 'Create your account', 2143),
  ('lp.steps.1.body', 'Sign in with Google or Telegram and set up your business.', 2144),
  ('lp.steps.2.title', 'Invite your team', 2145),
  ('lp.steps.2.body', 'Send each person a link. They join your company in one tap.', 2146),
  ('lp.steps.3.title', 'Open the apps', 2147),
  ('lp.steps.3.body', 'Everyone opens the apps they need on their phone.', 2148),
  ('lp.final.title', 'Ready to simplify your business?', 2149),
  ('lp.final.body', 'Create your free account in minutes. Already have one? Log in.', 2150)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('lp.nav.logIn', 'ចូលគណនី'),
  ('lp.nav.create', 'បង្កើតគណនី'),
  ('lp.cta.create', 'បង្កើតគណនីឥតគិតថ្លៃ'),
  ('lp.steps.title', 'ចាប់ដំណើរការក្នុងបីជំហាន'),
  ('lp.steps.1.title', 'បង្កើតគណនីរបស់អ្នក'),
  ('lp.steps.1.body', 'ចូលដោយ Google ឬ Telegram ហើយរៀបចំអាជីវកម្មរបស់អ្នក។'),
  ('lp.steps.2.title', 'អញ្ជើញក្រុមការងាររបស់អ្នក'),
  ('lp.steps.2.body', 'ផ្ញើតំណភ្ជាប់ទៅមនុស្សម្នាក់ៗ។ ពួកគេចូលរួមក្រុមហ៊ុនរបស់អ្នកដោយចុចតែមួយ។'),
  ('lp.steps.3.title', 'បើកកម្មវិធី'),
  ('lp.steps.3.body', 'មនុស្សគ្រប់គ្នាបើកកម្មវិធីដែលពួកគេត្រូវការលើទូរស័ព្ទ។'),
  ('lp.final.title', 'ត្រៀមខ្លួនធ្វើឱ្យអាជីវកម្មរបស់អ្នកងាយស្រួលហើយឬនៅ?'),
  ('lp.final.body', 'បង្កើតគណនីឥតគិតថ្លៃរបស់អ្នកក្នុងរយៈពេលប៉ុន្មាននាទី។ មានរួចហើយ? ចូលគណនី។')) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
