import Link from "next/link";
import { AlertTriangle, CreditCard, Hourglass, Users } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, ErrorState } from "@uplif/ui";
import { loadPlatform } from "@/lib/platform";
import { STATUS, money, type Status } from "@/lib/money";
import { fmtDate } from "@/components/bits";

const DAY = 86_400_000;

export default async function OverviewPage() {
  const { supabase } = await loadPlatform();
  const [subs, plans, hol] = await Promise.all([supabase.rpc("platform_list_subscribers"), supabase.rpc("platform_list_plans"), supabase.rpc("platform_holiday_overview")]);
  const holAlerts = ((hol.data as { alerts?: { country_code: string; year: number; acknowledged_at: string | null }[] } | null)?.alerts ?? []).filter((a) => !a.acknowledged_at);
  const header = (
    <div>
      <h1 className="text-2xl font-bold">Overview</h1>
      <p className="text-muted">The state of the platform: subscribers, revenue and what needs attention.</p>
    </div>
  );
  if (subs.error || plans.error) {
    return <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">{header}<ErrorState title="The overview could not be loaded" body="Check that the database migrations are applied, then reload." /></div>;
  }
  const list = subs.data ?? [], planList = plans.data ?? [];
  const planOf = (id: string) => planList.find((p) => p.id === id);
  const by = (s: Status) => list.filter((x) => x.status === s).length;
  // Monthly revenue counts paying accounts only; a yearly price is shown as a twelfth.
  const mrr = list.filter((x) => x.status === "active" || x.status === "past_due").reduce((sum, x) => {
    const p = planOf(x.plan_id);
    if (!p) return sum;
    return sum + (x.cycle === "year" || p.price_month_cents == null ? p.price_year_cents / 12 : p.price_month_cents);
  }, 0);
  const now = Date.now();
  const trialsEnding = list.filter((x) => x.status === "trial" && x.trial_ends_at && new Date(x.trial_ends_at).getTime() - now < 3 * DAY);
  const atLimit = list.filter((x) => { const p = planOf(x.plan_id); return p && x.users_active + x.users_pending >= p.max_users; });
  const pastDue = list.filter((x) => x.status === "past_due");

  const stats = [
    { icon: Users, label: "Subscribers", value: String(list.length), sub: `${by("active")} active · ${by("trial")} on trial` },
    { icon: CreditCard, label: "Monthly revenue", value: money(Math.round(mrr)), sub: "Active and past-due accounts; yearly plans count as a twelfth." },
    { icon: AlertTriangle, label: "Past due", value: String(by("past_due")), sub: by("past_due") ? "Payment is late. Nothing is suspended automatically." : "Nobody is late." },
    { icon: Hourglass, label: "Trials ending soon", value: String(trialsEnding.length), sub: "Within 3 days." },
  ];
  const attention = [
    ...holAlerts.map((a) => ({ key: `h${a.country_code}${a.year}`, id: "", href: "/holidays" as string, name: a.country_code === "*" ? "Holiday fetch" : `Holidays ${a.country_code}`, why: `${a.year} holidays could not be fetched`, tone: "warning" as const })),
    ...pastDue.map((x) => ({ key: `d${x.owner_user_id}`, id: x.owner_user_id, name: x.owner_name || x.owner_email || "Unknown", why: `Payment past due${x.next_invoice_at ? ` since ${fmtDate(x.next_invoice_at)}` : ""}`, tone: "warning" as const })),
    ...trialsEnding.map((x) => ({ key: `t${x.owner_user_id}`, id: x.owner_user_id, name: x.owner_name || x.owner_email || "Unknown", why: `Trial ends ${fmtDate(x.trial_ends_at!)}`, tone: "info" as const })),
    ...atLimit.map((x) => ({ key: `l${x.owner_user_id}`, id: x.owner_user_id, name: x.owner_name || x.owner_email || "Unknown", why: "Using every user their plan allows", tone: "neutral" as const })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      {header}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ icon: Icon, label, value, sub }) => (
          <Card key={label}>
            <CardBody className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-[13px] font-medium text-muted"><Icon className="size-[18px]" aria-hidden="true" />{label}</span>
              <span className="text-3xl font-bold tabular-nums">{value}</span>
              <span className="text-xs text-muted">{sub}</span>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Needs attention" action={<Link href="/subscribers" className="font-semibold text-link">All subscribers</Link>} />
        {attention.length === 0 ? (
          <p className="p-5 text-muted">Nothing needs attention right now.</p>
        ) : (
          <ul>
            {attention.map((a) => (
              <li key={a.key} className="border-b border-line last:border-b-0">
                <Link href={"href" in a ? String(a.href) : `/subscribers/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-primary-soft">
                  <b className="font-semibold">{a.name}</b>
                  <Badge tone={a.tone}>{a.why}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Subscribers by status" />
        <CardBody className="flex flex-wrap gap-3">
          {(Object.keys(STATUS) as Status[]).map((s) => <Badge key={s} tone={STATUS[s].tone}>{STATUS[s].label}: {by(s)}</Badge>)}
        </CardBody>
      </Card>
    </div>
  );
}
