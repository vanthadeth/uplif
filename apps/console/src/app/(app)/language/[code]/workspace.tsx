"use client";
import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { rpc } from "@/lib/translation/api";
import type { LanguageRow, WorkspaceRow } from "@/lib/translation/types";
import { BackLink, KindBadge, Tokens, useFill } from "../parts";
import { StringDetail } from "./detail";
import Link from "next/link";

type Filter = "all" | "mac" | "vote" | "pin";
const kindOf = { mac: "mac", vote: "top", pin: "pin" } as const;

export function Workspace({ language, initial }: { language: LanguageRow; initial: WorkspaceRow[] }) {
  const { t } = useI18n();
  const f = useFill();
  const [rows, setRows] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const refresh = useCallback(async () => {
    try { setRows(await rpc<WorkspaceRow[]>(createClient(), "i18n_workspace", { p_lang: language.code })); } catch {}
  }, [language.code]);

  const counts = useMemo(() => ({
    all: rows.length, mac: rows.filter((r) => r.kind === "mac").length, vote: rows.filter((r) => r.kind === "top").length, pin: rows.filter((r) => r.kind === "pin").length,
  }), [rows]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => (filter === "all" || r.kind === kindOf[filter]) &&
      (!needle || `${r.string_key} ${r.source_text} ${r.shown_text ?? ""}`.toLowerCase().includes(needle)));
  }, [rows, filter, q]);
  const chips: [Filter, "tl.f.all" | "tl.f.mac" | "tl.f.vote" | "tl.f.pin"][] = [["all", "tl.f.all"], ["mac", "tl.f.mac"], ["vote", "tl.f.vote"], ["pin", "tl.f.pin"]];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/language/community" label={t("tl.community")} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{f("tl.w.title", { lang: language.english_name })}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("tl.w.intro")}</p>
        </div>
        {language.is_reviewer && <Link href={`/language/${language.code}/review`} className="inline-flex min-h-(--control-h) items-center rounded-control border border-line-strong bg-surface px-4 font-semibold hover:bg-ground">{t("tl.c.review")}</Link>}
      </div>

      <label className="flex min-h-11 max-w-sm items-center gap-2 rounded-control border border-line-strong bg-surface px-3">
        <Search className="size-[18px] text-muted" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tl.w.find")} aria-label={t("tl.w.find")} className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted" />
      </label>
      <div role="group" aria-label={t("tl.col.shown")} className="flex flex-wrap gap-2">
        {chips.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] ${filter === id ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line-strong bg-surface font-medium"}`}>
            {t(label)} <em className="not-italic tabular-nums opacity-70">{counts[id]}</em>
          </button>
        ))}
      </div>

      {shown.length === 0 ? <EmptyState title={t("tl.w.emptyTitle")} body={t("tl.w.emptyBody")} /> : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          <div className="hidden grid-cols-[200px_minmax(0,1fr)_minmax(0,1.2fr)_130px] gap-4 border-b border-line bg-neutral-soft px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted md:grid">
            <span>{t("tl.col.key")}</span><span>{t("tl.col.source")}</span><span>{t("tl.col.shown")}</span><span>{t("tl.col.sug")}</span>
          </div>
          <ul className="m-0 list-none p-0">
            {shown.map((r) => {
              const on = open === r.string_key;
              return (
                <li key={r.string_key} className={`border-t border-line first:border-t-0 ${on ? "bg-primary-soft" : ""}`}>
                  <button type="button" aria-expanded={on} onClick={() => setOpen(on ? null : r.string_key)}
                    className={`grid w-full gap-1.5 px-4 py-3.5 text-start md:grid-cols-[200px_minmax(0,1fr)_minmax(0,1.2fr)_130px] md:gap-4 ${on ? "" : "hover:bg-neutral-soft"}`}>
                    <span className="break-all font-mono text-xs text-muted">{r.string_key}</span>
                    <span lang="en"><Tokens text={r.source_text} /></span>
                    <span className="flex flex-col items-start gap-1.5">
                      {r.shown_text ? <span lang={language.code}><Tokens text={r.shown_text} /></span> : <span className="text-muted">{t("tl.w.nothing")}</span>}
                      {r.kind && <KindBadge kind={r.kind} />}
                    </span>
                    <span className="text-[13px] text-muted">{f(r.suggestion_count === 1 ? "tl.s.count1" : "tl.s.count", { count: r.suggestion_count })}</span>
                  </button>
                  {on && <div className="px-4 pb-4"><StringDetail code={language.code} stringKey={r.string_key} source={r.source_text} isReviewer={language.is_reviewer} onChanged={refresh} /></div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="m-0 text-[13px] text-muted">{f("tl.w.showing", { shown: shown.length, total: rows.length })}</p>
    </div>
  );
}
