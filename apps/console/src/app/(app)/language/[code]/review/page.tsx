import { notFound, redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { rpc } from "@/lib/translation/api";
import type { LanguageRow, QueueRow } from "@/lib/translation/types";
import { Review } from "./view";

export default async function ReviewPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase } = await loadSession();
  const languages = await rpc<LanguageRow[]>(supabase, "i18n_languages_list").catch(() => []);
  const language = languages.find((l) => l.code === code);
  if (!language || language.is_source) notFound();
  // Only reviewers get the queue; everyone else goes to the translation workspace.
  if (!language.is_reviewer) redirect(`/language/${code}`);
  const queue = await rpc<QueueRow[]>(supabase, "i18n_review_queue", { p_lang: code });
  return <Review language={language} initial={queue} />;
}
