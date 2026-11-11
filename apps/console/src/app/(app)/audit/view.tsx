"use client";
import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Clock, Lock } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, Input, Select, SidePanel, useToast } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { fmtDate, pick } from "@/lib/format";
import type { Json } from "@/lib/supabase/database.types";

interface Row { id: string; created_at: string; membership_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Json }
interface Props {
  canView: boolean;
  rows: Row[];
  hasMore: boolean;
  count: number;
  pageSize: number;
  members: { id: string; display_name: string | null }[];
  names: Record<string, { name: string; local: string | null }>;
  filters: { entity: string; who: string; range: string; from: string; to: string };
}
type Obj = { [k: string]: Json | undefined };

const types = ["company", "companies", "company_settings", "branches", "memberships", "invitation", "roles", "role_permissions", "membership_roles", "support_grant"];
const isObject = (v: Json | undefined): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function AuditView({ canView, rows, hasMore, count, pageSize, members, names, filters }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState<Row | null>(null);
  const [raw, setRaw] = useState(false);

  const typeLabel = (e: string) => (types.includes(e) ? t(`audit.type.${e}` as MessageKey) : e);
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.display_name ?? "—" : t("audit.system"));
  const nameOf = (id: string | null | undefined) => {
    const n = id ? names[id] : undefined;
    return n ? pick(locale, n.name, n.local) : null;
  };
  const sentence = (r: Row) => {
    const d = isObject(r.details) ? r.details : {};
    let key = r.action;
    if (r.action === "memberships.update") {
      const status = isObject(d.new) ? d.new.status : undefined;
      key = status === "suspended" ? "memberships.suspended" : status === "active" ? "memberships.active" : r.action;
    }
    if (r.action.startsWith("role_permissions.")) key = "role_permissions";
    const k = `audit.act.${key}` as MessageKey;
    try { const s = t(k); if (s) return s; } catch { /* fall through */ }
    return r.action;
  };
  // The record an entry is about: the changed record itself, or the row it points to.
  const recordName = (r: Row) => {
    const d = isObject(r.details) ? r.details : {};
    const row = isObject(d.row) ? d.row : {};
    if (r.entity_type === "branches" || r.entity_type === "roles" || r.entity_type === "memberships") return nameOf(r.entity_id) ?? (typeof row.name === "string" ? row.name : null);
    if (r.entity_type === "role_permissions") return nameOf(typeof row.role_id === "string" ? row.role_id : null);
    if (r.entity_type === "membership_roles") return nameOf(typeof row.membership_id === "string" ? row.membership_id : null);
    return null;
  };

  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ ...(filters.entity && { entity: filters.entity }), ...(filters.who && { who: filters.who }), ...(filters.range && { range: filters.range }), ...(filters.from && { from: filters.from }), ...(filters.to && { to: filters.to }), ...patch });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    if (p.get("range") !== "cus") { p.delete("from"); p.delete("to"); }
    router.replace(p.size ? `${path}?${p}` : path, { scroll: false });
  };
  const filtersOn = !!(filters.entity || filters.who || filters.range);
  const badRange = filters.range === "cus" && !!filters.from && !!filters.to && filters.from > filters.to;

  const groups = useMemo(() => {
    const out: { key: string; iso: string; rows: Row[] }[] = [];
    for (const r of rows) {
      const k = dayKey(r.created_at);
      const last = out[out.length - 1];
      if (last?.key === k) last.rows.push(r); else out.push({ key: k, iso: r.created_at, rows: [r] });
    }
    return out;
  }, [rows]);
  const dayLabel = (iso: string) => {
    const k = dayKey(iso), now = new Date(), y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const text = fmtDate(locale, iso);
    if (k === dayKey(now.toISOString())) return `${t("audit.today")} · ${text}`;
    if (k === dayKey(y.toISOString())) return `${t("audit.yesterday")} · ${text}`;
    return text;
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale === "km" ? "km-KH" : "en-GB", { hour: "2-digit", minute: "2-digit" });

  const value = (k: string, v: Json | undefined) => {
    if (typeof v === "string" && uuid.test(v)) {
      const n = nameOf(v);
      return <>{n ?? ""}<small className="block text-muted"><code>{v.slice(0, 8)}…</code></small></>;
    }
    if (v === null || v === undefined) return <span className="text-muted">—</span>;
    if (typeof v === "boolean") return v ? t("audit.on") : t("audit.off");
    return typeof v === "string" ? v : JSON.stringify(v);
  };
  const d = open?.details;
  const changes = isObject(d) && isObject(d.old) && isObject(d.new) ? { old: d.old, new: d.new } : null;
  const snapshot = isObject(d) && isObject(d.row) ? d.row : isObject(d) && Object.keys(d).length ? d : null;

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
          <p className="text-muted">{t("audit.subtitle")}</p>
        </div>
        <Badge><Lock className="me-1 size-3" aria-hidden="true" />{t("audit.readOnly")}</Badge>
      </div>

      {!canView ? (
        <Card><EmptyState title={t("audit.noTitle")} body={t("audit.noBody")} action={<Link href="/roles" className="font-semibold text-link">{t("audit.noLink")}</Link>} /></Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-3 p-4">
              <Select label={t("audit.filter.who")} value={filters.who} onChange={(e) => go({ who: e.target.value })}>
                <option value="">{t("audit.filter.everyone")}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.display_name ?? "—"}</option>)}
                <option value="sys">{t("audit.filter.system")}</option>
              </Select>
              <Select label={t("audit.filter.entity")} value={filters.entity} onChange={(e) => go({ entity: e.target.value })}>
                <option value="">{t("audit.filter.all")}</option>
                {types.map((e) => <option key={e} value={e}>{typeLabel(e)}</option>)}
              </Select>
              <Select label={t("audit.filter.date")} value={filters.range} onChange={(e) => go({ range: e.target.value })}>
                <option value="">{t("audit.range.any")}</option>
                <option value="today">{t("audit.range.today")}</option>
                <option value="7">{t("audit.range.7")}</option>
                <option value="30">{t("audit.range.30")}</option>
                <option value="cus">{t("audit.range.cus")}</option>
              </Select>
              {filters.range === "cus" && (
                <>
                  <Input label={t("audit.filter.from")} type="date" value={filters.from} onChange={(e) => go({ from: e.target.value })} />
                  <Input label={t("audit.filter.to")} type="date" value={filters.to} error={badRange ? t("audit.filter.bad") : undefined} onChange={(e) => go({ to: e.target.value })} />
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm">
              <span role="status" aria-live="polite" className="text-muted">
                {rows.length === 1 ? t("audit.showingOne") : t("audit.showing").replace("{n}", String(rows.length))}
              </span>
              <button type="button" disabled={!filtersOn} onClick={() => router.replace(path, { scroll: false })} className="font-semibold text-link disabled:cursor-not-allowed disabled:opacity-40">
                {t("audit.filter.reset")}
              </button>
            </div>
          </Card>

          {rows.length === 0 ? (
            <Card><EmptyState title={t("audit.empty")} body={t("audit.emptyBody")} action={filtersOn ? <Button onClick={() => router.replace(path, { scroll: false })}>{t("audit.filter.reset")}</Button> : undefined} /></Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[5rem_minmax(8rem,12rem)_1fr_10rem_1.5rem] gap-3 border-b border-line bg-ground px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted md:grid">
                <span>{t("audit.when")}</span><span>{t("audit.who")}</span><span>{t("audit.what")}</span><span>{t("audit.record")}</span><span />
              </div>
              {groups.map((g) => (
                <section key={g.key} aria-label={dayLabel(g.iso)}>
                  <h2 className="flex items-center gap-2 border-b border-line bg-ground px-4 py-2 text-sm font-semibold">
                    <Clock className="size-4 text-muted" aria-hidden="true" />{dayLabel(g.iso)}
                    <span className="ms-auto font-normal text-muted">{g.rows.length}</span>
                  </h2>
                  <ul>
                    {g.rows.map((r) => {
                      const rec = recordName(r);
                      const wname = who(r.membership_id);
                      return (
                        <li key={r.id} className="border-b border-line last:border-b-0">
                          <button type="button" onClick={() => { setRaw(false); setOpen(r); }}
                            className="grid w-full grid-cols-[1fr_1.5rem] items-center gap-x-3 gap-y-1 px-4 py-3 text-start hover:bg-primary-soft md:grid-cols-[5rem_minmax(8rem,12rem)_1fr_10rem_1.5rem]">
                            <span className="col-span-2 flex items-center gap-2 md:contents">
                              <span className="text-sm text-muted tabular-nums"><time dateTime={r.created_at}>{time(r.created_at)}</time></span>
                              <span className="flex min-w-0 items-center gap-2">
                                <Avatar name={wname} size="sm" /><b className="truncate font-semibold">{wname}</b>
                              </span>
                            </span>
                            <span className="min-w-0">
                              <b className="block font-semibold">{sentence(r)}{r.action === "branches.insert" && rec ? ` ${rec}` : ""}</b>
                              {rec && r.action !== "branches.insert" && <small className="block truncate text-muted">{rec}</small>}
                            </span>
                            <span className="col-start-1 md:col-start-auto"><Badge>{typeLabel(r.entity_type)}</Badge></span>
                            <ChevronRight className="col-start-2 row-start-2 size-4 text-muted md:col-start-auto md:row-start-auto rtl:rotate-180" aria-hidden="true" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <div className="flex flex-col items-center gap-1 border-t border-line p-5 text-center text-sm">
                {hasMore ? (
                  <Button onClick={() => go({ n: String(count + pageSize) })}>{t("audit.older")}</Button>
                ) : (
                  <><b>{t("audit.endTitle")}</b><span className="text-muted">{t("audit.endBody")}</span></>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      <SidePanel sheet open={open !== null} onClose={() => setOpen(null)} closeLabel={t("common.close")} title={open ? sentence(open) : ""}
        footer={<Button onClick={() => setOpen(null)}>{t("common.close")}</Button>}>
        {open && (
          <div className="flex flex-col gap-4">
            <p className="text-muted">{who(open.membership_id)} · {fmtDate(locale, open.created_at)}, {time(open.created_at)}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">{t("audit.recordType")}</dt><dd>{typeLabel(open.entity_type)}</dd>
              <dt className="text-muted">{t("audit.record")}</dt>
              <dd>{recordName(open) ?? <span className="text-muted">{t("audit.deletedRecord")}</span>}{open.entity_id && <small className="block text-muted"><code>{open.entity_id.slice(0, 8)}…</code></small>}</dd>
              <dt className="text-muted">{t("audit.action")}</dt><dd><code className="text-xs">{open.action}</code></dd>
              <dt className="text-muted">{t("audit.entryId")}</dt>
              <dd className="flex items-center gap-2"><code className="text-xs">{open.id.slice(0, 8)}…</code>
                <button type="button" className="font-semibold text-link" onClick={() => { void navigator.clipboard?.writeText(open.id); toast("success", t("audit.copied")); }}>{t("audit.copy")}</button></dd>
            </dl>
            {(changes || snapshot) && (
              <section>
                <h3 className="mb-2 text-sm font-semibold">{changes ? t("audit.changed") : t("audit.rowThen")}</h3>
                <div className="overflow-x-auto rounded-control border border-line">
                  <table className="w-full text-start text-sm">
                    <thead className="bg-ground text-xs text-muted">
                      <tr><th className="px-3 py-2 text-start">{t("audit.field")}</th>{changes ? <><th className="px-3 py-2 text-start">{t("audit.before")}</th><th className="px-3 py-2 text-start">{t("audit.after")}</th></> : <th className="px-3 py-2 text-start">{t("audit.value")}</th>}</tr>
                    </thead>
                    <tbody>
                      {(changes ? Object.keys(changes.new) : Object.keys(snapshot!)).map((k) => (
                        <tr key={k} className="border-t border-line align-top">
                          <td className="px-3 py-2"><code className="text-xs">{k}</code></td>
                          {changes
                            ? <><td className="px-3 py-2 text-danger-ink">{value(k, changes.old[k])}</td><td className="px-3 py-2 text-success-ink">{value(k, changes.new[k])}</td></>
                            : <td className="px-3 py-2">{value(k, snapshot![k])}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
            <div><button type="button" className="text-sm font-semibold text-link" onClick={() => setRaw((v) => !v)}>{raw ? t("audit.rawHide") : t("audit.raw")}</button></div>
            {raw && <pre tabIndex={0} className="overflow-x-auto rounded-control bg-ground p-3 text-xs">{JSON.stringify(open.details, null, 2)}</pre>}
            <p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" aria-hidden="true" />{t("audit.locked")}</p>
          </div>
        )}
      </SidePanel>
    </div>
  );
}
