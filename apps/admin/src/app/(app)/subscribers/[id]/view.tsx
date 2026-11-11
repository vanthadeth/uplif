"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, ErrorState, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { STATUS, money, moduleLabel, type Status } from "@/lib/money";
import { UsageBar, fmtDate } from "@/components/bits";
import type { Plan } from "@/lib/types";

interface Data {
  owner_name: string | null; owner_email: string | null; plan_id: string; plan_name: string; cycle: "month" | "year"; status: Status;
  started_at: string; trial_ends_at: string | null; next_invoice_at: string | null; billing_email: string | null;
  companies: { name: string; name_local: string | null; country_code: string; created_at: string }[];
  usage: { companies: number; users_active: number; users_pending: number; branches_max: number };
}

export function SubscriberView({ data, plans, ownerId, failed }: { data: Data | null; plans: Plan[]; ownerId: string; failed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState("");
  const [cycle, setCycle] = useState<"month" | "year">("month");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const back = <Link href="/subscribers" className="inline-flex min-h-9 items-center gap-1 font-semibold text-link"><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />Subscribers</Link>;
  if (failed || !data) return <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">{back}<ErrorState title="This subscriber could not be loaded" body="Reload, or go back to the list." /></div>;

  const current = plans.find((p) => p.id === data.plan_id);
  const chosen = plans.find((p) => p.id === planId);
  const used = data.usage.users_active + data.usage.users_pending;
  const name = data.owner_name || data.owner_email || "Unknown";
  const st = STATUS[data.status];
  const offered = plans.filter((p) => !p.archived);
  const price = (p: Plan | undefined, c: string) => (p ? (c === "year" || p.price_month_cents == null ? `${money(p.price_year_cents)} per year` : `${money(p.price_month_cents)} per month`) : "—");

  function show() {
    setPlanId(data!.plan_id); setCycle(data!.cycle); setError(undefined); setOpen(true);
  }
  async function assign() {
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().rpc("platform_assign_plan", { p_owner: ownerId, p_plan: planId, p_cycle: cycle });
    setBusy(false);
    if (err) {
      const m = /over the limit: (.+)/.exec(err.message);
      return setError(m ? `This account already uses more ${m[1]} than that plan allows. They would need to reduce it first.` : err.message === "this package is billed yearly" ? "This package is billed yearly." : "Could not change the plan. Try again.");
    }
    toast("success", "Plan changed. The new price starts at the next invoice.");
    setOpen(false);
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
        <Button variant="primary" onClick={show}>Change plan</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Plan and billing" />
          <CardBody>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-muted">Plan</dt><dd>{data.plan_name}{current && <span className="text-muted"> · {price(current, data.cycle)}</span>}</dd>
              <dt className="text-muted">Billing</dt><dd>{data.cycle === "year" ? "Yearly" : "Monthly"}</dd>
              <dt className="text-muted">Subscribed</dt><dd>{fmtDate(data.started_at)}</dd>
              {data.status === "trial" && data.trial_ends_at && <><dt className="text-muted">Trial ends</dt><dd>{fmtDate(data.trial_ends_at)}</dd></>}
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
        <CardHeader title="Companies" />
        <ul>
          {data.companies.map((c) => (
            <li key={c.name + c.created_at} className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 last:border-b-0">
              <span><b className="font-semibold">{c.name}</b>{c.name_local && <span className="text-muted"> · {c.name_local}</span>}</span>
              <span className="text-muted">{c.country_code} · since {fmtDate(c.created_at)}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-5 py-3 text-sm text-muted">Only the company name, country and start date are visible here. Team, customers, sales and stock are never shown to the platform.</p>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} closeLabel="Close" title="Change plan"
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={busy} disabled={!planId || (planId === data.plan_id && cycle === data.cycle)} onClick={assign}>Change plan</Button></>}>
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
