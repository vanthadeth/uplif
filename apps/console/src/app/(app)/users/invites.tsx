"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Link2, Plus } from "lucide-react";
import { Badge, Button, Modal, useToast, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/translation/api";
import { fmtDate, pick } from "@/lib/format";
import { planLimitKey } from "@/lib/plan-limit";
import type { MessageKey } from "@/lib/messages";
import type { Json } from "@/lib/supabase/database.types";
import { LinkReady, type InviteBranch, type InviteEmployee, type InviteRole } from "./invite-panel";

export interface Invitation {
  id: string; label: string | null; role_id: string; branch_id: string | null; status: "pending" | "accepted" | "revoked"; expires_at: string; created_at: string;
  created_by: string; accepted_at: string | null; employee_record_id: string | null; roles: Json; overrides: Json; note: string | null;
}
type State = "pending" | "expired" | "accepted" | "revoked";
const DAY = 86_400_000;
const tone: Record<State, BadgeTone> = { pending: "info", expired: "neutral", accepted: "success", revoked: "neutral" };
const stateOf = (i: Invitation): State => (i.status === "pending" && new Date(i.expires_at) <= new Date() ? "expired" : i.status);

interface Props {
  invitations: Invitation[];
  employees: InviteEmployee[];
  members: { id: string; display_name: string | null }[];
  roles: InviteRole[];
  branches: InviteBranch[];
  companyName: string;
  canInvite: boolean;
  onNew: () => void;
}

/** The Invites tab: who was invited, with what access, how long the link has left, and what the admin can do about it. */
export function InvitesTab({ invitations, employees, members, roles, branches, companyName, canInvite, onNew }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const n = (v: number) => v.toLocaleString(locale === "km" ? "km-KH" : "en");
  const [busy, setBusy] = useState("");
  const [revoking, setRevoking] = useState<Invitation | null>(null);
  const [link, setLink] = useState<string>();

  // Expired and revoked invites stay visible for 30 days so an admin can see what happened.
  const now = Date.now();
  const kept = useMemo(() => invitations.filter((i) => {
    const s = stateOf(i);
    if (s === "revoked") return now - Date.parse(i.created_at) < 30 * DAY;
    if (s === "expired") return now - Date.parse(i.expires_at) < 30 * DAY;
    return true;
  }), [invitations, now]);
  const count = (s: State) => kept.filter((i) => stateOf(i) === s).length;
  const filters: { id: State; label: MessageKey }[] = [
    { id: "pending", label: "inv.f.pending" }, { id: "expired", label: "inv.f.expired" }, { id: "accepted", label: "inv.f.accepted" }, { id: "revoked", label: "inv.f.revoked" },
  ];
  const [filter, setFilter] = useState<State>(() => (["pending", "expired", "accepted", "revoked"] as State[]).find((s) => invitations.some((i) => stateOf(i) === s)) ?? "pending");
  const shown = kept.filter((i) => stateOf(i) === filter);

  const empName = (i: Invitation) => { const e = employees.find((x) => x.id === i.employee_record_id); return e ? pick(locale, e.name, e.name_local) : i.label ?? "—"; };
  const roleName = (id: string) => { const r = roles.find((x) => x.id === id); return r ? pick(locale, r.name, r.name_local) : "—"; };
  const branchName = (id: string | null) => { if (!id) return t("invite.allBranches"); const b = branches.find((x) => x.id === id); return b ? pick(locale, b.name, b.name_local) : "—"; };
  const access = (i: Invitation) => {
    const list = Array.isArray(i.roles) && i.roles.length ? (i.roles as { role_id: string; branch_id: string | null }[]) : [{ role_id: i.role_id, branch_id: i.branch_id }];
    return list;
  };
  const overrideCount = (i: Invitation) => (Array.isArray(i.overrides) ? i.overrides.length : 0);
  const byName = (id: string) => members.find((m) => m.id === id)?.display_name ?? "—";

  const status = (i: Invitation) => {
    const s = stateOf(i);
    const hours = (Date.parse(i.expires_at) - now) / 3_600_000;
    if (s === "pending") {
      const text = hours < 24 ? t("inv.leftToday") : hours < 48 ? t("inv.leftTomorrow") : fill(t("inv.left"), { n: n(Math.ceil(hours / 24)) });
      return { badge: <Badge tone={hours < 48 ? "warning" : "info"}>{text}</Badge>, sub: "" };
    }
    return {
      badge: <Badge tone={tone[s]}>{t(`invite.status.${s}` as MessageKey)}</Badge>,
      sub: s === "expired" ? t("inv.seatReleased") : s === "accepted" && i.accepted_at ? fill(t("inv.joined"), { date: fmtDate(locale, i.accepted_at) }) : "",
    };
  };

  // In-app notices: someone joined this week, or an invite runs out within a day.
  const notices = [
    ...invitations.filter((i) => i.status === "accepted" && i.accepted_at && now - Date.parse(i.accepted_at) < 7 * DAY).map((i) => ({ id: `a${i.id}`, tone: "ok" as const, text: fill(t("inv.notice.joined"), { name: empName(i) }) })),
    ...invitations.filter((i) => stateOf(i) === "pending" && Date.parse(i.expires_at) - now < DAY).map((i) => ({ id: `e${i.id}`, tone: "warn" as const, text: fill(t("inv.notice.soon"), { name: empName(i) }) })),
  ].slice(0, 4);

  async function newLink(i: Invitation) {
    setBusy(i.id);
    const { data, error } = await createClient().rpc("replace_invite", { p_id: i.id, p_days: 7 });
    setBusy("");
    if (error) return toast("error", planLimitKey(error) ? t(planLimitKey(error)!) : error.message.includes("predates") ? t("inv.olderCant") : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    setLink(`${location.origin}/invite/${(data as { token: string }).token}`);
    router.refresh();
  }
  async function revoke(i: Invitation) {
    setBusy(i.id);
    const { error } = await createClient().rpc("revoke_invitation", { p_id: i.id });
    setBusy("");
    setRevoking(null);
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("invite.revoked"));
    router.refresh();
  }

  const cols = canInvite ? "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]" : "md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]";

  if (invitations.length === 0) {
    return (
      <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
        <b className="mb-1 block text-[16px] text-ink">{t("users.noInvites")}</b>{t("users.noInvitesBody")}
        {canInvite && <div className="mt-3.5"><Button variant="primary" onClick={onNew}><Plus className="size-[18px]" aria-hidden />{t("users.invite")}</Button></div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {notices.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t("users.tabInvitations")}>
          {notices.map((x) => (
            <li key={x.id} className={`flex items-start gap-3 rounded-control p-3 leading-snug ${x.tone === "ok" ? "bg-success-soft text-success-ink" : "bg-warning-soft text-warning-ink"}`}><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{x.text}</li>
          ))}
        </ul>
      )}
      <div role="group" aria-label={t("common.status")} className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[14px] ${filter === f.id ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line-strong bg-surface font-medium"}`}>
            {t(f.label)} <em className="not-italic tabular-nums opacity-70">{n(count(f.id))}</em>
          </button>
        ))}
      </div>
      <div role="tabpanel" className="overflow-hidden rounded-card border border-line bg-surface">
        <div aria-hidden className={`hidden items-center gap-4 border-b border-line bg-ground px-4 py-2.5 text-[13px] font-semibold uppercase tracking-wider text-muted md:grid ${cols}`}>
          <span>{t("inv.h.person")}</span><span>{t("inv.h.access")}</span><span>{t("inv.h.by")}</span><span>{t("inv.h.status")}</span>{canInvite && <span />}
        </div>
        {shown.length === 0 && <p className="px-4 py-9 text-center text-muted">{t("users.noInvites")}</p>}
        {shown.map((i) => {
          const s = stateOf(i);
          const a = access(i);
          const st = status(i);
          return (
            <div key={i.id} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 border-t border-line px-4 py-3.5 first:border-t-0 md:gap-x-4 ${cols}`}>
              <div className="min-w-0 break-words"><b className="font-semibold">{empName(i)}</b>{!i.employee_record_id && <small className="block text-muted">{t("inv.older")}</small>}</div>
              <span className="col-start-2 row-start-1 md:hidden">{st.badge}</span>
              <div className="col-span-2 row-start-2 leading-snug md:col-span-1 md:row-start-auto">
                <span><b className="font-semibold">{roleName(a[0].role_id)}</b> <em className="not-italic text-muted">· {branchName(a[0].branch_id)}</em></span>
                {(a.length > 1 || overrideCount(i) > 0) && (
                  <small className="block text-muted">{[a.length > 1 ? fill(t("inv.moreRoles"), { n: n(a.length - 1) }) : "", overrideCount(i) ? fill(t("inv.withOverrides"), { n: n(overrideCount(i)) }) : ""].filter(Boolean).join(", ")}</small>
                )}
              </div>
              <div className="col-span-2 leading-snug md:col-span-1"><span>{byName(i.created_by)}</span><small className="block text-muted tabular-nums">{fmtDate(locale, i.created_at)}</small></div>
              <div className="col-span-2 hidden leading-snug md:col-span-1 md:block">{st.badge}{st.sub && <small className="block text-muted">{st.sub}</small>}</div>
              {st.sub && <small className="col-span-2 -mt-1 text-muted md:hidden">{st.sub}</small>}
              {canInvite && (s === "pending" || s === "expired") && (
                <div className="col-span-2 flex gap-2 md:col-span-1 md:justify-end">
                  <Button className="flex-1 md:flex-none" loading={busy === i.id} onClick={() => newLink(i)}><Link2 className="size-4" aria-hidden />{t("inv.newLink")}</Button>
                  {s === "pending" && <Button variant="danger" className="flex-1 md:flex-none" disabled={busy === i.id} onClick={() => setRevoking(i)}>{t("invite.revoke")}</Button>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={revoking !== null} onClose={() => setRevoking(null)} closeLabel={t("common.close")} title={t("inv.revokeTitle")}
        footer={<><Button onClick={() => setRevoking(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={busy === revoking?.id} onClick={() => revoking && revoke(revoking)}>{t("invite.revoke")}</Button></>}>
        {revoking && <p className="leading-relaxed text-muted">{fill(t("inv.revokeBody"), { name: empName(revoking) })}</p>}
      </Modal>
      {link && <LinkReady link={link} company={companyName} title={t("inv.newLinkTitle")} body={t("inv.newLinkOld")} onClose={() => setLink(undefined)} />}
    </div>
  );
}
