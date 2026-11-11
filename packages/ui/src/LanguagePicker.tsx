"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronsUpDown, Languages, Users } from "lucide-react";
import { cn } from "./cn";

export interface LanguageOption {
  code: string;
  /** Name in its own language, shown large. */
  native: string;
  /** English name, shown small. */
  english: string;
  /** Replaces the English name when set, for example "English for now". */
  note?: string;
}

interface Props {
  label: string;
  value: string;
  options: LanguageOption[];
  onChange: (code: string) => void;
  /** The "More languages" call to action under the list, and what it does (for example open the translation community). */
  moreLabel?: string;
  onMore?: () => void;
  /** Short help line under the call to action. */
  footer?: ReactNode;
  /** row: sidebar row (menu opens above). rail: icon only (menu opens to the side). button: compact bordered button (menu opens below). */
  variant?: "row" | "rail" | "button";
}

/** A language popup: a short list of featured languages, then a "More languages" call to action for the rest. */
export function LanguagePicker({ label, value, options, onChange, moreLabel, onMore, footer, variant = "row" }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const current = options.find((o) => o.code === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [open]);

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }
  function move(from: Element | null, dir: 1 | -1) {
    const items = Array.from(box.current?.querySelectorAll<HTMLElement>('[role="option"], [data-more]') ?? []);
    if (items.length === 0) return;
    const i = from ? items.indexOf(from as HTMLElement) : -1;
    const next = i === -1 ? (dir === 1 ? 0 : items.length - 1) : Math.min(items.length - 1, Math.max(0, i + dir));
    items[next].focus();
  }
  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(document.activeElement, 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(document.activeElement, -1); }
  }

  const pop = {
    row: "inset-x-0 bottom-[calc(100%+6px)]",
    rail: "bottom-0 start-[calc(100%+12px)] w-64",
    button: "end-0 top-[calc(100%+6px)] w-64",
  }[variant];

  return (
    <div ref={box} className={cn("relative", variant === "row" && "w-full", variant === "rail" && "w-11")} onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${label}: ${current.native}`}
        title={variant === "rail" ? `${label}: ${current.native}` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          variant === "button"
            ? "inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 font-semibold text-ink hover:bg-ground"
            : "flex min-h-11 w-full items-center gap-3 rounded-[10px] border border-transparent px-3 text-start font-medium text-(--sb-muted) transition-colors hover:bg-(--sb-hover) hover:text-(--sb-fg)",
          variant === "rail" && "size-11 justify-center px-0",
        )}
      >
        <Languages className="size-5 shrink-0" aria-hidden="true" />
        {variant !== "rail" && <span lang={current.code} className="min-w-0 flex-1 truncate">{current.native}</span>}
        {variant === "row" && <ChevronsUpDown className="size-4 shrink-0 opacity-70" aria-hidden="true" />}
      </button>

      {open && (
        <div className={cn("absolute z-50 flex flex-col gap-1 rounded-card border p-1.5 shadow-pop animate-[uplif-in_120ms_ease-out]",
          variant === "button" ? "border-line-strong bg-surface text-ink" : "border-(--sb-pill-line) bg-(--sb-pill) text-(--sb-fg)", pop)}>
          <div ref={list} id={id} role="listbox" aria-label={label} className="flex max-h-[216px] flex-col gap-0.5 overflow-auto">
            {options.map((o) => {
              const on = o.code === value;
              return (
                <button
                  key={o.code}
                  type="button"
                  role="option"
                  lang={o.code}
                  aria-selected={on}
                  onClick={() => { onChange(o.code); close(); }}
                  className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-start",
                    variant === "button" ? "hover:bg-ground" : "hover:bg-(--sb-hover)",
                    on && (variant === "button" ? "bg-primary-soft font-semibold" : "bg-(--sb-acc-soft) font-semibold"))}
                >
                  <span className="min-w-0 flex-1 truncate">{o.native}</span>
                  <span lang="en" className={cn("text-xs", variant === "button" ? "text-muted" : "text-(--sb-muted)")}>{o.note ?? o.english}</span>
                  {on && <Check className="size-4 shrink-0 text-(--sb-acc)" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <div className={cn("mt-0.5 flex flex-col gap-0.5 border-t pt-1.5", variant === "button" ? "border-line" : "border-(--sb-line)")}>
            {moreLabel && onMore && <button
              type="button"
              data-more
              onClick={() => { onMore(); close(false); }}
              className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-start font-semibold text-(--sb-acc)", variant === "button" ? "hover:bg-ground" : "hover:bg-(--sb-hover)")}
            >
              <Users className="size-[18px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{moreLabel}</span>
              <ArrowRight className="size-[18px] shrink-0 rtl:rotate-180" aria-hidden="true" />
            </button>}
            {footer && <p className={cn("m-0 px-2.5 pb-1 pt-1 text-xs leading-snug", variant === "button" ? "text-muted" : "text-(--sb-muted)")}>{footer}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
