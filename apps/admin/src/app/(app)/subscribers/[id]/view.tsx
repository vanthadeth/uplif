"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, ErrorState, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { INVOICE_STATUS, STATUS, methodLabel, money, moduleLabel, type InvoiceStatus, type Status } from "@/lib/money";
import { UsageBar, fmtDate, fmtDay } from "@/components/bits";
import { PayModal, VoidModal } from "@/components/invoice-actions";
import type { Invoice, Plan, SupportGrant } from "@/lib/types";
import { GRANT_STATUS, type GrantStatus } from "@/lib/money";

interface Data {
  owner_name: string | null; owner_email: string | null; plan_id: string; plan_name: string; cycle: "month" | "year"; status: Status;
  started_at: string; trial_ends_at: string | null; next_invoice_at: string | null; billing_email: string | null;
  suspended_reason: string | null; requested_plan_id: string | null; requested_plan: string | null; requested_cycle: "month" | "year" | null; requested_at: string | null;
  companies: { id: string; name: string; name_local: string | null; country_code: string; created_at: string }[];
  usage: { companies: number; users_active: number; users_pending: number; branches_max: number };
}

export function SubscriberView({ data, plans, invoices, grants, ownerId, failed }: { data: Data | null; plans: Plan[]; invoices: Invoice[]; grants: SupportGrant[]; ownerId: string; failed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState<"month" | "year">("month");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [askCo, setAskCo] = useState<{ id: string; name: string } | null>(null);
  const [why, setWhy] = useState("");
  const [hours, setHours] = useState("2");
  const [extending, setExtending] = useState(false);
  const [days, setDays] = useState("14");
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const back = <Link href="/subscribers" className="inline-flex min-h-9 items-center gap-1 font-semibold text-link"><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />Subscribers</Link>;
  if (failed || !data) return <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">{back}<ErrorState title="This subscriber could not be loaded" body="Reload, or go back to the list." /></div>;

  const current = plans.find((p) => p.id === data.plan_id);
  const chosen = plans.find((p) => p.id === planId);
  const used = data.usage.users_active + data.usage.users_pending;
  const name = data.owner_name || data.owner_email || "Unknown";
  const st = STATUS[data.status];
  const fromTrial = data.status === "trial" || data.suspended_reason === "trial_ended";
  const offered = plans.filter((p) => !p.archived);
  const price = (p: Plan | undefined, c: string) => (p ? (c === "year" || p.price_month_cents == null ? `${money(p.price_year_cents)} per year` : `${money(p.price_month_cents)} per month`) : "—");

  function show() {
    // A plan the owner asked for is the natural choice.
    setPlanId(data!.requested_plan_id ?? data!.plan_id); setCycle(data!.requested_cycle ?? data!.cycle); setError(undefined); setOpen(true);
  }
  async function assign() {
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().rpc("platform_assign_plan", { p_owner: ownerId, p_plan: planId, p_cycle: cycle });
    setBusy(false);
    if (err) {
      const m = /over the limit: (.+)/.exec(err.message);
      return setError(m ? `This account already uses more ${m[1]} than that plan allows. They would need to reduce it first.` : err.message === "this package is billed yearly" ? "This package is billed yearly." : "Could not change the plan. Try again.");
    }
    toast("success", fromTrial ? "Plan assigned. The account is unlocked and the first invoice goes out at the next daily run (or press Run billing now)." : "Plan changed. The new price starts at the next invoice.");
    setOpen(false);
    router.refresh();
  }

  async function extend() {
    setBusy(true);
    const { error: err } = await createClient().rpc("platform_extend_trial", { p_owner: ownerId, p_days: Number(days) });
    setBusy(false);
    if (err) return toast("error", "Could not extend the trial. Reload and try again.");
    toast("success", `Trial extended by ${days} days.${data!.status === "suspended" ? " The account is unlocked." : ""}`);
    setExtending(false);
    router.refresh();
  }
  const hasOpen = invoices.some((i) => i.status === "open" || i.status === "overdue");
  async function ask() {
    if (!askCo) return;
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().rpc("platform_request_support_access", { p_company: askCo.id, p_reason: why, p_hours: Number(hours) });
    setBusy(false);
    if (err) return setError(err.message.includes("open request") ? "This company already has an open request." : err.message.includes("suspended") ? "This account is suspended." : err.message.includes("reason") ? "Give a reason of 5 to 300 characters." : "Could not send the request. Try again.");
    toast("success", "Request sent to the owner. You cannot see anything until they approve.");
    setAskCo(null); setWhy("");
    router.refresh();
  }
  async function issue() {
    setBusy(true);
    const { error: err } = await createClient().rpc("platform_issue_invoice", { p_owner: ownerId, p_due_days: 7 });
    setBusy(false);
    if (err) return toast("error", err.message.includes("open invoice") ? "Settle or void the open invoice first." : err.message.includes("suspended") ? "This account is suspended." : "Could not issue the invoice. Try again.");
    toast("success", "Invoice issued. It is due in 7 days.");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold">{name}</h1>
            <p className="flex flex-wrap items-center gap-2 text-muted">{data.owner_email}<Badge tone={st.tone}>{st.label}</Badge></p>
          </div>
        </div>
        <div className="flex gap-2">
          {fromTrial && <Button onClick={() => setExtending(true)}>Extend trial</Button>}
          <Button onClick={issue} loading={busy} disabled={hasOpen || data.status === "suspended"}>Issue invoice</Button>
          <Button variant="primary" onClick={show}>{fromTrial ? "Assign plan" : "Change plan"}</Button>
        </div>
      </div>

      {data.suspended_reason === "trial_ended" && (
        <p role="status" className="rounded-md border border-line bg-neutral-soft px-3 py-2">
          The trial ended{data.trial_ends_at ? ` on ${fmtDate(data.trial_ends_at)}` : ""} and this account is locked. Assign a plan or extend the trial to unlock it.
        </p>
      )}
      {data.requested_plan && data.requested_cycle && data.requested_at && (
        <p role="status" className="rounded-md border border-line bg-primary-soft px-3 py-2 text-primary-ink">
          The owner asked for <b>{data.requested_plan}</b> ({data.requested_cycle === "year" ? "yearly" : "monthly"}) on {fmtDate(data.requested_at)}. Agree payment with them, then press Assign plan.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Plan and billing" />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-muted">Plan</dt><dd>{data.plan_name}{current && <span className="text-muted"> · {price(current, data.cycle)}</span>}</dd>
              <dt className="text-muted">Billing</dt><dd>{data.cycle === "year" ? "Yearly" : "Monthly"}</dd>
              <dt className="text-muted">Subscribed</dt><dd>{fmtDate(data.started_at)}</dd>
              {fromTrial && data.trial_ends_at && <><dt className="text-muted">{data.status === "trial" ? "Trial ends" : "Trial ended"}</dt><dd>{fmtDate(data.trial_ends_at)}</dd></>}
              <dt className="text-muted">Next invoice</dt><dd>{data.next_invoice_at ? fmtDate(data.next_invoice_at) : "—"}</dd>
              <dt className="text-muted">Billing contact</dt><dd className="break-all">{data.billing_email || data.owner_email || "—"}</dd>
              <dt className="text-muted">Modules</dt><dd>{current?.modules.length ? current.modules.map(moduleLabel).join(", ") : "None"}</dd>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Usage against the plan" />
          <CardBody className="flex flex-col gap-4">
            {[
              { l: "Users", u: used, m: current?.max_users ?? null, extra: `${data.usage.users_active} active, ${data.usage.users_pending} invited` },
              { l: "Companies", u: data.usage.companies, m: current?.max_companies ?? null },
              { l: "Branches in the largest company", u: data.usage.branches_max, m: current?.max_branches ?? null },
            ].map((r) => (
              <div key={r.l} className="flex flex-col gap-1.5">
                <div className="flex justify-between gap-3"><span>{r.l}</span><b className="tabular-nums">{r.u} / {r.m ?? "no limit"}</b></div>
                <UsageBar used={r.u} limit={r.m} label={`${r.l}: ${r.u} of ${r.m ?? "no limit"}`} />
                {r.extra && <small className="text-muted">{r.extra}</small>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Invoices" />
        {invoices.length === 0 ? <p className="px-5 pb-5 text-muted">No invoices yet. Issue one when this account is due to pay.</p> : (
          <ul>
            {invoices.map((i) => {
              const t = INVOICE_STATUS[i.status as InvoiceStatus] ?? INVOICE_STATUS.open;
              const live = i.status === "open" || i.status === "overdue";
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0">
                  <span><b className="font-semibold">{i.number}</b><small className="block text-muted">{i.status === "paid" ? `Paid ${fmtDay(i.paid_at!)} · ${methodLabel(i.payment_method)}` : `Due ${fmtDay(i.due_date)}`}</small></span>
                  <span className="flex items-center gap-3"><b className="tabular-nums">{money(i.amount_cents)}</b><Badge tone={t.tone}>{t.label}</Badge>
                    {live && <><Button onClick={() => setVoiding(i)}>Void</Button><Button variant="primary" onClick={() => setPaying(i)}>Mark as paid</Button></>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Companies" />
        <ul>
          {data.companies.map((c) => (
            <li key={c.name + c.created_at} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 last:border-b-0">
              <span><b className="font-semibold">{c.name}</b>{c.name_local && <span className="text-muted"> · {c.name_local}</span>}</span>
              <span className="flex flex-wrap items-center gap-3">
                <span className="text-muted">{c.country_code} · since {fmtDate(c.created_at)}</span>
                {(() => {
                  const g = grants.find((x) => x.company_id === c.id && (x.status === "requested" || x.status === "approved"));
                  if (g) { const t = GRANT_STATUS[g.status as GrantStatus]; return <Badge tone={t.tone}>{t.label}</Badge>; }
                  return <Button onClick={() => { setError(undefined); setAskCo({ id: c.id, name: c.name }); }}>Request support access</Button>;
                })()}
              </span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-3 text-sm text-muted">Only the company name, country and start date are visible here. Team, customers, sales and stock are never shown to the platform.</p>
      </Card>

      <Modal open={!!askCo} onClose={() => setAskCo(null)} closeLabel="Close" title="Request support access"
        footer={<><Button onClick={() => setAskCo(null)}>Cancel</Button><Button variant="primary" loading={busy} disabled={why.trim().length < 5} onClick={ask}>Send request</Button></>}>
        <div className="flex flex-col gap-4">
          <p className="text-muted">{askCo?.name}. The owner must approve before you can see anything. Access is read only, every record you open is logged, and the owner can end it at any time.</p>
          <Input label="Why do you need access?" value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} hint="The owner sees this. For example: invoice total looks wrong, ticket 214." />
          <Select label="For how long" value={hours} onChange={(e) => setHours(e.target.value)}>
            {[1, 2, 4, 8, 24].map((h) => <option key={h} value={h}>{h} {h === 1 ? "hour" : "hours"}</option>)}
          </Select>
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      </Modal>
      <Modal open={extending} onClose={() => setExtending(false)} closeLabel="Close" title="Extend the trial"
        footer={<><Button onClick={() => setExtending(false)}>Cancel</Button><Button variant="primary" loading={busy} onClick={extend}>Extend trial</Button></>}>
        <div className="flex flex-col gap-3">
          <Select label="Extend by" value={days} onChange={(e) => setDays(e.target.value)}>
            {["7", "14", "30", "60"].map((d) => <option key={d} value={d}>{d} days</option>)}
          </Select>
          <p className="text-muted">{data.status === "suspended" ? "The account is unlocked straight away and the new trial runs from today." : "The days are added to the current end date."} This is written to the activity log.</p>
        </div>
      </Modal>
      <PayModal invoice={paying} onClose={() => setPaying(null)} />
      <VoidModal invoice={voiding} onClose={() => setVoiding(null)} />
      <Modal open={open} onClose={() => setOpen(false)} closeLabel="Close" title={fromTrial ? "Assign a plan" : "Change plan"}
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!planId || (!fromTrial && planId === data.plan_id && cycle === data.cycle)} onClick={assign}>{fromTrial ? "Assign plan" : "Change plan"}</Button></>}>
        <div className="flex flex-col gap-4">
          <Select label="Plan" value={planId} onChange={(e) => { setPlanId(e.target.value); const p = plans.find((x) => x.id === e.target.value); if (p?.price_month_cents == null) setCycle("year"); }}>
            {offered.map((p) => <option key={p.id} value={p.id}>{p.name}{p.kind === "custom" ? " (custom)" : ""}</option>)}
          </Select>
          <Select label="Billing" value={cycle} onChange={(e) => setCycle(e.target.value as "month" | "year")} disabled={chosen?.price_month_cents == null}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </Select>
          <p className="text-muted">{price(chosen, cycle)}. No credit or refund is given; the new price starts at the next invoice.</p>
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
