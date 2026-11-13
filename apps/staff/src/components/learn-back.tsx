"use client";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Header of a Learn sub-page: a back link to the hub and the page title. */
export function LearnBack({ title, href = "/learn", label }: { title: string; href?: string; label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1 pt-1">
      <Link href={href} aria-label={label ?? t("st.learn.back")} className="grid size-11 place-items-center rounded-control hover:bg-ground"><ChevronLeft className="size-6 rtl:rotate-180" aria-hidden /></Link>
      <h1 className="m-0 min-w-0 break-words text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}
