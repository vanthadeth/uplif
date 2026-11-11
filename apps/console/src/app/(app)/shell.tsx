"use client";
import { useEffect, useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ClipboardList, GitBranch, Languages, LayoutDashboard, LogOut, Moon, Repeat, ShieldCheck, Store, Sun, Users } from "lucide-react";
import { AppShell, Avatar, type NavItem, type UtilityItem } from "@uplif/ui";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import { pick } from "@/lib/format";
import { NavProgress } from "@/components/nav-progress";

const routes: Record<string, string> = { dashboard: "/dashboard", company: "/company", branches: "/branches", users: "/users", roles: "/roles", audit: "/audit" };
// A section shows in the menu when the user holds any of these permissions. This only tidies the menu:
// the database enforces access on every read and write regardless.
const needs: Record<string, string[] | undefined> = {
  company: ["org.company.update", "org.settings.update"],
  branches: ["org.branch.read"],
  users: ["org.member.read"],
  roles: ["org.role.read"],
  audit: ["org.audit.read"],
};

export function ConsoleShell({ companyName, companyNameLocal, userName, userId, profileLocale, permissions, children }: {
  companyName: string; companyNameLocal: string | null; userName: string; userId: string; profileLocale: Locale; permissions: string[]; children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle: toggleTheme } = useTheme();
  // Use the saved profile language on a new device; this browser's own choice wins once made.
  useEffect(() => {
    try { if (!localStorage.getItem("uplif.locale")) setLocale(profileLocale); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function changeLocale(l: Locale) {
    setLocale(l);
    if (userId) void createClient().from("profiles").update({ locale: l }).eq("user_id", userId);
  }
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const allNav: NavItem[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard /> },
    { id: "company", label: t("nav.company"), icon: <Building2 /> },
    { id: "branches", label: t("nav.branches"), icon: <GitBranch /> },
    { id: "users", label: t("nav.users"), icon: <Users /> },
    { id: "roles", label: t("nav.roles"), icon: <ShieldCheck /> },
    { id: "audit", label: t("nav.audit"), icon: <ClipboardList /> },
  ];
  const nav = allNav.filter((n) => !needs[n.id] || needs[n.id]!.some((k) => permissions.includes(k)));
  const visible = nav.map((n) => routes[n.id]);

  // Warm up every other visible section after each page change. The page you are on cannot be prefetched, so
  // without this the section you landed on (usually Dashboard) waited on the server for its first click back.
  useEffect(() => {
    visible.forEach((href) => { if (!pathname.startsWith(href)) router.prefetch(href); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname, visible.join()]);
  // Highlight the clicked item at once instead of after the server answers.
  const [shownPath, setShownPath] = useOptimistic(pathname);

  const active = Object.keys(routes).find((k) => shownPath.startsWith(routes[k])) ?? "dashboard";
  const shownName = pick(locale, companyName, companyNameLocal);

  const utilities: UtilityItem[] = [
    { id: "lang", label: t("shell.language"), icon: <Languages />, value: locale === "km" ? "ខ្មែរ" : "English", onClick: () => changeLocale(locale === "km" ? "en" : "km") },
    { id: "theme", label: theme === "dark" ? t("shell.lightMode") : t("shell.darkMode"), icon: theme === "dark" ? <Sun /> : <Moon />, onClick: toggleTheme },
  ];

  return (
    <AppShell
      appName="UPLIF" nav={nav} groupLabel={t("shell.group")} activeId={active}
      onNavigate={(id) => startTransition(() => { setShownPath(routes[id]); router.push(routes[id]); })}
      onPrefetch={(id) => { if (!pathname.startsWith(routes[id])) router.prefetch(routes[id]); }}
      utilities={utilities}
      account={{
        label: t("shell.user"), name: userName || "?", sub: shownName, avatar: <Avatar name={userName || "?"} />,
        menu: [
          { id: "switch", label: t("dash.switch"), icon: <Repeat />, onClick: () => router.push("/companies") },
          { id: "out", label: t("auth.signOut"), icon: <LogOut />, onClick: signOut },
        ],
      }}
      navLabel={t("shell.nav")} collapseLabel={t("shell.collapse")} expandLabel={t("shell.expand")}
      menuLabel={t("shell.menu")} closeLabel={t("shell.close")}
      topBar={
        <span className="flex items-center gap-2 font-semibold">
          <Store className="size-4 text-link" aria-hidden="true" />{shownName}
        </span>
      }
    >
      <NavProgress active={pending} />
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>{children}</div>
    </AppShell>
  );
}
