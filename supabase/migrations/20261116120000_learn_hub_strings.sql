-- Strings for the Learn hub, code of conduct and the console Policies page tabs.
-- Khmer entries are machine drafts for the Khmer reviewer at /i18n; a reviewer's pinned or voted text is never overwritten.
insert into public.i18n_strings (key, source_text, position) values
  ('st.learn.attention', 'Needs your attention', 1877),
  ('st.learn.attn.tests', 'Tests to take: {n}', 1878),
  ('st.learn.attn.policies', 'Policies to confirm: {n}', 1879),
  ('st.learn.attn.conduct', 'Confirm the code of conduct', 1880),
  ('st.learn.tile.tests', 'Tests', 1881),
  ('st.learn.tile.policies', 'Company policies', 1882),
  ('st.learn.tile.conduct', 'Code of conduct', 1883),
  ('st.learn.sub.todo', '{n} to do', 1884),
  ('st.learn.sub.allDone', 'All done', 1885),
  ('st.learn.sub.none', 'Nothing yet', 1886),
  ('st.learn.back', 'Back to Learn', 1888),
  ('st.learn.policies.empty.title', 'No policies yet', 1889),
  ('st.learn.policies.empty.body', 'Company policies will appear here when your company adds them.', 1890),
  ('st.learn.conduct.empty.title', 'No code of conduct yet', 1891),
  ('st.learn.conduct.empty.body', 'Your company''s code of conduct will appear here when it is published.', 1892),
  ('st.learn.tests.empty.title', 'No tests yet', 1893),
  ('st.learn.tests.empty.body', 'Tests from your company will appear here.', 1894),
  ('st.policy.confirmConduct', 'I have read the code of conduct and agree to follow it.', 1895),
  ('pol.tabsLabel', 'Type', 1896),
  ('pol.tabPolicies', 'Policies', 1897),
  ('pol.tabConduct', 'Code of conduct', 1898),
  ('pol.addConduct', 'New code of conduct', 1899),
  ('pol.editConduct', 'Edit code of conduct', 1900),
  ('pol.emptyConduct', 'No code of conduct yet', 1901),
  ('pol.emptyConductBody', 'Publish your code of conduct. Staff will see it in UPLIF Me under Learn and confirm it.', 1902)
on conflict (key) do nothing;

insert into public.i18n_suggestions (language_code, string_key, text, origin)
select 'km', v.key, v.text, 'machine' from (values
  ('st.learn.attention', 'ត្រូវការការយកចិត្តទុកដាក់ពីអ្នក'),
  ('st.learn.attn.tests', 'ការធ្វើតេស្តត្រូវធ្វើ៖ {n}'),
  ('st.learn.attn.policies', 'គោលនយោបាយត្រូវបញ្ជាក់៖ {n}'),
  ('st.learn.attn.conduct', 'បញ្ជាក់ក្រមសីលធម៌'),
  ('st.learn.tile.tests', 'ការធ្វើតេស្ត'),
  ('st.learn.tile.policies', 'គោលនយោបាយក្រុមហ៊ុន'),
  ('st.learn.tile.conduct', 'ក្រមសីលធម៌'),
  ('st.learn.sub.todo', '{n} ត្រូវធ្វើ'),
  ('st.learn.sub.allDone', 'បានធ្វើរួចអស់'),
  ('st.learn.sub.none', 'មិនទាន់មាន'),
  ('st.learn.back', 'ត្រឡប់ទៅចំណេះដឹង'),
  ('st.learn.policies.empty.title', 'មិនទាន់មានគោលនយោបាយ'),
  ('st.learn.policies.empty.body', 'គោលនយោបាយក្រុមហ៊ុននឹងបង្ហាញនៅទីនេះ នៅពេលក្រុមហ៊ុនបន្ថែម។'),
  ('st.learn.conduct.empty.title', 'មិនទាន់មានក្រមសីលធម៌'),
  ('st.learn.conduct.empty.body', 'ក្រមសីលធម៌របស់ក្រុមហ៊ុននឹងបង្ហាញនៅទីនេះ នៅពេលត្រូវបានផ្សព្វផ្សាយ។'),
  ('st.learn.tests.empty.title', 'មិនទាន់មានការធ្វើតេស្ត'),
  ('st.learn.tests.empty.body', 'ការធ្វើតេស្តពីក្រុមហ៊ុននឹងបង្ហាញនៅទីនេះ។'),
  ('st.policy.confirmConduct', 'ខ្ញុំបានអានក្រមសីលធម៌ ហើយយល់ព្រមអនុវត្តតាម។'),
  ('pol.tabsLabel', 'ប្រភេទ'),
  ('pol.tabPolicies', 'គោលនយោបាយ'),
  ('pol.tabConduct', 'ក្រមសីលធម៌'),
  ('pol.addConduct', 'ក្រមសីលធម៌ថ្មី'),
  ('pol.editConduct', 'កែក្រមសីលធម៌'),
  ('pol.emptyConduct', 'មិនទាន់មានក្រមសីលធម៌'),
  ('pol.emptyConductBody', 'ផ្សព្វផ្សាយក្រមសីលធម៌របស់អ្នក។ បុគ្គលិកនឹងឃើញវានៅក្នុង UPLIF Me ក្រោមផ្នែកចំណេះដឹង ហើយបញ្ជាក់។')
) as v(key, text)
where not exists (select 1 from public.i18n_suggestions s where s.language_code = 'km' and s.string_key = v.key);
