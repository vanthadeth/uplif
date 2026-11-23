"use client";
import { WifiOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { languageOf } from "@/lib/languages";
import { savedAtLabel } from "@/lib/offline";

/** Tells the person they are looking at the copy saved on this phone, and when it was saved. */
export function OfflineNotice({ savedAt }: { savedAt: number }) {
  const { t, locale } = useI18n();
  return (
    <p role="status" className="flex items-start gap-3 rounded-card bg-warning-soft p-3 text-warning-ink">
      <WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />
      {fill(t("go.off.saved"), { time: savedAtLabel(savedAt, languageOf(locale).dateTag) })}
    </p>
  );
}
