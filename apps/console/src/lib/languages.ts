/**
 * Supported interface languages: the single list the language menu, saved profile language and date
 * formats read from. Adding a language is one line here (the menu, its search and its scrolling need no
 * layout change). Until its strings are added to `dictionaries` in messages.ts and a reviewer approves
 * them, the language falls back to English text, so it can be listed early.
 */
export const languages = [
  { code: "en", native: "English", english: "English", dateTag: "en-GB" },
  { code: "km", native: "ខ្មែរ", english: "Khmer", dateTag: "km-KH" },
  { code: "zh", native: "中文", english: "Chinese", dateTag: "zh-CN" },
  { code: "th", native: "ไทย", english: "Thai", dateTag: "th-TH" },
  { code: "lo", native: "ລາວ", english: "Lao", dateTag: "lo-LA" },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese", dateTag: "vi-VN" },
] as const;

export type Locale = (typeof languages)[number]["code"];

export const isLocale = (v: unknown): v is Locale => languages.some((l) => l.code === v);
export const languageOf = (code: string) => languages.find((l) => l.code === code) ?? languages[0];
