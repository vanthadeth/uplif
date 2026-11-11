"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown, Menu, PanelLeftClose, X } from "lucide-react";
import { cn } from "./cn";

export interface NavItem { id: string; label: string; icon: ReactNode }
export interface UtilityItem { id: string; label: string; icon: ReactNode; onClick: () => void; value?: string }
export interface AccountMenuItem { id: string; label: string; icon?: ReactNode; onClick: () => void }

interface ShellProps {
  appName: string;
  nav: NavItem[];
  /** Small heading above the nav list in the expanded panel. */
  groupLabel: string;
  activeId: string;
  onNavigate: (id: string) => void;
  /** Optional: warm up a section when the pointer or keyboard reaches its item. */
  onPrefetch?: (id: string) => void;
  /** Rows above the account, for example language and theme. */
  utilities?: UtilityItem[];
  account: { name: string; sub?: string; avatar: ReactNode; menu: AccountMenuItem[]; label: string };
  navLabel: string;
  collapseLabel: string;
  expandLabel: string;
  menuLabel: string;
  closeLabel: string;
  /** Page header content, to the right of the phone menu button. */
  topBar: ReactNode;
  children: ReactNode;
}

const base = "flex min-h-11 w-full items-center gap-3 text-start rounded-[10px] border border-transparent px-3 font-medium text-(--sb-muted) transition-colors hover:bg-(--sb-hover) hover:text-(--sb-fg)";

/**
 * Sidebar (expanded panel on desktop, icon rail when collapsed, drawer on phones) plus the page frame.
 * Colours come from the --sb-* tokens so the same markup works in light and dark.
 */
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
      {drawer && <div className="fixed inset-0 z-30 bg-(--sb-scrim) md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}
      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex flex-col border-e border-(--sb-line) bg-(--sb-bg) text-(--sb-fg) transition-[width,transform] duration-200 md:sticky md:top-0 md:h-dvh md:translate-x-0 md:rtl:translate-x-0",
          drawer ? "w-[312px] max-w-[88%] translate-x-0" : "w-72 -translate-x-full rtl:translate-x-full",
          rail ? "md:w-[72px]" : "md:w-72",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center gap-2.5 border-b border-(--sb-line) px-3", rail && "justify-center px-0")}>
          {rail ? (
            <button type="button" onClick={toggleRail} aria-label={p.expandLabel} title={p.expandLabel} className="inline-flex size-10 items-center justify-center rounded-[10px] hover:bg-(--sb-hover)">
              <Mark />
            </button>
          ) : (
            <>
              <span className="flex flex-1 items-center gap-2.5 text-lg font-bold tracking-wide"><Mark />{p.appName}</span>
              <button type="button" aria-label={p.closeLabel} title={p.closeLabel} onClick={() => setDrawer(false)} className="inline-flex size-10 items-center justify-center rounded-[10px] text-(--sb-muted) hover:bg-(--sb-hover) hover:text-(--sb-fg) md:hidden">
                <X className="size-5" aria-hidden="true" />
              </button>
              <button type="button" aria-label={p.collapseLabel} title={p.collapseLabel} onClick={toggleRail} className="hidden size-10 items-center justify-center rounded-[10px] text-(--sb-muted) hover:bg-(--sb-hover) hover:text-(--sb-fg) md:inline-flex">
                <PanelLeftClose className="size-5 rtl:rotate-180" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        <nav aria-label={p.navLabel} className={cn("flex-1 overflow-y-auto p-2", rail && "flex flex-col items-center")}>
          {!rail && <div className="px-3 pb-1.5 pt-3.5 text-xs font-semibold tracking-wide text-(--sb-muted)">{p.groupLabel}</div>}
          <ul className="flex flex-col gap-0.5">
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
                    onPointerEnter={() => p.onPrefetch?.(n.id)}
                    onFocus={() => p.onPrefetch?.(n.id)}
                    className={cn(
                      base,
                      rail && "size-11 justify-center px-0",
                      on && "border-(--sb-pill-line) bg-(--sb-pill) font-semibold text-(--sb-fg) shadow-(--sb-pill-shadow)",
                    )}
                  >
                    <span className={cn("shrink-0 [&_svg]:size-5", on && "text-(--sb-acc)")} aria-hidden="true">{n.icon}</span>
                    {!rail && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {p.utilities && p.utilities.length > 0 && (
          <div className={cn("flex shrink-0 flex-col gap-0.5 border-t border-(--sb-line) p-2", rail && "items-center")}>
            {p.utilities.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={u.onClick}
                aria-label={rail ? u.label : undefined}
                title={rail ? u.label : undefined}
                className={cn(base, rail && "size-11 justify-center px-0")}
              >
                <span className="shrink-0 [&_svg]:size-5" aria-hidden="true">{u.icon}</span>
                {!rail && <span className="min-w-0 flex-1 truncate">{u.label}</span>}
                {!rail && u.value && <span className="rounded-full bg-(--sb-hover) px-2 py-0.5 text-xs font-semibold">{u.value}</span>}
              </button>
            ))}
          </div>
        )}

        <Account rail={rail} account={p.account} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-2 sm:px-6">
          <button type="button" aria-label={p.menuLabel} aria-expanded={drawer} onClick={() => setDrawer(true)} className="inline-flex size-11 items-center justify-center rounded-control hover:bg-ground md:hidden">
            <Menu className="size-5" aria-hidden="true" />
          </button>
          {p.topBar}
        </header>
        <main className="flex-1 p-4 sm:p-6">{p.children}</main>
      </div>
    </div>
  );
}

function Mark() {
  return (
    <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-(--sb-acc) font-bold text-(--sb-mark-fg)">U</span>
  );
}

function Account({ rail, account }: { rail: boolean; account: ShellProps["account"] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div ref={box} className="relative shrink-0 border-t border-(--sb-line)">
      {open && (
        <div role="menu" className={cn("absolute z-50 flex w-56 flex-col rounded-card border border-(--sb-pill-line) bg-(--sb-pill) p-1 shadow-pop animate-[uplif-in_120ms_ease-out]", rail ? "bottom-2 start-full ms-2" : "bottom-full start-2 mb-2")}>
          {account.menu.map((m) => (
            <button key={m.id} role="menuitem" type="button" onClick={() => { setOpen(false); m.onClick(); }} className="flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-start font-medium hover:bg-(--sb-hover)">
              {m.icon && <span aria-hidden="true" className="[&_svg]:size-5">{m.icon}</span>}{m.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={rail ? `${account.label}: ${account.name}` : undefined}
        title={rail ? account.name : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex min-h-[68px] w-full items-center gap-3 p-3 text-start hover:bg-(--sb-hover)", rail && "justify-center px-0")}
      >
        <span className="shrink-0">{account.avatar}</span>
        {!rail && (
          <>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate font-semibold">{account.name}</span>
              {account.sub && <span className="block truncate text-xs text-(--sb-muted)">{account.sub}</span>}
            </span>
            <ChevronsUpDown className="size-5 shrink-0 text-(--sb-muted)" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}
