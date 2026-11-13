"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Menu, X } from "lucide-react";
import { cn } from "./cn";

export interface NavItem { id: string; label: string; icon: ReactNode }
/** A labelled group of menu items. Empty groups are not shown. */
export interface NavGroup { id: string; label: string; items: NavItem[] }
export interface UtilityItem {
  id: string;
  /** A fully custom row (for example the language popup); receives whether the rail is collapsed. */
  custom?: (rail: boolean) => ReactNode;
  label?: string; icon?: ReactNode; onClick?: () => void; value?: string;
}
export interface AccountMenuItem { id: string; label: string; icon?: ReactNode; onClick: () => void }

interface ShellProps {
  /** Company switcher at the top: logo (or mark), name and a line under it. */
  company: { name: string; sub?: string; logo?: ReactNode; label: string; onSwitch?: () => void };
  groups: NavGroup[];
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
  /** Title bar content, to the right of the phone menu button. */
  topBar: ReactNode;
  children: ReactNode;
}

function BrandTag({ switchable, children, ...rest }: { switchable: boolean; children: ReactNode; onClick: () => void; className: string; title?: string; "aria-label": string }) {
  const { onClick, ...plain } = rest;
  return switchable ? <button type="button" onClick={onClick} {...plain}>{children}</button> : <div {...plain}>{children}</div>;
}

const row = "relative flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-start font-medium text-(--sb-muted) transition-colors hover:bg-(--sb-hover) hover:text-(--sb-fg)";

/**
 * Sidebar (expanded panel on desktop, icon rail when collapsed, drawer on phones) plus the page frame and title bar.
 * Colours come from the --sb-* tokens so the same markup works in light and dark.
 */
