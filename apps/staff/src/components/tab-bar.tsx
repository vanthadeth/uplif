"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clock, FileText, Menu, UserRound } from "lucide-react";
import { BottomNav } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const tabs = [
  { href: "/profile", key: "st.tab.profile", icon: UserRound },
  { href: "/record", key: "st.tab.record", icon: FileText },
  { href: "/", key: "st.tab.today", icon: Clock, centre: true },
  { href: "/learn", key: "st.tab.learn", icon: BookOpen },
  { href: "/menu", key: "st.tab.menu", icon: Menu },
] as const satisfies readonly { href: string; key: MessageKey; icon: unknown; centre?: boolean }[];

/** Bottom navigation for the phone: five items, Today raised in the centre. Taller for easy taps; slides away while scrolling down and returns on scroll up. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <BottomNav label={t("st.tab.label")} overhang="2.25rem">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map((tab) => {
          const { href, key, icon: Icon } = tab;
          const on = active(href);
          const centre = "centre" in tab;
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${on ? "text-link" : "text-muted"}`}>
                {centre ? (
                  <span className={`-mt-7 grid size-16 place-items-center rounded-full border-4 border-surface shadow-pop transition-transform active:scale-95 ${on ? "bg-primary text-white" : "bg-primary-soft text-primary-ink"}`}>
                    <Icon className="size-7" aria-hidden />
                  </span>
                ) : <Icon className="size-6" aria-hidden />}
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </BottomNav>
  );
}
