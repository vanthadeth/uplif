import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { LearnTestsView, type ResultRow, type TestRow } from "./view";

export default async function LearnTestsPage() {
  const { supabase, permissions } = await loadSession();
  const canManage = permissions.includes("learn.test.manage");
  const canRead = permissions.includes("learn.result.read");
  if (!canManage && !canRead) redirect("/dashboard");

  // Read as the signed-in user. Authors read tests through row-level security; results are limited by scope in the database.
  const [tests, questions, options, results] = await Promise.all([
    canManage ? supabase.from("learn_tests").select("id, title, title_local, pass_percent, retake_days, archived").order("created_at", { ascending: false }) : null,
    canManage ? supabase.from("learn_questions").select("id, test_id, position, prompt, prompt_local").order("position") : null,
    canManage ? supabase.from("learn_options").select("question_id, position, label, label_local, is_correct").order("position") : null,
    canRead ? supabase.rpc("learn_results") : null,
  ]);
  const optsByQ = new Map<string, TestRow["questions"][number]["options"]>();
  for (const o of options?.data ?? []) {
    const list = optsByQ.get(o.question_id) ?? [];
    list.push({ label: o.label, label_local: o.label_local ?? "", correct: o.is_correct });
    optsByQ.set(o.question_id, list);
  }
  const qsByTest = new Map<string, TestRow["questions"]>();
  for (const q of questions?.data ?? []) {
    const list = qsByTest.get(q.test_id) ?? [];
    list.push({ prompt: q.prompt, prompt_local: q.prompt_local ?? "", options: optsByQ.get(q.id) ?? [] });
    qsByTest.set(q.test_id, list);
  }
  const rows: TestRow[] = (tests?.data ?? []).map((t) => ({ ...t, questions: qsByTest.get(t.id) ?? [] }));
  return <LearnTestsView canManage={canManage} canRead={canRead} tests={rows} results={(results?.data ?? []) as ResultRow[]} />;
}
