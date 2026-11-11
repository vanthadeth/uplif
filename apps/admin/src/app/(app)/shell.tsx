"use client";
import { useEffect, useOptimistic, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, Moon, Package, Sun } from "lucide-react";
import { AppShell, Avatar, NavProgress, TitleBar, useTheme, type NavGroup, type NavItem, type UtilityItem } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";

// Add a page here as each slice is built. Pages that are not built yet are not shown.
const items: (NavItem & { href: string; group: "platform" | "safety" })[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard />, href: "/overview", group: "platform" },
  { id: "subscribers", label: "Subscribers", icon: <Building2 />, href: "/subscribers", group: "platform" },
  { id: "plans", label: "Plans", icon: <Package />, href: "/plans", group: "platform" },
];

export function AdminShell({ userName, userEmail, children }: { userName: string; userEmail: string; children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shownPath, setShownPath] = useOptimistic(pathname);
  useEffect(() => { items.forEach((i) => { if (!pathname.startsWith(i.href)) router.prefetch(i.href); }); }, [router, pathname]);

  const groups: NavGroup[] = [
    { id: "platform", label: "Platform", items: items.filter((i) => i.group === "platform") },
    { id: "safety", label: "Safety", items: items.filter((i) => i.group === "safety") },
  ];
  const active = items.find((i) => shownPath.startsWith(i.href))?.id ?? "overview";
  const utilities: UtilityItem[] = [
    { id: "theme", label: theme === "dark" ? "Light mode" : "Dark mode", icon: theme === "dark" ? <Sun /> : <Moon />, onClick: toggle },
  ];
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <AppShell
      company={{ name: "UPLIF", sub: "Super Admin", label: "UPLIF Super Admin" }}
      groups={groups} activeId={active}
      onNavigate={(id) => { const href = items.find((i) => i.id === id)?.href ?? "/overview"; startTransition(() => { setShownPath(href); router.push(href); }); }}
      utilities={utilities}
      account={{
        label: "Account", name: userName || "?", sub: userEmail || undefined, avatar: <Avatar name={userName || "?"} />,
        menu: [{ id: "out", label: "Sign out", icon: <LogOut />, onClick: signOut }],
      }}
      navLabel="Main menu" collapseLabel="Collapse menu" expandLabel="Expand menu" menuLabel="Open menu" closeLabel="Close menu"
      topBar={<TitleBar name={userName} greeting="Platform administration" searchLabel="Search" notifLabel="Notifications" soonLabel="coming later" />}
    >
      <NavProgress active={pending} />
      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity duration-150" : "transition-opacity duration-150"}>{children}</div>
    </AppShell>
  );
}
