"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "./cn";

export interface NavItem { id: string; label: string; icon: ReactNode }

interface ShellProps {
  appName: string;
  nav: NavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  navLabel: string;
  collapseLabel: string;
  expandLabel: string;
  menuLabel: string;
  closeLabel: string;
  topBar: ReactNode;
  children: ReactNode;
}

/** Navy sidebar rail (collapsible on desktop, drawer on phone) + top bar + main content. */
export function AppShell(p: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("uplif.rail") === "1"); } catch {}
  }, []);
  function toggleRail() {
    setCollapsed((c) => { try { localStorage.setItem("uplif.rail", c ? "0" : "1"); } catch {} return !c; });
  }
  useEffect(() => {
    if (!drawer) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [drawer]);

  const rail = collapsed && !drawer;
  return (
    <div className="flex min-h-dvh">
      {drawer && <div className="fixed inset-0 z-30 bg-navy/50 md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex flex-col bg-navy text-white transition-[width,transform] duration-200 md:sticky md:top-0 md:h-dvh md:translate-x-0 md:rtl:translate-x-0",
          drawer ? "w-64 translate-x-0" : "w-64 -translate-x-full rtl:translate-x-full",
          rail ? "md:w-[72px]" : "md:w-64",
        )}
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <span aria-hidden="true" className="inline-flex size-9 shrink-0 items-center justify-center rounded-control bg-primary font-bold">U</span>
          {!rail && <span className="flex-1 truncate text-lg font-bold">{p.appName}</span>}
          <button type="button" aria-label={p.closeLabel} onClick={() => setDrawer(false)} className="inline-flex size-9 items-center justify-center rounded-control hover:bg-white/10 md:hidden">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <nav aria-label={p.navLabel} className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="flex flex-col gap-1">
            {p.nav.map((n) => {
              const on = n.id === p.activeId;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    aria-label={rail ? n.label : undefined}
                    title={rail ? n.label : undefined}
                    onClick={() => { p.onNavigate(n.id); setDrawer(false); }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-control px-3 font-medium transition-colors",
                      rail && "justify-center px-0",
                      on ? "bg-primary text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <span className="shrink-0 [&_svg]:size-5" aria-hidden="true">{n.icon}</span>
                    {!rail && <span className="truncate">{n.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="hidden border-t border-white/10 p-3 md:block">
          <button
            type="button"
            onClick={toggleRail}
            aria-expanded={!collapsed}
            aria-label={collapsed ? p.expandLabel : p.collapseLabel}
            title={collapsed ? p.expandLabel : p.collapseLabel}
            className={cn("flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-white/80 hover:bg-white/10 hover:text-white", rail && "justify-center px-0")}
          >
            {collapsed ? <PanelLeftOpen className="size-5 rtl:rotate-180" aria-hidden="true" /> : <PanelLeftClose className="size-5 rtl:rotate-180" aria-hidden="true" />}
            {!rail && <span>{p.collapseLabel}</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
          <button type="button" aria-label={p.menuLabel} aria-expanded={drawer} onClick={() => setDrawer(true)} className="inline-flex size-10 items-center justify-center rounded-control hover:bg-ground md:hidden">
            <Menu className="size-5" aria-hidden="true" />
          </button>
          {p.topBar}
        </header>
        <main className="flex-1 p-4 sm:p-6">{p.children}</main>
      </div>
    </div>
  );
}
