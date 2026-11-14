/** Local-language text when the UI language is not English and a local value exists, otherwise the English name. */
export const pick = (locale: string, name: string, local: string | null | undefined) =>
  locale !== "en" && local ? local : name;
