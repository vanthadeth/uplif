/** Normalise a phone number to E.164. Local numbers starting with 0 use the default country code. */
export function toE164(input: string, defaultCode = "855"): string | null {
  const raw = input.trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  let e164: string;
  if (raw.startsWith("+")) e164 = digits;
  else if (raw.startsWith("00")) e164 = digits.slice(2);
  else if (digits.startsWith("0")) e164 = defaultCode + digits.slice(1);
  else e164 = defaultCode + digits;
  return e164.length >= 8 && e164.length <= 15 ? `+${e164}` : null;
}
