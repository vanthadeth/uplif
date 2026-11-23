"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, Plus, Search, WifiOff } from "lucide-react";
import { Avatar, Button, EmptyState, ErrorState, Input, SidePanel, Skeleton, isNetworkError, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pick } from "@/lib/format";
import { useOrders } from "@/components/orders-context";
import { useOrdersOutbox } from "@/components/outbox-context";
import { readCustomerCache, writeCustomerCache, type CustomerRow } from "@/lib/customers-cache";

const PAGE = 50;
type Page = { rows: CustomerRow[]; next: { k: string; id: string } | null };

/** Customer list from the shared customer database: search, paging, add. The first page is kept on the phone for offline use. */
export function CustomersView() {
  const { t, locale } = useI18n();
  const { userId, canCreate } = useOrders();
  const ob = useOrdersOutbox();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [next, setNext] = useState<Page["next"]>(null);
  const [failed, setFailed] = useState(false);
  const [cached, setCached] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", name_local: "", phone: "" });
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (q: string, cursor: Page["next"]) => {
    const mine = ++seq.current;
    const { data, error: err } = await createClient().rpc("customers_list" as never, { p_q: q || null, p_cursor: cursor, p_limit: PAGE } as never);
    if (mine !== seq.current) return;
    if (err) {
      if (isNetworkError(err) && !cursor && !q) { setRows(readCustomerCache(userId)); setCached(true); setFailed(false); }
      else if (!cursor) setFailed(true);
      return;
    }
    const page = data as unknown as Page;
    setFailed(false); setCached(false);
    setRows((old) => (cursor ? [...(old ?? []), ...page.rows] : page.rows));
    setNext(page.next);
    if (!cursor && !q) writeCustomerCache(userId, page.rows);
  }, [userId]);

  useEffect(() => {
    const id = setTimeout(() => { setRows(null); void load(query.trim(), null); }, query ? 250 : 0);
    return () => clearTimeout(id);
  }, [query, load]);

  async function create() {
    if (form.name.trim().length === 0) { setError(t("od.cust.nameRequired")); return; }
    setBusy(true);
    const r = await ob.submit({ fn: "customers_create", kind: "customer", args: {
      p_id: crypto.randomUUID(), p_name: form.name.trim(), p_name_local: form.name_local.trim() || null, p_phone: form.phone.trim() || null, p_source: "orders" } });
    setBusy(false);
    if (r.error) { toast("error", r.error.message); return; }
    toast("success", t(r.queued ? "od.cust.queued" : "od.cust.created"));
    setAdding(false); setForm({ name: "", name_local: "", phone: "" });
    if (!r.queued) void load(query.trim(), null);
  }

  return (
    <main className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("od.cust.title")}</h1>
        {canCreate && <Button variant="primary" onClick={() => { setError(undefined); setAdding(true); }}><Plus className="size-5" aria-hidden />{t("od.cust.add")}</Button>}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("od.cust.search")} aria-label={t("od.cust.search")}
          className="h-12 w-full rounded-control border border-line bg-surface ps-10 pe-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" />
      </div>
      {cached && <p role="status" className="flex items-start gap-3 rounded-card bg-warning-soft p-3 text-warning-ink"><WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />{t("od.cust.cached")}</p>}
      {failed ? <ErrorState title={t("od.cust.loadError")} action={<Button onClick={() => { setFailed(false); void load(query.trim(), null); }}>{t("od.retry")}</Button>} />
        : rows === null ? <ul className="flex flex-col gap-3" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <li key={i}><Skeleton className="h-18 w-full rounded-card" /></li>)}</ul>
        : rows.length === 0 ? <EmptyState title={t(query ? "od.cust.noMatch" : "od.cust.empty")} body={query ? undefined : t("od.cust.emptyBody")} />
        : (
          <ul className="flex flex-col gap-3">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
                <Avatar name={pick(locale, c.name, c.name_local)} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{pick(locale, c.name, c.name_local)}</b>
                  <span className="block truncate text-sm text-muted">{[c.code, c.province].filter(Boolean).join(" · ") || t("od.cust.noPhone")}</span>
                </span>
                {c.phone && <a href={`tel:${c.phone}`} aria-label={c.phone} className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-ink"><Phone className="size-5" aria-hidden /></a>}
              </li>
            ))}
          </ul>
        )}
      {next && rows && <Button onClick={() => void load(query.trim(), next)}>{t("od.cust.more")}</Button>}
      <SidePanel sheet open={adding} onClose={() => setAdding(false)} closeLabel={t("od.close")} title={t("od.cust.add")}
        footer={<><Button onClick={() => setAdding(false)}>{t("od.cancel")}</Button><Button variant="primary" loading={busy} onClick={create}>{t("od.cust.create")}</Button></>}>
        <div className="flex flex-col gap-5">
          <Input label={t("od.cust.name")} value={form.name} maxLength={120} error={error} onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(undefined); }} />
          <Input label={t("od.cust.nameLocal")} value={form.name_local} maxLength={120} onChange={(e) => setForm({ ...form, name_local: e.target.value })} />
          <Input label={t("od.cust.phone")} type="tel" inputMode="tel" value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
      </SidePanel>
    </main>
  );
}
