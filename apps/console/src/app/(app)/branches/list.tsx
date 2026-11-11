"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState, Input, Modal, Table, TBody, TD, TH, THead, TR, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Branch { id: string; name: string; name_local: string | null; is_active: boolean }

export function BranchList({ branches, companyId }: { branches: Branch[]; companyId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function open(b: Branch | "new") {
    setEditing(b);
    setName(b === "new" ? "" : b.name);
    setNameLocal(b === "new" ? "" : b.name_local ?? "");
    setError(undefined);
  }

  async function save() {
    if (!name.trim()) return setError(t("branches.error.name"));
    setBusy(true);
    const supabase = createClient();
    const values = { name: name.trim(), name_local: nameLocal.trim() || null };
    const res = editing === "new"
      ? await supabase.from("branches").insert({ company_id: companyId, ...values }).select("id")
      : await supabase.from("branches").update(values).eq("id", (editing as Branch).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", res.error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    if (!res.data?.length) return toast("error", t("common.forbidden"));
    toast("success", editing === "new" ? t("branches.added") : t("branches.saved"));
    setEditing(null);
    router.refresh();
  }

  async function toggle(b: Branch) {
    const { data, error: err } = await createClient().from("branches").update({ is_active: !b.is_active }).eq("id", b.id).select("id");
    if (err) return toast("error", t("common.saveError"));
    if (!data?.length) return toast("error", t("common.forbidden"));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("branches.title")}</h1>
          <p className="text-muted">{t("branches.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => open("new")}>{t("branches.add")}</Button>
      </div>
      {branches.length === 0 ? (
        <EmptyState title={t("branches.empty")} body={t("branches.emptyBody")} />
      ) : (
        <Table>
          <THead><TR>
            <TH>{t("branches.name")}</TH><TH>{t("common.status")}</TH><TH>{t("common.actions")}</TH>
          </TR></THead>
          <TBody>
            {branches.map((b) => (
              <TR key={b.id}>
                <TD>{locale === "km" && b.name_local ? b.name_local : b.name}</TD>
                <TD><Badge tone={b.is_active ? "success" : "neutral"}>{b.is_active ? t("status.active") : t("status.inactive")}</Badge></TD>
                <TD>
                  <span className="flex gap-1">
                    <Button variant="quiet" onClick={() => open(b)}>{t("common.edit")}</Button>
                    <Button variant="quiet" onClick={() => toggle(b)}>{b.is_active ? t("branches.deactivate") : t("branches.activate")}</Button>
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Modal
        open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("common.close")}
        title={editing === "new" ? t("branches.add") : t("branches.edit")}
        footer={<>
          <Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>{t("company.save")}</Button>
        </>}
      >
        <div className="flex flex-col gap-4">
          <Input label={t("branches.name")} value={name} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label={t("branches.nameLocal")} value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
