"use client";
import { Badge, ButtonLink, Reveal } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { startUrl } from "@/lib/links";

export function Hero() {
  const { t } = useI18n();
  return (
    <section id="top" className="mx-auto flex max-w-(--content-max) flex-col items-center gap-5 px-4 pb-14 pt-14 text-center sm:px-8 sm:pt-20">
      <Reveal><Badge tone="info">{t("lp.hero.badge")}</Badge></Reveal>
      <Reveal delay={60}>
        <h1 className="max-w-3xl text-balance text-[2.5rem] font-bold leading-[1.1] sm:text-6xl">{t("lp.hero.title")}</h1>
      </Reveal>
      <Reveal delay={120}>
        <p className="max-w-2xl text-balance text-xl leading-relaxed text-muted">{t("lp.hero.body")}</p>
      </Reveal>
      <Reveal delay={180} className="mt-2 flex flex-wrap justify-center gap-3">
        <ButtonLink href={startUrl} variant="primary" size="lg">{t("lp.cta.start")}</ButtonLink>
        <ButtonLink href="#apps" variant="secondary" size="lg">{t("lp.cta.apps")}</ButtonLink>
      </Reveal>
      <Reveal delay={240}><p className="max-w-xl text-muted">{t("lp.hero.note")}</p></Reveal>
    </section>
  );
}
