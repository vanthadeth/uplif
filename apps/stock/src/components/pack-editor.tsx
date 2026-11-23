"use client";
import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Button, Input } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { blankPackRow, MAX_PACKS, MEASURES, type Measure, type PackRow } from "@/lib/packs";

const LABEL: Record<Measure, MessageKey> = { length_cm: "sk.pack.length", width_cm: "sk.pack.width", height_cm: "sk.pack.height", gross_kg: "sk.pack.gross", net_kg: "sk.pack.net" };

/** The pack list of an item or a variant: name, units, and an optional carton size and weight per pack. */
export function PackEditor({ rows, onChange, error }: { rows: PackRow[]; onChange: (rows: PackRow[]) => void; error?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(null);
  const edit = (n: number, k: keyof PackRow, v: string) => onChange(rows.map((r, i) => (i === n ? { ...r, [k]: v } : r)));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, n) => {
        const hasMeasure = MEASURES.some((m) => r[m].trim());
        return (
          <div key={n} className="flex flex-col gap-2 rounded-card border border-line p-3">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1"><Input label={t("sk.item.packName")} value={r.name} maxLength={40} onChange={(e) => edit(n, "name", e.target.value)} /></div>
              <div className="w-24 shrink-0"><Input label={t("sk.item.packQty")} type="number" inputMode="numeric" min={2} step={1} value={r.qty} onChange={(e) => edit(n, "qty", e.target.value)} /></div>
              <button type="button" aria-label={t("sk.item.packRemove")} onClick={() => { onChange(rows.filter((_, i) => i !== n)); setOpen(null); }}
                className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft"><X className="size-5" aria-hidden /></button>
            </div>
            <button type="button" aria-expanded={open === n} onClick={() => setOpen(open === n ? null : n)}
              className="flex min-h-11 items-center gap-1 self-start font-semibold text-link">
              {t("sk.pack.measure")}{hasMeasure && <span className="size-2 rounded-full bg-primary" aria-hidden />}
              <ChevronDown className={`size-4 transition-transform ${open === n ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {open === n && (
              <div className="grid grid-cols-2 gap-3">
                {MEASURES.map((m) => (
                  <Input key={m} label={t(LABEL[m])} type="number" inputMode="decimal" min={0} step="any" value={r[m]} onChange={(e) => edit(n, m, e.target.value)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {error && <p role="alert" className="text-danger">{error}</p>}
      {rows.length < MAX_PACKS && <Button onClick={() => onChange([...rows, blankPackRow()])}><Plus className="size-[18px]" aria-hidden />{t("sk.item.packAdd")}</Button>}
    </div>
  );
}
