"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, SidePanel, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { INVOICE_STATUS, methodLabel, money, type InvoiceStatus } from "@/lib/money";
import { fmtDay } from "@/components/bits";
import { PayModal, VoidModal } from "@/components/invoice-actions";
import type { Invoice } from "@/lib/types";

const FILTERS: ("all" | InvoiceStatus)[] = ["all", "overdue", "open", "paid", "void"];
const month = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const st = (i: Invoice) => INVOICE_STATUS[i.status as InvoiceStatus] ?? INVOICE_STATUS.open;

export function BillingView({ invoices, failed }: { invoices: Invoice[]; failed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | InvoiceStatus>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const thisMonth = new Date().toISOString().slice(0, 7);

  const totals = useMemo(() => {
    const sum = (f: (i: Invoice) => boolean) => invoices.filter(f).reduce((a, i) => a + i.amount_cents, 0);
    return {
      paid: sum((i) => i.status === "paid" && !!i.paid_at && i.paid_at.startsWith(thisMonth)),
      waiting: sum((i) => i.status === "open"),
      overdue: sum((i) => i.status === "overdue"),
    };
  }, [invoices, thisMonth]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const i of invoices) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [invoices]);
  const shown = useMemo(() => invoices.filter((i) => filter === "all" || i.status === filter).sort((a, b) => b.period_start.localeCompare(a.period_start) || b.number.localeCompare(a.number)), [invoices, filter]);
  const groups = useMemo(() => {
    const g: { key: string; items: Invoice[] }[] = [];
    for (const i of shown) {
      const key = i.period_start.slice(0, 7);
      const last = g[g.length - 1];
      if (last?.key === key) last.items.push(i); else g.push({ key, items: [i] });
    }
    return g;
  }, [shown]);
  const open = invoices.find((i) => i.id === openId) ?? null;
  async function runBilling() {
    setRunning(true);
    const { data, error } = await createClient().rpc("platform_run_billing");
    setRunning(false);
    if (error) return toast("error", "Could not run billing. Reload and try again.");
    const r = data as { issued: number; failed: number; past_due: number };
    toast(r.failed ? "error" : "success", `Issued ${r.issued} invoice${r.issued === 1 ? "" : "s"}, marked ${r.past_due} past due${r.failed ? `, ${r.failed} could not be issued (see Admin activity)` : ""}.`);
    router.refresh();
  }
  const canAct = (i: Invoice) => i.status === "open" || i.status === "overdue";

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted">Subscription invoices for every account. New invoices go out by themselves every day at 8:00 (Cambodia time) when an account&apos;s billing date has come. Payments are recorded by hand.</p>
        </div>
        <Button loading={running} onClick={runBilling}>Run billing now</Button>
      </div>
      {failed ? <ErrorState title="Invoices could not be loaded" body="Check that the database migrations are applied, then reload." /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[["Paid this month", totals.paid], ["Waiting for payment", totals.waiting], ["Overdue", totals.overdue]].map(([l, v]) => (
              <Card key={l as string} className="p-4"><div className="text-sm text-muted">{l}</div><div className="text-2xl font-bold tabular-nums">{money(v as number)}</div></Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className="min-h-9 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-primary-ink">
                {f === "all" ? "All" : INVOICE_STATUS[f].label} <span className="text-muted tabular-nums">{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <EmptyState title={invoices.length ? "No invoices match" : "No invoices yet"} body={invoices.length ? "Try another status." : "Open a subscriber and choose Issue invoice."} />
          ) : (
            <Card className="overflow-hidden">
              {groups.map((g) => (
                <section key={g.key}>
                  <h2 className="border-b border-line bg-ground px-4 py-2.5 text-sm font-semibold">{month(`${g.key}-01`)} <span className="font-normal text-muted">· {g.items.length}</span></h2>
                  <ul>
                    {g.items.map((i) => (
                      <li key={i.id} className="border-b border-line last:border-b-0">
                        <button type="button" onClick={() => setOpenId(i.id)} className="grid w-full items-center gap-x-4 gap-y-1 px-4 py-3 text-start hover:bg-primary-soft sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_7rem_7rem_1.5rem]">
                          <span><b className="block font-semibold">{i.number}</b><small className="text-muted">{i.status === "paid" ? `Paid ${fmtDay(i.paid_at!)} · ${methodLabel(i.payment_method)}` : i.status === "void" ? "Void" : `Due ${fmtDay(i.due_date)}`}</small></span>
                          <span className="min-w-0 truncate">{i.owner_name || i.owner_email}</span>
                          <b className="tabular-nums">{money(i.amount_cents)}</b>
                          <span><Badge tone={st(i).tone}>{st(i).label}</Badge></span>
                          <ChevronRight className="hidden size-4 text-muted sm:block" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </Card>
          )}
        </>
      )}

      <SidePanel sheet open={!!open} onClose={() => setOpenId(null)} closeLabel="Close" title={open?.number ?? ""}
        footer={open && (
          <>
            <Button onClick={() => setOpenId(null)}>Close</Button>
            {canAct(open) && <Button onClick={() => setVoiding(open)}>Void</Button>}
            {canAct(open) && <Button variant="primary" onClick={() => setPaying(open)}>Mark as paid</Button>}
          </>
        )}>
        {open && (
          <div className="flex flex-col gap-4">
            <div><Badge tone={st(open).tone}>{st(open).label}</Badge></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
              <dt className="text-muted">Subscriber</dt><dd><Link className="font-semibold text-link" href={`/subscribers/${open.owner_user_id}`}>{open.owner_name || open.owner_email}</Link></dd>
              <dt className="text-muted">Plan</dt><dd>{open.plan_name} · {open.cycle === "year" ? "Yearly" : "Monthly"}</dd>
              <dt className="text-muted">Period</dt><dd>{fmtDay(open.period_start)} to {fmtDay(open.period_end)}</dd>
              <dt className="text-muted">Amount</dt><dd><b>{money(open.amount_cents)}</b></dd>
              <dt className="text-muted">Due</dt><dd>{fmtDay(open.due_date)}</dd>
              {open.status === "paid" && <><dt className="text-muted">Paid on</dt><dd>{fmtDay(open.paid_at!)}</dd><dt className="text-muted">Method</dt><dd>{methodLabel(open.payment_method)}</dd>{open.payment_ref && <><dt className="text-muted">Reference</dt><dd className="break-all">{open.payment_ref}</dd></>}</>}
            </dl>
          </div>
        )}
      </SidePanel>
      <PayModal invoice={paying} onClose={() => setPaying(null)} />
      <VoidModal invoice={voiding} onClose={() => setVoiding(null)} />
    </div>
  );
}
