"use client";
import { usePathname, useRouter } from "next/navigation";
import { Building2, GitBranch, LayoutDashboard, Store, Users } from "lucide-react";
import { AppShell, Avatar, LanguageToggle, type NavItem } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

const routes: Record<string, string> = { dashboard: "/dashboard", company: "/company", branches: "/branches", users: "/users" };

export function ConsoleShell({ companyName, companyNameLocal, userName, children }: {
  companyName: string; companyNameLocal: string | null; userName: string; children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const nav: NavItem[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard /> },
    { id: "company", label: t("nav.company"), icon: <Building2 /> },
    { id: "branches", label: t("nav.branches"), icon: <GitBranch /> },
    { id: "users", label: t("nav.users"), icon: <Users /> },
  ];
  const active = Object.keys(routes).find((k) => pathname.startsWith(routes[k])) ?? "dashboard";
  const shownName = locale === "km" && companyNameLocal ? companyNameLocal : companyName;
  return (
    <AppShell
      appName="UPLIF" nav={nav} activeId={active} onNavigate={(id) => router.push(routes[id])}
      navLabel={t("shell.nav")} collapseLabel={t("shell.collapse")} expandLabel={t("shell.expand")}
      menuLabel={t("shell.menu")} closeLabel={t("shell.close")}
      topBar={
        <>
          <span className="flex items-center gap-2 font-semibold">
            <Store className="size-4 text-primary" aria-hidden="true" />{shownName}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <LanguageToggle label={t("lang.toggle")} value={locale} onChange={(l) => setLocale(l as "en" | "km")}
              options={[{ id: "en", label: "English" }, { id: "km", label: "ខ្មែរ" }]} />
            <Avatar name={userName || "?"} />
          </div>
        </>
      }
    >
      {children}
    </AppShell>
  );
}
