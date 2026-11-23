/**
 * Supported interface languages: the single list the language menu, saved profile language and date
 * formats read from. Adding a language is one line here (the popup and the language page need no
 * layout change). `featured` ones appear in the language popup; the rest are reached through "More languages".
 * Until its strings are added to `dictionaries` in messages.ts and a reviewer approves
 * them, the language falls back to English text, so it can be listed early.
 */
export const languages = [
  { code: "en", native: "English", english: "English", dateTag: "en-GB", featured: true },
  { code: "km", native: "ខ្មែរ", english: "Khmer", dateTag: "km-KH", featured: true },
  { code: "zh", native: "中文", english: "Chinese", dateTag: "zh-CN", featured: true },
  { code: "th", native: "ไทย", english: "Thai", dateTag: "th-TH", featured: true },
  { code: "vi", native: "Tiếng Việt", english: "Vietnamese", dateTag: "vi-VN", featured: true },
  { code: "lo", native: "ລາວ", english: "Lao", dateTag: "lo-LA", featured: false },
] as const;

/** Any language code. Languages started in the translation community are added in the database, not in this list. */
export type Locale = string;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(v);
export const languageOf = (code: string) => languages.find((l) => l.code === code) ?? languages[0];
