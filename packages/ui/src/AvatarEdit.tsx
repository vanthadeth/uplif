"use client";
import { useRef } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Avatar } from "./Avatar";

/** An avatar with a camera button to choose a new picture and, when there is one, a button to remove it. The caller does the upload. */
export function AvatarEdit({ name, src, size = "lg", changeLabel, removeLabel, busy, onPick, onRemove }: {
  name: string; src?: string; size?: "lg" | "xl"; changeLabel: string; removeLabel: string; busy?: boolean;
  onPick: (file: File) => void; onRemove?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="relative shrink-0" aria-busy={busy}>
      <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}><Avatar name={name} src={src} size={size} /></div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
      <button type="button" aria-label={changeLabel} disabled={busy} onClick={() => input.current?.click()}
        className="absolute -bottom-1 -end-1 grid size-7 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm transition-colors hover:bg-primary-soft disabled:opacity-50">
        <Camera className="size-4" aria-hidden />
      </button>
      {src && onRemove && (
        <button type="button" aria-label={removeLabel} disabled={busy} onClick={onRemove}
          className="absolute -start-1 -top-1 grid size-6 place-items-center rounded-full border border-line bg-surface text-muted shadow-sm transition-colors hover:bg-danger-soft disabled:opacity-50">
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
