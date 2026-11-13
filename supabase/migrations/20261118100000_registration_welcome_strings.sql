-- Strings for the registration welcome screens and the app list. Khmer entries are machine drafts for the Khmer reviewer at /i18n.
insert into public.i18n_strings (key, source_text, position) values
  ('inv.w.title', '{company} has invited you to join their dream', 1992),
  ('inv.w.by', '{name} invited you to work with the team.', 1993),
  ('auth.inviteHint', 'Joining a company? If you already use UPLIF, sign in the same way you did before so the company is added to your existing account. A different way creates a new, empty account.', 1994),
  ('inv.w.added', '{company} was added to your account', 1995),
  ('inv.w.addedBody', 'You are signed in with your existing UPLIF account. Switch between companies from the top bar in any app.', 1996),
  ('inv.w.apps', 'Open the apps you will use', 1997),
  ('inv.w.openHint', 'Open an app, then add it to your home screen. On iPhone: tap Share, then Add to Home Screen.', 1998),
  ('inv.w.openApp', 'Open', 1999),
  ('inv.w.noApps', 'No apps are available for you yet. Ask your manager.', 2000),
  ('app.me.blurb', 'Your profile and work record', 2001),
  ('app.admin.blurb', 'Set up your company and people', 2002),
  ('app.time.blurb', 'Clock in and attendance', 2003),
  ('app.go.blurb', 'Customer visits and notes', 2004),
  ('app.orders.blurb', 'Orders, invoices and payments', 2005),
  ('app.stock.blurb', 'Items and stock levels', 2006),
  ('app.pos.blurb', 'Sell at the counter', 2007),
  ('app.sites.blurb', 'Jobs, sites and teams', 2008)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('inv.w.title', '{company} បានអញ្ជើញអ្នកឲ្យចូលរួមក្តីសុបិនរបស់ពួកគេ'),
  ('inv.w.by', '{name} បានអញ្ជើញអ្នកឲ្យធ្វើការជាមួយក្រុម។'),
  ('auth.inviteHint', 'កំពុងចូលរួមក្រុមហ៊ុន? ប្រសិនបើអ្នកធ្លាប់ប្រើ UPLIF សូមចូលតាមវិធីដដែលដែលអ្នកធ្លាប់ប្រើ ដើម្បីបន្ថែមក្រុមហ៊ុនទៅគណនីដែលមានស្រាប់។ វិធីផ្សេងនឹងបង្កើតគណនីថ្មីដែលទទេ។'),
  ('inv.w.added', '{company} ត្រូវបានបន្ថែមទៅគណនីរបស់អ្នក'),
  ('inv.w.addedBody', 'អ្នកបានចូលដោយគណនី UPLIF ដែលមានស្រាប់។ ប្តូររវាងក្រុមហ៊ុនបានពីរបារខាងលើក្នុងកម្មវិធីណាមួយ។'),
  ('inv.w.apps', 'បើកកម្មវិធីដែលអ្នកនឹងប្រើ'),
  ('inv.w.openHint', 'បើកកម្មវិធី រួចបន្ថែមវាទៅអេក្រង់ដើម។ លើ iPhone៖ ចុច Share បន្ទាប់មក Add to Home Screen។'),
  ('inv.w.openApp', 'បើក'),
  ('inv.w.noApps', 'មិនទាន់មានកម្មវិធីសម្រាប់អ្នកទេ។ សូមសួរអ្នកគ្រប់គ្រងរបស់អ្នក។'),
  ('app.me.blurb', 'ប្រវត្តិរូប និងកំណត់ត្រាការងាររបស់អ្នក'),
  ('app.admin.blurb', 'រៀបចំក្រុមហ៊ុន និងបុគ្គលិករបស់អ្នក'),
  ('app.time.blurb', 'ចុះវត្តមាន និងរបាយការណ៍វត្តមាន'),
  ('app.go.blurb', 'ការជួបអតិថិជន និងកំណត់ចំណាំ'),
  ('app.orders.blurb', 'ការបញ្ជាទិញ វិក្កយបត្រ និងការទូទាត់'),
  ('app.stock.blurb', 'ទំនិញ និងកម្រិតស្តុក'),
  ('app.pos.blurb', 'លក់នៅបញ្ជរ'),
  ('app.sites.blurb', 'ការងារ ទីតាំង និងក្រុម')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
