"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Clock, Info, Lock, Plus, Search, Shield, Users } from "lucide-react";
import { Badge, Button, Input, Modal, Select, useToast, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { fmtDate, pick } from "@/lib/format";
import { GROWTH, seatsUsed } from "@/lib/plan";
import { planLimitKey } from "@/lib/plan-limit";
import { OverridesDialog, type Override, type PermissionDef } from "./overrides";

interface Member { id: string; display_name: string | null; status: "active" | "suspended" | "removed" }
interface MemberRole { id: string; membership_id: string; role_id: string; branch_id: string | null }
interface Role { id: string; name: string; name_local: string | null }
interface Branch { id: string; name: string; name_local: string | null; is_active: boolean }
interface Invitation { id: string; label: string | null; role_id: string; branch_id: string | null; status: "pending" | "accepted" | "revoked"; expires_at: string }
type InviteStatus = "pending" | "accepted" | "revoked" | "expired";
type Filter = "all" | "active" | "suspended";
type GroupBy = "none" | "branch" | "role";

interface Props {
  myMembershipId: string;
  members: Member[];
  memberRoles: MemberRole[];
  roles: Role[];
  branches: Branch[];
  invitations: Invitation[];
  canInvite: boolean;
  canEdit: boolean;
  canRoles: boolean;
  overrides: Override[];
  catalog: PermissionDef[];
  /** Open the invite dialog on arrival (the title bar action links here with ?invite=1). */
  openInvite?: boolean;
}

const inviteTone: Record<InviteStatus, BadgeTone> = { pending: "info", accepted: "success", revoked: "neutral", expired: "neutral" };

export function UsersView({ myMembershipId, members, memberRoles, roles, branches, invitations, canInvite, canEdit, canRoles, overrides, catalog, openInvite: autoInvite }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const n = (v: number) => v.toLocaleString(locale === "km" ? "km-KH" : "en");

  const roleName = (id: string) => { const r = roles.find((x) => x.id === id); return r ? pick(locale, r.name, r.name_local) : "—"; };
  const branchName = (id: string | null) => { if (!id) return t("invite.allBranches"); const b = branches.find((x) => x.id === id); return b ? pick(locale, b.name, b.name_local) : "—"; };
  const invitable = roles.filter((r) => r.name !== "Owner");
  const activeBranches = branches.filter((b) => b.is_active);

  const visible = members.filter((m) => m.status !== "removed");
  const inviteStatus = (i: Invitation): InviteStatus => (i.status === "pending" && new Date(i.expires_at) < new Date() ? "expired" : i.status);
  const active = visible.filter((m) => m.status === "active").length;
  const suspended = visible.filter((m) => m.status === "suspended").length;
  const pending = invitations.filter((i) => inviteStatus(i) === "pending").length;
  const used = seatsUsed(active, pending);
  const limit = GROWTH.seats; // Seat limits are not enforced by the database yet; this is the intended rule.
  const full = used >= limit;
  const readOnly = !canInvite && !canEdit && !canRoles;

  const [tab, setTab] = useState<"team" | "inv">("team");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("role");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [roleId, setRoleId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [link, setLink] = useState<string>();
  const [rolesFor, setRolesFor] = useState<string | null>(null);
  const [addRoleId, setAddRoleId] = useState("");
  const [addBranchId, setAddBranchId] = useState("");
  const [suspending, setSuspending] = useState<Member | null>(null);
  const [permsFor, setPermsFor] = useState<string | null>(null);

  function openInvite() {
    setLabel(""); setBranchId(""); setRoleId(invitable[0]?.id ?? ""); setLink(undefined); setInviteOpen(true);
  }

  useEffect(() => {
    if (!autoInvite) return;
    if (canInvite && !full && invitable.length > 0) openInvite();
    router.replace("/users");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoInvite]);

  async function createInvite() {
    setBusy(true);
    const { data, error } = await createClient().rpc("create_invitation", { p_role_id: roleId, p_branch_id: branchId || null, p_label: label });
    setBusy(false);
    if (error) return toast("error", planLimitKey(error) ? t(planLimitKey(error)!) : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    setLink(`${location.origin}/invite/${(data as { token: string }).token}`);
    router.refresh();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(link!); toast("success", t("invite.copied")); } catch { toast("error", t("common.saveError")); }
  }

  async function revoke(id: string) {
    const { error } = await createClient().rpc("revoke_invitation", { p_id: id });
    if (error) return toast("error", t("common.saveError"));
    toast("success", t("invite.revoked"));
    router.refresh();
  }

  async function setStatus(m: Member, status: Member["status"]) {
    setBusy(true);
    // .select() returns the rows row-level security let us change; an empty result means no permission.
    const { data, error } = await createClient().from("memberships").update({ status }).eq("id", m.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : error.message || t("common.saveError"));
    if (!data?.length) return toast("error", t("common.forbidden"));
    setSuspending(null);
    toast("success", t("users.updated"));
    router.refresh();
  }

  async function addRole() {
    if (!rolesFor || !addRoleId) return;
    const { data: co } = await createClient().from("companies").select("id").maybeSingle();
    const { error } = await createClient().from("membership_roles").insert({ company_id: co!.id, membership_id: rolesFor, role_id: addRoleId, branch_id: addBranchId || null });
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : error.code === "23505" ? t("common.saveError") : error.message);
    toast("success", t("users.roleAdded"));
    router.refresh();
  }

  async function removeRole(id: string) {
    const { error } = await createClient().from("membership_roles").delete().eq("id", id);
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : error.message);
    toast("success", t("users.roleRemoved"));
    router.refresh();
  }

  const assignmentsOf = (m: Member) => memberRoles.filter((r) => r.membership_id === m.id);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((m) => (filter === "all" || m.status === filter) && (!q || (m.display_name ?? "").toLowerCase().includes(q)));
  }, [visible, query, filter]);

  // Groups: someone with roles at two branches (or two roles) appears in each group they belong to.
  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    const map = new Map<string, { name: string; rows: { m: Member; only: MemberRole[] }[] }>();
    const add = (key: string, name: string, m: Member, only: MemberRole[]) => {
      if (!map.has(key)) map.set(key, { name, rows: [] });
      map.get(key)!.rows.push({ m, only });
    };
    for (const m of shown) {
      const rs = assignmentsOf(m);
      if (!rs.length) { add("none", t("users.gNoRole"), m, []); continue; }
      const byKey = new Map<string, MemberRole[]>();
      for (const r of rs) {
        const key = groupBy === "branch" ? `b:${r.branch_id ?? ""}` : `r:${r.role_id}`;
        byKey.set(key, [...(byKey.get(key) ?? []), r]);
      }
      byKey.forEach((only, key) => add(key, groupBy === "branch" ? branchName(only[0].branch_id) : roleName(only[0].role_id), m, only));
    }
    return [...map.entries()].map(([key, g]) => ({ key, ...g })).sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.name.localeCompare(b.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, groupBy, memberRoles, roles, branches, locale]);

  const peopleText = (c: number) => (locale === "km" ? `${n(c)} នាក់` : c === 1 ? "1 person" : `${c} people`);
  const roleCell = (rs: MemberRole[]) => rs.length === 0
    ? <span className="text-muted">{t("users.noRoles")}</span>
    : <div className="flex min-w-0 flex-col gap-1 leading-snug">{rs.map((r) => <span key={r.id}><b className="font-semibold">{roleName(r.role_id)}</b> <em className="not-italic text-muted">· {branchName(r.branch_id)}</em></span>)}</div>;

  const memberRow = (m: Member, only: MemberRole[]) => {
    const rs = only.length ? only : assignmentsOf(m);
    const me = m.id === myMembershipId;
    return (
      <div key={`${m.id}-${only[0]?.id ?? "x"}`} className={`grid min-h-[68px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3.5 first:border-t-0 md:gap-x-4 ${readOnly ? "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.7fr)_minmax(0,.8fr)]" : "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.7fr)_minmax(0,.8fr)_210px]"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-primary-soft text-[13px] font-bold text-primary-ink">{(m.display_name ?? "?").charAt(0).toUpperCase()}</span>
          <div className="min-w-0"><b className={`break-words font-semibold ${m.status === "suspended" ? "text-muted" : ""}`}>{m.display_name ?? "—"}</b> {me && <Badge tone="info">{t("users.you")}</Badge>}</div>
        </div>
        <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto">{roleCell(rs)}</div>
        <span className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
          {m.status === "active" ? <Badge tone="success"><Check className="me-1 size-3" aria-hidden />{t("status.active")}</Badge> : <Badge tone="warning"><Clock className="me-1 size-3" aria-hidden />{t("users.suspended")}</Badge>}
        </span>
        {!readOnly && (canRoles || (canEdit && !me)) && (
          <div className="col-span-2 mt-1 flex gap-2 md:col-span-1 md:mt-0 md:justify-end">
            {canRoles && <Button className="flex-1 md:flex-none" onClick={() => { setRolesFor(m.id); setAddRoleId(roles[0]?.id ?? ""); setAddBranchId(""); }}><Shield className="size-4" aria-hidden />{t("users.manageRoles")}</Button>}
            {canRoles && !me && <Button className="flex-1 md:flex-none" onClick={() => setPermsFor(m.id)}><Lock className="size-4" aria-hidden />{t("ovr.btn")}</Button>}
            {canEdit && !me && (m.status === "active"
              ? <Button className="flex-1 md:flex-none" onClick={() => setSuspending(m)}>{t("users.suspend")}</Button>
              : <Button className="flex-1 md:flex-none" disabled={full} title={full ? t("users.noSeat") : undefined} onClick={() => setStatus(m, "active")}>{t("users.reactivate")}</Button>)}
          </div>
        )}
      </div>
    );
  };

  const tabBtn = (id: "team" | "inv", text: string, count: number) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
      className={`-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-4 font-semibold ${tab === id ? "border-primary text-primary-ink" : "border-transparent text-muted"}`}>
      {text}<span className={`rounded-full px-2 py-px text-xs font-semibold ${tab === id ? "bg-primary-soft text-primary-ink" : "bg-neutral-soft text-muted"}`}>{n(count)}</span>
    </button>
  );
  const rolesTarget = rolesFor ? members.find((m) => m.id === rolesFor) : null;
  const filters: { id: Filter; label: MessageKey; count: number }[] = [
    { id: "all", label: "users.f.all", count: visible.length }, { id: "active", label: "users.f.active", count: active }, { id: "suspended", label: "users.f.suspended", count: suspended },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("users.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("users.subtitle")}</p>
        </div>
        {readOnly ? <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("users.viewOnly")}</Badge>
          : canInvite && <Button variant="primary" className="w-full sm:w-auto" disabled={full || invitable.length === 0} title={full ? t("users.fullTitle") : undefined} onClick={openInvite}><Plus className="size-[18px]" aria-hidden />{t("users.invite")}</Button>}
      </div>

      {readOnly && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("users.roTitle")}</b>{t("users.roBody")}</div>
        </div>
      )}

      <section aria-label={t("users.seats")} className="grid items-center gap-x-6 gap-y-3 rounded-card border border-line bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="text-2xl font-bold tabular-nums leading-tight">{n(used)} <small className="text-sm font-medium text-muted">{t("users.of")} {n(limit)} {t("users.seatsUsed")}</small></div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted">
            <span><i className="me-1.5 inline-block size-2.5 rounded-[3px] bg-primary" />{n(active)} {t("users.lgActive")}</span>
            <span><i className="me-1.5 inline-block size-2.5 rounded-[3px] bg-primary/40" />{n(pending)} {t("users.lgInvited")}</span>
            <span><i className="me-1.5 inline-block size-2.5 rounded-[3px] bg-line-strong" />{n(suspended)} {t("users.lgSuspended")}</span>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1.5 sm:items-end sm:text-end">
          <Badge tone="info"><Clock className="me-1 size-3" aria-hidden />{t("users.planChip")}</Badge>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-neutral-soft sm:col-span-2" role="img" aria-label={`${used} / ${limit}`}>
          <i className="block h-full bg-primary" style={{ width: `${Math.min(100, (active / limit) * 100)}%` }} />
          <i className="block h-full bg-primary/40" style={{ width: `${Math.min(100 - Math.min(100, (active / limit) * 100), (pending / limit) * 100)}%` }} />
        </div>
      </section>

      {full && (
        <div role="alert" className="flex items-start gap-3 rounded-card bg-warning-soft p-4 leading-normal text-warning-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("users.fullTitle")}</b>{t("users.fullBody")}</div>
        </div>
      )}

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">{tabBtn("team", t("users.tabTeam"), visible.length)}{tabBtn("inv", t("users.tabInvitations"), invitations.length)}</div>

      {tab === "team" ? (
        <>
          {visible.length <= 1 && canInvite && (
            <div className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
              <Users className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div><b className="block">{t("users.soloTitle")}</b>{t("users.soloBody")}</div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 sm:max-w-[380px] sm:min-w-[200px]">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("users.search")} aria-label={t("users.search")} className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            <div role="group" aria-label={t("common.status")} className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] ${filter === f.id ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line-strong bg-surface font-medium"}`}>
                  {t(f.label)} <em className="not-italic tabular-nums opacity-70">{n(f.count)}</em>
                </button>
              ))}
            </div>
            <div className="flex w-full items-center gap-2 sm:ms-auto sm:w-auto">
              <span aria-hidden="true" className="whitespace-nowrap text-[13px] font-semibold text-muted">{t("users.groupBy")}</span>
              <div className="min-w-[160px] flex-1"><Select bare label={t("users.groupBy")} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="none">{t("users.gNone")}</option>
                <option value="branch">{t("invite.branch")}</option>
                <option value="role">{t("invite.role")}</option>
              </Select></div>
            </div>
          </div>
          <div role="tabpanel" className="overflow-hidden rounded-card border border-line bg-surface">
            {shown.length === 0 ? (
              <div className="px-4 py-9 text-center text-muted">
                <b className="mb-1 block text-[15px] text-ink">{t("users.noMatch")}</b>{t("users.noMatchBody")}
                <div className="mt-3"><Button onClick={() => { setQuery(""); setFilter("all"); }}>{t("branches.clearSearch")}</Button></div>
              </div>
            ) : (
              <>
                <div aria-hidden className={`hidden items-center gap-4 border-b border-line bg-ground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid ${readOnly ? "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.7fr)_minmax(0,.8fr)]" : "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.7fr)_minmax(0,.8fr)_210px]"}`}>
                  <span>{t("users.name")}</span><span>{t("users.roles")}</span><span>{t("common.status")}</span>{!readOnly && <span />}
                </div>
                {groups === null ? shown.map((m) => memberRow(m, [])) : groups.map((g) => {
                  const open = !collapsed[g.key];
                  return (
                    <div key={g.key}>
                      <button type="button" aria-expanded={open} onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))}
                        className="flex min-h-11 w-full items-center gap-2.5 border-y border-line bg-ground px-4 text-start font-semibold first:border-t-0">
                        {open ? <ChevronDown className="size-4 text-muted" aria-hidden /> : <ChevronRight className="size-4 text-muted" aria-hidden />}
                        <b>{g.name}</b><span className="ms-auto text-xs font-semibold text-muted">{peopleText(g.rows.length)}</span>
                      </button>
                      {open && g.rows.map((r) => memberRow(r.m, r.only))}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </>
      ) : invitations.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t("users.noInvites")}</b>{t("users.noInvitesBody")}
          {canInvite && <div className="mt-3.5"><Button variant="primary" disabled={full} onClick={openInvite}><Plus className="size-[18px]" aria-hidden />{t("users.invite")}</Button></div>}
        </div>
      ) : (
        <div role="tabpanel" className="overflow-hidden rounded-card border border-line bg-surface">
          <div aria-hidden className={`hidden items-center gap-4 border-b border-line bg-ground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid ${canInvite ? "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,.8fr)_minmax(0,.8fr)_120px]" : "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,.8fr)_minmax(0,.8fr)]"}`}>
            <span>{t("users.cFor")}</span><span>{t("users.cRoleBranch")}</span><span>{t("common.status")}</span><span>{t("invite.expires")}</span>{canInvite && <span />}
          </div>
          {invitations.map((i) => {
            const st = inviteStatus(i);
            return (
              <div key={i.id} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0 md:gap-x-4 ${canInvite ? "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,.8fr)_minmax(0,.8fr)_120px]" : "md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,.8fr)_minmax(0,.8fr)]"}`}>
                <div className="min-w-0 break-words">{i.label ? <b className="font-semibold">{i.label}</b> : <span className="text-muted">{t("users.noNote")}</span>}</div>
                <span className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto"><Badge tone={inviteTone[st]}>{t(`invite.status.${st}` as MessageKey)}</Badge></span>
                <div className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto"><b className="font-semibold">{roleName(i.role_id)}</b> <em className="not-italic text-muted">· {branchName(i.branch_id)}</em></div>
                <span className="col-span-2 tabular-nums text-muted md:col-span-1"><span className="md:hidden">{t("invite.expires")} </span>{fmtDate(locale, i.expires_at)}</span>
                {canInvite && <div className="col-span-2 flex md:col-span-1 md:justify-end">{st === "pending" && <Button className="flex-1 md:flex-none" onClick={() => revoke(i.id)}>{t("invite.revoke")}</Button>}</div>}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={inviteOpen} onClose={() => setInviteOpen(false)} closeLabel={t("common.close")}
        title={link ? t("invite.linkTitle") : t("users.invite")}
        footer={link
          ? <><Button onClick={() => setInviteOpen(false)}>{t("common.close")}</Button><Button variant="primary" onClick={copy}><Check className="size-4" aria-hidden />{t("invite.copy")}</Button></>
          : <><Button onClick={() => setInviteOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={createInvite}>{t("invite.create")}</Button></>}
      >
        {link ? (
          <div className="flex flex-col gap-3">
            <p className="leading-relaxed text-muted">{t("invite.linkBody")}</p>
            <input readOnly value={link} aria-label={t("invite.linkTitle")} onFocus={(e) => e.currentTarget.select()} className="h-(--control-h) w-full rounded-control border border-line-strong bg-ground px-3" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input label={t("invite.label")} hint={t("invite.labelHint")} value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
            <Select label={t("invite.role")} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {invitable.map((r) => <option key={r.id} value={r.id}>{pick(locale, r.name, r.name_local)}</option>)}
            </Select>
            <Select label={t("invite.branch")} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">{t("invite.allBranches")}</option>
              {activeBranches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
            </Select>
            <div className="flex items-start gap-3 rounded-control bg-primary-soft p-3 text-[13px] leading-snug text-primary-ink"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("users.inviteSeat")}</div>
          </div>
        )}
      </Modal>

      <Modal open={rolesTarget != null} onClose={() => setRolesFor(null)} closeLabel={t("common.close")} title={`${t("users.rolesFor")} ${rolesTarget?.display_name ?? ""}`}
        footer={<><Button onClick={() => setRolesFor(null)}>{t("common.close")}</Button><Button variant="primary" disabled={!addRoleId} onClick={addRole}>{t("users.addRole")}</Button></>}>
        {rolesTarget && (
          <div className="flex flex-col gap-4">
            {assignmentsOf(rolesTarget).length === 0 && <p className="text-muted">{t("users.noRoles")}</p>}
            <ul className="flex flex-col gap-2">
              {assignmentsOf(rolesTarget).map((r) => (
                <li key={r.id} className="flex min-h-11 items-center justify-between gap-3">
                  <span><b className="font-semibold">{roleName(r.role_id)}</b> <em className="not-italic text-muted">· {branchName(r.branch_id)}</em></span>
                  <Button onClick={() => removeRole(r.id)}>{t("users.removeRole")}</Button>
                </li>
              ))}
            </ul>
            <hr className="border-line" />
            <Select label={t("invite.role")} value={addRoleId} onChange={(e) => setAddRoleId(e.target.value)}>{roles.map((r) => <option key={r.id} value={r.id}>{pick(locale, r.name, r.name_local)}</option>)}</Select>
            <Select label={t("invite.branch")} value={addBranchId} onChange={(e) => setAddBranchId(e.target.value)}>
              <option value="">{t("invite.allBranches")}</option>
              {activeBranches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
            </Select>
          </div>
        )}
      </Modal>

      {permsFor && <OverridesDialog memberId={permsFor} memberName={members.find((m) => m.id === permsFor)?.display_name ?? ""} overrides={overrides} catalog={catalog} onClose={() => setPermsFor(null)} />}

      <Modal open={suspending !== null} onClose={() => setSuspending(null)} closeLabel={t("common.close")} title={t("users.suspendTitle")}
        footer={<><Button onClick={() => setSuspending(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => suspending && setStatus(suspending, "suspended")}>{t("users.suspend")}</Button></>}>
        <div className="flex flex-col gap-3">
          {suspending && <p className="font-semibold">{suspending.display_name}</p>}
          <p className="leading-relaxed text-muted">{t("users.suspendBody")}</p>
        </div>
      </Modal>
    </div>
  );
}
