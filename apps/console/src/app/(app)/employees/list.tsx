"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Info, Link2, Link2Off, Lock, Mail, Pencil, Plus, Search } from "lucide-react";
import { Badge, Button, Input, Modal, Select, useToast, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

type Status = "active" | "on_leave" | "left";
interface Employee {
  id: string; employee_no: string | null; name: string; name_local: string | null; department_id: string | null; position_id: string | null;
  branch_id: string | null; reports_to_id: string | null; membership_id: string | null; employment_date: string | null; status: Status;
}
interface Named { id: string; name: string; name_local: string | null }
interface Member { id: string; display_name: string | null; status: string }

const tone: Record<Status, BadgeTone> = { active: "success", on_leave: "warning", left: "neutral" };
const statusKey: Record<Status, MessageKey> = { active: "emp.s.active", on_leave: "emp.s.on_leave", left: "emp.s.left" };

interface Props {
  employees: Employee[];
  departments: Named[];
  positions: Named[];
  branches: Named[];
  members: Member[];
  companyId: string;
  canManage: boolean;
  /** Can send invitations; employees with a pending invitation are listed in pendingInvites. */
  canInvite: boolean;
  /** Can read work schedules: each row links to the employee's Time and leave page. */
  canSchedule: boolean;
  pendingInvites: string[];
}

export function EmployeeList({ employees, departments, positions, branches, members, companyId, canManage, canInvite, canSchedule, pendingInvites }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Employee | "new" | null>(null);
  const [linking, setLinking] = useState<Employee | null>(null);
  const [linkTo, setLinkTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [f, setF] = useState({ name: "", nameLocal: "", no: "", dept: "", pos: "", branch: "", boss: "", hired: "", status: "active" as Status });
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  const nm = (list: Named[], id: string | null) => { const x = list.find((y) => y.id === id); return x ? pick(locale, x.name, x.name_local) : ""; };
  const empName = (id: string | null) => { const e = employees.find((y) => y.id === id); return e ? pick(locale, e.name, e.name_local) : ""; };
  const memberName = (m: Member) => m.display_name ?? "—";
  const n = (v: number) => v.toLocaleString(locale === "km" ? "km-KH" : "en");
  const directReports = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of employees) if (e.reports_to_id && e.status !== "left") c[e.reports_to_id] = (c[e.reports_to_id] ?? 0) + 1;
    return c;
  }, [employees]);
  const linkedIds = new Set(employees.map((e) => e.membership_id).filter(Boolean));
  const freeMembers = members.filter((m) => m.status !== "removed" && !linkedIds.has(m.id));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => !q || `${e.name} ${e.name_local ?? ""} ${e.employee_no ?? ""}`.toLowerCase().includes(q));
  }, [employees, query]);

  function open(e: Employee | "new") {
    setEditing(e);
    setError(undefined);
    setF(e === "new"
      ? { name: "", nameLocal: "", no: "", dept: "", pos: "", branch: "", boss: "", hired: "", status: "active" }
      : { name: e.name, nameLocal: e.name_local ?? "", no: e.employee_no ?? "", dept: e.department_id ?? "", pos: e.position_id ?? "", branch: e.branch_id ?? "", boss: e.reports_to_id ?? "", hired: e.employment_date ?? "", status: e.status });
  }

  function failure(code: string | undefined, message: string | undefined) {
    if (code === "23505") return t("emp.err.dup");
    if (code === "42501") return t("common.forbidden");
    const m = message ?? "";
    if (m.includes("loop")) return t("emp.err.loop");
    if (m.includes("left the company")) return t("emp.err.manager");
    if (m.includes("themselves")) return t("emp.err.self");
    if (m.includes("owner cannot")) return t("emp.err.owner");
    return t("common.saveError");
  }

  async function save() {
    if (!f.name.trim()) return setError(t("emp.error.name"));
    setBusy(true);
    const values = {
      name: f.name.trim(), name_local: f.nameLocal.trim() || null, employee_no: f.no.trim() || null,
      department_id: f.dept || null, position_id: f.pos || null, branch_id: f.branch || null, reports_to_id: f.boss || null,
      employment_date: f.hired || null, status: f.status,
    };
    const supabase = createClient();
    const res = editing === "new"
      ? await supabase.from("employees").insert({ company_id: companyId, ...values }).select("id")
      : await supabase.from("employees").update(values).eq("id", (editing as Employee).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", failure(res.error.code, res.error.message));
    if (!res.data?.length) return toast("error", t("common.forbidden"));
    toast("success", editing === "new" ? t("emp.added") : t("emp.saved"));
    setEditing(null);
    router.refresh();
  }

  async function link(e: Employee, membershipId: string | null) {
    setBusy(true);
    const { error: err } = await createClient().rpc("link_employee", { p_employee_id: e.id, p_membership_id: membershipId });
    setBusy(false);
    if (err) return toast("error", err.code === "23505" ? t("emp.linkTaken") : err.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    setLinking(null);
    toast("success", membershipId ? t("emp.linked") : t("emp.unlinked"));
    router.refresh();
  }

  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("emp.add")}</Button>;
  const bosses = employees.filter((e) => e.status !== "left" && (editing === "new" || e.id !== (editing as Employee | null)?.id));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("emp.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("emp.subtitle")}</p>
        </div>
        {canManage ? add : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("branches.viewOnly")}</Badge>}
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("emp.roTitle")}</b>{t("emp.roBody")}</div>
        </div>
      )}

      {employees.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t("emp.empty")}</b>
          {t("emp.emptyBody")}
          {canManage && <div className="mt-3.5">{add}</div>}
        </div>
      ) : (
        <>
          <label className="flex min-h-11 max-w-none items-center gap-2 rounded-control border border-line-strong bg-surface px-3 sm:max-w-[380px]">
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("emp.search")} aria-label={t("emp.search")}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {shown.length === 0 ? (
              <div className="px-4 py-9 text-center text-muted"><b className="mb-1 block text-[15px] text-ink">{t("emp.noMatch")}</b>{t("emp.noMatchBody")}</div>
            ) : shown.map((e) => (
              <div key={e.id} className={`grid min-h-[68px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0 ${e.status === "left" ? "[&_.nm]:text-muted" : ""}`}>
                <div className="nm min-w-0 leading-snug">
                  <b className="block break-words text-[15px] font-semibold">{pick(locale, e.name, e.name_local)}{e.employee_no && <span className="ms-2 text-[13px] font-normal text-muted">#{e.employee_no}</span>}</b>
                  <small className="block break-words text-[13px] text-muted">{[nm(positions, e.position_id), nm(departments, e.department_id), nm(branches, e.branch_id)].filter(Boolean).join(" · ") || "—"}</small>
                  <small className="block break-words text-[13px] text-muted">
                    {e.reports_to_id ? `${t("emp.reports")}: ${empName(e.reports_to_id)}` : ""}
                    {directReports[e.id] ? `${e.reports_to_id ? " · " : ""}${t("emp.team").replace("{n}", n(directReports[e.id]))}` : ""}
                    {e.employment_date ? ` · ${fmtDate(locale, e.employment_date)}` : ""}
                  </small>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge tone={tone[e.status]}>{t(statusKey[e.status])}</Badge>
                  <Badge tone={e.membership_id ? "info" : "neutral"}>{e.membership_id ? t("emp.userLinked") : t("emp.userNone")}</Badge>
                </div>
                {(canManage || canInvite || canSchedule) && (
                  <div className="col-span-2 mt-1.5 flex flex-wrap gap-2 md:justify-end">
                    {canInvite && !e.membership_id && e.status !== "left" && (pendingInvites.includes(e.id)
                      ? <Badge tone="info">{t("inv.invitePending")}</Badge>
                      : <Link href={`/users?invite=1&employee=${e.id}`} className="inline-flex min-h-(--control-h) flex-1 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-semibold md:flex-none"><Mail className="size-4" aria-hidden />{t("inv.inviteBtn")}</Link>)}
                    {canSchedule && <Link href={`/employees/${e.id}`} className="inline-flex min-h-(--control-h) flex-1 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-semibold md:flex-none"><CalendarClock className="size-4" aria-hidden />{t("wt.emp.link")}</Link>}
                    {canManage && <>
                    <Button className="flex-1 md:flex-none" onClick={() => open(e)}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Button>
                    {e.membership_id
                      ? <Button className="flex-1 md:flex-none" loading={busy} onClick={() => link(e, null)}><Link2Off className="size-4" aria-hidden />{t("emp.unlink")}</Button>
                      : <Button className="flex-1 md:flex-none" onClick={() => { setLinking(e); setLinkTo(freeMembers[0]?.id ?? ""); }}><Link2 className="size-4" aria-hidden />{t("emp.link")}</Button>}
                    </>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("common.close")} title={editing === "new" ? t("emp.add") : t("emp.edit")}
        footer={<><Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("branches.saveBtn")}</Button></>}>
        <div className="flex flex-col gap-4">
          <Input label={t("emp.name")} value={f.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} error={error} />
          <Input label={t("emp.nameLocal")} value={f.nameLocal} maxLength={120} onChange={(e) => set({ nameLocal: e.target.value })} hint={t("branches.nameLocalHint")} />
          <Input label={t("emp.no")} value={f.no} maxLength={40} onChange={(e) => set({ no: e.target.value })} />
          <Select label={t("emp.department")} value={f.dept} onChange={(e) => set({ dept: e.target.value })}>
            <option value="">{t("emp.none")}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{pick(locale, d.name, d.name_local)}</option>)}
          </Select>
          <Select label={t("emp.position")} value={f.pos} onChange={(e) => set({ pos: e.target.value })}>
            <option value="">{t("emp.none")}</option>
            {positions.map((d) => <option key={d.id} value={d.id}>{pick(locale, d.name, d.name_local)}</option>)}
          </Select>
          {branches.length > 0 && (
            <Select label={t("emp.branch")} value={f.branch} onChange={(e) => set({ branch: e.target.value })}>
              <option value="">{t("emp.none")}</option>
              {branches.map((d) => <option key={d.id} value={d.id}>{pick(locale, d.name, d.name_local)}</option>)}
            </Select>
          )}
          <Select label={t("emp.reportsTo")} value={f.boss} onChange={(e) => set({ boss: e.target.value })}>
            <option value="">{t("emp.none")}</option>
            {bosses.map((d) => <option key={d.id} value={d.id}>{pick(locale, d.name, d.name_local)}</option>)}
          </Select>
          <Input label={t("emp.hired")} type="date" value={f.hired} onChange={(e) => set({ hired: e.target.value })} />
          <Select label={t("emp.status")} value={f.status} onChange={(e) => set({ status: e.target.value as Status })}>
            {(["active", "on_leave", "left"] as const).map((s) => <option key={s} value={s}>{t(statusKey[s])}</option>)}
          </Select>
          {f.status === "left" && <p className="text-[13px] leading-snug text-muted">{t("emp.leftNote")}</p>}
        </div>
      </Modal>

      <Modal open={linking !== null} onClose={() => setLinking(null)} closeLabel={t("common.close")} title={t("emp.linkTitle")}
        footer={<><Button onClick={() => setLinking(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!linkTo} onClick={() => linking && link(linking, linkTo)}>{t("emp.link")}</Button></>}>
        <div className="flex flex-col gap-3">
          {linking && <p className="font-semibold">{pick(locale, linking.name, linking.name_local)}</p>}
          {freeMembers.length === 0
            ? <p className="leading-relaxed text-muted">{t("emp.linkNone")}</p>
            : <Select label={t("emp.linkPick")} value={linkTo} onChange={(e) => setLinkTo(e.target.value)}>{freeMembers.map((m) => <option key={m.id} value={m.id}>{memberName(m)}</option>)}</Select>}
        </div>
      </Modal>
    </div>
  );
}
