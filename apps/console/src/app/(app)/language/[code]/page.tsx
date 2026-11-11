import { notFound } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { rpc } from "@/lib/translation/api";
import type { LanguageRow, WorkspaceRow } from "@/lib/translation/types";
import { Workspace } from "./workspace";

export default async function WorkspacePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase } = await loadSession();
  const languages = await rpc<LanguageRow[]>(supabase, "i18n_languages_list").catch(() => []);
  const language = languages.find((l) => l.code === code);
  if (!language || language.is_source) notFound();
  const rows = await rpc<WorkspaceRow[]>(supabase, "i18n_workspace", { p_lang: code });
  return <Workspace language={language} initial={rows} />;
}
