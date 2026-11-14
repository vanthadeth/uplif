"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp } from "lucide-react";
import { Badge, Button, SidePanel, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { IMPORT_TEMPLATE, buildRows, parseCsv, type ImportRow } from "@/lib/csv";

interface Named { id: string; name: string; name_local: string | null }

/** Import items from a CSV file: read it here, check every row, show what will happen, then save the good rows. */
export function ItemsImport({ open, onClose, companyId, currency, categories, brands, skus, barcodes }: {
  open: boolean; onClose: () => void; companyId: string; currency: string;
  categories: Named[]; brands: Named[]; skus: string[]; barcodes: string[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{ rows: ImportRow[]; missingName: boolean; tooMany: boolean } | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<number[]>([]);

  const good = useMemo(() => (parsed?.rows ?? []).filter((r) => r.errors.length === 0), [parsed]);
  const bad = useMemo(() => (parsed?.rows ?? []).filter((r) => r.errors.length > 0), [parsed]);

  function close() { if (busy) return; setParsed(null); setFileName(""); setReadError(false); setFailed([]); onClose(); }

  async function pick(file: File | undefined) {
    if (!file) return;
    setReadError(false); setFailed([]);
    try {
      const text = await file.text();
      setFileName(file.name);
      setParsed(buildRows(parseCsv(text), { categories, brands, existingSkus: skus, existingBarcodes: barcodes }));
    } catch { setParsed(null); setReadError(true); }
    if (input.current) input.current.value = "";
  }

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob(["﻿" + IMPORT_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "uplif-stock-items-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  async function run() {
    setBusy(true);
    const supabase = createClient();
    const lines: number[] = [];
    let saved = 0;
    for (let i = 0; i < good.length; i += 50) {
      const chunk = good.slice(i, i + 50);
      const values = chunk.map((r) => ({
        company_id: companyId, currency_code: currency, name: r.name, name_local: r.name_local, sku: r.sku, base_uom: r.base_uom,
        price: r.price, reorder_level: r.reorder_level, category_id: r.category_id, brand_id: r.brand_id,
      }));
      let ids: (string | null)[] = [];
      const all = await supabase.from("items").insert(values).select("id");
      if (!all.error && all.data?.length === chunk.length) ids = all.data.map((d) => d.id);
      else {
        // One bad row must not sink the other 49: save the chunk row by row.
        for (let k = 0; k < chunk.length; k++) {
          const one = await supabase.from("items").insert(values[k]).select("id");
          if (one.error || !one.data?.length) { lines.push(chunk[k].line); ids.push(null); } else ids.push(one.data[0].id);
        }
      }
      // The barcode lives on the item's hidden default variant.
      const withCode = chunk.map((r, k) => ({ r, id: ids[k] })).filter((x) => x.id && x.r.barcode);
      if (withCode.length) {
        const defs = await supabase.from("item_variants").select("id, item_id").eq("is_default", true).in("item_id", withCode.map((x) => x.id!));
        const variantOf = new Map((defs.data ?? []).map((d) => [d.item_id, d.id]));
        for (let k = 0; k < withCode.length; k += 8) {
          await Promise.all(withCode.slice(k, k + 8).map(async (x) => {
            const v = variantOf.get(x.id!);
            const res = v ? await supabase.from("item_variants").update({ barcode: x.r.barcode }).eq("id", v) : { error: true };
            if (res.error) lines.push(x.r.line);
          }));
        }
      }
      saved += ids.filter(Boolean).length;
    }
    setBusy(false);
    setFailed(lines);
    router.refresh();
    if (lines.length === 0) { toast("success", fill(t("sk.imp.done"), { n: saved })); close(); }
    else toast("error", fill(t("sk.imp.partial"), { n: saved, bad: lines.length, lines: lines.sort((a, b) => a - b).slice(0, 10).join(", ") }));
  }

  return (
    <SidePanel sheet open={open} onClose={close} closeLabel={t("sk.close")} title={t("sk.imp.title")}
      footer={<><Button onClick={close} disabled={busy}>{t("sk.cancel")}</Button>
        <Button variant="primary" loading={busy} disabled={good.length === 0} onClick={run}>{fill(t("sk.imp.run"), { n: good.length })}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-muted">{t("sk.imp.intro")}</p>
        <p className="break-words rounded-control bg-ground p-3 font-mono text-[13px] text-ink-2">{t("sk.imp.columns")}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={downloadTemplate}><Download className="size-[18px]" aria-hidden />{t("sk.imp.template")}</Button>
          <Button variant="primary" onClick={() => input.current?.click()}><FileUp className="size-[18px]" aria-hidden />{t("sk.imp.choose")}</Button>
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>
        {readError && <p role="alert" className="text-danger">{t("sk.imp.readError")}</p>}
        {parsed?.missingName && <p role="alert" className="text-danger">{t("sk.imp.noName")}</p>}
        {parsed && !parsed.missingName && (
          <div className="flex flex-col gap-3" role="status">
            <p><b>{fileName}</b></p>
            {parsed.rows.length === 0 ? <p className="text-muted">{t("sk.imp.none")}</p> : <p>{fill(t("sk.imp.summary"), { ok: good.length, bad: bad.length })}</p>}
            {parsed.tooMany && <p className="text-muted">{t("sk.imp.tooMany")}</p>}
            {bad.length > 0 && (
              <ul className="overflow-hidden rounded-card border border-line">
                {bad.slice(0, 50).map((r) => (
                  <li key={r.line} className="flex flex-col gap-1 border-t border-line p-3 first:border-t-0">
                    <span className="flex items-center gap-2"><Badge tone="warning">{fill(t("sk.imp.line"), { n: r.line })}</Badge><b className="min-w-0 break-words">{r.name}</b></span>
                    <small className="text-danger-ink">{r.errors.map((e) => t(`sk.imp.e.${e}` as MessageKey)).join(" · ")}</small>
                  </li>
                ))}
              </ul>
            )}
            {failed.length > 0 && <p role="alert" className="text-danger">{fill(t("sk.imp.partial"), { n: good.length - failed.length, bad: failed.length, lines: failed.slice(0, 10).join(", ") })}</p>}
          </div>
        )}
      </div>
    </SidePanel>
  );
}
