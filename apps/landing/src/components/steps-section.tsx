"use client";
import { Smartphone, UserPlus, Users } from "lucide-react";
import { InView } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const STEPS = [
  { icon: UserPlus, title: "lp.steps.1.title", body: "lp.steps.1.body" },
  { icon: Users, title: "lp.steps.2.title", body: "lp.steps.2.body" },
  { icon: Smartphone, title: "lp.steps.3.title", body: "lp.steps.3.body" },
] as const satisfies readonly { icon: unknown; title: MessageKey; body: MessageKey }[];

export function StepsSection() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-(--content-max) px-4 py-12 sm:px-8">
      <InView><h2 className="mb-10 text-balance text-center text-2xl font-bold tracking-tight sm:text-3xl">{t("lp.steps.title")}</h2></InView>
      <ol className="grid gap-8 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title}>
            <InView delay={i * 80} className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
              <span className="relative inline-flex size-12 items-center justify-center rounded-card bg-primary-soft text-primary-ink">
                <Icon className="size-6" aria-hidden="true" />
                <span className="absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{i + 1}</span>
              </span>
              <h3 className="text-lg font-semibold">{t(title)}</h3>
              <p className="max-w-xs leading-relaxed text-muted">{t(body)}</p>
            </InView>
          </li>
        ))}
      </ol>
    </section>
  );
}
