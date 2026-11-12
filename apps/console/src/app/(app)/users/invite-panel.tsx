"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Info, Plus, Send, Share2, X } from "lucide-react";
import { Badge, Button, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/translation/api";
import { fmtDate, pick } from "@/lib/format";
import { planLimitKey } from "@/lib/plan-limit";
import type { MessageKey } from "@/lib/messages";
import type { Json } from "@/lib/supabase/database.types";
import type { PermissionDef } from "./overrides";
import { DraftOverridesDialog, type DraftOverride } from "./draft-overrides";

export interface InviteEmployee { id: string; name: string; name_local: string | null; membership_id: string | null; status: "active" | "on_leave" | "left"; position_id: string | null }
export interface InvitePosition { id: string; name: string; name_local: string | null; default_role_id: string | null }
export interface InviteRole { id: string; name: string; name_local: string | null }
export interface InviteBranch { id: string; name: string; name_local: string | null; is_active: boolean }
/** What the database says about seats: shared by every company the owner has. */
export interface Seats { max: number | null; active: number; pending: number; is_owner: boolean; owner_name: string | null; companies: { name: string; name_local: string | null; count: number }[] | null }

interface Row { id: number; roleId: string; branchId: string }
const NEW = "__new__";
const DAYS = [1, 3, 7, 14] as const;

/** The state of the seats for a person about to invite. Exported so the page header can reuse the wording. */
export function seatState(seats: Seats | null) {
  if (!seats || seats.max == null) return { used: seats ? seats.active + seats.pending : 0, max: seats?.max ?? null, left: Infinity, full: false, last: false };
  const used = seats.active + seats.pending;
  const left = seats.max - used;
  return { used, max: seats.max, left, full: left <= 0, last: left === 1 };
}

/** The plan-limit banner: last seat, or none left. Owners are pointed at plans; everyone else at the owner. */
export function SeatBanner({ seats, onInvites }: { seats: Seats | null; onInvites?: () => void }) {
  const { t, locale } = useI18n();
  const st = seatState(seats);
  if (!seats || (!st.full && !st.last)) return null;
  if (st.last) {
    return (
      <div role="note" className="flex items-start gap-3 rounded-card bg-warning-soft p-3 leading-normal text-warning-ink">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div><b className="block">{t("inv.seat.last.title")}</b>{t("inv.seat.last.body")}</div>
      </div>
    );
  }
  const split = (seats.companies ?? []).map((c) => `${pick(locale, c.name, c.name_local)} ${c.count}`).join(", ");
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-card bg-danger-soft p-3 leading-normal text-danger-ink">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <b className="block">{fill(t("inv.seat.full.title"), { max: st.max ?? 0 })}</b>
          {seats.is_owner
            ? fill(t("inv.seat.full.owner"), { split })
            : seats.owner_name ? fill(t("inv.seat.full.admin"), { owner: seats.owner_name }) : t("inv.seat.full.adminNoName")}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {seats.is_owner && <Link href="/account" className="inline-flex min-h-10 items-center rounded-control bg-primary px-4 font-semibold text-white">{t("inv.seat.plans")}</Link>}
        {onInvites && <Button onClick={onInvites}>{t("inv.seat.invites")}</Button>}
      </div>
    </div>
  );
}

