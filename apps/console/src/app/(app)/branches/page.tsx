import { loadSession } from "@/lib/auth/session";
import { BranchList } from "./list";

export default async function BranchesPage() {
  const { supabase, companyId, permissions } = await loadSession();
  const can = (k: string) => permissions.includes(k);
  // Read as the signed-in user, so row-level security decides which branches and assignments they see.
  // People counts need to read role assignments, so they are shown only to people allowed to.
  const canPeople = can("org.role.read");
  const [{ data }, assignments] = await Promise.all([
    supabase.from("branches").select("id, name, name_local, is_active, created_at").order("created_at"),
    canPeople ? supabase.from("membership_roles").select("branch_id, membership_id").not("branch_id", "is", null) : Promise.resolve({ data: null }),
  ]);
  const people: Record<string, number> | null = canPeople ? {} : null;
  if (people) {
    const seen = new Set<string>();
    for (const a of assignments.data ?? []) {
      const key = `${a.branch_id}:${a.membership_id}`;
      if (a.branch_id && !seen.has(key)) { seen.add(key); people[a.branch_id] = (people[a.branch_id] ?? 0) + 1; }
    }
  }
  return (
    <BranchList
      branches={data ?? []}
      people={people}
      companyId={companyId ?? ""}
      canCreate={can("org.branch.create")}
      canUpdate={can("org.branch.update")}
    />
  );
}
