import { loadSession } from "@/lib/auth/session";
import { rpc } from "@/lib/translation/api";
import type { LanguageRow } from "@/lib/translation/types";
import { LanguageSelect } from "./select";

export default async function LanguagePage() {
  const { supabase, claims } = await loadSession();
  const languages = await rpc<LanguageRow[]>(supabase, "i18n_languages_list").catch(() => []);
  return <LanguageSelect languages={languages} userId={claims?.sub ?? ""} />;
}
