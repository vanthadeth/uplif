"use client";
import { useEffect, useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ClipboardList, GitBranch, LayoutDashboard, ShieldCheck, Store, Users } from "lucide-react";
import { AppShell, Avatar, LanguageToggle, type NavItem } from "@uplif/ui";
import { useI18n, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { pick } from "@/lib/format";
import { NavProgress } from "@/components/nav-progress";

const routes: Record<string, string> = { dashboard: "/dashboard", company: "/company", branches: "/branches", users: "/users", roles: "/roles", audit: "/audit" };

export function ConsoleShell({ companyName, companyNameLocal, userName, userId, profileLocale, children }: {
  companyName: string; companyNameLocal: string | null; userName: string; userId: string; profileLocale: Locale; children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useI18n();
  // Use the saved profile language on a new device; this browser's own choice wins once made.
  useEffect(() => {
    try { if (!localStorage.getItem("uplif.locale")) setLocale(profileLocale); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function changeLocale(l: Locale) {
    setLocale(l);
    if (userId) void createClient().from("profiles").update({ locale: l }).eq("user_id", userId);
  }
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Warm up every other section after each page change. The page you are on cannot be prefetched, so
  // without this the section you landed on (usually Dashboard) waited on the server for its first click back.
  useEffect(() => {
    Object.values(routes).forEach((href) => { if (!pathname.startsWith(href)) router.prefetch(href); });
  }, [router, pathname]);
  // Highlight the clicked item at once instead of after the server answers.
  const [shownPath, setShownPath] = useOptimistic(pathname);
  const nav: NavItem[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard /> },
    { id: "company", label: t("nav.company"), icon: <Building2 /> },
    { id: "branches", label: t("nav.branches"), icon: <GitBranch /> },
    { id: "users", label: t("nav.users"), icon: <Users /> },
    { id: "roles", label: t("nav.roles"), icon: <ShieldCheck /> },
    { id: "audit", label: t("nav.audit"), icon: <ClipboardList /> },
  ];
  const active = Object.keys(routes).find((k) => shownPath.startsWith(routes[k])) ?? "dashboard";
  const shownName = pick(locale, companyName, companyNameLocal);
  return (
    <AppShell
      appName="UPLIF" nav={nav} activeId={active} onNavigate={(id) => startTransition(() => { setShownPath(routes[id]); router.push(routes[id]); })}
      onPrefetch={(id) => { if (!pathname.startsWith(routes[id])) router.prefetch(routes[id]); }}
      navLabel={t("shell.nav")} collapseLabel={t("shell.collapse")} expandLabel={t("shell.expand")}
      menuLabel={t("shell.menu")} closeLabel={t("shell.close")}
      topBar={
        <>
          <span className="flex items-center gap-2 font-semibold">
            <Store className="size-4 text-primary" aria-hidden="true" />{shownName}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <LanguageToggle label={t("lang.toggle")} value={locale} onChange={(l) => changeLocale(l as Locale)}
              options={[{ id: "en", label: "English" }, { id: "km", label: "ខ្មែរ" }]} />
            <Avatar name={userName || "?"} />
          </div>
        </>
      }
    >
      <NavProgress active={pending} />
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>{children}</div>
    </AppShell>
  );
}
