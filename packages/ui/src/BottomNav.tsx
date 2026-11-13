import type { ComponentType, ReactNode } from "react";
import { cn } from "./cn";

export interface BottomNavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Raised round button in the middle (use for at most one item). */
  centre?: boolean;
  /** Small number on the icon, such as unread items. */
  badge?: number;
}

export interface BottomNavProps {
  label: string;
  items: BottomNavItem[];
  /** The current path; an item is active when it matches or the path is inside it. "/" matches only itself. */
  path: string;
  /** Pass the router's Link so taps stay inside the app. Defaults to a plain anchor. */
  linkAs?: ComponentType<{ href: string; className?: string; "aria-current"?: "page"; children: ReactNode }>;
}

/** Bottom navigation for phone apps: up to five items, one optionally raised in the centre. Fixed to the screen edge and clear of the home indicator. */
export function BottomNav({ label, items, path, linkAs: As = "a" as never }: BottomNavProps) {
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label={label} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label: text, icon: Icon, centre, badge }) => {
          const on = active(href);
          return (
            <li key={href}>
              <As href={href} aria-current={on ? "page" : undefined}
                className={cn("relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors", on ? "text-link" : "text-muted")}>
                {centre ? (
                  <span className={cn("-mt-6 grid size-14 place-items-center rounded-full border-4 border-surface shadow-pop transition-transform active:scale-95", on ? "bg-primary text-white" : "bg-primary-soft text-primary-ink")}>
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className="size-6" aria-hidden />
                    {badge ? <span aria-hidden className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">{badge > 9 ? "9+" : badge}</span> : null}
                  </span>
                )}
                {text}
              </As>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
