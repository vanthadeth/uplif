"use client";
import { Badge, ButtonLink, Reveal } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { signInUrl, startUrl } from "@/lib/links";

export function Hero() {
  const { t } = useI18n();
  return (
    <section id="top" className="mx-auto flex max-w-(--content-max) flex-col items-center gap-6 px-4 pb-16 pt-16 text-center sm:px-8 sm:pb-20 sm:pt-24">
      <Reveal><Badge tone="info">{t("lp.hero.badge")}</Badge></Reveal>
      <Reveal delay={60}>
        <h1 className="max-w-3xl text-balance text-[2.5rem] font-bold leading-[1.08] tracking-tight sm:text-6xl">{t("lp.hero.title")}</h1>
      </Reveal>
      <Reveal delay={120}>
        <p className="max-w-2xl text-balance text-xl leading-relaxed text-muted">{t("lp.hero.body")}</p>
      </Reveal>
      <Reveal delay={180} className="mt-2 flex w-full flex-col items-stretch justify-center gap-3 min-[480px]:w-auto min-[480px]:flex-row">
        <ButtonLink href={startUrl} variant="primary" size="lg">{t("lp.cta.create")}</ButtonLink>
        <ButtonLink href={signInUrl} variant="secondary" size="lg">{t("lp.nav.logIn")}</ButtonLink>
      </Reveal>
      <Reveal delay={240}>
        <p className="max-w-xl text-muted">{t("lp.hero.note")}</p>
        <a href="#apps" className="mt-2 inline-flex min-h-11 items-center font-semibold text-link hover:underline">{t("lp.cta.apps")}</a>
      </Reveal>
    </section>
  );
}
