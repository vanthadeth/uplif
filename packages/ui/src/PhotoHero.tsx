"use client";
import { useRef, type ReactNode } from "react";
import { Camera, Trash2 } from "lucide-react";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [parts[0] ?? "?"];
  return chars.map((p) => Array.from(p)[0]).join("").toUpperCase();
}

/**
 * A person's photo filling the whole card, with their name and role over the bottom of it.
 * With no photo it shows a flat dark card with their initials. Camera and bin buttons sit top right; the caller does the upload.
 * `compact` is the scrolled state: a 4:3 card with a smaller name and nothing else.
 */
export function PhotoHero({ name, src, title, subtitle, children, compact, busy, changeLabel, removeLabel, onPick, onRemove }: {
  name: string; src?: string; title: string; subtitle?: ReactNode; children?: ReactNode; compact?: boolean; busy?: boolean;
  changeLabel: string; removeLabel: string; onPick: (file: File) => void; onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const btn = "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  return (
    <div className={`relative isolate w-full overflow-hidden rounded-3xl bg-navy text-white ${compact ? "aspect-4/3" : "aspect-4/5 max-h-[62dvh]"}`} aria-busy={busy}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className={`absolute inset-0 -z-10 size-full object-cover transition-opacity ${busy ? "opacity-60" : ""}`} />
      ) : (
        <span aria-hidden className={`absolute inset-0 -z-10 grid place-items-center font-bold text-white/25 ${compact ? "pb-10 text-7xl" : "text-8xl"}`}>{initials(name)}</span>
      )}
      {/* A flat dark layer keeps the white text readable on any photo. */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-black/35" />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      <div className="absolute end-3 top-3 flex gap-2">
        {src && onRemove && <button type="button" aria-label={removeLabel} disabled={busy} onClick={onRemove} className={btn}><Trash2 className="size-5" aria-hidden /></button>}
        <button type="button" aria-label={changeLabel} disabled={busy} onClick={() => input.current?.click()} className={btn}><Camera className="size-5" aria-hidden /></button>
      </div>
      <div className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 ${compact ? "p-4" : "p-5"}`}>
        <h1 className={`m-0 font-bold leading-tight tracking-tight [overflow-wrap:anywhere] transition-[font-size] duration-200 ${compact ? "truncate text-2xl" : "text-4xl"}`}>{title}</h1>
        {!compact && subtitle && <p className="m-0 text-white/90">{subtitle}</p>}
        {!compact && children}
      </div>
    </div>
  );
}
