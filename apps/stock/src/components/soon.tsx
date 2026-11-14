"use client";
import { Hammer } from "lucide-react";
import { ButtonLink } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

/** A tab whose part of Stock is not built yet. Points to what can be set up now. */
export function Soon({ title }: { title: MessageKey }) {
  const { t } = useI18n();
  return (
    <main className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-neutral-soft text-muted"><Hammer className="size-8" aria-hidden /></span>
      <h1 className="text-2xl font-bold tracking-tight">{t(title)}</h1>
      <b>{t("sk.soon.title")}</b>
      <p className="max-w-sm text-muted">{t("sk.soon.body")}</p>
      <ButtonLink href="/brands" variant="primary" className="mt-2 h-13">{t("sk.home.brands")}</ButtonLink>
    </main>
  );
}
