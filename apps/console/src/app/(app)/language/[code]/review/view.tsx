"use client";
import { useCallback, useMemo, useState } from "react";
import { EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { rpc } from "@/lib/translation/api";
import type { LanguageRow, QueueRow } from "@/lib/translation/types";
import { BackLink, KindBadge, Tokens, useFill } from "../../parts";
import { StringDetail } from "../detail";

type Filter = "all" | "tied" | "differs" | "mac";

/** The reviewer's queue: strings where votes are tied, a pin differs from the votes, or only a machine draft exists. */
export function Review({ language, initial }: { language: LanguageRow; initial: QueueRow[] }) {
  const { t } = useI18n();
  const f = useFill();
  const [rows, setRows] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [key, setKey] = useState<string | null>(initial[0]?.string_key ?? null);
  const refresh = useCallback(async () => {
    try { setRows(await rpc<QueueRow[]>(createClient(), "i18n_review_queue", { p_lang: language.code })); } catch {}
  }, [language.code]);

  const counts = useMemo(() => ({ all: rows.length, tied: rows.filter((r) => r.tied).length, differs: rows.filter((r) => r.differs).length, mac: rows.filter((r) => r.kind === "mac").length }), [rows]);
  const list = rows.filter((r) => filter === "all" || (filter === "tied" ? r.tied : filter === "differs" ? r.differs : r.kind === "mac"));
  const current = rows.find((r) => r.string_key === key) ?? null;
  const chips: [Filter, "tl.r.all" | "tl.r.tied" | "tl.r.differs" | "tl.r.mac"][] = [["all", "tl.r.all"], ["tied", "tl.r.tied"], ["differs", "tl.r.differs"], ["mac", "tl.r.mac"]];

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/language/${language.code}`} label={f("tl.w.title", { lang: language.english_name })} />
      <div>
        <h1 className="text-2xl font-bold">{f("tl.r.title", { lang: language.english_name })}</h1>
        <p className="mt-1 max-w-[62ch] text-muted">{t("tl.r.intro")}</p>
      </div>
      <div role="group" aria-label={t("tl.r.all")} className="flex flex-wrap gap-2">
        {chips.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] ${filter === id ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line-strong bg-surface font-medium"}`}>
            {t(label)} <em className="not-italic tabular-nums opacity-70">{counts[id]}</em>
          </button>
        ))}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {list.length === 0 ? <EmptyState title={t("tl.r.empty")} body={t("tl.r.emptyBody")} /> : (
            <ul className="m-0 max-h-[70vh] list-none overflow-y-auto p-0">
              {list.map((r) => (
                <li key={r.string_key} className="border-t border-line first:border-t-0">
                  <button type="button" aria-current={r.string_key === key} onClick={() => setKey(r.string_key)}
                    className={`flex w-full flex-col gap-1 px-4 py-3 text-start ${r.string_key === key ? "bg-primary-soft" : "hover:bg-neutral-soft"}`}>
                    <span className="break-all font-mono text-xs text-muted">{r.string_key}</span>
                    <span lang={language.code} className="font-medium">{r.shown_text ? <Tokens text={r.shown_text} /> : t("tl.w.nothing")}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      {r.kind && <KindBadge kind={r.kind} />}
                      {f(r.suggestion_count === 1 ? "tl.s.count1" : "tl.s.count", { count: r.suggestion_count })}
                    </span>
                    {(r.tied || r.differs) && (
                      <span className="flex flex-wrap gap-1.5">
                        {r.tied && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-ink">{t("tl.r.fTied")}</span>}
                        {r.differs && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning-ink">{t("tl.r.fDiffers")}</span>}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          {current ? (
            <div className="flex flex-col gap-3">
              <div><span className="break-all font-mono text-xs text-muted">{current.string_key}</span><p lang="en" className="m-0 mt-1 font-medium"><Tokens text={current.source_text} /></p></div>
              <StringDetail key={current.string_key} code={language.code} stringKey={current.string_key} source={current.source_text} isReviewer onChanged={refresh} />
            </div>
          ) : <p className="m-0 text-muted">{t("tl.r.pick")}</p>}
        </div>
      </div>
    </div>
  );
}
