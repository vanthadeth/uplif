"use client";
import { useCallback, useEffect, useState } from "react";
import { Award, Medal } from "lucide-react";
import { Button, Card, CardBody, EmptyState, ErrorState, ProgressBar, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";

interface Row { kind: "green_month" | "progress" | "tenure"; period: string; n: number; total: number | null }

/** Achievements earned automatically from attendance, and how this month is going. */
export function AchievementsView() {
  const { t } = useI18n();
  const { tag } = useFormat();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const { data, error } = await createClient().rpc("my_achievements");
    if (error) { setFailed(true); return; }
    setRows(data as Row[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (failed) return <ErrorState title={t("st.ach.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!rows) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.ach.loading")}><Skeleton className="h-24" /><Skeleton className="h-16" /></div>;

  const month = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString(tag, { month: "long", year: "numeric", timeZone: "UTC" });
  const progress = rows.find((r) => r.kind === "progress");
  const earned = rows.filter((r) => r.kind !== "progress");
  const pct = progress && progress.total ? Math.round((progress.n / progress.total) * 100) : 0;
  const onTrack = !!progress && !!progress.total && progress.n === progress.total;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardBody className="flex flex-col gap-3">
          <span className="caps text-xs font-bold text-muted">{t("st.ach.thisMonth")}</span>
          {progress && progress.total ? (
            <>
              <b className="text-lg">{fill(t("st.ach.progress"), { n: progress.n, total: progress.total })}</b>
              <ProgressBar value={pct} tone={onTrack ? "success" : "warning"} label={fill(t("st.ach.progress"), { n: progress.n, total: progress.total })} />
              <span className="text-sm text-muted">{t(onTrack ? "st.ach.ontrack" : "st.ach.missed")}</span>
            </>
          ) : <span className="text-muted">{t("st.ach.progress.none")}</span>}
        </CardBody>
      </Card>

      {earned.length === 0 ? (
        <EmptyState title={t("st.ach.empty.title")} body={t("st.ach.empty.body")} />
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 pb-1 pt-4"><span className="caps text-xs font-bold text-muted">{t("st.ach.earned")}</span></div>
          <ul className="m-0 list-none divide-y divide-line p-0">
            {earned.map((r, i) => (
              <li key={`${r.kind}-${r.period}`} className="flex items-center gap-3 px-4 py-3 animate-[uplif-in_240ms_ease-out_both]" style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-full ${r.kind === "green_month" ? "bg-success-soft text-success-ink" : "bg-primary-soft text-primary-ink"}`}>
                  {r.kind === "green_month" ? <Award className="size-5" aria-hidden /> : <Medal className="size-5" aria-hidden />}
                </span>
                <div className="min-w-0">
                  <b className="block">{r.kind === "green_month" ? t("st.ach.green") : r.n === 1 ? t("st.ach.tenure.one") : fill(t("st.ach.tenure"), { n: r.n })}</b>
                  <span className="text-sm text-muted">{r.kind === "green_month" ? month(r.period) : new Date(r.period + "T00:00:00Z").toLocaleDateString(tag, { month: "short", year: "numeric", timeZone: "UTC" })}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="text-sm text-muted">{t("st.ach.rule")}</p>
    </div>
  );
}
