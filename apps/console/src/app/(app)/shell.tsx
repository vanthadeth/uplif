"use client";
import { useEffect, useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Briefcase, Building2, CalendarCheck, CalendarClock, CalendarDays, CalendarOff, ClipboardList, FilePenLine, GraduationCap, TrendingUp, GitBranch, IdCard, LayoutDashboard, LogOut, Network, Moon, Repeat, ShieldCheck, LifeBuoy, KeyRound, ScrollText, Sun, Users } from "lucide-react";
import { AppShell, Avatar, LanguagePicker, type NavGroup, type NavItem, type UtilityItem } from "@uplif/ui";
import { useI18n, type Locale } from "@/lib/i18n";
import { isLocale } from "@/lib/languages";
import { useLanguageOptions } from "@/lib/use-language-options";
import type { MessageKey } from "@/lib/messages";
import { useTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/client";
import { pick } from "@/lib/format";
import { NavProgress } from "@/components/nav-progress";
import { TitleBar } from "@/components/title-bar";

const routes: Record<string, string> = { dashboard: "/dashboard", company: "/company", branches: "/branches", users: "/users", roles: "/roles", employees: "/employees", departments: "/departments", positions: "/positions", "working-time": "/working-time", attendance: "/attendance", holidays: "/holidays", leave: "/leave", performance: "/performance", corrections: "/corrections", "learn-tests": "/learn-tests", policies: "/policies", audit: "/audit", support: "/support" };
// A section shows in the menu when the user holds any of these permissions. This only tidies the menu:
// the database enforces access on every read and write regardless.
const needs: Record<string, string[] | undefined> = {
  company: ["org.company.update", "org.settings.update"],
  branches: ["org.branch.read"],
  users: ["org.member.read"],
  roles: ["org.role.read"],
  employees: ["org.employee.read"],
  departments: ["org.employee.read", "org.department.manage"],
  positions: ["org.employee.read", "org.position.manage"],
  "working-time": ["attendance.schedule.read", "attendance.schedule.manage"],
  holidays: ["attendance.holiday.read", "attendance.holiday.manage"],
  attendance: ["attendance.settings.manage"],
  leave: ["leave.request.review", "leave.type.manage"],
  performance: ["performance.review.write", "performance.kpi.manage"],
  corrections: ["attendance.amendment.review"],
  policies: ["learn.policy.manage"],
  "learn-tests": ["learn.test.manage", "learn.result.read"],
  audit: ["org.audit.read"],
};

export function ConsoleShell({ companyName, companyNameLocal, userName, userEmail, userId, profileLocale, permissions, isOwner, pendingSupport, children }: {
  companyName: string; companyNameLocal: string | null; userName: string; userEmail: string; userId: string; profileLocale: Locale; permissions: string[]; isOwner: boolean; pendingSupport: number; children: React.ReactNode;
}) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle: toggleTheme } = useTheme();
  const languageOptions = useLanguageOptions().options;
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
    { id: "employees", label: t("nav.employees"), icon: <IdCard /> },
    { id: "departments", label: t("nav.departments"), icon: <Network /> },
    { id: "positions", label: t("nav.positions"), icon: <Briefcase /> },
    { id: "working-time", label: t("nav.workingTime"), icon: <CalendarClock /> },
    { id: "holidays", label: t("nav.holidays"), icon: <CalendarDays /> },
    { id: "attendance", label: t("nav.attendance"), icon: <CalendarCheck /> },
    { id: "leave", label: t("nav.leave"), icon: <CalendarOff /> },
    { id: "corrections", label: t("nav.corrections"), icon: <FilePenLine /> },
    { id: "performance", label: t("nav.performance"), icon: <TrendingUp /> },
    { id: "policies", label: t("nav.policies"), icon: <ScrollText /> },
    { id: "learn-tests", label: t("nav.tests"), icon: <GraduationCap /> },
    { id: "audit", label: t("nav.audit"), icon: <ClipboardList /> },
    { id: "support", label: pendingSupport > 0 ? `${t("nav.support")} (${pendingSupport})` : t("nav.support"), icon: <LifeBuoy /> },
  ];
  // Support requests are for the company Owner only (the database checks it again on every call).
  const nav = allNav.filter((n) => (n.id === "support" ? isOwner : !needs[n.id] || needs[n.id]!.some((k) => permissions.includes(k))));
  const visible = nav.map((n) => routes[n.id]);
  const groupIds: [string, MessageKey, string[]][] = [
    ["workspace", "shell.group.workspace", ["dashboard", "company", "branches"]],
    ["people", "shell.group.people", ["users", "roles", "employees", "departments", "positions", "working-time", "holidays", "attendance", "corrections", "leave", "performance"]],
    ["records", "shell.group.records", ["policies", "learn-tests", "audit", "support"]],
  ];
  const groups: NavGroup[] = groupIds.map(([id, label, ids]) => ({ id, label: t(label), items: nav.filter((n) => ids.includes(n.id)) }));

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
    {
      id: "lang",
      custom: (rail) => (
        <LanguagePicker
          variant={rail ? "rail" : "row"} label={t("shell.language")} value={locale} options={languageOptions}
          onChange={(c) => isLocale(c) && changeLocale(c)} moreLabel={t("lang.more")} onMore={() => router.push("/language")} footer={t("lang.help")}
        />
      ),
    },
    { id: "theme", label: theme === "dark" ? t("shell.lightMode") : t("shell.darkMode"), icon: theme === "dark" ? <Sun /> : <Moon />, onClick: toggleTheme },
  ];

  return (
    <AppShell
      company={{ name: shownName || "UPLIF", sub: t("dash.switch"), label: t("dash.switch"), onSwitch: () => router.push("/companies") }}
      groups={groups} activeId={active}
      onNavigate={(id) => startTransition(() => { setShownPath(routes[id]); router.push(routes[id]); })}
      onPrefetch={(id) => { if (!pathname.startsWith(routes[id])) router.prefetch(routes[id]); }}
      utilities={utilities}
      account={{
        label: t("shell.user"), name: userName || "?", sub: userEmail || undefined, avatar: <Avatar name={userName || "?"} />,
        menu: [
          { id: "account", label: t("nav.account"), icon: <KeyRound />, onClick: () => router.push("/account") },
          { id: "switch", label: t("dash.switch"), icon: <Repeat />, onClick: () => router.push("/companies") },
          { id: "out", label: t("auth.signOut"), icon: <LogOut />, onClick: signOut },
        ],
      }}
      navLabel={t("shell.nav")} collapseLabel={t("shell.collapse")} expandLabel={t("shell.expand")}
      menuLabel={t("shell.menu")} closeLabel={t("shell.close")}
      topBar={
        <TitleBar
          name={userName} greeting={t("tb.welcome").replace("{company}", shownName)}
          searchLabel={t("shell.search")} notifLabel={t("tb.notif")} soonLabel={t("tb.soon")}
          action={permissions.includes("org.invitation.manage") ? { label: t("users.invite"), onClick: () => router.push("/users?invite=1") } : undefined}
        />
      }
    >
      <NavProgress active={pending} />
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>{children}</div>
    </AppShell>
  );
}
