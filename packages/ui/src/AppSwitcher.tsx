"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Lock, X } from "lucide-react";
import { APPS, coreApps, switcherApps, type AppKey, type SwitcherApp, type SwitcherData } from "./apps";
import { APP_ICON_SVG } from "./app-icons";
import { cn } from "./cn";

/** The app's colour tile with its pixel arrow and badge. Inline, so it works offline and needs no request. */
export function AppIcon({ app, size = 48, dim, className }: { app: AppKey; size?: number; dim?: boolean; className?: string }) {
  return (
    <svg
      viewBox="32 32 448 448" width={size} height={size} aria-hidden="true" focusable="false"
      className={cn("shrink-0 rounded-[23%] ring-1 ring-black/5 dark:ring-white/15", dim && "opacity-45 saturate-50", className)}
      dangerouslySetInnerHTML={{ __html: APP_ICON_SVG[app] }}
    />
  );
}

export interface AppSwitcherLabels {
  apps: string; core: string; modules: string; company: string; switchCompany: string; current: string; soon: string;
  premium: string; addon: string; close: string; back: string; seePlans: string; askOwner: string; hint: string;
  lockedPremium: string; lockedAddon: string; noApps: string; noAppsBody: string; loading: string;
}
export const defaultAppSwitcherLabels: AppSwitcherLabels = {
  apps: "Apps", core: "Core", modules: "Modules", company: "Company", switchCompany: "Switch company", current: "Current",
  soon: "Coming soon", premium: "Premium", addon: "Add-on", close: "Close", back: "Back", seePlans: "See plans",
  askOwner: "Ask an owner to add it", hint: "Point at an app to see what it does.",
  lockedPremium: "Included in the Premium plan.", lockedAddon: "Available as an add-on.",
  noApps: "No apps available", noAppsBody: "Your access to this company is paused. Ask an owner or admin to restore your role, or switch to another company.",
  loading: "Loading apps",
};

/** Builds the switcher's text from an app's own translator, using the shared `sw.*` and `app.<key>.blurb` strings. */
export function appSwitcherText(t: (key: string) => string): { labels: AppSwitcherLabels; blurbs: Partial<Record<string, string>> } {
  const labels = Object.fromEntries(Object.keys(defaultAppSwitcherLabels).map((k) => [k, t(`sw.${k}`)])) as unknown as AppSwitcherLabels;
  const blurbs = Object.fromEntries(APPS.map((a) => [a.key, t(a.blurbKey)]));
  return { labels, blurbs };
}

const PANEL_W = 440;
const focusables = 'a[href],button:not([disabled]):not([aria-disabled="true"])';

/**
 * The apps switcher, shared by every UPLIF app. It sits in the top bar (or the sidebar header) as a button showing the
 * open app and company. It opens a popover on desktop and a bottom sheet on phones, listing only the apps this person's
 * role allows: open ones, ones the plan locks (tap for details) and ones coming soon. Company switching is at the top.
 * `data` is null while loading, which shows skeletons. With one app and one company it turns into a plain label.
 * The icons and order are fixed, so nothing moves when a plan changes.
 */
