"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clock, FileText, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

const tabs = [
  { href: "/", key: "st.tab.today", icon: Clock },
  { href: "/record", key: "st.tab.record", icon: FileText },
  { href: "/learn", key: "st.tab.learn", icon: BookOpen },
  { href: "/me", key: "st.tab.me", icon: UserRound },
] as const satisfies readonly { href: string; key: MessageKey; icon: unknown }[];

/** Bottom navigation for the phone. Fixed to the screen edge and clear of the home indicator. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label={t("st.tab.label")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {tabs.map(({ href, key, icon: Icon }) => (
          <li key={href}>
            <Link href={href} aria-current={active(href) ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${active(href) ? "text-link" : "text-muted"}`}>
              <Icon className="size-6" aria-hidden />{t(key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
