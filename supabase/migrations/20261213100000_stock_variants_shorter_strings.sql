-- Shorter help text on the variants sheet. Machine Khmer drafts are replaced; reviewed ones are left alone.
update public.i18n_strings set source_text = 'Use variants when each version has its own stock, like sizes.', updated_at = now() where key = 'sk.var.help';
update public.i18n_strings set source_text = 'Add variants only if each version needs its own count.', updated_at = now() where key = 'sk.var.emptyBody';
update public.i18n_strings set source_text = 'Can one option run out while the others are in stock? If yes, make them variants.', updated_at = now() where key = 'sk.var.notSureBody';

update public.i18n_suggestions s set text = v.text
from (values
  ('sk.var.help', 'ប្រើជម្រើស នៅពេលកំណែនីមួយៗមានស្តុកផ្ទាល់ខ្លួន ដូចជាទំហំ។'),
  ('sk.var.emptyBody', 'បន្ថែមជម្រើស តែនៅពេលកំណែនីមួយៗត្រូវការរាប់ស្តុកដាច់ដោយឡែក។'),
  ('sk.var.notSureBody', 'តើអាចអស់ជម្រើសមួយ ខណៈដែលជម្រើសផ្សេងទៀតនៅមានស្តុកឬទេ? បើបាទ/ចាស សូមធ្វើជាជម្រើសរាប់ស្តុក។')
) as v(key, text)
where s.language_code = 'km' and s.string_key = v.key and s.origin = 'machine';
