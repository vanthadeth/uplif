"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, ErrorState, ProgressBar, Reveal, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";

interface Kpi { name: string; name_local: string | null; weight: number; last_score: number | null }
interface Review { period: string; overall_percent: number; comment: string | null }

/** A half-circle gauge. A flat arc, no gradient; the colour follows the score band. */
function Gauge({ value, label }: { value: number; label: string }) {
  const r = 80, c = Math.PI * r;
  const tone = value >= 80 ? "var(--color-success)" : value >= 60 ? "var(--color-primary)" : "var(--color-warning)";
  return (
    <div role="img" aria-label={label} className="relative mx-auto w-full max-w-60">
      <svg viewBox="0 0 200 110" className="w-full" aria-hidden>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--color-neutral-soft)" strokeWidth="16" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={tone} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} style={{ transition: "stroke-dashoffset 700ms ease-out" }} />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center"><span className="text-4xl font-bold tracking-tight">{value}%</span></div>
    </div>
  );
}

/** The person's own score, what they are measured on, and earlier reviews. Nothing is shown that a manager has not scored. */
export function PerformanceView() {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const [kpis, setKpis] = useState<Kpi[] | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const sb = createClient();
    const [k, r] = await Promise.all([sb.rpc("my_kpis"), sb.rpc("my_reviews")]);
    if (k.error || r.error) { setFailed(true); return; }
    setKpis(k.data as Kpi[]); setReviews(r.data as Review[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  const month = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(tag, { month: "long", year: "numeric" });

  if (failed) return <ErrorState title={t("st.perf.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!kpis || !reviews) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.perf.loading")}><Skeleton className="h-40" /><Skeleton className="h-24" /></div>;

  const latest = reviews[0];
  return (
    <Reveal className="flex flex-col gap-5">
      {latest ? (
        <Card className="flex flex-col gap-3 p-5">
          <p className="m-0 text-center text-sm font-semibold text-muted">{fill(t("st.perf.latest"), { month: month(latest.period) })}</p>
          <Gauge value={latest.overall_percent} label={`${latest.overall_percent}%`} />
          {latest.comment && <p className="m-0 rounded-card bg-ground p-3 text-sm">{fill(t("st.perf.note"), { note: latest.comment })}</p>}
        </Card>
      ) : <EmptyState title={t("st.perf.noReview")} body={t("st.perf.noReviewBody")} />}

      <section className="flex flex-col gap-2">
        <h2 className="m-0 px-1 text-sm font-semibold text-muted">{t("st.perf.kpis")}</h2>
        {kpis.length === 0 ? <p className="m-0 px-1 text-muted">{t("st.perf.noKpis")}</p> : (
          <Card className="divide-y divide-line overflow-hidden">
            {kpis.map((k) => (
              <div key={k.name} className="flex flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <b className="min-w-0 break-words">{local(k.name, k.name_local)}</b>
                  <span className="shrink-0 text-sm text-muted">{fill(t("st.perf.weight"), { n: k.weight })}</span>
                </div>
                {k.last_score == null ? <span className="text-sm text-muted">{t("st.perf.notScored")}</span>
                  : <div className="flex items-center gap-3"><ProgressBar className="flex-1" value={k.last_score} label={`${k.last_score}%`} tone={k.last_score >= 60 ? "success" : "warning"} /><span className="w-11 text-end text-sm font-semibold">{k.last_score}%</span></div>}
              </div>
            ))}
          </Card>
        )}
      </section>

      {reviews.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="m-0 px-1 text-sm font-semibold text-muted">{t("st.perf.history")}</h2>
          <Card className="divide-y divide-line overflow-hidden">
            {reviews.slice(1).map((r) => (
              <div key={r.period} className="flex items-center justify-between gap-3 p-4"><span>{month(r.period)}</span><b>{r.overall_percent}%</b></div>
            ))}
          </Card>
        </section>
      )}
    </Reveal>
  );
}
