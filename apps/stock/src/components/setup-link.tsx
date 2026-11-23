"use client";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

/** A big tappable row that opens one catalogue list. Used on Home and in the Menu. */
export function SetupLink({ href, icon: Icon, title, body }: { href: string; icon: LucideIcon; title: MessageKey; body?: MessageKey }) {
  const { t } = useI18n();
  return (
    <Link href={href} className="flex min-h-20 items-center gap-4 rounded-card border border-line bg-surface p-4 transition-colors active:bg-primary-soft">
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-ink"><Icon className="size-6" aria-hidden /></span>
      <span className="min-w-0 flex-1"><b className="block">{t(title)}</b>{body && <small className="block text-sm text-muted">{t(body)}</small>}</span>
      <ChevronRight className="size-5 shrink-0 text-muted rtl:rotate-180" aria-hidden />
    </Link>
  );
}
