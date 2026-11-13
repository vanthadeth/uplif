"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Reveal, Skeleton } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { initials, shownName, useSignedUrls, type CustomerRow } from "@/lib/customers";
import { useMe } from "./me-context";

function RowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <Skeleton className="size-12 rounded-full" />
      <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
    </div>
  );
}

/** Customer list with search. Row level security decides which customers the person may see. */
export function CustomersList() {
  const { t, locale } = useI18n();
  const me = useMe();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      createClient().rpc("sales_customer_list", { p_search: q.trim() || null, p_limit: 100 }).then(({ data, error }) => {
        if (!live) return;
        if (error) { setFailed(true); setRows(null); return; }
        setFailed(false); setRows((data ?? []) as unknown as CustomerRow[]);
      });
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [q, tick]);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_path));

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3 pt-2">
        <h1 className="text-2xl font-bold tracking-tight">{t("go.cust.title")}</h1>
        {me.can_create && <Link href="/customers/new"><Button variant="primary"><Plus className="size-4" aria-hidden />{t("go.cust.add")}</Button></Link>}
      </div>
      <label className="relative block">
        <span className="sr-only">{t("go.cust.search")}</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("go.cust.search")}
          className="h-12 w-full rounded-control border border-line-strong bg-surface ps-10 pe-3 placeholder:text-muted" />
      </label>
      {failed ? (
        <ErrorState title={t("go.cust.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={() => setTick(tick + 1)}>{t("go.retry")}</Button>} />
      ) : rows === null ? (
        <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-2"><RowSkeleton /><RowSkeleton /><RowSkeleton /><RowSkeleton /></div>
      ) : rows.length === 0 ? (
        q ? <EmptyState title={t("go.cust.noMatch")} body={t("go.cust.noMatchBody")} />
          : <EmptyState title={t("go.cust.empty")} body={t("go.cust.emptyBody")}
              action={me.can_create ? <Link href="/customers/new"><Button variant="primary"><Plus className="size-4" aria-hidden />{t("go.cust.add")}</Button></Link> : undefined} />
      ) : (
        <>
          <p className="px-1 text-sm text-muted">{fill(t("go.cust.count"), { n: rows.length })}</p>
          <ul className="flex flex-col gap-2">
            {rows.map((c, i) => {
              const name = shownName(c, locale);
              const photo = c.photo_path ? urls[c.photo_path] : undefined;
              return (
                <li key={c.id}>
                  <Reveal delay={Math.min(i, 8) * 30}>
                    <Link href={`/customers/${c.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors active:bg-neutral-soft">
                      {photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={photo} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                        : <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary-ink">{initials(name)}</span>}
                      <span className="min-w-0 flex-1">
                        <b className="block truncate">{name}</b>
                        <span className="block truncate text-sm text-muted">{[c.contact_name, c.contact_phone].filter(Boolean).join(" · ") || c.address || t("go.cust.noContact")}</span>
                      </span>
                      {c.archived_at && <Badge>{t("go.cust.archived")}</Badge>}
                    </Link>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
