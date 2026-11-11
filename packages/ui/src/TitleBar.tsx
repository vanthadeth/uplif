"use client";
import { Bell, Plus, Search } from "lucide-react";
import { Avatar } from "./Avatar";

/**
 * Title bar: greeting, then the controls. Search and notifications have no backing feature yet, so they show
 * as disabled placeholders (no fake data). The primary action only appears when the user may use it.
 */
export function TitleBar({ name, greeting, searchLabel, notifLabel, soonLabel, action }: {
  name: string; greeting: string; searchLabel: string; notifLabel: string; soonLabel: string;
  action?: { label: string; onClick: () => void };
}) {
  const inert = "inline-flex size-11 shrink-0 cursor-not-allowed items-center justify-center rounded-control text-muted opacity-60";
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-2">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar name={name || "?"} size="lg" />
        <div className="min-w-0 leading-snug">
          <div className="truncate text-base font-semibold">{name}</div>
          <div className="truncate text-[13px] text-muted">{greeting}</div>
        </div>
      </div>
      <button type="button" aria-disabled="true" aria-label={`${searchLabel} (${soonLabel})`} title={`${searchLabel}: ${soonLabel}`} className={inert}>
        <Search className="size-5" aria-hidden="true" />
      </button>
      <button type="button" aria-disabled="true" aria-label={`${notifLabel} (${soonLabel})`} title={`${notifLabel}: ${soonLabel}`} className={inert}>
        <Bell className="size-5" aria-hidden="true" />
      </button>
      {action && (
        <button
          type="button" onClick={action.onClick}
          className="ms-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-4 font-semibold text-white transition-colors hover:bg-primary-hover max-sm:px-3"
        >
          <Plus className="size-[18px]" aria-hidden="true" /><span className="max-sm:sr-only">{action.label}</span>
        </button>
      )}
    </div>
  );
}
