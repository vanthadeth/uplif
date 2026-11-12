"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clock, FileText, Menu, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const tabs = [
  { href: "/profile", key: "st.tab.profile", icon: UserRound },
  { href: "/record", key: "st.tab.record", icon: FileText },
  { href: "/", key: "st.tab.today", icon: Clock, centre: true },
  { href: "/learn", key: "st.tab.learn", icon: BookOpen },
  { href: "/menu", key: "st.tab.menu", icon: Menu },
] as const satisfies readonly { href: string; key: MessageKey; icon: unknown; centre?: boolean }[];

/** Bottom navigation for the phone: five items, Today raised in the centre. Fixed to the screen edge and clear of the home indicator. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label={t("st.tab.label")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const { href, key, icon: Icon } = tab;
          const on = active(href);
          const centre = "centre" in tab;
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors ${on ? "text-link" : "text-muted"}`}>
                {centre ? (
                  <span className={`-mt-6 grid size-14 place-items-center rounded-full border-4 border-surface shadow-pop transition-transform active:scale-95 ${on ? "bg-primary text-white" : "bg-primary-soft text-primary-ink"}`}>
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : <Icon className="size-6" aria-hidden />}
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
