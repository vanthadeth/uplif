"use client";
import { useRef, type ReactNode } from "react";
import { Camera, Trash2 } from "lucide-react";

/**
 * A person's photo filling the whole card, with their name and role over the bottom of it.
 * A black fade (multiply, clear at the top, solid black at the bottom) keeps the white text readable on any photo. With no
 * photo it is a shorter flat dark card with no initials. Camera and bin buttons sit top right; the caller does the upload.

 */
export function PhotoHero({ name, src, title, subtitle, children, busy, changeLabel, removeLabel, onPick, onRemove }: {
  name: string; src?: string; title: string; subtitle?: ReactNode; children?: ReactNode; busy?: boolean;
  changeLabel: string; removeLabel: string; onPick: (file: File) => void; onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const btn = "grid size-11 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
  const fade = (h: string) => <span aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 ${h} bg-linear-to-b from-transparent to-black mix-blend-multiply`} />;
  return (
    <div className={`relative isolate w-full overflow-hidden rounded-3xl bg-navy text-white ${src ? "aspect-4/5 max-h-[62dvh]" : "h-58"}`} aria-busy={busy}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className={`absolute inset-0 -z-10 size-full object-cover transition-opacity ${busy ? "opacity-60" : ""}`} />
      )}
      {fade("h-[52%]")}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      <div className="absolute end-3 top-3 flex gap-2">
        {src && onRemove && <button type="button" aria-label={removeLabel} disabled={busy} onClick={onRemove} className={btn}><Trash2 className="size-5" aria-hidden /></button>}
        <button type="button" aria-label={changeLabel} disabled={busy} onClick={() => input.current?.click()} className={btn}><Camera className="size-5" aria-hidden /></button>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5">
        <h1 className="m-0 text-[36px] font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{title}</h1>
        {subtitle && <p className="m-0 text-white/90">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
