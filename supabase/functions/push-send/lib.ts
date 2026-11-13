/** Words for the push message. It never carries details: only that something is waiting in the app. */
export const WORDS: Record<string, { title: string; body: string }> = {
  en: { title: "UPLIF Me", body: "You have a new update." },
  km: { title: "UPLIF Me", body: "អ្នកមានដំណឹងថ្មី។" },
};

export function wordsFor(locale: string | null | undefined) {
  return WORDS[locale ?? "en"] ?? WORDS.en;
}

/** Compare two secrets without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** True when the push service says this address will never work again. */
export const isGone = (status: number | undefined) => status === 404 || status === 410;
