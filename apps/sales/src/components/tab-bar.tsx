"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Clock, Inbox, Menu, Users } from "lucide-react";
import { BottomNav } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

const tabs = [
  { href: "/inbox", key: "go.tab.inbox", icon: Inbox },
  { href: "/customers", key: "go.tab.customers", icon: Users },
  { href: "/", key: "go.tab.today", icon: Clock, centre: true },
  { href: "/tasks", key: "go.tab.tasks", icon: CheckSquare },
  { href: "/menu", key: "go.tab.menu", icon: Menu },
] as const;

/** Bottom navigation: Inbox, Customers, Today in the raised centre, Tasks, Menu. Slides away while scrolling down. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  // The conversation has its own message bar at the bottom.
  if (/^\/customers\/[0-9a-f-]{36}$/.test(path)) return null;
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <BottomNav label={t("go.tab.label")} overhang="2.25rem">
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
