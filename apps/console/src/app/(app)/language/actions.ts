"use server";
import { createClient } from "@/lib/supabase/server";
import { machineProvider, MachineUnavailable } from "@/lib/translation/machine";
import { rpc } from "@/lib/translation/api";
import type { MessageKey } from "@/lib/messages";
import { errorKey } from "@/lib/translation/api";

export type StartResult = { ok: true; status: "done" | "unavailable"; count: number; code: string } | { ok: false; error: MessageKey };

/** Machine translates every string that has no text yet and stores the results as machine drafts. */
async function machineRun(code: string, name: string): Promise<{ status: "done" | "unavailable"; count: number }> {
  const supabase = await createClient();
  const todo = await rpc<{ string_key: string; source_text: string }[]>(supabase, "i18n_begin_machine", { p_lang: code });
  try {
    const out = await machineProvider().translate(todo.map((r) => ({ key: r.string_key, text: r.source_text })), { code, name });
    const count = await rpc<number>(supabase, "i18n_add_machine_drafts", { p_lang: code, p_drafts: out });
    return { status: "done", count };
  } catch (e) {
    // No provider, or it failed: nothing was stored, so the language stays usable and the run can be retried.
    await rpc(supabase, "i18n_machine_unavailable", { p_lang: code }).catch(() => {});
    if (!(e instanceof MachineUnavailable)) console.error("machine translation failed", e);
    return { status: "unavailable", count: 0 };
  }
}

/** Start machine translation for a language that already exists in the list. */
export async function startMachine(code: string, name: string): Promise<StartResult> {
  try {
    const r = await machineRun(code, name);
    return { ok: true, code, ...r };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}

/** Create a new language, then machine translate it. */
export async function createLanguage(code: string, native: string, english: string): Promise<StartResult> {
  try {
    const supabase = await createClient();
    const made = await rpc<string>(supabase, "i18n_create_language", { p_code: code, p_native: native, p_english: english });
    const r = await machineRun(made, english || native);
    return { ok: true, code: made, ...r };
  } catch (e) {
    return { ok: false, error: errorKey(e) };
  }
}
