"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, Tabs, useToast } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";

interface Plan { id: string; name: string; price_month_cents: number | null; price_year_cents: number; max_companies: number; max_branches: number | null; max_users: number; modules: string[] }
const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, String(x)), s);

/** Shown instead of the app while the account is suspended. The database refuses everything else meanwhile. */
export function LockedView({ reason, isOwner, plans, requested, companyName }: {
  reason: string | null; isOwner: boolean; plans: Plan[]; requested: { plan: string; cycle: string } | null; companyName: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [cycle, setCycle] = useState<"month" | "year">("year");
  const [busy, setBusy] = useState("");
  const trial = reason === "trial_ended";

  async function choose(p: Plan) {
    setBusy(p.id);
    const { error } = await createClient().rpc("request_plan", { p_plan: p.id, p_cycle: cycle });
    setBusy("");
    if (error) return toast("error", t("lock.error"));
    toast("success", t("lock.sent"));
    router.refresh();
  }
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center gap-5 p-4">
      <div className="flex flex-col gap-2">
        {companyName && <Badge tone="warning">{companyName}</Badge>}
        <h1 className="text-2xl font-bold">{t(trial ? "lock.title" : "lock.titleOther")}</h1>
        <p className="text-muted">{t(!trial ? "lock.bodySuspended" : isOwner ? "lock.body" : "lock.bodyMember")}</p>
      </div>

      {trial && isOwner && (
        <>
          {requested && <p className="rounded-md border border-line bg-neutral-soft px-3 py-2">{fill(t("lock.requested"), { plan: requested.plan, cycle: t(requested.cycle === "year" ? "lock.yearly" : "lock.monthly") })}</p>}
          <Tabs label={t("lock.title")} value={cycle} onChange={(v) => setCycle(v as "month" | "year")}
            items={[{ id: "month", label: t("lock.monthly") }, { id: "year", label: t("lock.yearly") }]} />
          <div className="grid gap-3 sm:grid-cols-2">
            {plans.map((p) => {
              const price = cycle === "month" ? p.price_month_cents : p.price_year_cents;
              return (
                <Card key={p.id} className="flex flex-col gap-3 p-4">
                  <div>
                    <b className="text-lg">{p.name}</b>
                    <div className="text-2xl font-bold tabular-nums">{price == null ? "—" : usd(price)} <span className="text-base font-normal text-muted">{t(cycle === "month" ? "lock.perMonth" : "lock.perYear")}</span></div>
                  </div>
                  <small className="text-muted">{fill(t("lock.limits"), { companies: p.max_companies, branches: p.max_branches ?? t("lock.unlimited"), users: p.max_users })}</small>
                  <Button variant="primary" disabled={price == null} loading={busy === p.id} onClick={() => choose(p)}>{fill(t("lock.choose"), { plan: p.name })}</Button>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => router.push("/companies")}>{t("dash.switch")}</Button>
        <Button onClick={signOut}>{t("auth.signOut")}</Button>
      </div>
    </main>
  );
}
