"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Clock, CreditCard, GitBranch, Lock, Mail, Package, Receipt, ShieldCheck, Sparkles, Users, UserRound, Building2, ClipboardList, Plus } from "lucide-react";
import { Badge, Button, Card, CardBody, EmptyState, Modal, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { languageOf } from "@/lib/languages";
import { fmtDate, fmtDateTime, pick } from "@/lib/format";
import { describeAction } from "@/lib/activity";
import { GROWTH, STARTER, TRIAL_DAYS, seatsUsed, trialDaysLeft } from "@/lib/plan";
import type { MessageKey } from "@/lib/messages";
import type { Json } from "@/lib/supabase/database.types";
import { planLimitKey } from "@/lib/plan-limit";

export interface DashboardData {
  can: { members: boolean; invites: boolean; branches: boolean; roles: boolean; audit: boolean; plan: boolean; createBranch: boolean };
  members: { id: string; display_name: string | null; status: "active" | "suspended" | "removed" }[];
  invitations: { id: string; label: string | null; role_id: string; branch_id: string | null; expires_at: string; created_at: string }[];
  branches: { id: string; name: string; name_local: string | null; is_active: boolean }[];
  roles: { id: string; name: string; name_local: string | null }[];
  audit: { id: string; created_at: string; membership_id: string | null; action: string; details: Json }[];
  companyCreatedAt: string | null;
}

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

export function DashboardView({ company, hasClaim, data }: { company: { name: string; name_local: string | null } | null; hasClaim: boolean; data: DashboardData | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [link, setLink] = useState<string>();
  const [busy, setBusy] = useState("");
  const f = (k: MessageKey, v: Record<string, string | number> = {}) => fill(t(k), v);
  const num = (n: number) => new Intl.NumberFormat(languageOf(locale).dateTag).format(n);

  if (!company || !data) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-2xl font-bold">{t("dash.welcome")}</h1>
        <Card><CardBody className="flex flex-col gap-3">
          <p role="alert" className="text-danger-ink">{hasClaim ? t("auth.error.generic") : t("dash.noClaim")}</p>
          <Link href="/companies" className="font-semibold text-link">{t("dash.switch")}</Link>
        </CardBody></Card>
      </div>
    );
  }

  const { can } = data;
  const active = data.members.filter((m) => m.status === "active").length;
  const suspended = data.members.filter((m) => m.status === "suspended").length;
  const invited = data.invitations.length;
  const seats = seatsUsed(active, invited);
  const roleName = (id: string) => { const r = data.roles.find((x) => x.id === id); return r ? pick(locale, r.name, r.name_local) : "—"; };
  const branchName = (id: string | null) => { const b = data.branches.find((x) => x.id === id); return b ? pick(locale, b.name, b.name_local) : t("invite.allBranches"); };
  const who = (id: string | null) => (id ? data.members.find((m) => m.id === id)?.display_name ?? "—" : t("audit.system"));
  const daysLeft = data.companyCreatedAt ? trialDaysLeft(data.companyCreatedAt) : TRIAL_DAYS;

  async function revoke(id: string) {
    setBusy(id);
    const { error } = await createClient().rpc("revoke_invitation", { p_id: id });
    setBusy("");
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("invite.revoked"));
    router.refresh();
  }
  // Links are shown once and stored hashed, so "send again" makes a fresh link and cancels the old one.
  async function resend(i: DashboardData["invitations"][number]) {
    setBusy(i.id);
    const supabase = createClient();
    const made = await supabase.rpc("create_invitation", { p_role_id: i.role_id, p_branch_id: i.branch_id, p_label: i.label ?? "" });
    if (made.error) { setBusy(""); return toast("error", planLimitKey(made.error) ? t(planLimitKey(made.error)!) : made.error.code === "42501" ? t("common.forbidden") : t("common.saveError")); }
    await supabase.rpc("revoke_invitation", { p_id: i.id });
    setBusy("");
    setLink(`${location.origin}/invite/${(made.data as { token: string }).token}`);
    router.refresh();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link!); toast("success", t("invite.copied")); } catch { toast("error", t("common.saveError")); }
  }

  // Getting started: shown to people who set the company up, until the first branch and some team exist.
  const showTeam = can.members || can.invites;
  const teamDone = invited > 0 || data.members.length > 1;
  const steps = [
    { id: "company", icon: Building2, title: "db.g.company", body: "db.g.companyBody", done: true, href: "" },
    ...(can.branches ? [{ id: "branch", icon: GitBranch, title: "db.g.branch", body: "db.g.branchBody", done: data.branches.length > 0, href: can.createBranch ? "/branches" : "" }] : []),
    ...(showTeam ? [{ id: "team", icon: Users, title: "db.g.team", body: "db.g.teamBody", done: teamDone, href: can.invites ? "/users?invite=1" : "" }] : []),
    ...(can.roles ? [{ id: "roles", icon: ShieldCheck, title: "db.g.roles", body: "db.g.rolesBody", done: data.audit.some((a) => a.action.startsWith("roles.") || a.action.startsWith("role_permissions.")), href: "/roles" }] : []),
  ] as { id: string; icon: typeof Users; title: MessageKey; body: MessageKey; done: boolean; href: string }[];
  const showStart = can.plan && can.branches && showTeam && (data.branches.length === 0 || !teamDone);
  const doneCount = steps.filter((s) => s.done).length;

  const modules: [string, MessageKey, MessageKey, typeof Users][] = [
    ["att", "db.m.attendance", "db.m.attendanceBody", Clock],
    ["sales", "db.m.sales", "db.m.salesBody", GitBranch],
    ["cust", "db.m.customers", "db.m.customersBody", Users],
    ["ord", "db.m.orders", "db.m.ordersBody", Receipt],
    ["inv", "db.m.inventory", "db.m.inventoryBody", Package],
  ];
  const actIcon = (a: string) => (a.startsWith("invitation") ? Mail : a.startsWith("branches") ? GitBranch : a.startsWith("role") ? ShieldCheck : a.startsWith("membership") ? Users : a.startsWith("compan") ? Building2 : a === "company.create" ? ClipboardList : UserRound);

  const stat = "flex min-h-[132px] flex-col gap-2 p-4";
  const label = "flex items-center gap-2 text-[13px] font-medium text-muted";

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">{t("nav.dashboard")}</h1>

      {showStart && (
        <Card><CardBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 text-[15px] font-semibold">{t("db.gs")}</h2>
            <span className="text-[13px] text-muted">{f("db.gsCount", { done: num(doneCount), total: num(steps.length) })}</span>
          </div>
          <Bar value={doneCount} max={steps.length} />
          <ul className="m-0 flex list-none flex-col p-0">
            {steps.map((s) => (
              <li key={s.id} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-3 first:border-t-0">
                <span aria-hidden="true" className={`grid size-6 place-items-center rounded-full border-2 ${s.done ? "border-primary bg-primary text-white" : "border-line-strong"}`}>{s.done && <Check className="size-3.5 stroke-[3]" />}</span>
                <div><b className={`block font-semibold ${s.done ? "text-muted" : ""}`}>{t(s.title)}</b><small className="text-[13px] leading-snug text-muted">{t(s.body)}</small></div>
                {s.done ? <Badge tone="success">{t("db.done")}</Badge> : s.href ? <Button className="min-h-10 px-3 text-[13px]" onClick={() => router.push(s.href)}>{t("db.open")}</Button> : null}
              </li>
            ))}
          </ul>
        </CardBody></Card>
      )}

      {(can.members || can.branches || can.roles) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {can.members && (
            <Card className={stat}>
              <div className={label}><CreditCard className="size-[18px]" aria-hidden="true" />{t("db.seats")}</div>
              <div className="text-[28px] font-bold leading-tight tabular-nums">{num(seats)} <small className="text-sm font-medium text-muted">{t("db.of")} {num(GROWTH.seats)}</small></div>
              <Bar value={seats} max={GROWTH.seats} />
              <div className="text-xs leading-snug text-muted">{f("db.seatsSub", { active: num(active), invited: num(invited) })}</div>
            </Card>
          )}
          {can.members && (
            <Card className={stat}>
              <div className={label}><Users className="size-[18px]" aria-hidden="true" />{t("db.users")}</div>
              <dl className="m-0 mt-0.5 flex flex-col gap-1.5 text-[13px]">
                {([["status.active", active], ["db.invited", invited], ["status.suspended", suspended]] as const).map(([k, n]) => (
                  <div key={k} className="flex items-center justify-between"><dt>{t(k)}</dt><dd className="m-0 font-bold tabular-nums">{num(n)}</dd></div>
                ))}
              </dl>
            </Card>
          )}
          {can.branches && (
            <Card className={stat}>
              <div className={label}><GitBranch className="size-[18px]" aria-hidden="true" />{t("db.branches")}</div>
              <div className="text-[28px] font-bold leading-tight tabular-nums">{num(data.branches.length)}</div>
              {data.branches.length > 0
                ? <div className="text-xs leading-snug text-muted">{data.branches.slice(0, 3).map((b) => pick(locale, b.name, b.name_local)).join(", ")}</div>
                : can.createBranch && <Link href="/branches" className="-ms-1.5 inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-[13px] font-semibold text-link hover:bg-ground">{t("db.addFirstBranch")}<ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" /></Link>}
            </Card>
          )}
          {can.roles && (
            <Card className={stat}>
              <div className={label}><ShieldCheck className="size-[18px]" aria-hidden="true" />{t("db.roles")}</div>
              <div className="text-[28px] font-bold leading-tight tabular-nums">{num(data.roles.length)}</div>
              <div className="text-xs leading-snug text-muted">{t("db.rolesSub")}</div>
            </Card>
          )}
        </div>
      )}

      {can.audit && (
        <Card><CardBody className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-[15px] font-semibold">{t("db.activity")}</h2>
            <Link href="/audit" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-1.5 text-[13px] font-semibold text-link hover:bg-ground">{t("db.viewAudit")}<ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden="true" /></Link>
          </div>
          {data.audit.length === 0 ? <p className="m-0 text-muted">{t("db.activityEmpty")}</p> : (
            <ul className="m-0 flex list-none flex-col p-0">
              {data.audit.map((a) => {
                const d = describeAction(a.action, a.details);
                const Icon = actIcon(a.action);
                return (
                  <li key={a.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0 first:pt-0">
                    <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-primary-soft text-primary-ink"><Icon className="size-4" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1 leading-snug">{f(d.key, { who: who(a.membership_id), name: d.name ?? "", action: a.action })}</span>
                    <time dateTime={a.created_at} className="flex-none whitespace-nowrap text-xs tabular-nums text-muted">{fmtDateTime(locale, a.created_at)}</time>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody></Card>
      )}

      {(can.invites || can.plan) && (
        <div className={`grid items-start gap-4 ${can.invites && can.plan ? "lg:grid-cols-[2.2fr_1fr]" : ""}`}>
          {can.invites && (
            <Card><CardBody className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-[15px] font-semibold">{t("db.inv")}</h2>
                {invited > 0 && <Badge>{num(invited)}</Badge>}
              </div>
              {invited === 0 ? (
                <EmptyState title={t("db.invEmpty")} body={t("db.invEmptyBody")} action={<Button variant="primary" onClick={() => router.push("/users?invite=1")}><Plus className="size-[18px]" aria-hidden="true" />{t("users.invite")}</Button>} />
              ) : (
                <ul className="m-0 flex list-none flex-col p-0">
                  {data.invitations.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0">
                      <div className="min-w-0">
                        <b className="block break-all font-semibold">{i.label || t("db.invNoLabel")}</b>
                        <small className="block text-xs leading-snug text-muted">{f("db.invMeta", { role: roleName(i.role_id), branch: branchName(i.branch_id) })}</small>
                        <small className="block text-xs leading-snug text-muted">{f("db.invDates", { sent: fmtDate(locale, i.created_at), expires: fmtDate(locale, i.expires_at) })}</small>
                      </div>
                      <div className="flex gap-2">
                        <Button className="min-h-10 px-3 text-[13px]" loading={busy === i.id} title={t("db.resendHint")} onClick={() => resend(i)}>{t("db.resend")}</Button>
                        <Button variant="danger" className="min-h-10 px-3 text-[13px]" disabled={busy === i.id} onClick={() => revoke(i.id)}>{t("invite.revoke")}</Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 text-xs text-muted">{t("db.seatsRule")}</p>
            </CardBody></Card>
          )}
          {can.plan && (
            <Card><CardBody className="flex flex-col gap-3">
              <h2 className="m-0 text-[15px] font-semibold">{t("db.plan")}</h2>
              <div><Badge tone={daysLeft > 0 ? "info" : "warning"}>{daysLeft > 0 ? t("db.trial") : t("db.trialEnded")}</Badge></div>
              {daysLeft > 0 && <div className="flex flex-col gap-2"><span className="text-[13px]">{f("db.daysLeft", { days: num(daysLeft) })}</span><Bar value={TRIAL_DAYS - daysLeft} max={TRIAL_DAYS} /></div>}
              <div className="text-[13px] text-muted">{f("db.planSeats", { used: num(seats), limit: num(GROWTH.seats), slots: num(0), max: num(GROWTH.slots) })}</div>
              <p className="m-0 text-[13px] leading-snug text-muted">{t("db.planAfter")}</p>
              {seats > STARTER.seats && <p role="note" className="m-0 rounded-[10px] bg-warning-soft p-2.5 text-[13px] leading-snug text-warning-ink">{f("db.planWarn", { n: num(seats) })}</p>}
            </CardBody></Card>
          )}
        </div>
      )}

      <section aria-labelledby="mods" className="flex flex-col gap-3 rounded-card border border-primary bg-linear-to-b from-primary-soft to-surface p-4 shadow-[inset_0_0_0_1px_var(--color-primary)]">
        <div className="flex items-center justify-between gap-2">
          <h2 id="mods" className="m-0 flex items-center gap-2 text-base font-semibold"><Sparkles className="size-5 text-primary" aria-hidden="true" />{t("db.modules")}</h2>
          <Badge tone="info">{t("db.soon")}</Badge>
        </div>
        <p className="m-0 text-[13px] text-muted">{t("db.modulesNote")}</p>
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 p-0">
          {modules.map(([id, title, body, Icon]) => (
            <li key={id} className="flex flex-col gap-3 rounded-card border border-line-strong bg-surface p-3.5">
              <span className="grid size-11 place-items-center rounded-xl bg-primary text-white"><Icon className="size-[22px]" aria-hidden="true" /></span>
              <div className="flex flex-col gap-0.5"><b className="text-[15px] font-semibold">{t(title)}</b><small className="text-[13px] leading-snug text-muted">{t(body)}</small></div>
              <span className="mt-auto"><Badge tone="info"><Lock className="me-1 size-3" aria-hidden="true" />{t("db.soon")}</Badge></span>
            </li>
          ))}
        </ul>
      </section>

      <Modal open={link !== undefined} onClose={() => setLink(undefined)} closeLabel={t("common.close")} title={t("invite.linkTitle")}
        footer={<><Button onClick={() => setLink(undefined)}>{t("common.close")}</Button><Button variant="primary" onClick={copy}>{t("invite.copy")}</Button></>}>
        <div className="flex flex-col gap-3">
          <p className="text-muted">{t("invite.linkBody")}</p>
          <input readOnly value={link ?? ""} aria-label={t("invite.linkTitle")} onFocus={(e) => e.currentTarget.select()} className="h-(--control-h) w-full rounded-control border border-line-strong bg-ground px-3" />
        </div>
      </Modal>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div role="progressbar" aria-valuenow={Math.min(value, max)} aria-valuemin={0} aria-valuemax={max} className="h-2 overflow-hidden rounded-full bg-neutral-soft">
      <i className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}
