"use client";
import { Hammer } from "lucide-react";
import { ButtonLink } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

/** A tab whose part of Time is not built yet. Points back to Today, which already works. */
export function Soon({ title }: { title: MessageKey }) {
  const { t } = useI18n();
  return (
    <main className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-neutral-soft text-muted"><Hammer className="size-8" aria-hidden /></span>
      <h1 className="text-2xl font-bold tracking-tight">{t(title)}</h1>
      <b>{t("tm.soon.title")}</b>
      <p className="max-w-sm text-muted">{t("tm.soon.body")}</p>
      <ButtonLink href="/" variant="primary" className="mt-2 h-13">{t("tm.soon.today")}</ButtonLink>
    </main>
  );
}
