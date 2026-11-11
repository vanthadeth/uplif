"use client";
import { useState } from "react";
import { Building2, ClipboardList, CreditCard, GitBranch, Languages, LayoutDashboard, Search, ShieldCheck, Store, Users } from "lucide-react";
import { AppShell, Avatar, Card, CardBody, CardHeader, LanguageToggle, Switcher, type NavItem } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

export default function ShellDemo() {
  const { t, locale, setLocale } = useI18n();
  const [active, setActive] = useState("dashboard");
  const [company, setCompany] = useState("sokha");
  const [branch, setBranch] = useState("all");

  const nav: NavItem[] = [
    { id: "dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard /> },
    { id: "company", label: t("nav.company"), icon: <Building2 /> },
    { id: "branches", label: t("nav.branches"), icon: <GitBranch /> },
    { id: "users", label: t("nav.users"), icon: <Users /> },
    { id: "roles", label: t("nav.roles"), icon: <ShieldCheck /> },
    { id: "audit", label: t("nav.audit"), icon: <ClipboardList /> },
    { id: "billing", label: t("nav.billing"), icon: <CreditCard /> },
  ];

  return (
    <AppShell
      appName="UPLIF"
      nav={nav}
      groupLabel={t("shell.group")}
      activeId={active}
      onNavigate={setActive}
      account={{ label: t("shell.user"), name: "Sokha Chan", sub: "Sokha Mart", avatar: <Avatar name="Sokha Chan" />, menu: [] }}
      utilities={[{ id: "lang", label: t("shell.language"), icon: <Languages />, value: locale === "km" ? "ខ្មែរ" : "English", onClick: () => setLocale(locale === "km" ? "en" : "km") }]}
      navLabel={t("shell.nav")}
      collapseLabel={t("shell.collapse")}
      expandLabel={t("shell.expand")}
      menuLabel={t("shell.menu")}
      closeLabel={t("shell.close")}
      topBar={
        <>
          <Switcher
            label={t("shell.company")}
            icon={<Store className="size-4 text-link" aria-hidden="true" />}
            value={company}
            onChange={setCompany}
            options={[
              { id: "sokha", label: "Sokha Mart", hint: t("shell.hint.you") },
              { id: "dara", label: "Dara Electronics", hint: t("shell.hint.you") },
            ]}
          />
          <Switcher
            label={t("shell.branch")}
            icon={<GitBranch className="size-4 text-muted" aria-hidden="true" />}
            value={branch}
            onChange={setBranch}
            options={[
              { id: "all", label: t("shell.allBranches") },
              { id: "main", label: t("field.branch.main") },
              { id: "market", label: t("field.branch.market") },
            ]}
          />
          <div className="ms-auto flex items-center gap-2">
            <div className="hidden w-56 sm:block">
              <label className="sr-only" htmlFor="top-search">{t("shell.search")}</label>
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input id="top-search" placeholder={t("shell.search")} className="h-(--control-h) w-full rounded-control border border-line-strong bg-surface ps-9 pe-3 placeholder:text-muted" />
              </div>
            </div>
            <LanguageToggle label={t("lang.toggle")} value={locale} onChange={(l) => setLocale(l as "en" | "km")} options={[{ id: "en", label: "English" }, { id: "km", label: "ខ្មែរ" }]} />
            <Avatar name="Sokha Chan" />
          </div>
        </>
      }
    >
      <h1 className="text-2xl font-bold">{nav.find((n) => n.id === active)?.label}</h1>
      <p className="mt-1 max-w-xl text-muted">{t("shell.intro")}</p>
      <Card className="mt-6 max-w-xl">
        <CardHeader title={t("shell.title")} />
        <CardBody>{t("shell.pageBody")}</CardBody>
      </Card>
    </AppShell>
  );
}