export function AppSwitcher({ current, data, locale = "en", labels, blurbs, onSwitchCompany, plansHref, canManagePlan, compact, tone = "bar", className }: {
  current: AppKey;
  data: SwitcherData | null;
  locale?: string;
  labels?: Partial<AppSwitcherLabels>;
  blurbs?: Partial<Record<string, string>>;
  /** Called with the membership id; the app should refresh the session and reload. Without it companies are listed but not tappable. */
  onSwitchCompany?: (membershipId: string) => Promise<void> | void;
  plansHref?: string;
  /** Whether this person may change the plan; others are told to ask an owner. */
  canManagePlan?: boolean;
  /** Icon only (the collapsed sidebar rail). */
  compact?: boolean;
  /** "sidebar" takes the --sb-* colours of the dark sidebar. */
  tone?: "bar" | "sidebar";
  className?: string;
}) {
  const L = { ...defaultAppSwitcherLabels, ...labels };
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<AppKey | null>(null);
  const [coOpen, setCoOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [pos, setPos] = useState({ left: 8, top: 64, max: 640 });
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const list = useMemo<SwitcherApp[]>(() => (data ? switcherApps(data.modules, data.permissions) : []), [data]);
  const currentApp = APPS.find((a) => a.key === current)!;
  const company = data?.companies.find((c) => c.active) ?? data?.companies[0];
  const nameOf = (c: { name: string; nameLocal: string | null }) => (locale !== "en" && c.nameLocal) || c.name;
  const companies = data?.companies ?? [];
  const interactive = !!data && (list.some((x) => x.app.key !== current) || companies.length > 1);
  const loading = !data || switching;

  function show() {
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8)), top: r.bottom + 8, max: Math.max(280, Math.min(680, window.innerHeight - r.bottom - 24)) });
    setDetail(null); setCoOpen(false); setOpen(true);
  }
  function hide(focusTrigger = true) {
    setOpen(false); setDetail(null); setCoOpen(false);
    if (focusTrigger) requestAnimationFrame(() => btn.current?.focus());
  }

  // Focus the first open app when the panel opens (or returns from a detail view).
  useEffect(() => {
    if (!open || loading) return;
    const first = panel.current?.querySelector<HTMLElement>("[data-app]:not([aria-disabled='true'])") ?? panel.current?.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true });
  }, [open, loading, detail === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const close = () => hide(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); if (detail) setDetail(null); else hide(); return; }
    const root = panel.current;
    if (!root) return;
    if (e.key === "Tab") {
      const f = Array.from(root.querySelectorAll<HTMLElement>(focusables));
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return;
    }
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-app]:not([aria-disabled='true'])"));
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    e.preventDefault();
    items[(i + step + items.length) % items.length].focus();
  }

  async function pickCompany(id: string, active: boolean) {
    if (active || !onSwitchCompany) { setCoOpen(false); return; }
    setSwitching(true); setCoOpen(false);
    try { await onSwitchCompany(id); } catch { setSwitching(false); }
  }

  // ---- trigger ----
  const sidebar = tone === "sidebar";
  const triggerInner = loading ? (
    <>
      <span aria-hidden="true" className="size-9 shrink-0 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-[9px] bg-line" />
      {!compact && (
        <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="h-3.5 w-24 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-full bg-line" />
          <span className="h-3 w-32 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-full bg-line" />
        </span>
      )}
      <span className="sr-only">{L.loading}</span>
    </>
  ) : (
    <>
      <AppIcon app={current} size={36} />
      {!compact && (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-start leading-tight">
            <b className="truncate font-semibold">{currentApp.name}</b>
            {company && <small className={cn("truncate text-[13px]", sidebar ? "text-(--sb-muted)" : "text-muted")}>{nameOf(company)}</small>}
          </span>
          {interactive && <ChevronDown aria-hidden="true" className={cn("size-[18px] shrink-0 transition-transform duration-200", sidebar ? "text-(--sb-muted)" : "text-muted", open && "rotate-180")} />}
        </>
      )}
    </>
  );
  const base = cn("flex min-h-12 min-w-0 items-center gap-2.5 rounded-[12px] p-1.5 pe-2.5", compact && "size-12 justify-center p-0", className);
  const label = `${L.apps}: ${currentApp.name}${company ? `, ${nameOf(company)}` : ""}`;

  const trigger = !interactive || loading ? (
    <div className={cn(base, sidebar && "text-(--sb-fg)")} aria-busy={loading || undefined} aria-label={loading ? undefined : label} role={loading ? undefined : "group"}>{triggerInner}</div>
  ) : (
    <button
      ref={btn} type="button" onClick={() => (open ? hide() : show())}
      aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={compact ? label : undefined}
      className={cn(base, "transition-colors", sidebar ? "text-(--sb-fg) hover:bg-(--sb-hover)" : "border border-line bg-ground hover:border-primary")}
    >
      {triggerInner}
    </button>
  );

  // ---- panel ----
  const groups = [
    { id: "core", label: L.core, items: list.filter((x) => coreApps.includes(x.app.key)) },
    { id: "mod", label: L.modules, items: list.filter((x) => !coreApps.includes(x.app.key)) },
  ].filter((g) => g.items.length > 0);
  const detailApp = detail ? list.find((x) => x.app.key === detail) : undefined;
  const blurb = (k: AppKey) => blurbs?.[k] ?? APPS.find((a) => a.key === k)?.blurb ?? "";

  function tile({ app, status }: SwitcherApp, i: number) {
    const isCurrent = app.key === current && status === "on";
    const chip =
      isCurrent ? <span className="rounded-full bg-primary px-2 py-1 text-[13px] font-semibold leading-none text-white">{L.current}</span>
      : status === "soon" ? <span className="rounded-full border border-line-strong px-2 py-1 text-[13px] leading-none text-muted">{L.soon}</span>
      : status === "locked" ? <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[13px] font-semibold leading-none text-warning-ink"><Lock className="size-3" aria-hidden="true" />{app.tier === "premium" ? L.premium : L.addon}</span>
      : null;
    const inner = (
      <>
        <AppIcon app={app.key} size={56} dim={status === "soon"} className="transition-transform duration-200 group-hover:-translate-y-0.5" />
        <span className="flex min-w-0 flex-col items-center gap-1.5 leading-tight">
          <span className="max-w-full truncate font-semibold">{app.name.replace(/^UPLIF /, "")}</span>
          {chip}
        </span>
        <span className="sr-only">{blurb(app.key)}</span>
      </>
    );
    const cls = cn(
      "group flex min-w-0 flex-col items-center gap-2 rounded-card border border-transparent px-1.5 pb-2.5 pt-3 text-center transition-[background-color,border-color,transform] duration-150 animate-[uplif-in_0.28s_ease-out_both]",
      status === "soon" ? "cursor-default" : "hover:border-line hover:bg-ground active:scale-[0.97]",
      isCurrent && "border-primary bg-primary-soft",
    );
    const common = { "data-app": app.key, "data-hint": `${app.name}: ${blurb(app.key)}`, className: cls, style: { animationDelay: `${40 + i * 35}ms` } };
    if (status === "soon") return <button key={app.key} type="button" aria-disabled="true" {...common}>{inner}</button>;
    if (status === "locked") return <button key={app.key} type="button" onClick={() => setDetail(app.key)} {...common}>{inner}</button>;
    if (isCurrent) return <button key={app.key} type="button" aria-current="true" onClick={() => hide()} {...common}>{inner}</button>;
    return <a key={app.key} href={app.url} {...common}>{inner}</a>;
  }

  let body;
  if (loading) {
    body = (
      <div aria-busy="true" className="grid grid-cols-3 gap-1.5 p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 px-1.5 pb-2.5 pt-3">
            <span className="size-14 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-[23%] bg-line" />
            <span className="h-3.5 w-14 animate-[uplif-pulse_1.2s_ease-in-out_infinite] rounded-full bg-line" />
          </div>
        ))}
      </div>
    );
  } else if (detailApp) {
    const a = detailApp.app;
    body = (
      <div className="flex animate-[uplif-in_0.25s_ease-out] flex-col items-start gap-3 p-4">
        <div className="flex items-center gap-3">
          <AppIcon app={a.key} size={72} />
          <div className="flex flex-col items-start gap-1.5">
            <h3 className="text-xl font-semibold leading-tight">{a.name}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-1 text-[13px] font-semibold leading-none text-warning-ink"><Lock className="size-3" aria-hidden="true" />{a.tier === "premium" ? L.premium : L.addon}</span>
          </div>
        </div>
        <p>{blurb(a.key)}. {a.tier === "premium" ? L.lockedPremium : L.lockedAddon}</p>
        <div className="flex flex-wrap items-center gap-2">
          {canManagePlan && plansHref
            ? <a href={plansHref} className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 font-semibold text-white transition-transform hover:bg-primary-hover active:scale-[0.97]">{L.seePlans}</a>
            : <span className="rounded-full border border-line-strong px-3 py-2 text-muted">{L.askOwner}</span>}
          <button type="button" onClick={() => setDetail(null)} className="inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 font-semibold transition-transform hover:border-primary active:scale-[0.97]">{L.back}</button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4 p-4 pt-1">
        {company && (
          <div className="animate-[uplif-in_0.28s_ease-out_both]">
            {companies.length > 1 ? (
              <button type="button" aria-expanded={coOpen} aria-label={`${L.switchCompany}: ${nameOf(company)}`} onClick={() => setCoOpen(!coOpen)}
                className="flex min-h-14 w-full items-center gap-3 rounded-card border border-line bg-ground p-2.5 text-start transition-colors hover:border-primary">
                <CompanyRow label={L.company} name={nameOf(company)} chev open={coOpen} />
              </button>
            ) : (
              <div className="flex min-h-14 items-center gap-3 rounded-card border border-line bg-ground p-2.5"><CompanyRow label={L.company} name={nameOf(company)} /></div>
            )}
            {coOpen && (
              <ul role="listbox" aria-label={L.switchCompany} className="mt-1.5 flex animate-[uplif-in_0.2s_ease-out] flex-col gap-0.5">
                {companies.map((c) => (
                  <li key={c.id} role="option" aria-selected={c.active}>
                    <button type="button" onClick={() => pickCompany(c.id, c.active)} className="flex min-h-12 w-full items-center gap-3 rounded-control px-3 text-start hover:bg-ground">
                      <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-primary-soft font-bold text-link">{nameOf(c).charAt(0)}</span>
                      <span className="min-w-0 flex-1 truncate">{nameOf(c)}</span>
                      {c.active && <Check className="size-4.5 text-link" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {groups.length === 0 ? (
          <div className="flex animate-[uplif-in_0.3s_ease-out] flex-col items-center gap-2 px-2 py-5 text-center">
            <b className="text-lg">{L.noApps}</b>
            <p className="max-w-[36ch] text-muted">{L.noAppsBody}</p>
          </div>
        ) : groups.map((g, gi) => (
          <section key={g.id} aria-label={g.label}>
            <h4 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted [&:lang(km)]:normal-case [&:lang(km)]:tracking-normal">{g.label}</h4>
            <div className="grid grid-cols-3 gap-1.5">{g.items.map((x, i) => tile(x, gi * 3 + i))}</div>
          </section>
        ))}
      </div>
    );
  }

  const hintRef = useRef<HTMLDivElement>(null);
  function setHint(e: React.SyntheticEvent) {
    const el = (e.target as HTMLElement).closest?.("[data-hint]") as HTMLElement | null;
    if (hintRef.current) hintRef.current.textContent = el?.dataset.hint ?? L.hint;
  }

  return (
    <>
      {trigger}
      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[60] animate-[uplif-fade_0.2s_ease-out] bg-black/50" aria-hidden="true" onClick={() => hide()} />
          <div
            ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKey} onMouseOver={setHint} onFocus={setHint}
            style={{ "--sw-left": `${pos.left}px`, "--sw-top": `${pos.top}px`, "--sw-max": `${pos.max}px` } as React.CSSProperties}
            className={cn(
              "fixed inset-x-0 bottom-0 z-[61] flex max-h-[86dvh] animate-[uplif-slide-up_0.28s_cubic-bezier(.2,.8,.2,1)] flex-col overflow-hidden rounded-t-[22px] border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] text-ink shadow-pop",
              "md:inset-x-auto md:bottom-auto md:left-(--sw-left) md:top-(--sw-top) md:max-h-(--sw-max) md:w-[440px] md:animate-[uplif-in_0.2s_ease-out] md:rounded-card md:border",
            )}
          >
            <span aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong md:hidden" />
            <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-3">
              <h3 id={titleId} className="text-lg font-semibold">{L.apps}</h3>
              <button type="button" onClick={() => hide()} aria-label={L.close} className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-ground">
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{body}</div>
            {!loading && !detail && groups.length > 0 && (
              <div ref={hintRef} aria-hidden="true" className="hidden min-h-11 shrink-0 items-center border-t border-line bg-ground px-4 text-sm text-muted md:flex">{L.hint}</div>
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function CompanyRow({ label, name, chev, open }: { label: string; name: string; chev?: boolean; open?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary-soft font-bold text-link">{name.charAt(0)}</span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <small className="text-[13px] text-muted">{label}</small>
        <b className="truncate font-semibold">{name}</b>
      </span>
      {chev && <ChevronDown aria-hidden="true" className={cn("size-[18px] shrink-0 text-muted transition-transform duration-200", open && "rotate-180")} />}
    </>
  );
}
