"use client";
import { ButtonLink, LanguageToggle } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { signInUrl, startUrl } from "@/lib/links";

export function SiteHeader() {
  const { t, locale, setLocale } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-(--content-max) flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-8">
        <a href="#top" className="flex flex-1 items-center gap-2.5 font-bold text-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 rounded-control" />
          {t("lp.app")}
        </a>
        <nav aria-label={t("lp.nav.main")} className="flex items-center gap-1 sm:gap-3">
          <a href="#apps" className="hidden min-h-11 items-center rounded-control px-3 font-medium text-muted hover:text-ink sm:inline-flex">{t("lp.nav.apps")}</a>
          <a href="#pricing" className="hidden min-h-11 items-center rounded-control px-3 font-medium text-muted hover:text-ink sm:inline-flex">{t("lp.nav.pricing")}</a>
          <LanguageToggle label={t("lp.language")} value={locale === "km" ? "km" : "en"} onChange={setLocale}
            options={[{ id: "en", label: "EN" }, { id: "km", label: "ខ្មែរ" }]} />
          <ButtonLink href={signInUrl} variant="quiet" className="hidden sm:inline-flex">{t("lp.nav.signIn")}</ButtonLink>
          <ButtonLink href={startUrl} variant="primary" className="hidden sm:inline-flex">{t("lp.cta.start")}</ButtonLink>
        </nav>
      </div>
    </header>
  );
}
