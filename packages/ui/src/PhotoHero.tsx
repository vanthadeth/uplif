"use client";
import { useRef, type ReactNode } from "react";
import { Camera, Trash2 } from "lucide-react";

/**
 * A person's photo filling the whole card, with their name and role over the bottom of it.
 * A black fade (multiply, clear at the top, solid black at the bottom) keeps the white text readable on any photo. With no
 * photo it is a shorter flat dark card with no initials. Camera and bin buttons sit top right; the caller does the upload.
 * `compact` is the scrolled state: the photo is hidden and a short dark bar keeps the name, role and tenure in view.
 */
export function PhotoHero({ name, src, title, subtitle, children, compact, busy, changeLabel, removeLabel, onPick, onRemove }: {
  name: string; src?: string; title: string; subtitle?: ReactNode; children?: ReactNode; compact?: boolean; busy?: boolean;
  changeLabel: string; removeLabel: string; onPick: (file: File) => void; onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const btn = "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  const fade = (h: string) => <span aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 ${h} bg-linear-to-b from-transparent to-black mix-blend-multiply`} />;
  return (
    <div className={`relative isolate w-full overflow-hidden rounded-3xl bg-navy text-white transition-[height] duration-200 ${compact ? "h-28" : src ? "aspect-4/5 max-h-[62dvh]" : "h-58"}`} aria-busy={busy}>
      {src && !compact && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className={`absolute inset-0 -z-10 size-full object-cover transition-opacity ${busy ? "opacity-60" : ""}`} />
      )}
      {compact ? fade("h-[70%]") : fade("h-[52%]")}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      {!compact && (
        <div className="absolute end-3 top-3 flex gap-2">
          {src && onRemove && <button type="button" aria-label={removeLabel} disabled={busy} onClick={onRemove} className={btn}><Trash2 className="size-5" aria-hidden /></button>}
          <button type="button" aria-label={changeLabel} disabled={busy} onClick={() => input.current?.click()} className={btn}><Camera className="size-5" aria-hidden /></button>
        </div>
      )}
      <div className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 ${compact ? "p-4" : "p-5"}`}>
        <h1 className={`m-0 font-bold leading-tight tracking-tight [overflow-wrap:anywhere] transition-[font-size] duration-200 ${compact ? "truncate text-[22px]" : "text-[34px]"}`}>{title}</h1>
        {subtitle && <p className={`m-0 text-white/90 ${compact ? "truncate text-sm" : ""}`}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
