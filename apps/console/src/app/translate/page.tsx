"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { Button, Card, CardBody } from "@uplif/ui";
import { isLocale } from "@/lib/languages";
import { useI18n } from "@/lib/i18n";
import { useLanguageOptions } from "@/lib/use-language-options";

// Placeholder for the translation community: how to help, and every supported language in one place.
export default function TranslatePage() {
  const { t, locale, setLocale } = useI18n();
  const { all } = useLanguageOptions();
  const router = useRouter();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <div>
        <button type="button" onClick={() => router.back()} className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 font-medium text-muted hover:bg-ground hover:text-ink">
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />{t("tr.back")}
        </button>
        <h1 className="mt-2 text-2xl font-bold">{t("tr.title")}</h1>
        <p className="mt-2 text-muted">{t("tr.intro")}</p>
      </div>

      <Card>
        <CardBody className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("tr.how.title")}</h2>
          <ol className="list-decimal ps-5 leading-relaxed">
            <li>{t("tr.how.1")}</li>
            <li>{t("tr.how.2")}</li>
            <li>{t("tr.how.3")}</li>
          </ol>
          <div><Link href="/i18n" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline">{t("tr.sheet")}</Link></div>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-1">
          <h2 className="mb-1 text-lg font-semibold">{t("tr.list")}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {all.map((l) => {
              const on = l.code === locale;
              return (
                <li key={l.code} className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span lang={l.code} className="min-w-0 flex-1 font-semibold">{l.native} <span lang="en" className="text-xs font-normal text-muted">{l.english}</span></span>
                  <span lang={locale} className="text-xs text-muted">{l.note ?? t("tr.ready")}</span>
                  {on ? (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary"><Check className="size-4" aria-hidden="true" />{t("tr.current")}</span>
                  ) : (
                    <Button type="button" variant="secondary" onClick={() => isLocale(l.code) && setLocale(l.code)}>{t("tr.use")}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </main>
  );
}
