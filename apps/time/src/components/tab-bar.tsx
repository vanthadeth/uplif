"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Clock, House, Menu, Wallet } from "lucide-react";
import { BottomNav } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const tabs = [
  { href: "/", key: "tm.tab.today", icon: House },
  { href: "/attendance", key: "tm.tab.attendance", icon: Clock },
  { href: "/leave", key: "tm.tab.leave", icon: CalendarDays },
  { href: "/payroll", key: "tm.tab.payroll", icon: Wallet },
  { href: "/menu", key: "tm.tab.menu", icon: Menu },
] as const satisfies readonly { href: string; key: MessageKey; icon: unknown }[];

/** Bottom navigation: five plain tabs of equal size, no raised centre button. Slides away while scrolling down. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <BottomNav label={t("tm.tab.label")} overhang="0rem">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {tabs.map(({ href, key, icon: Icon }) => {
          const on = active(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors ${on ? "text-link" : "text-muted"}`}>
                <Icon className="size-6" aria-hidden />
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </BottomNav>
  );
}
