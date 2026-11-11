/**
 * Machine translation for new languages. The app only talks to this interface, so the provider can change
 * without touching the pages or the database.
 *
 * Provider today: Claude, used when ANTHROPIC_API_KEY is set on the server (Vercel project environment variable).
 * Without a key the stub is used: it reports "unavailable", the language is still created, and people add
 * suggestions by hand until a key is set and machine translation is run again.
 */
export interface MachineProvider {
  /** Translate each source text into the target language. Keys that cannot be translated are left out. */
  translate(items: { key: string; text: string }[], target: { code: string; name: string }): Promise<Record<string, string>>;
}

export class MachineUnavailable extends Error {}

export const stubProvider: MachineProvider = {
  async translate() {
    throw new MachineUnavailable("No machine translation provider is configured (set ANTHROPIC_API_KEY).");
  },
};

const MODEL = process.env.MACHINE_TRANSLATION_MODEL || "claude-haiku-5-5";
const BATCH = 40;

/** Pulls the JSON object out of a model reply, tolerating a code fence around it. */
export function parseTranslations(reply: string): Record<string, string> {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end < start) return {};
  try {
    const obj = JSON.parse(reply.slice(start, end + 1)) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === "string" && v.trim()) as [string, string][]);
  } catch { return {}; }
}

export function claudeProvider(apiKey: string, fetchImpl: typeof fetch = fetch): MachineProvider {
  async function one(batch: { key: string; text: string }[], target: { code: string; name: string }) {
    const source = Object.fromEntries(batch.map((b) => [b.key, b.text]));
    const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: `You translate user interface text for a business management app into ${target.name} (language code ${target.code}). ` +
          "Reply with one JSON object only: the same keys, each with the translated text. Keep every placeholder in curly brackets, such as {name}, exactly as written. " +
          "Keep numbers, product names and the word UPLIF unchanged. Use short, natural wording suited to buttons and labels.",
        messages: [{ role: "user", content: JSON.stringify(source) }],
      }),
    });
    if (!res.ok) throw new Error(`Machine translation failed: ${res.status}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return parseTranslations((body.content ?? []).map((c) => c.text ?? "").join(""));
  }
  return {
    async translate(items, target) {
      const batches: { key: string; text: string }[][] = [];
      for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
      const parts = await Promise.all(batches.map((b) => one(b, target)));
      return Object.assign({}, ...parts);
    },
  };
}

export function machineProvider(): MachineProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? claudeProvider(key) : stubProvider;
}
