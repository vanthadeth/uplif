"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Clock, Inbox, Menu, Users } from "lucide-react";
import { BottomNav } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

/** Bottom navigation: Inbox, Customers, Today in the raised centre, Tasks, Menu. */
export function TabBar() {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <BottomNav label={t("go.tab.label")} path={path} linkAs={Link}
      items={[
        { href: "/inbox", label: t("go.tab.inbox"), icon: Inbox },
        { href: "/customers", label: t("go.tab.customers"), icon: Users },
        { href: "/", label: t("go.tab.today"), icon: Clock, centre: true },
        { href: "/tasks", label: t("go.tab.tasks"), icon: CheckSquare },
        { href: "/menu", label: t("go.tab.menu"), icon: Menu },
      ]} />
  );
}
