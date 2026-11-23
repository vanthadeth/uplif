import type { ReactNode } from "react";
import { cn } from "./cn";

/** A product tile: icon, name and one line. `soon` draws it dashed for apps that are not built yet. */
export function AppTile({ icon, name, blurb, soon, badge, className }: {
  icon: ReactNode; name: string; blurb: string; soon?: boolean; badge?: ReactNode; className?: string;
}) {
  return (
    <div className={cn(
      "flex h-full flex-col gap-3 rounded-card border bg-surface p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop",
      soon ? "border-dashed border-line-strong" : "border-line", className,
    )}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex gap-2">{icon}</span>
        {badge}
      </div>
      <b className="text-lg font-semibold">{name}</b>
      <span className="leading-relaxed text-muted">{blurb}</span>
    </div>
  );
}
