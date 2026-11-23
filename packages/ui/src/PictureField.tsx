"use client";
import { useRef } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "./cn";

/**
 * One picture with buttons to add, change and remove it. Shared by every list that carries a picture (brands,
 * categories, items, variants). It only picks the file and shows the result; the caller shrinks and uploads it.
 */
export function PictureField({ label, hint, error, src, alt = "", addLabel, changeLabel, removeLabel, busy, onPick, onRemove, className }: {
  label: string; hint?: string; error?: string; src?: string | null; alt?: string;
  addLabel: string; changeLabel: string; removeLabel: string; busy?: boolean;
  onPick: (file: File) => void; onRemove?: () => void; className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("flex flex-col gap-1.5", className)} aria-busy={busy}>
      <span className="text-[14px] font-semibold text-ink-2">{label}</span>
      <div className="flex items-center gap-4">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label={src ? changeLabel : addLabel}
          className="relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-card border border-dashed border-line-strong bg-ground text-muted transition-colors hover:bg-primary-soft disabled:opacity-60">
          {src ? <img src={src} alt={alt} className="size-full object-cover" /> : <ImagePlus className="size-8" aria-hidden />}
          {busy && <span className="absolute inset-0 grid place-items-center bg-surface/70"><Loader2 className="size-6 animate-[uplif-spin_0.8s_linear_infinite]" aria-hidden /></span>}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
        <div className="flex min-w-0 flex-col items-start gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 font-semibold transition-colors hover:bg-primary-soft disabled:opacity-60">
            <ImagePlus className="size-[18px]" aria-hidden />{src ? changeLabel : addLabel}
          </button>
          {src && onRemove && (
            <button type="button" disabled={busy} onClick={onRemove}
              className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 font-semibold text-danger-ink transition-colors hover:bg-danger-soft disabled:opacity-60">
              <Trash2 className="size-[18px]" aria-hidden />{removeLabel}
            </button>
          )}
        </div>
      </div>
      {error ? <span role="alert" className="text-xs text-danger-ink">{error}</span> : hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
