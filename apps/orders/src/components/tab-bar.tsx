"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Menu, Users } from "lucide-react";
import { BottomNav } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const tabs = [
  { href: "/", key: "od.tab.home", icon: House },
  { href: "/customers", key: "od.tab.customers", icon: Users },
  { href: "/menu", key: "od.tab.menu", icon: Menu },
] as const satisfies readonly { href: string; key: MessageKey; icon: unknown }[];

/** Bottom navigation: five plain tabs of equal size, no raised centre button. Slides away while scrolling down. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <BottomNav label={t("od.tab.label")} overhang="0rem">
      <ul className="mx-auto grid max-w-md grid-cols-3">
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
