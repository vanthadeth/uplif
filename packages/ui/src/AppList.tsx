import { appIconUrl, type AppInfo } from "./apps";
import { cn } from "./cn";

/**
 * The apps a person can open, one row each: icon, name, one line, and an Open button. Presentational, so
 * every app can use it with its own translated text (`blurbs` maps an app key to its description).
 * Each app is installed from its own address: opening it shows the browser's Add to Home Screen option.
 */
export function AppList({ apps, openLabel, blurbs, className }: {
  apps: readonly AppInfo[]; openLabel: string; blurbs?: Partial<Record<string, string>>; className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {apps.map((a) => (
        <li key={a.key} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appIconUrl(a)} alt="" width={48} height={48} className="size-12 shrink-0 rounded-control" />
          <span className="min-w-0 flex-1 leading-snug">
            <b className="block break-words font-semibold">{a.name}</b>
            <span className="block text-sm text-muted">{blurbs?.[a.key] ?? a.blurb}</span>
          </span>
          <a href={a.url} target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-transform active:scale-[0.97]">
            {openLabel}
          </a>
        </li>
      ))}
    </ul>
  );
}
