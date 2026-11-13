import type { ElementType, ReactNode } from "react";
import { cn } from "./cn";

/**
 * A tile for a hub page: icon, title, one line of status, and an optional alert dot.
 * Pass the app's router link as `as` (for example next/link) so navigation stays client-side.
 */
export function HubTile({ href, icon, title, sub, alert, as: As = "a", className }: {
  href: string; icon: ReactNode; title: string; sub?: string; alert?: boolean; as?: ElementType; className?: string;
}) {
  return (
    <As href={href} className={cn("relative flex min-h-32 flex-col gap-3 rounded-card border border-line bg-surface p-4 transition-[background-color,transform] hover:bg-ground active:scale-[0.98]", className)}>
      <span className="grid size-11 place-items-center rounded-control bg-primary-soft text-link" aria-hidden>{icon}</span>
      <span className="min-w-0">
        <b className="block break-words leading-snug">{title}</b>
        {sub && <span className="mt-0.5 block text-sm text-muted">{sub}</span>}
      </span>
      {alert && <span className="absolute end-3 top-3 size-3 rounded-full bg-warning" aria-hidden />}
    </As>
  );
}
