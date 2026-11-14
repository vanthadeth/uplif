"use client";
import { ButtonLink, LanguageToggle } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { signInUrl, startUrl } from "@/lib/links";

const navLink = "hidden min-h-11 items-center rounded-control px-3 font-medium text-muted transition-colors hover:text-ink md:inline-flex";

/** Log in and Create account are always visible, on phones too. */
export function SiteHeader() {
  const { t, locale, setLocale } = useI18n();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="mx-auto flex max-w-(--content-max) items-center gap-2 px-4 py-2.5 sm:gap-3 sm:px-8">
        <a href="#top" className="flex min-w-0 flex-1 items-center gap-2.5 text-xl font-bold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={36} height={36} className="size-9 shrink-0 rounded-control" />
          <span className="hidden min-[480px]:inline">{t("lp.app")}</span>
        </a>
        <nav aria-label={t("lp.nav.main")} className="flex items-center gap-1.5 sm:gap-2">
          <a href="#apps" className={navLink}>{t("lp.nav.apps")}</a>
          <a href="#pricing" className={navLink}>{t("lp.nav.pricing")}</a>
          <LanguageToggle label={t("lp.language")} value={locale === "km" ? "km" : "en"} onChange={setLocale}
            options={[{ id: "en", label: "EN" }, { id: "km", label: "ខ្មែរ" }]} />
          <ButtonLink href={signInUrl} variant="secondary" className="px-3 sm:px-4">{t("lp.nav.logIn")}</ButtonLink>
          <ButtonLink href={startUrl} variant="primary" className="hidden px-3 min-[560px]:inline-flex sm:px-4">{t("lp.nav.create")}</ButtonLink>
        </nav>
      </div>
    </header>
  );
}
