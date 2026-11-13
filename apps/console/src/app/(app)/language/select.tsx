"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Clock, ShieldCheck, Users } from "lucide-react";
import { Button, Card } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import type { LanguageRow } from "@/lib/translation/types";
import { startMachine, type StartResult } from "./actions";
import { Progress, useFill } from "./parts";

function Tag({ tone, icon, children }: { tone: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{icon}{children}</span>;
}
const ic = "size-3.5";

export function LanguageSelect({ languages, userId }: { languages: LanguageRow[]; userId: string }) {
  const { t, locale, setLocale } = useI18n();
  const f = useFill();
  const router = useRouter();
  const [creating, setCreating] = useState<LanguageRow | null>(null);
  const [done, setDone] = useState<{ row: LanguageRow; result: Extract<StartResult, { ok: true }> } | null>(null);
  const [error, setError] = useState("");

  function use(code: string) {
    setLocale(code);
    if (userId) void createClient().from("profiles").update({ locale: code }).eq("user_id", userId);
  }
  async function start(l: LanguageRow) {
    setError(""); setDone(null); setCreating(l);
    const r = await startMachine(l.code, l.english_name);
    setCreating(null);
    if (r.ok) setDone({ row: l, result: r }); else setError(t(r.error));
    router.refresh();
  }
  const name = (l: LanguageRow) => l.native_name;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("tl.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("tl.intro")}</p>
        </div>
        <Button onClick={() => router.push("/language/community")}><Users className="size-[18px]" aria-hidden="true" />{t("tl.community")}</Button>
      </div>

      {creating && (
        <div role="status" className="flex flex-col gap-2 rounded-card bg-primary-soft p-4 text-primary-ink">
          <b>{f("tl.creating", { name: name(creating) })}</b>
          <p className="m-0">{f("tl.creatingBody", { total: creating.total })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-surface"><i className="block h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
        </div>
      )}
      {done && (
        <div role="status" className="flex flex-col gap-3 rounded-card bg-primary-soft p-4 text-primary-ink">
          <b>{done.result.status === "done" ? f("tl.ready", { name: name(done.row) }) : name(done.row)}</b>
          <p className="m-0">{done.result.status === "done" ? f("tl.readyBody", { count: done.result.count }) : f("tl.unavailable", { name: name(done.row) })}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => { use(done.row.code); setDone(null); }}>{t("tl.use")}</Button>
            <Button onClick={() => router.push(`/language/${done.row.code}`)}>{t("tl.openWork")}</Button>
            <Button variant="quiet" onClick={() => setDone(null)}>{t("tl.dismiss")}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="m-0 rounded-card bg-danger-soft p-4 text-danger-ink">{error}</p>}

      <Card>
        <ul className="m-0 flex list-none flex-col p-0">
          {languages.map((l) => {
            const cur = l.code === locale;
            const none = !l.is_source && (l.machine_status === "none" || l.machine_status === "unavailable") && l.pinned + l.voted + l.machine === 0;
            const tags = l.is_source ? <Tag tone="bg-neutral-soft text-ink-2" icon={<Check className={ic} aria-hidden="true" />}>{t("tl.tag.source")}</Tag>
              : l.machine_status === "pending" ? <Tag tone="bg-primary-soft text-primary-ink" icon={<Clock className={ic} aria-hidden="true" />}>{t("tl.tag.creating")}</Tag>
              : none ? <Tag tone="bg-neutral-soft text-ink-2" icon={<Clock className={ic} aria-hidden="true" />}>{t("tl.tag.none")}</Tag>
              : <>
                  {l.reviewer_name && <Tag tone="bg-primary-soft text-primary-ink" icon={<ShieldCheck className={ic} aria-hidden="true" />}>{t("tl.tag.reviewer")}</Tag>}
                  {l.machine > 0 && <Tag tone="bg-warning-soft text-warning-ink" icon={<Bot className={ic} aria-hidden="true" />}>{l.reviewer_name ? t("tl.tag.some") : t("tl.tag.machine")}</Tag>}
                </>;
            return (
              <li key={l.code} className={`grid items-center gap-x-4 gap-y-2 border-t border-line p-4 first:border-t-0 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_150px_170px] ${cur ? "bg-primary-soft" : ""}`}>
                <div className="min-w-0">
                  <b lang={l.code} className="block text-lg font-semibold">{l.native_name}</b>
                  <span lang="en" className="text-[14px] text-muted">{l.english_name}{l.reviewer_name ? ` · ${f("tl.reviewer", { name: l.reviewer_name })}` : ""}</span>
                </div>
                <div>{l.is_source || none ? <div className="h-2 rounded-full bg-neutral-soft" /> : <Progress l={l} />}</div>
                <div className="flex flex-col items-start gap-1.5">{tags}</div>
                <div className="md:justify-self-end">
                  {cur ? <Tag tone="bg-primary-soft text-primary-ink" icon={<Check className={ic} aria-hidden="true" />}>{t("tl.current")}</Tag>
                    : none ? <Button onClick={() => start(l)} disabled={!!creating}>{t("tl.start")}</Button>
                    : <Button variant="primary" onClick={() => use(l.code)}>{t("tl.use")}</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="m-0 flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-relaxed text-primary-ink">{t("tl.note")}</p>
    </div>
  );
}