export function AppShell(p: ShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  /** Ids of the groups the person folded; kept in this browser. */
  const [folded, setFolded] = useState<string[]>([]);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem("uplif.rail") === "1"); } catch {}
    try { const v = JSON.parse(localStorage.getItem("uplif.navfold") ?? "[]"); if (Array.isArray(v)) setFolded(v.filter((x) => typeof x === "string")); } catch {}
  }, []);
  function toggleGroup(id: string) {
    setFolded((f) => {
      const n = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      try { localStorage.setItem("uplif.navfold", JSON.stringify(n)); } catch {}
      return n;
    });
  }
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
  const groups = p.groups.filter((g) => g.items.length > 0);
  // Going to a section opens its group, so the page you are on is never hidden in a folded group.
  const activeGroup = groups.find((g) => g.items.some((n) => n.id === p.activeId))?.id;
  useEffect(() => {
    if (!activeGroup) return;
    setFolded((f) => {
      if (!f.includes(activeGroup)) return f;
      const n = f.filter((x) => x !== activeGroup);
      try { localStorage.setItem("uplif.navfold", JSON.stringify(n)); } catch {}
      return n;
    });
  }, [activeGroup, p.activeId]);
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
        <button
          type="button" onClick={toggleRail}
          aria-label={rail ? p.expandLabel : p.collapseLabel} title={rail ? p.expandLabel : p.collapseLabel}
          className={cn("absolute top-5 z-10 hidden size-8 items-center justify-center rounded-full border border-(--sb-pill-line) bg-(--sb-bg) text-(--sb-muted) shadow-sm hover:text-(--sb-fg) md:inline-flex", rail ? "-end-3" : "-end-4")}
        >
          {rail ? <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" /> : <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />}
        </button>

        <div className={cn("flex h-[72px] shrink-0 items-center gap-2 border-b border-(--sb-line) px-3", rail && "justify-center px-0")}>
          {/* Without onSwitch (one-company apps such as the super-admin app) the block is a plain label. */}
          <BrandTag
            switchable={!!p.company.onSwitch}
            onClick={() => { p.company.onSwitch?.(); setDrawer(false); }}
            aria-label={`${p.company.label}: ${p.company.name}`} title={rail ? p.company.label : undefined}
            className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-1.5 text-start", p.company.onSwitch && "hover:bg-(--sb-hover)", rail && "flex-none p-0")}
          >
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-(--sb-acc) text-lg font-bold text-(--sb-mark-fg)">
              {p.company.logo ?? <span aria-hidden="true">U</span>}
            </span>
            {!rail && (
              <>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate font-semibold">{p.company.name}</span>
                  {p.company.sub && <span className="block truncate text-xs text-(--sb-muted)">{p.company.sub}</span>}
                </span>
                {p.company.onSwitch && <ChevronsUpDown className="size-[18px] shrink-0 text-(--sb-muted)" aria-hidden="true" />}
              </>
            )}
          </BrandTag>
          {drawer && (
            <button type="button" aria-label={p.closeLabel} title={p.closeLabel} onClick={() => setDrawer(false)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] text-(--sb-muted) hover:bg-(--sb-hover) hover:text-(--sb-fg) md:hidden">
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </div>

        <nav aria-label={p.navLabel} className={cn("flex-1 overflow-y-auto px-2 pb-2 pt-1", rail && "flex flex-col items-center")}>
          {groups.map((g, gi) => (
            <div key={g.id} className={cn("flex flex-col gap-0.5", gi > 0 && "mt-1.5", rail && gi > 0 && "mt-2 w-11 border-t border-(--sb-line) pt-2")}>
              {!rail && (
                <button
                  type="button" aria-expanded={!folded.includes(g.id)} aria-controls={`nav-${g.id}`} onClick={() => toggleGroup(g.id)}
                  className="flex min-h-9 w-full items-center justify-between gap-2 rounded-[10px] px-3 pb-1 pt-2.5 text-start text-[11px] font-semibold uppercase tracking-wide text-(--sb-muted) transition-colors hover:text-(--sb-fg) [&:lang(km)]:normal-case [&:lang(km)]:tracking-normal"
                >
                  <span className="min-w-0 truncate">{g.label}</span>
                  <ChevronDown className={cn("size-4 shrink-0 transition-transform duration-200", folded.includes(g.id) && "-rotate-90 rtl:rotate-90")} aria-hidden="true" />
                </button>
              )}
              <div id={`nav-${g.id}`} className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", !rail && folded.includes(g.id) ? "grid-rows-[0fr]" : "grid-rows-[1fr]")} inert={!rail && folded.includes(g.id) ? true : undefined}>
              <ul className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                {g.items.map((n) => {
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
                          row,
                          rail && "size-11 justify-center px-0",
                          on && cn(
                            "bg-(--sb-act) font-semibold text-(--sb-act-fg) hover:bg-(--sb-act) hover:text-(--sb-act-fg) before:absolute before:inset-y-2.5 before:w-[3px] before:rounded-e-[3px] before:bg-(--sb-ind) before:content-['']",
                            rail ? "before:-start-3.5" : "before:-start-2",
                          ),
                        )}
                      >
                        <span className={cn("shrink-0 [&_svg]:size-5", on && "text-(--sb-ind)")} aria-hidden="true">{n.icon}</span>
                        {!rail && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
                        {!rail && on && <ChevronRight className="size-4 shrink-0 opacity-80 rtl:rotate-180" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
              </div>
            </div>
          ))}
        </nav>

        {p.utilities && p.utilities.length > 0 && (
          <div className={cn("flex shrink-0 flex-col gap-0.5 border-t border-(--sb-line) p-2", rail && "items-center")}>
            {p.utilities.map((u) => u.custom ? <div key={u.id} className={cn(!rail && "w-full")}>{u.custom(rail)}</div> : (
              <button
                key={u.id}
                type="button"
                onClick={u.onClick}
                aria-label={rail ? u.label : undefined}
                title={rail ? u.label : undefined}
                className={cn(row, rail && "size-11 justify-center px-0")}
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
        {/* The bar keeps its full-width background and border; its content and the page share one centered max width. */}
        <header className="sticky top-0 z-20 min-h-[72px] border-b border-line bg-surface px-3 py-2 sm:px-6">
          <div className="mx-auto flex min-h-[56px] w-full max-w-(--content-max) flex-wrap items-center gap-x-2 gap-y-2">
            <button type="button" aria-label={p.menuLabel} aria-expanded={drawer} onClick={() => setDrawer(true)} className="inline-flex size-11 items-center justify-center rounded-control hover:bg-ground md:hidden">
              <Menu className="size-5" aria-hidden="true" />
            </button>
            {p.topBar}
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6"><div className="mx-auto w-full max-w-(--content-max)">{p.children}</div></main>
      </div>
    </div>
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
        className={cn("flex min-h-[72px] w-full items-center gap-3 p-3 text-start hover:bg-(--sb-hover)", rail && "justify-center px-0")}
      >
        <span className="shrink-0">{account.avatar}</span>
        {!rail && (
          <>
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block truncate font-semibold">{account.name}</span>
              {account.sub && <span className="block truncate text-xs text-(--sb-muted)">{account.sub}</span>}
            </span>
            <ChevronRight className="size-[18px] shrink-0 text-(--sb-muted) rtl:rotate-180" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
}
