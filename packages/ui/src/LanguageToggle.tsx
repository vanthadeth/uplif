"use client";
import { cn } from "./cn";

export interface LangOption { id: string; label: string }

export function LanguageToggle({ label, options, value, onChange }: { label: string; options: LangOption[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          lang={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("min-h-9 rounded-md px-3 font-semibold", value === o.id ? "bg-primary text-white" : "text-ink-2 hover:bg-ground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
