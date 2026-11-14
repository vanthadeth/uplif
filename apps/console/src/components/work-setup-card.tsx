"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Badge, Button, Card, CardBody, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import type { Pattern } from "@/lib/working-time";

const choices: { id: Pattern; key: MessageKey }[] = [
  { id: "mon_fri", key: "wt.setup.p1" },
  { id: "mon_fri_sat_half", key: "wt.setup.p2" },
  { id: "mon_sat", key: "wt.setup.p3" },
];

/** First-time setup of working time: one question with the usual answer pre-selected. Skipping applies that answer. */
export function WorkSetupCard() {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pattern, setPattern] = useState<Pattern>("mon_fri_sat_half");
  const [busy, setBusy] = useState(false);

  async function go(p: Pattern) {
    setBusy(true);
    const { error } = await createClient().rpc("setup_working_time", { p_pattern: p });
    setBusy(false);
    if (error) return toast("error", t(error.code === "42501" ? "common.forbidden" : "common.saveError"));
    toast("success", t("wt.setup.done"));
    router.refresh();
  }

  return (
    <Card><CardBody className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 flex items-center gap-2 text-[16px] font-semibold"><CalendarClock className="size-5 text-primary" aria-hidden />{t("wt.setup.title")}</h2>
        <Badge tone="info">{t("wt.setup.time")}</Badge>
      </div>
      <div role="radiogroup" aria-labelledby="wt-setup-q" className="flex flex-col gap-2">
        <b id="wt-setup-q" className="text-[14px] font-semibold text-ink-2">{t("wt.setup.q1")}</b>
        <div className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={pattern === c.id} onClick={() => setPattern(c.id)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${pattern === c.id ? "border-primary bg-primary-soft text-primary-ink" : "border-line-strong bg-surface text-muted"}`}>
              {t(c.key)}
            </button>
          ))}
        </div>
      </div>
      <p className="m-0 text-[14px] leading-snug text-muted">{t("wt.setup.hint")}</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={busy} onClick={() => go("mon_fri_sat_half")}>{t("wt.setup.skip")}</Button>
        <Button variant="primary" loading={busy} onClick={() => go(pattern)}>{t("wt.setup.go")}</Button>
      </div>
    </CardBody></Card>
  );
}
