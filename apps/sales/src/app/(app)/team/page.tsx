"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, EmptyState, ErrorState, Reveal, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { shownName } from "@/lib/customers";
import { daysFrom } from "@/lib/plan";

interface FeedItem {
  id: string; kind: "visit" | "call"; body: string; occurred_at: string; customer_id: string;
  customer_name: string; customer_name_local: string | null; author_name: string | null; author_name_local: string | null;
  detail: { outside_range?: boolean } | null;
}
interface Overdue { id: string; title: string; due_date: string; customer_id: string | null; customer_name: string | null; customer_name_local: string | null; employee_name: string; employee_name_local: string | null }
interface Feed { allowed: boolean; visits?: number; calls?: number; items?: FeedItem[]; overdue?: Overdue[] }
type Filter = "all" | "visit" | "call" | "overdue";

/** Manager feed: what the team did today, and what is overdue. Read only. */
export default function Page() {
  const { t, locale } = useI18n();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("sales_team_feed", {});
    if (error) { setFailed(true); return; }
    setFailed(false); setFeed(data as unknown as Feed);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const items = (feed?.items ?? []).filter((i) => filter === "all" || filter === i.kind);
  const overdue = feed?.overdue ?? [];
  const chips = [["all", "go.team.all"], ["visit", "go.team.visitsOnly"], ["call", "go.team.callsOnly"], ["overdue", "go.team.overdue"]] as const;

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("go.team.title")}</h1>
      {failed ? (
        <ErrorState title={t("go.team.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={() => void load()}>{t("go.retry")}</Button>} />
      ) : feed === null ? (
        <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-card" />)}</div>
      ) : !feed.allowed ? (
        <EmptyState title={t("go.team.title")} body={t("go.team.noAccess")} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([[feed.visits ?? 0, "go.team.visits"], [feed.calls ?? 0, "go.team.calls"], [overdue.length, "go.team.overdue"]] as const).map(([n, k]) => (
              <div key={k} className="rounded-card border border-line bg-surface p-3"><b className="block text-2xl">{n}</b><span className="text-xs text-muted">{t(k)}</span></div>
            ))}
          </div>
          <div role="radiogroup" aria-label={t("go.team.title")} className="flex flex-wrap gap-1.5">
            {chips.map(([f, k]) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}
                className={`min-h-10 rounded-full px-3 text-sm ${filter === f ? "bg-primary font-semibold text-white" : "border border-line-strong"}`}>{t(k)}</button>
            ))}
          </div>
          {filter !== "overdue" && (items.length === 0 && (filter !== "all" || overdue.length === 0) ? (
            <EmptyState title={t("go.team.title")} body={t("go.team.empty")} />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {items.map((i, n) => (
                <li key={i.id}>
                  <Reveal delay={Math.min(n, 8) * 30}>
                    <Link href={`/customers/${i.customer_id}`} aria-label={t("go.team.open")} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-3">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <b className="min-w-0 truncate">{shownName({ name: i.author_name ?? "", name_local: i.author_name_local }, locale)} · {t(i.kind === "visit" ? "go.inbox.visit" as const : "go.inbox.call" as const)} · {shownName({ name: i.customer_name, name_local: i.customer_name_local }, locale)}</b>
                        <span className="shrink-0 text-xs text-muted">{time(i.occurred_at)}</span>
                      </span>
                      {i.body && <span className="line-clamp-2 text-sm text-muted">{i.body}</span>}
                      {i.detail?.outside_range && <Badge tone="warning">{t("go.team.outside")}</Badge>}
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          ))}
          {(filter === "all" || filter === "overdue") && overdue.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {overdue.map((o) => (
                <li key={o.id} className="flex flex-col gap-1 rounded-card border border-line bg-surface p-3">
                  <b className="text-sm">{shownName({ name: o.employee_name, name_local: o.employee_name_local }, locale)} · {fill(t("go.team.lateFor"), { n: -daysFrom(o.due_date) })}</b>
                  <span className="text-sm text-muted">{o.title}{o.customer_id && o.customer_name ? ` · ${shownName({ name: o.customer_name, name_local: o.customer_name_local }, locale)}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {filter === "overdue" && overdue.length === 0 && <EmptyState title={t("go.team.overdue")} body={t("go.team.empty")} />}
        </>
      )}
    </div>
  );
}
