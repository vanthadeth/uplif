"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Card, Input, Modal, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

/** Owner-only danger zone. The company is hidden at once and kept for 30 days before it is removed for good. */
export function DeleteCompany({ company }: { company: { id: string; name: string } }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === company.name;

  async function remove() {
    if (!matches) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_company", { p_company: company.id, p_confirm_name: typed });
    // The old company claims are no longer valid; a refreshed token drops them.
    if (!error) await supabase.auth.refreshSession();
    setBusy(false);
    if (error) return toast("error", t("common.saveError"));
    toast("success", t("company.delete.done"));
    router.replace("/companies");
    router.refresh();
  }

  return (
    <>
      <Card className="flex flex-col gap-3 border-danger p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 className="text-base font-semibold text-danger-ink">{t("company.delete.title")}</h2>
          <p className="mt-1 max-w-[62ch] text-[14px] leading-normal text-muted">{t("company.delete.body")}</p>
        </div>
        <Button variant="danger" className="shrink-0" onClick={() => { setTyped(""); setOpen(true); }}>
          <Trash2 className="size-4" aria-hidden />{t("company.delete.button")}
        </Button>
      </Card>

      <Modal open={open} onClose={() => !busy && setOpen(false)} closeLabel={t("common.close")} title={t("company.delete.confirmTitle")}
        footer={<>
          <Button onClick={() => setOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={busy} disabled={!matches} onClick={remove}>{t("company.delete.button")}</Button>
        </>}>
        <div className="flex flex-col gap-3">
          <p className="leading-relaxed text-muted">{t("company.delete.confirmBody")}</p>
          <p className="font-semibold">{company.name}</p>
          <Input label={t("company.delete.nameLabel")} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)}
            error={typed && !matches ? t("company.delete.mismatch") : undefined} />
        </div>
      </Modal>
    </>
  );
}
