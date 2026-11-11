"use client";
import { useCallback, useEffect, useState } from "react";
import { Bot, ChevronUp, Pin, Plus } from "lucide-react";
import { Button, useToast } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { errorKey, rpc } from "@/lib/translation/api";
import { sameTokens, tokensOf, type ShownKind, type SuggestionRow } from "@/lib/translation/types";
import { KindBadge, kindBody, Tokens, useFill } from "../parts";

/** One string opened: why its text is shown, every suggestion with a vote button, and a box to add another. */
export function StringDetail({ code, stringKey, source, isReviewer, onChanged }: {
  code: string; stringKey: string; source: string; isReviewer: boolean; onChanged: () => void;
}) {
  const { t } = useI18n();
  const f = useFill();
  const toast = useToast();
  const [rows, setRows] = useState<SuggestionRow[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const need = tokensOf(source);

  const load = useCallback(async () => {
    try {
      setRows(await rpc<SuggestionRow[]>(createClient(), "i18n_string_detail", { p_lang: code, p_key: stringKey }));
    } catch (e) { setError(t(errorKey(e))); setRows([]); }
  }, [code, stringKey, t]);
  useEffect(() => { void load(); }, [load]);

  async function act(fn: string, args: Record<string, unknown>, done: Parameters<typeof t>[0]) {
    setBusy(true); setError("");
    try {
      await rpc(createClient(), fn, args);
      toast("success", t(done));
      await load();
      onChanged();
    } catch (e) { setError(t(errorKey(e))); }
    setBusy(false);
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    if (!sameTokens(source, draft)) return setError(t("tl.e.tokens"));
    setBusy(true); setError("");
    try {
      await rpc(createClient(), "i18n_add_suggestion", { p_lang: code, p_key: stringKey, p_text: draft });
      toast("success", t("tl.t.add"));
      setDraft("");
      await load();
      onChanged();
    } catch (err) { setError(t(errorKey(err))); }
    setBusy(false);
  }

  if (!rows) return <p role="status" className="m-0 text-muted">…</p>;
  const shown = rows.find((r) => r.is_shown);
  const kind: ShownKind | null = shown?.kind ?? null;
  const order = [...rows].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || Number(b.is_shown) - Number(a.is_shown) || Number(a.origin === "machine") - Number(b.origin === "machine"));

  return (
    <div className="flex flex-col gap-3">
      {kind ? <p className="m-0 text-[13px] leading-relaxed text-muted"><KindBadge kind={kind} /> {t(kindBody(kind))}</p> : <p className="m-0 text-[13px] text-muted">{t("tl.s.none")}</p>}
      <div className="flex flex-col gap-2">
        {order.map((r) => (
          <div key={r.id} className={`grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-card border bg-surface p-2.5 sm:grid-cols-[44px_minmax(0,1fr)_auto] ${r.is_shown ? "border-primary shadow-[0_0_0_1px_var(--color-primary)]" : "border-line"}`}>
            <div className="flex flex-col items-center gap-1">
              <button type="button" disabled={busy} aria-pressed={r.i_voted} aria-label={t("tl.s.vote")} title={t("tl.s.vote")}
                onClick={() => act("i18n_vote", { p_suggestion: r.id, p_on: !r.i_voted }, "tl.t.vote")}
                className={`grid size-11 place-items-center rounded-xl border disabled:opacity-60 ${r.i_voted ? "border-primary bg-primary text-white" : "border-line-strong bg-surface text-muted hover:bg-ground hover:text-ink"}`}>
                <ChevronUp className="size-5" aria-hidden="true" />
              </button>
              {r.i_voted && <span className="text-[11px] text-muted">{t("tl.s.voted")}</span>}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span lang={code} className="break-words text-[15px] leading-relaxed"><Tokens text={r.text} /></span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {r.origin === "machine"
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-neutral-soft px-2 py-0.5 font-semibold"><Bot className="size-3.5" aria-hidden="true" />{t("tl.s.machine")}</span>
                  : <span>{f("tl.s.by", { name: r.is_mine ? t("tl.s.you") : r.author_name ?? "—" })}</span>}
                {r.is_shown && kind && <KindBadge kind={kind} prefix={t("tl.s.shownNow")} />}
              </span>
            </div>
            {isReviewer && (
              <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:flex-col sm:items-end">
                <span className="text-base font-bold tabular-nums">{f((r.votes ?? 0) === 1 ? "tl.s.vote1" : "tl.s.votes", { count: r.votes ?? 0 })}</span>
                {r.is_pinned
                  ? <Button className="min-h-10 px-3 text-[13px] !border-primary !bg-primary-soft !text-primary-ink" disabled={busy} onClick={() => act("i18n_unpin", { p_lang: code, p_key: stringKey }, "tl.t.unpin")}><Pin className="size-4" aria-hidden="true" />{t("tl.s.pinned")} · {t("tl.s.unpin")}</Button>
                  : <Button className="min-h-10 px-3 text-[13px]" disabled={busy} onClick={() => act("i18n_pin", { p_lang: code, p_key: stringKey, p_suggestion: r.id }, "tl.t.pin")}><Pin className="size-4" aria-hidden="true" />{t("tl.s.show")}</Button>}
              </div>
            )}
          </div>
        ))}
      </div>
      {need.length > 0 && <p className="m-0 text-xs text-muted">{t("tl.s.keep")} {need.map((x) => <span key={x} className="mx-0.5 inline-block rounded-md bg-warning-soft px-1.5 font-mono text-warning-ink">{x}</span>)}</p>}
      <form onSubmit={add} className="flex flex-col gap-2">
        <label htmlFor={`ns-${stringKey}`} className="text-[13px] font-semibold">{t("tl.s.addTitle")}</label>
        <textarea id={`ns-${stringKey}`} lang={code} value={draft} onChange={(e) => { setDraft(e.target.value); setError(""); }} maxLength={2000} rows={3}
          className={`min-h-[72px] w-full resize-y rounded-control border bg-surface px-3 py-2 text-ink ${error ? "border-danger" : "border-line-strong"}`} />
        {error && <p role="alert" className="m-0 text-xs leading-snug text-danger-ink">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" className="min-h-10 px-3 text-[13px]" disabled={busy || !draft.trim()}><Plus className="size-[18px]" aria-hidden="true" />{t("tl.s.addBtn")}</Button>
          <span className="text-xs text-muted">{t("tl.s.addHint")}</span>
        </div>
        {!isReviewer && <p className="m-0 text-xs text-muted">{t("tl.w.hideNote")}</p>}
      </form>
    </div>
  );
}
