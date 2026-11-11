"use client";
import { useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Input, SidePanel, Select, Table, TBody, TD, TH, THead, TR } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { fmtDateTime } from "@/lib/format";
import type { Json } from "@/lib/supabase/database.types";

interface Row { id: string; created_at: string; membership_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Json }
interface Props {
  rows: Row[];
  hasMore: boolean;
  members: { id: string; display_name: string | null }[];
  filters: { entity: string; from: string; to: string };
  isFirstPage: boolean;
}

const types = ["company", "companies", "company_settings", "branches", "memberships", "invitation", "roles", "role_permissions", "membership_roles"];

function isObject(v: Json | undefined): v is { [k: string]: Json | undefined } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const show = (v: Json | undefined) => (typeof v === "string" ? v : JSON.stringify(v));

export function AuditView({ rows, hasMore, members, filters, isFirstPage }: Props) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState<Row | null>(null);
  const who = (id: string | null) => (id ? members.find((m) => m.id === id)?.display_name ?? "—" : t("audit.system"));
  const typeLabel = (e: string) => (types.includes(e) ? t(`audit.type.${e}` as MessageKey) : e);

  const params = new URLSearchParams();
  if (filters.entity) params.set("entity", filters.entity);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const older = new URLSearchParams(params);
  if (rows.length) older.set("before", rows[rows.length - 1].created_at);

  const d = open?.details;
  const changes = isObject(d) && isObject(d.old) && isObject(d.new) ? { old: d.old, new: d.new } : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("audit.title")}</h1>
        <p className="text-muted">{t("audit.subtitle")}</p>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Select label={t("audit.filter.entity")} name="entity" defaultValue={filters.entity}>
          <option value="">{t("audit.filter.all")}</option>
          {types.map((e) => <option key={e} value={e}>{typeLabel(e)}</option>)}
        </Select>
        <Input label={t("audit.filter.from")} type="date" name="from" defaultValue={filters.from} />
        <Input label={t("audit.filter.to")} type="date" name="to" defaultValue={filters.to} />
        <Button type="submit" variant="primary">{t("audit.filter.apply")}</Button>
        <Link href="/audit" className="py-2.5 font-semibold text-link">{t("audit.filter.clear")}</Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={t("audit.empty")} body={t("audit.emptyBody")} />
      ) : (
        <Table>
          <THead><TR><TH>{t("audit.when")}</TH><TH>{t("audit.who")}</TH><TH>{t("audit.action")}</TH><TH>{t("audit.entity")}</TH><TH><span className="sr-only">{t("audit.details")}</span></TH></TR></THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD><time dateTime={r.created_at}>{fmtDateTime(locale, r.created_at)}</time></TD>
                <TD>{who(r.membership_id)}</TD>
                <TD><code className="text-xs">{r.action}</code></TD>
                <TD>{typeLabel(r.entity_type)}</TD>
                <TD><Button variant="quiet" onClick={() => setOpen(r)}>{t("audit.details")}</Button></TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <div className="flex gap-4">
        {!isFirstPage && <Link href={params.size ? `/audit?${params}` : "/audit"} className="font-semibold text-link">{t("audit.newest")}</Link>}
        {hasMore && <Link href={`/audit?${older}`} className="font-semibold text-link">{t("audit.older")}</Link>}
      </div>

      <SidePanel open={open !== null} onClose={() => setOpen(null)} closeLabel={t("common.close")} title={open?.action ?? ""}
        footer={<Button onClick={() => setOpen(null)}>{t("common.close")}</Button>}>
        {open && (
          <div className="flex flex-col gap-3">
            <p className="text-muted">{who(open.membership_id)} · {fmtDateTime(locale, open.created_at)}</p>
            {changes ? (
              <Table>
                <THead><TR><TH>{t("audit.field")}</TH><TH>{t("audit.before")}</TH><TH>{t("audit.after")}</TH></TR></THead>
                <TBody>
                  {Object.keys(changes.new).map((k) => (
                    <TR key={k}><TD><code className="text-xs">{k}</code></TD><TD>{show(changes.old[k])}</TD><TD>{show(changes.new[k])}</TD></TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <pre className="overflow-x-auto rounded-control bg-ground p-3 text-xs">{JSON.stringify(open.details, null, 2)}</pre>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
