"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Star, Trash2 } from "lucide-react";
import { Badge, Button, EmptyState, SidePanel, resizeImage, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { pick } from "@/lib/format";
import { IMAGE_BUCKET, removePicture } from "@/lib/use-picture";

export interface ItemImage { id: string; item_id: string; image_path: string; is_main: boolean; url: string | null }
export const MAX_PICTURES = 10;

/** The picture gallery of one item: add several, choose the main one, remove. Every action is saved at once. */
export function ItemPictures({ item, images, companyId, canManage, onClose }: {
  item: { id: string; name: string; name_local: string | null } | null; images: ItemImage[]; companyId: string; canManage: boolean; onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const mine = item ? images.filter((i) => i.item_id === item.id).sort((a, b) => Number(b.is_main) - Number(a.is_main)) : [];
  const room = MAX_PICTURES - mine.length;

  async function add(files: FileList | null) {
    if (!item || !files?.length) return;
    const chosen = Array.from(files);
    if (chosen.length > room) toast("error", fill(t("sk.pics.limit"), { max: String(MAX_PICTURES) }));
    setBusy(true);
    const supabase = createClient();
    let failed = false;
    for (const file of chosen.slice(0, Math.max(0, room))) {
      let path: string | null = null;
      try {
        const blob = await resizeImage(file, 1600, 0.85);
        path = `${companyId}/items/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        const ins = await supabase.from("item_images").insert({ company_id: companyId, item_id: item.id, image_path: path }).select("id");
        if (ins.error || !ins.data?.length) throw ins.error ?? new Error("not saved");
      } catch {
        failed = true;
        await removePicture(path); // the file was uploaded but the row was refused
      }
    }
    setBusy(false);
    if (failed) toast("error", t("sk.pics.uploadError"));
    router.refresh();
  }

  async function makeMain(img: ItemImage) {
    setBusy(true);
    const { error } = await createClient().rpc("set_item_main_image", { p_image_id: img.id });
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    toast("success", t("sk.pics.mainSet"));
    router.refresh();
  }

  async function remove(img: ItemImage) {
    setBusy(true);
    const { data, error } = await createClient().from("item_images").delete().eq("id", img.id).select("id");
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("sk.forbidden") : t("sk.saveError"));
    if (!data?.length) return toast("error", t("sk.forbidden"));
    await removePicture(img.image_path);
    toast("success", t("sk.pics.removed"));
    router.refresh();
  }

  return (
    <SidePanel sheet open={item !== null} onClose={onClose} closeLabel={t("sk.close")}
      title={item ? `${t("sk.pics.title")}: ${pick(locale, item.name, item.name_local)}` : t("sk.pics.title")}
      footer={canManage ? (
        <Button variant="primary" className="w-full sm:w-auto" disabled={busy || room <= 0} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="size-[18px] animate-[uplif-spin_0.8s_linear_infinite]" aria-hidden /> : <ImagePlus className="size-[18px]" aria-hidden />}
          {t("sk.pics.add")}
        </Button>
      ) : undefined}>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden
        onChange={(e) => { const f = e.target.files; void add(f).finally(() => { if (input.current) input.current.value = ""; }); }} />
      <div className="flex flex-col gap-4" aria-busy={busy}>
        <p className="text-muted">{fill(t("sk.pics.count"), { n: String(mine.length), max: String(MAX_PICTURES) })}</p>
        {mine.length === 0 ? (
          <EmptyState title={t("sk.pics.empty")} body={canManage ? t("sk.pics.emptyBody") : t("sk.pics.roEmpty")} />
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {mine.map((img) => (
              <li key={img.id} className="overflow-hidden rounded-card border border-line bg-surface">
                <div className="relative aspect-square bg-ground">
                  {img.url && <img src={img.url} alt="" className="size-full object-cover" />}
                  {img.is_main && <span className="absolute start-2 top-2"><Badge tone="info"><Star className="size-3" aria-hidden />{t("sk.pics.main")}</Badge></span>}
                </div>
                {canManage && (
                  <div className="flex items-center justify-between gap-1 p-1">
                    {img.is_main ? <span /> : (
                      <button type="button" disabled={busy} onClick={() => makeMain(img)}
                        className="min-h-11 rounded-control px-2 font-semibold text-link transition-colors hover:bg-primary-soft disabled:opacity-60">{t("sk.pics.makeMain")}</button>
                    )}
                    <button type="button" disabled={busy} aria-label={t("sk.pics.remove")} onClick={() => remove(img)}
                      className="grid size-11 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft disabled:opacity-60"><Trash2 className="size-5" aria-hidden /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SidePanel>
  );
}
