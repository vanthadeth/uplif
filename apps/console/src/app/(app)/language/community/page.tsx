import { loadSession } from "@/lib/auth/session";
import { rpc } from "@/lib/translation/api";
import type { LanguageRow, MyStats } from "@/lib/translation/types";
import { Community } from "./view";

export default async function CommunityPage() {
  const { supabase } = await loadSession();
  const [languages, stats] = await Promise.all([
    rpc<LanguageRow[]>(supabase, "i18n_languages_list").catch(() => []),
    rpc<MyStats[]>(supabase, "i18n_my_stats").catch(() => []),
  ]);
  return <Community languages={languages} stats={stats[0] ?? { suggestions: 0, votes: 0, shown: 0 }} />;
}