/** Colour-coded cells: active members, pending invitations, the invitation being made, then free seats. */
export function SeatMeter({ seats, adding }: { seats: Seats | null; adding: boolean }) {
  const { t } = useI18n();
  if (!seats) return null;
  const st = seatState(seats);
  const max = st.max;
  const cells = max != null && max <= 30 ? Array.from({ length: max }, (_, i) => (i < seats.active ? "a" : i < st.used ? "p" : adding && i === st.used ? "n" : "f")) : null;
  return (
    <div className="rounded-control border border-line p-3">
      <div className="flex items-center justify-between gap-2 font-semibold"><span>{t("inv.meter")}</span><span className="tabular-nums">{seats.active} + {seats.pending} / {max ?? "∞"}</span></div>
      {cells && (
        <div className="my-2 flex gap-1" role="img" aria-label={`${st.used} / ${max}`}>
          {cells.map((c, i) => (
            <i key={i} className={`block h-2.5 flex-1 rounded-[3px] ${c === "a" ? "bg-primary" : c === "p" ? "bg-primary/40" : c === "n" ? "border-2 border-primary bg-surface" : "border border-line bg-neutral-soft"}`} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><i className="me-1.5 inline-block size-2.5 rounded-[3px] bg-primary" />{t("inv.lgActive")}</span>
        <span><i className="me-1.5 inline-block size-2.5 rounded-[3px] bg-primary/40" />{t("inv.lgPending")}</span>
        {adding && <span><i className="me-1.5 inline-block size-2.5 rounded-[3px] border-2 border-primary" />{t("inv.lgThis")}</span>}
      </div>
    </div>
  );
}

/** Shows a freshly made link once, with copy and share buttons. Used after creating an invite and after getting a new link. */
export function LinkReady({ link, company, title, body, onClose }: { link: string; company: string; title: string; body?: string; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const text = fill(t("inv.shareText"), { company });
  async function copy() {
    try { await navigator.clipboard.writeText(link); toast("success", t("invite.copied")); } catch { toast("error", t("common.saveError")); }
  }
  async function share() {
    try { await navigator.share({ title: "UPLIF", text, url: link }); } catch { /* the person closed the share sheet */ }
  }
  const canShare = typeof navigator !== "undefined" && "share" in navigator;
  return (
    <Modal open onClose={onClose} closeLabel={t("common.close")} title={title} footer={<Button variant="primary" onClick={onClose}>{t("inv.done")}</Button>}>
      <div className="flex flex-col gap-3">
        <div role="note" className="flex items-start gap-3 rounded-control bg-warning-soft p-3 leading-snug text-warning-ink">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div><b className="block">{t("inv.onceTitle")}</b>{body ?? t("inv.onceBody")}</div>
        </div>
        <input readOnly value={link} aria-label={t("invite.linkTitle")} onFocus={(e) => e.currentTarget.select()} className="h-(--control-h) w-full rounded-control border border-line-strong bg-ground px-3 font-mono text-[13px]" />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={copy}><Check className="size-4" aria-hidden />{t("invite.copy")}</Button>
          <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-(--control-h) items-center gap-2 rounded-control border border-line-strong bg-surface px-4 font-semibold"><Send className="size-4" aria-hidden />{t("inv.telegram")}</a>
          {canShare && <Button onClick={share}><Share2 className="size-4" aria-hidden />{t("inv.share")}</Button>}
        </div>
      </div>
    </Modal>
  );
}

interface Props {
  companyId: string;
  companyName: string;
  employees: InviteEmployee[];
  positions: InvitePosition[];
  roles: InviteRole[];
  branches: InviteBranch[];
  /** Employees that already hold a pending (unexpired) invitation. */
  pendingEmployeeIds: Set<string>;
  presetEmployeeId?: string;
  seats: Seats | null;
  catalog: PermissionDef[];
  canRoles: boolean;
  canCreateEmployee: boolean;
  onInvites: () => void;
  onClose: () => void;
}

/** Step 1 of the invite: pick the employee, their roles and branches, optional permission changes. Step 2 shows the link. */
export function InvitePanel({ companyId, companyName, employees, positions, roles, branches, pendingEmployeeIds, presetEmployeeId, seats, catalog, canRoles, canCreateEmployee, onInvites, onClose }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const invitable = roles.filter((r) => r.name !== "Owner");
  const activeBranches = branches.filter((b) => b.is_active);
  const posOf = (id: string | null) => positions.find((p) => p.id === id);
  const reason = (e: InviteEmployee): MessageKey | null => (e.membership_id ? "inv.optHasLogin" : e.status === "left" ? "inv.optLeft" : pendingEmployeeIds.has(e.id) ? "inv.optPending" : null);
  const ready = employees.filter((e) => !reason(e));
  const initial = presetEmployeeId && ready.some((e) => e.id === presetEmployeeId) ? presetEmployeeId : "";
  const st = seatState(seats);

  const defaultRole = (empId: string) => {
    const emp = employees.find((e) => e.id === empId);
    const dr = posOf(emp?.position_id ?? null)?.default_role_id;
    return dr && invitable.some((r) => r.id === dr) ? dr : invitable[0]?.id ?? "";
  };
  const [employeeId, setEmployeeId] = useState(initial);
  const [newName, setNewName] = useState("");
  const [newPos, setNewPos] = useState("");
  const [rows, setRows] = useState<Row[]>([{ id: 1, roleId: defaultRole(initial), branchId: "" }]);
  const [touched, setTouched] = useState(false);
  const [overrides, setOverrides] = useState<DraftOverride[]>([]);
  const [editingOverrides, setEditingOverrides] = useState(false);
  const [days, setDays] = useState<number>(7);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string>();

  const nameOf = (e: InviteEmployee) => pick(locale, e.name, e.name_local);
  const label = (e: InviteEmployee) => {
    const pos = posOf(e.position_id);
    const r = reason(e);
    return [nameOf(e), pos ? pick(locale, pos.name, pos.name_local) : "", r ? t(r) : ""].filter(Boolean).join(" · ");
  };
  const chosen = employees.find((e) => e.id === employeeId);
  const personName = employeeId === NEW ? newName.trim() : chosen ? nameOf(chosen) : "";

  function onEmployee(v: string) {
    setEmployeeId(v);
    // Until the admin picks a role themselves, follow the position's suggested role.
    if (!touched) setRows((rs) => rs.map((r, i) => (i === 0 ? { ...r, roleId: v === NEW ? invitable[0]?.id ?? "" : defaultRole(v) } : r)));
  }
  const setRow = (id: number, patch: Partial<Row>) => { setTouched(true); setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))); };

  const failure = (err: { code?: string; message?: string }) => {
    const m = err.message ?? "";
    const pl = planLimitKey(err);
    if (pl) return t(pl);
    if (m.includes("pending invitation")) return t("inv.err.pending");
    if (m.includes("already has a sign-in")) return t("inv.err.linked");
    if (m.includes("has left")) return t("inv.err.left");
    if (m.includes("listed twice")) return t("inv.err.dupRole");
    if (m.includes("roles")) return t("inv.err.roles");
    if (m.includes("more than you have")) return t("ovr.err.beyond");
    if (m.includes("reason")) return t("ovr.err.reason");
    return err.code === "42501" ? t("common.forbidden") : t("common.saveError");
  };

  async function create() {
    if (!employeeId) return setError(t("inv.err.employee"));
    if (employeeId === NEW && !newName.trim()) return setError(t("inv.err.name"));
    if (rows.some((r) => !r.roleId)) return setError(t("inv.err.roles"));
    setError(undefined);
    setBusy(true);
    const supabase = createClient();
    let empId = employeeId;
    if (employeeId === NEW) {
      const made = await supabase.from("employees").insert({ company_id: companyId, name: newName.trim(), position_id: newPos || null }).select("id").single();
      if (made.error || !made.data) { setBusy(false); return toast("error", made.error?.code === "42501" ? t("common.forbidden") : t("common.saveError")); }
      empId = made.data.id;
    }
    const { data, error: err } = await supabase.rpc("create_invite", {
      p_employee_id: empId,
      p_roles: rows.map((r) => ({ role_id: r.roleId, branch_id: r.branchId || null })),
      p_overrides: overrides as unknown as Json,
      p_days: days,
      p_note: note.trim() || null,
    });
    setBusy(false);
    router.refresh();
    if (err) return toast("error", failure(err));
    setLink(`${location.origin}/invite/${(data as { token: string }).token}`);
  }

  if (link) return <LinkReady link={link} company={companyName} title={t("inv.readyTitle")} onClose={onClose} />;

  const blocked = st.full || invitable.length === 0;
  const noneFree = ready.length === 0;
  return (
    <>
      <Modal open onClose={onClose} closeLabel={t("common.close")} title={t("inv.title")}
        footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={blocked} onClick={create}>{t("invite.create")}</Button></>}>
        <div className="flex flex-col gap-4">
          <SeatMeter seats={seats} adding={!st.full} />
          <SeatBanner seats={seats} onInvites={() => { onInvites(); onClose(); }} />
          {noneFree && !canCreateEmployee && (
            <div role="note" className="rounded-control bg-primary-soft p-3 leading-snug text-primary-ink"><b className="block">{t("inv.noEmployees")}</b>{t("inv.noEmployeesBody")}</div>
          )}
          <div className="flex flex-col gap-2">
            <Select label={t("inv.employee")} value={employeeId} onChange={(e) => onEmployee(e.target.value)} hint={t("inv.employeeHint")} error={error && !employeeId ? error : undefined}>
              <option value="">—</option>
              {canCreateEmployee && <option value={NEW}>{t("inv.newEmployee")}</option>}
              {employees.filter((e) => !reason(e)).map((e) => <option key={e.id} value={e.id}>{label(e)}</option>)}
              {employees.filter((e) => reason(e)).map((e) => <option key={e.id} value={e.id} disabled>{label(e)}</option>)}
            </Select>
            {employeeId === NEW && (
              <div className="flex flex-col gap-3 rounded-control border border-line p-3">
                <Input label={t("inv.newName")} value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} error={error && !newName.trim() ? error : undefined} />
                <Select label={t("inv.newPosition")} value={newPos} onChange={(e) => setNewPos(e.target.value)}>
                  <option value="">{t("emp.none")}</option>
                  {positions.map((p) => <option key={p.id} value={p.id}>{pick(locale, p.name, p.name_local)}</option>)}
                </Select>
              </div>
            )}
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-[13px] font-semibold text-muted">{t("inv.roles")}</legend>
            {rows.map((r, i) => (
              <div key={r.id} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Select label={t("invite.role")} value={r.roleId} onChange={(e) => setRow(r.id, { roleId: e.target.value })}>
                  {invitable.map((x) => <option key={x.id} value={x.id}>{pick(locale, x.name, x.name_local)}</option>)}
                </Select>
                <Select label={t("invite.branch")} value={r.branchId} onChange={(e) => setRow(r.id, { branchId: e.target.value })}>
                  <option value="">{t("invite.allBranches")}</option>
                  {activeBranches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
                </Select>
                {rows.length > 1 && i > 0 && <Button aria-label={t("inv.removeRole")} onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}><X className="size-4" aria-hidden /></Button>}
              </div>
            ))}
            <div><Button onClick={() => { setTouched(true); setRows((rs) => [...rs, { id: Math.max(...rs.map((x) => x.id)) + 1, roleId: invitable[0]?.id ?? "", branchId: "" }]); }}><Plus className="size-4" aria-hidden />{t("inv.addRole")}</Button></div>
            <p className="text-xs text-muted">{t("inv.rolesHint")}</p>
          </fieldset>

          {canRoles && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-line-strong p-3">
              <div className="min-w-0 flex-1 leading-snug">
                <b className="font-semibold">{t("inv.overrides")}</b>{" "}
                <Badge tone={overrides.length ? "warning" : "neutral"}>{overrides.length ? fill(t("inv.overridesCount"), { n: overrides.length }) : t("inv.overridesNone")}</Badge>
                <small className="block text-muted">{t("inv.overridesHint")}</small>
              </div>
              <Button onClick={() => setEditingOverrides(true)}>{t("inv.overridesEdit")}</Button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label={t("inv.days")} value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
              {DAYS.map((d) => <option key={d} value={d}>{t(`inv.d.${d}` as MessageKey)}</option>)}
            </Select>
            <Input label={t("inv.note")} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} hint={t("inv.noteHint")} />
          </div>
          {personName && !blocked && <p className="text-[13px] text-muted">{t("inv.for")}: <b className="font-semibold text-ink">{personName}</b> · {t("invite.expires")} {fmtDate(locale, new Date(Date.now() + days * 86_400_000).toISOString())}</p>}
          {error && employeeId && !(employeeId === NEW && !newName.trim()) && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      </Modal>
      {editingOverrides && <DraftOverridesDialog catalog={catalog} value={overrides} onChange={setOverrides} onClose={() => setEditingOverrides(false)} />}
    </>
  );
}

export function usePendingEmployeeIds(invitations: { employee_record_id: string | null; status: string; expires_at: string }[]) {
  return useMemo(() => new Set(invitations.filter((i) => i.employee_record_id && i.status === "pending" && new Date(i.expires_at) > new Date()).map((i) => i.employee_record_id as string)), [invitations]);
}
