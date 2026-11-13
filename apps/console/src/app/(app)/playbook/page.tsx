import { redirect } from "next/navigation";
import { loadSession } from "@/lib/auth/session";
import { PlaybookView, type GuideRow, type PositionOption, type StepDraftData } from "./view";

export default async function PlaybookPage() {
  const { supabase, permissions, companyId } = await loadSession();
  if (!permissions.includes("learn.playbook.manage")) redirect("/dashboard");

  // Read as the signed-in user through row-level security.
  const [guides, steps, links, positions] = await Promise.all([
    supabase.from("playbook_guides").select("id, title, title_local, topic, read_minutes, archived").order("created_at", { ascending: false }),
    supabase.from("playbook_steps").select("guide_id, position, title, title_local, skip_if, skip_condition, skip_condition_local, body, body_local, image_path").order("position"),
    supabase.from("playbook_guide_positions").select("guide_id, position_id"),
    supabase.from("positions").select("id, name, name_local").order("name"),
  ]);
  const stepsBy = new Map<string, StepDraftData[]>();
  for (const s of steps.data ?? []) {
    const list = stepsBy.get(s.guide_id) ?? [];
    list.push({ title: s.title, title_local: s.title_local ?? "", skip_if: s.skip_if, skip_condition: s.skip_condition ?? "", skip_condition_local: s.skip_condition_local ?? "", body: s.body, body_local: s.body_local ?? "", image_path: s.image_path });
    stepsBy.set(s.guide_id, list);
  }
  const posBy = new Map<string, string[]>();
  for (const l of links.data ?? []) posBy.set(l.guide_id, [...(posBy.get(l.guide_id) ?? []), l.position_id]);

  const rows: GuideRow[] = await Promise.all((guides.data ?? []).map(async (g) => {
    const { data } = await supabase.rpc("playbook_progress_status", { p_guide_id: g.id });
    return { ...g, steps: stepsBy.get(g.id) ?? [], position_ids: posBy.get(g.id) ?? [], people: data ?? [] };
  }));
  return <PlaybookView rows={rows} positions={(positions.data ?? []) as PositionOption[]} companyId={companyId ?? ""} />;
}
