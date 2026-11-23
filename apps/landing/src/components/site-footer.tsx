"use client";
import { useI18n } from "@/lib/i18n";
import { signInUrl } from "@/lib/links";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-(--content-max) flex-wrap items-center justify-between gap-3 px-4 py-6 text-muted sm:px-8">
        <span>{t("lp.footer.tag")}</span>
        <a href={signInUrl} className="inline-flex min-h-11 items-center font-semibold text-link hover:underline">{t("lp.footer.signIn")}</a>
      </div>
    </footer>
  );
}
