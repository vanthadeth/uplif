"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, CardHeader, Input, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Props {
  company: { id: string; name: string; name_local: string | null; country_code: string } | null;
  settings: { cross_branch_stock_visibility: boolean; attendance_selfie_retention_days: number } | null;
  homeCurrency: string;
}

export function CompanyForm({ company, settings, homeCurrency }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(company?.name ?? "");
  const [nameLocal, setNameLocal] = useState(company?.name_local ?? "");
  const [visibility, setVisibility] = useState(settings?.cross_branch_stock_visibility ?? false);
  const [days, setDays] = useState(String(settings?.attendance_selfie_retention_days ?? 60));
  const [nameError, setNameError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (!company || !settings) return <p role="alert" className="text-danger-ink">{t("dash.noClaim")}</p>;

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return setNameError(t("wizard.error.name"));
    const retention = Number.parseInt(days, 10);
    if (!Number.isInteger(retention) || retention < 1) return toast("error", t("common.saveError"));
    setNameError(undefined); setBusy(true);
    const supabase = createClient();
    // .select() returns the rows RLS let us change; an empty result means no permission.
    const a = await supabase.from("companies").update({ name: name.trim(), name_local: nameLocal.trim() || null }).eq("id", company!.id).select("id");
    const b = await supabase.from("company_settings")
      .update({ cross_branch_stock_visibility: visibility, attendance_selfie_retention_days: retention })
      .eq("company_id", company!.id).select("company_id");
    setBusy(false);
    if (a.error || b.error) return toast("error", t("common.saveError"));
    if (!a.data?.length || !b.data?.length) return toast("error", t("common.forbidden"));
    toast("success", t("company.saved"));
    router.refresh();
  }

  return (
    <form onSubmit={save} className="flex max-w-2xl flex-col gap-4" noValidate>
      <div>
        <h1 className="text-2xl font-bold">{t("company.title")}</h1>
        <p className="text-muted">{t("company.subtitle")}</p>
      </div>
      <Card>
        <CardHeader title={t("company.profile")} />
        <CardBody className="flex flex-col gap-4">
          <Input label={t("wizard.companyName")} value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
          <Input label={t("wizard.companyNameLocal")} value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} />
          <Input label={t("wizard.country")} value={company.country_code} disabled />
          <Input label={t("company.homeCurrency")} value={homeCurrency} disabled />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("company.settings")} />
        <CardBody className="flex flex-col gap-4">
          <Toggle checked={visibility} onChange={setVisibility} label={t("company.stockVisibility")} />
          <Input label={t("company.retention")} hint={t("company.retentionHint")} type="number" min={1} inputMode="numeric"
            value={days} onChange={(e) => setDays(e.target.value)} />
        </CardBody>
      </Card>
      <div><Button type="submit" variant="primary" loading={busy}>{t("company.save")}</Button></div>
    </form>
  );
}
