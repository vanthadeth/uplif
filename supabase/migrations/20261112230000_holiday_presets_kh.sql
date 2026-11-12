-- Migration 34: Cambodia public-holiday presets for 2027, entered by hand.
-- Cambodia's holidays follow the lunar calendar and the Ministry of Labour announces them late, and neither free source
-- we looked at covers Cambodia (see the pull request). These dates come from officeholidays.com's 2027 table and are
-- marked provisional: companies see "Date to be confirmed" until they edit the day. Replace this list when the official
-- announcement (Prakas) for 2027 is published. Khmer names are machine drafts. The yearly fetch never overwrites rows
-- whose source is 'manual'.
insert into public.holiday_presets (country_code, holiday_date, name, name_local, source, provisional) values
  ('KH', '2027-01-01', 'International New Year''s Day', 'ទិវាចូលឆ្នាំសកល', 'manual', true),
  ('KH', '2027-01-07', 'Victory over Genocide Day', 'ទិវាជ័យជម្នះលើរបបប្រល័យពូជសាសន៍', 'manual', true),
  ('KH', '2027-03-08', 'International Women''s Day', 'ទិវានារីអន្តរជាតិ', 'manual', true),
  ('KH', '2027-04-14', 'Khmer New Year (day 1)', 'បុណ្យចូលឆ្នាំថ្មីប្រពៃណីជាតិ (ថ្ងៃទី១)', 'manual', true),
  ('KH', '2027-04-15', 'Khmer New Year (day 2)', 'បុណ្យចូលឆ្នាំថ្មីប្រពៃណីជាតិ (ថ្ងៃទី២)', 'manual', true),
  ('KH', '2027-04-16', 'Khmer New Year (day 3)', 'បុណ្យចូលឆ្នាំថ្មីប្រពៃណីជាតិ (ថ្ងៃទី៣)', 'manual', true),
  ('KH', '2027-05-01', 'International Labour Day', 'ទិវាពលកម្មអន្តរជាតិ', 'manual', true),
  ('KH', '2027-05-14', 'King''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្មព្រះមហាក្សត្រ', 'manual', true),
  ('KH', '2027-05-20', 'Visak Bochea Day', 'ពិធីបុណ្យវិសាខបូជា', 'manual', true),
  ('KH', '2027-05-24', 'Royal Plowing Ceremony', 'ព្រះរាជពិធីបុណ្យច្រត់ព្រះនង្គ័ល', 'manual', true),
  ('KH', '2027-06-18', 'Queen Mother''s Birthday', 'ព្រះរាជពិធីបុណ្យចម្រើនព្រះជន្មព្រះវររាជមាតា', 'manual', true),
  ('KH', '2027-09-24', 'Constitution Day', 'ទិវារដ្ឋធម្មនុញ្ញ', 'manual', true),
  ('KH', '2027-09-29', 'Pchum Ben Day (day 1)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (ថ្ងៃទី១)', 'manual', true),
  ('KH', '2027-09-30', 'Pchum Ben Day (day 2)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (ថ្ងៃទី២)', 'manual', true),
  ('KH', '2027-10-01', 'Pchum Ben Day (day 3)', 'ពិធីបុណ្យភ្ជុំបិណ្ឌ (ថ្ងៃទី៣)', 'manual', true),
  ('KH', '2027-10-15', 'Commemoration Day of the King Father', 'ទិវាគោរពព្រះវិញ្ញាណក្ខន្ធព្រះបរមរតនកោដ្ឋ', 'manual', true),
  ('KH', '2027-10-29', 'Coronation Day', 'ព្រះរាជពិធីបុណ្យគ្រងព្រះបរមសិរីរាជសម្បត្តិ', 'manual', true),
  ('KH', '2027-11-09', 'Independence Day', 'ពិធីបុណ្យឯករាជ្យជាតិ', 'manual', true),
  ('KH', '2027-11-12', 'Water Festival (day 1)', 'ព្រះរាជពិធីបុណ្យអុំទូក អកអំបុក និងសំពះព្រះខែ (ថ្ងៃទី១)', 'manual', true),
  ('KH', '2027-11-13', 'Water Festival (day 2)', 'ព្រះរាជពិធីបុណ្យអុំទូក អកអំបុក និងសំពះព្រះខែ (ថ្ងៃទី២)', 'manual', true),
  ('KH', '2027-11-14', 'Water Festival (day 3)', 'ព្រះរាជពិធីបុណ្យអុំទូក អកអំបុក និងសំពះព្រះខែ (ថ្ងៃទី៣)', 'manual', true),
  ('KH', '2027-12-29', 'Peace Day', 'ទិវាសន្តិភាព', 'manual', true)
on conflict (country_code, holiday_date, name) do nothing;
