"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Reveal, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";

interface Job { position_name: string; position_name_local: string | null; summary: string | null; summary_local: string | null; duties: string | null; duties_local: string | null }
interface Event { id: string; kind: "promotion" | "transfer"; event_date: string; from_name: string | null; from_name_local: string | null; to_name: string; to_name_local: string | null; note: string | null }

/** The person's own position, what it involves, and the promotions and transfers on their record. */
export function JobView() {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const sb = createClient();
    const [j, c] = await Promise.all([sb.rpc("my_job_description"), sb.rpc("my_career")]);
    if (j.error || c.error) { setFailed(true); return; }
    setJob((j.data as Job[])[0] ?? null); setEvents(c.data as Event[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const local = (en: string, loc: string | null) => (locale !== "en" && loc) || en;
  const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(tag, { day: "numeric", month: "short", year: "numeric" });
  const list = (s: string | null) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean);

  if (failed) return <ErrorState title={t("st.job.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (job === undefined || !events) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.job.loading")}><Skeleton className="h-32" /><Skeleton className="h-24" /></div>;

  const duties = job ? list(locale !== "en" && job.duties_local ? job.duties_local : job.duties) : [];
  const summary = job ? (locale !== "en" && job.summary_local) || job.summary : null;
  return (
    <Reveal className="flex flex-col gap-5">
      {!job ? <EmptyState title={t("st.job.noPosition")} body={t("st.job.noPositionBody")} /> : (
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="m-0 text-xl font-bold">{local(job.position_name, job.position_name_local)}</h2>
          {!summary && duties.length === 0 ? <p className="m-0 text-muted"><b className="block text-ink">{t("st.job.noDesc")}</b>{t("st.job.noDescBody")}</p> : (
            <>
              {summary && <p className="m-0 whitespace-pre-line">{summary}</p>}
              {duties.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="m-0 text-sm font-semibold text-muted">{t("st.job.duties")}</h3>
                  <ul className="m-0 flex list-disc flex-col gap-1 ps-5">{duties.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>
                </div>
              )}
            </>
          )}
        </Card>
      )}
      <Link href="/record/performance" className="flex min-h-14 items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 font-semibold hover:bg-ground">
        {t("st.job.kpis")}<ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
      </Link>

      <section className="flex flex-col gap-2">
        <h2 className="m-0 px-1 text-sm font-semibold text-muted">{t("st.job.history")}</h2>
        {events.length === 0 ? <EmptyState title={t("st.job.noHistory")} body={t("st.job.noHistoryBody")} /> : (
          <Card className="divide-y divide-line overflow-hidden">
            {events.map((e) => (
              <div key={e.id} className="flex flex-col gap-1 p-4">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone={e.kind === "promotion" ? "success" : "neutral"}>{t(e.kind === "promotion" ? "st.job.promotion" : "st.job.transfer")}</Badge>
                  <span className="text-sm text-muted">{day(e.event_date)}</span>
                </div>
                <b className="break-words">{e.from_name ? fill(t("st.job.line"), { from: local(e.from_name, e.from_name_local), to: local(e.to_name, e.to_name_local) }) : local(e.to_name, e.to_name_local)}</b>
                {e.note && <span className="text-sm text-muted">{fill(t("st.job.note"), { note: e.note })}</span>}
              </div>
            ))}
          </Card>
        )}
      </section>
    </Reveal>
  );
}
