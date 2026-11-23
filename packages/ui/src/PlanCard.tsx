import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";

/** A pricing card: name, price, a second price line, and a feature list. Presentational, so any app can show a plan. */
export function PlanCard({ name, price, period, altPrice, features, highlight, badge, action, className }: {
  name: string; price: string; period?: string; altPrice?: string; features: readonly string[];
  highlight?: boolean; badge?: ReactNode; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn(
      "flex h-full flex-col gap-3 rounded-card bg-surface p-7",
      highlight ? "border-2 border-primary" : "border border-line", className,
    )}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">{name}</h3>
        {badge}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        {period && <span className="text-muted">{period}</span>}
      </div>
      {altPrice && <span className="text-muted">{altPrice}</span>}
      <ul className="mt-1 flex flex-1 flex-col gap-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
}
