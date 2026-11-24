"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { initials, shownName, type CustomerRow } from "@/lib/customers";
import { addDays } from "@/lib/plan";

const KINDS = ["planned", "appointment", "delivery", "collection"] as const;

/** Add a stop to the plan: pick a customer, the day, an optional time and what it is for. */
export default function AddStop() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [day, setDay] = useState<0 | 1>(0);
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("planned");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      createClient().rpc("sales_customer_list", { p_search: q.trim() || null, p_limit: 30 }).then(({ data }) => setRows((data ?? []) as unknown as CustomerRow[]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  async function save() {
    if (!pick || busy) return;
    setBusy(true); setError(false);
    const { error: e } = await createClient().rpc("sales_plan_add", { p_id: crypto.randomUUID(), p_customer_id: pick, p_day: addDays(day), p_time: time || null, p_kind: kind, p_note: null });
    setBusy(false);
    if (e) { setError(true); return; }
    router.replace("/");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href="/" aria-label={t("go.cancel")} className="grid size-10 place-items-center"><X className="size-5" aria-hidden /></Link>
        <h1 className="m-0 flex-1 text-base font-semibold">{t("go.plan.addTitle")}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pb-32">
        <label className="flex h-12 items-center gap-2 rounded-control border border-line-strong bg-surface px-3"><Search className="size-5 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("go.cust.search")} aria-label={t("go.cust.search")} className="min-w-0 flex-1 bg-transparent outline-none" /></label>
        {rows === null ? <Skeleton className="h-40 w-full" /> : (
          <ul className="m-0 flex max-h-64 list-none flex-col gap-1.5 overflow-y-auto p-0">
            {rows.map((r) => {
              const name = shownName(r, locale), on = pick === r.id;
              return (
                <li key={r.id}><button type="button" aria-pressed={on} onClick={() => setPick(r.id)} className={`flex w-full items-center gap-3 rounded-card border p-2.5 text-start ${on ? "border-2 border-primary bg-primary-soft/40" : "border-line bg-surface"}`}>
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-soft text-sm font-semibold">{initials(name)}</span><b className="truncate">{name}</b></button></li>
              );
            })}
          </ul>
        )}
        <div role="radiogroup" aria-label={t("go.plan.day")} className="flex gap-2">
          {([[0, "go.tasks.today"], [1, "go.log.next.tomorrow"]] as const).map(([n, k]) => (
            <button key={n} type="button" role="radio" aria-checked={day === n} onClick={() => setDay(n)} className={`min-h-11 rounded-full px-4 text-sm ${day === n ? "bg-primary font-semibold text-white" : "border border-line-strong bg-surface"}`}>{t(k)}</button>
          ))}
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label={t("go.plan.time")} className="ms-auto h-11 rounded-control border border-line-strong bg-surface px-2" />
        </div>
        <div role="radiogroup" aria-label={t("go.plan.kind")} className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-11 rounded-full px-3.5 text-sm ${kind === k ? "bg-primary font-semibold text-white" : "border border-line-strong bg-surface"}`}>{t(`go.plan.kind.${k}` as never)}</button>
          ))}
        </div>
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md flex-col gap-2 border-t border-line bg-surface px-4 pb-6 pt-3">
        {error && <p role="alert" className="m-0 rounded-card bg-danger-soft p-2 text-sm text-danger-ink">{t("go.plan.failed")}</p>}
        <Button variant="primary" className="h-12 w-full" disabled={!pick} loading={busy} onClick={save}>{t("go.plan.save")}</Button>
      </footer>
    </div>
  );
}
