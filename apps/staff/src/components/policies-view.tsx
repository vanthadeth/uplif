"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Skeleton, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";

interface Policy {
  policy_id: string; version_id: string; version: number; title: string; title_local: string | null; body: string; body_local: string | null;
  published_at: string; acknowledged_at: string | null; confirmed_earlier: boolean;
}

/** Company policies: the list, a policy to read, and the confirmation for the current version. */
export function PoliciesView() {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const toast = useToast();
  const [rows, setRows] = useState<Policy[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await createClient().rpc("my_policies");
    if (error) { setFailed(true); return; }
    setRows(data as Policy[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  const date = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });

  if (failed) return <ErrorState title={t("st.learn.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!rows) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.learn.loading")}><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (rows.length === 0) return <EmptyState title={t("st.learn.empty.title")} body={t("st.learn.empty.body")} />;

  const open = rows.find((r) => r.policy_id === openId) ?? null;
  const todo = rows.filter((r) => !r.acknowledged_at).length;

  async function confirm(p: Policy) {
    setBusy(true);
    const { error } = await createClient().rpc("acknowledge_policy", { p_version_id: p.version_id });
    setBusy(false);
    if (error) {
      toast("error", t(error.code === "P0002" ? "st.policy.stale" : "st.policy.error"));
      if (error.code === "P0002") { setAgreed(false); void load(); }
      return;
    }
    toast("success", t("st.policy.saved"));
    setAgreed(false);
    void load();
  }

  if (open) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1">
          <button type="button" aria-label={t("st.back")} onClick={() => { setOpenId(null); setAgreed(false); }} className="grid size-11 place-items-center rounded-control hover:bg-ground"><ChevronLeft className="size-6 rtl:rotate-180" aria-hidden /></button>
          <h2 className="min-w-0 break-words text-xl font-bold tracking-tight">{local(open.title, open.title_local)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{fill(t("st.policy.version"), { n: open.version, date: date(open.published_at) })}</span>
          {!open.acknowledged_at && open.confirmed_earlier && <Badge tone="warning">{t("st.policy.updated")}</Badge>}
        </div>
        <p className="m-0 whitespace-pre-wrap break-words rounded-card border border-line bg-surface p-4 leading-relaxed">{local(open.body, open.body_local)}</p>
        {open.acknowledged_at ? (
          <p className="m-0 flex items-center gap-2 rounded-card bg-success-soft p-3 font-semibold text-success-ink"><Check className="size-5" aria-hidden />{fill(t("st.policy.done"), { date: date(open.acknowledged_at) })}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 leading-snug">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 size-5 shrink-0" />
              <span>{t("st.policy.confirm")}</span>
            </label>
            <Button variant="primary" className="h-14 w-full text-lg" disabled={!agreed} loading={busy} onClick={() => void confirm(open)}>{t("st.policy.confirmBtn")}</Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {todo > 0 && <div><Badge tone="warning">{fill(t("st.learn.todo"), { n: todo })}</Badge></div>}
      <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0">
        {rows.map((r) => (
          <li key={r.policy_id}>
            <button type="button" onClick={() => setOpenId(r.policy_id)} className="flex w-full items-center gap-3 p-4 text-start hover:bg-ground">
              <span className="min-w-0 flex-1">
                <b className="block break-words">{local(r.title, r.title_local)}</b>
                <span className="text-sm text-muted">{fill(t("st.policy.version"), { n: r.version, date: date(r.published_at) })}</span>
              </span>
              <Badge tone={r.acknowledged_at ? "success" : "warning"}>{t(r.acknowledged_at ? "st.policy.confirmed" : "st.policy.needs")}</Badge>
              <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
