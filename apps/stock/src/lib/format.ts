/** Local-language text when the UI language is not English and a local value exists, otherwise the English name. */
export const pick = (locale: string, name: string, local: string | null | undefined) =>
  locale !== "en" && local ? local : name;

/** A price in its own currency, for example $1.25 or 5,000 ៛. Falls back to plain text for an unknown code. */
export function money(locale: string, amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
