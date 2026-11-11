"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Avatar, Badge, Card, EmptyState, ErrorState, Input } from "@uplif/ui";
import { STATUS, type Status } from "@/lib/money";
import { fmtDate, UsageBar } from "@/components/bits";
import type { Plan, Subscriber } from "@/lib/types";

const FILTERS: ("all" | Status)[] = ["all", "past_due", "trial", "active", "suspended"];

export function SubscribersView({ subscribers, plans, failed }: { subscribers: Subscriber[]; plans: Plan[]; failed: boolean }) {
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [q, setQ] = useState("");
  const planOf = (id: string) => plans.find((p) => p.id === id);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: subscribers.length };
    for (const s of subscribers) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [subscribers]);
  const shown = subscribers.filter((s) =>
    (filter === "all" || s.status === filter) &&
    (!q.trim() || `${s.owner_name ?? ""} ${s.owner_email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Subscribers</h1>
        <p className="text-muted">Every owner account on the platform, with its plan and how much of it they use. Business data is never shown here.</p>
      </div>
      {failed ? <ErrorState title="Subscribers could not be loaded" body="Check that the database migrations are applied, then reload." /> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
              {FILTERS.map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className="min-h-9 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:font-semibold aria-pressed:text-primary-ink">
                  {f === "all" ? "All" : STATUS[f].label} <span className="text-muted tabular-nums">{counts[f] ?? 0}</span>
                </button>
              ))}
            </div>
            <div className="min-w-56 max-w-sm flex-1">
              <Input label="Search subscribers" type="search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          {shown.length === 0 ? (
            <EmptyState title="No subscribers match" body={subscribers.length ? "Try another status or search." : "Owners appear here when they create a company."} />
          ) : (
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_minmax(0,1.2fr)_8rem_1.5rem] gap-4 border-b border-line bg-ground px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted lg:grid">
                <span>Subscriber</span><span>Plan</span><span>Status</span><span>Users</span><span>Next invoice</span><span />
              </div>
              <ul>
                {shown.map((s) => {
                  const p = planOf(s.plan_id);
                  const used = s.users_active + s.users_pending;
                  const name = s.owner_name || s.owner_email || "Unknown";
                  const st = STATUS[s.status as Status] ?? STATUS.active;
                  return (
                    <li key={s.owner_user_id} className="border-b border-line last:border-b-0">
                      <Link href={`/subscribers/${s.owner_user_id}`} className="grid items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-primary-soft lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_minmax(0,1.2fr)_8rem_1.5rem]">
                        <span className="flex min-w-0 items-center gap-3">
                          <Avatar name={name} size="sm" />
                          <span className="min-w-0"><b className="block truncate font-semibold">{name}</b><small className="block truncate text-muted">{s.owner_email}</small></span>
                        </span>
                        <span><b className="font-semibold">{s.plan_name}</b><small className="block text-muted">{s.cycle === "year" ? "Yearly" : "Monthly"} · {s.companies} {s.companies === 1 ? "company" : "companies"}</small></span>
                        <span><Badge tone={st.tone}>{st.label}</Badge></span>
                        <span className="flex flex-col gap-1.5">
                          <UsageBar used={used} limit={p?.max_users ?? null} label={`${used} of ${p?.max_users ?? "?"} users`} />
                          <small className="text-muted tabular-nums">{s.users_active} active{s.users_pending ? `, ${s.users_pending} invited` : ""}</small>
                        </span>
                        <span className="tabular-nums text-muted">{s.next_invoice_at ? fmtDate(s.next_invoice_at) : "—"}</span>
                        <ChevronRight className="hidden size-4 text-muted lg:block" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
