"use client";
import {
  Children, Fragment, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type ReactElement, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { SHEET_SLIDE, SheetSkeleton, useSheetReady } from "./Sheet";
import { FieldShell, control } from "./Field";

interface Opt { value: string; text: string; disabled: boolean }

function textOf(n: ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children);
  return "";
}

/** Reads <option> children so callers keep writing plain options. */
function parseOptions(children: ReactNode): Opt[] {
  const out: Opt[] = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (c) => {
      if (!isValidElement(c)) return;
      const el = c as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
      if (el.type === Fragment) return walk(el.props.children);
      if (el.type === "option") {
        const text = textOf(el.props.children);
        out.push({ value: el.props.value != null ? String(el.props.value) : text, text, disabled: !!el.props.disabled });
      }
    });
  };
  walk(children);
  return out;
}

export interface SelectChange { target: { value: string; name?: string } }

export interface SelectProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (e: SelectChange) => void;
  children?: ReactNode;
  /** No visible label (e.g. inside a table row); `label` is then the accessible name. */
  bare?: boolean;
}

function useIsSheet() {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 639px)");
    const on = () => setSheet(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return sheet;
}

/**
 * Shared select. Large screens: a dropdown menu under the field. Small screens: a bottom sheet.
 * Combobox + listbox pattern: focus stays on the button, arrows move the highlighted option.
 */
export function Select({ label, hint, error, id, name, className, disabled, required, value, defaultValue, onChange, children, bare }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  const listId = `${fid}-list`;
  const options = useMemo(() => parseOptions(children), [children]);
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const selected = options.find((o) => o.value === current);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const sheet = useIsSheet();
  const slid = useSheetReady(open);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: "", t: 0 });
  const [host, setHost] = useState<Element | null>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null);

  const openList = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === current && !o.disabled);
    setActive(i >= 0 ? i : Math.max(0, options.findIndex((o) => !o.disabled)));
    // A modal <dialog> makes everything outside it inert, so the list is rendered inside the dialog when there is one.
    setHost(btn.current?.closest("dialog") ?? document.body);
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);
  const choose = (o: Opt) => {
    if (o.disabled) return;
    if (value === undefined) setInner(o.value);
    onChange?.({ target: { value: o.value, name } });
    setOpen(false);
    btn.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || sheet || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 4;
    const edge = 8;
    const below = vh - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    const up = below < 180 && above > below;
    const width = Math.min(Math.max(r.width, 160), vw - edge * 2);
    const left = Math.min(Math.max(edge, r.left), vw - edge - width);
    setPos({ left, width, max: Math.max(120, Math.min(320, up ? above : below)), ...(up ? { bottom: vh - r.top + gap } : { top: r.bottom + gap }) });
  }, [open, sheet]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (list.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    const scroll = (e: Event) => { if (!list.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", down);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open, close]);

  useEffect(() => {
    const ul = list.current;
    const el = open ? ul?.querySelector<HTMLElement>(`[data-i="${active}"]`) : null;
    if (!ul || !el) return;
    // Scroll the list itself only, so the page behind never moves.
    if (el.offsetTop < ul.scrollTop) ul.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = el.offsetTop + el.offsetHeight - ul.clientHeight;
  }, [open, active, pos, slid]);

  const move = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const k = e.key;
    if (!open) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") { e.preventDefault(); openList(); }
      return;
    }
    if (k === "ArrowDown") { e.preventDefault(); setActive((a) => move(a, 1)); }
    else if (k === "ArrowUp") { e.preventDefault(); setActive((a) => move(a, -1)); }
    else if (k === "Home") { e.preventDefault(); setActive(move(-1, 1)); }
    else if (k === "End") { e.preventDefault(); setActive(move(options.length, -1)); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (k === "Tab") close();
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey) {
      const now = Date.now();
      typed.current.s = now - typed.current.t > 700 ? k.toLowerCase() : typed.current.s + k.toLowerCase();
      typed.current.t = now;
      const q = typed.current.s;
      const hit = options.findIndex((o) => !o.disabled && o.text.toLowerCase().startsWith(q));
      if (hit >= 0) setActive(hit);
    }
  };

  const aid = (i: number) => `${fid}-o${i}`;
  const items = options.map((o, i) => {
    const sel = o.value === current;
    return (
      <li
        key={o.value + i}
        id={aid(i)}
        data-i={i}
        role="option"
        aria-selected={sel}
        aria-disabled={o.disabled || undefined}
        onPointerMove={() => !o.disabled && setActive(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(o)}
        className={cn(
          "flex cursor-pointer items-center justify-between gap-3 px-3 text-ink",
          sheet ? "min-h-12 text-base" : "min-h-9 text-sm",
          i === active && "bg-primary-soft",
          sel && "font-semibold text-primary-ink",
          o.disabled && "cursor-not-allowed text-muted",
        )}
      >
        <span className="truncate">{o.text}</span>
        {sel && <Check className="size-4 shrink-0" aria-hidden="true" />}
      </li>
    );
  });

  const ul = (
    <ul
      ref={list}
      id={listId}
      role="listbox"
      aria-label={label}
      className={cn(
        "overflow-y-auto py-1",
        sheet
          ? "relative max-h-[60dvh] overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))]"
          : "fixed z-[100] rounded-control border border-line bg-surface shadow-pop",
      )}
      style={sheet ? undefined : pos ? { left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.max } : { visibility: "hidden" }}
    >
      {items}
    </ul>
  );

  const trigger = (
    <button
      ref={btn}
      id={fid}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? aid(active) : undefined}
      aria-label={bare ? label : undefined}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error || hint ? `${fid}-msg` : undefined}
      disabled={disabled}
      onClick={() => (open ? close() : openList())}
      onKeyDown={onKey}
      className={cn(control, "flex items-center justify-between gap-2 pe-3 text-start", error ? "border-danger" : "border-line-strong", bare && "h-9", className)}
    >
      <span className={cn("truncate", !selected && "text-muted")}>{selected?.text ?? ""}</span>
      <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden="true" />
    </button>
  );

  const body = (
    <div className="relative">
      {trigger}
      {name && <input type="hidden" name={name} value={current} />}
    </div>
  );

  const layer = open && host ? createPortal(
    sheet ? (
      <div className="fixed inset-0 z-[100] flex items-end bg-navy/50" onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className={cn("w-full rounded-t-card bg-surface pb-2 shadow-pop", SHEET_SLIDE)}>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          <div className="px-4 pb-1 pt-3 text-[14px] font-semibold text-muted">{label}</div>
          {slid ? ul : <SheetSkeleton rows={Math.min(options.length, 6)} className="px-4 pb-6 pt-2" />}
        </div>
      </div>
    ) : ul,
    host,
  ) : null;

  if (bare) return <>{body}{layer}</>;
  return <><FieldShell label={label} hint={hint} error={error} id={fid}>{body}</FieldShell>{layer}</>;
}
