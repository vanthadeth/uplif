"use client";
import { ButtonLink, InView } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { signInUrl, startUrl } from "@/lib/links";

/** Closing panel: the two ways in, create an account or log in. Solid navy, no gradient. */
export function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="mx-auto max-w-(--content-max) px-4 pb-20 sm:px-8">
      <InView>
        <div className="flex flex-col items-center gap-5 rounded-card bg-navy px-6 py-12 text-center text-white sm:px-12 sm:py-16">
          <h2 className="max-w-2xl text-balance text-2xl font-bold tracking-tight sm:text-4xl">{t("lp.final.title")}</h2>
          <p className="max-w-xl text-balance text-lg leading-relaxed text-white/80">{t("lp.final.body")}</p>
          <div className="mt-2 flex w-full flex-col gap-3 min-[480px]:w-auto min-[480px]:flex-row">
            <ButtonLink href={startUrl} variant="light" size="lg">{t("lp.cta.create")}</ButtonLink>
            <ButtonLink href={signInUrl} variant="outlineLight" size="lg">{t("lp.nav.logIn")}</ButtonLink>
          </div>
        </div>
      </InView>
    </section>
  );
}
