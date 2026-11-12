"use client";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ClipboardList, Info, Lock, Pencil, Plus } from "lucide-react";
import { Badge, Button, Card, FloatingBar, Input, Switch, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Props {
  company: { id: string; name: string; name_local: string | null; country_code: string } | null;
  settings: { cross_branch_stock_visibility: boolean; attendance_selfie_retention_days: number } | null;
  currencies: { code: string; is_home: boolean }[];
  canProfile: boolean;
  canSettings: boolean;
  canCurrency: boolean;
}

const RETENTION = [30, 60, 90, 180, 365];
const CURRENCIES = ["KHR", "USD", "THB", "VND", "CNY", "LAK"];
const MAX_DAYS = 3650;

function displayName(type: "region" | "currency", code: string, locale: string) {
  try { return new Intl.DisplayNames([locale], { type }).of(code) ?? code; } catch { return code; }
}

function Section({ first, title, description, children }: { first?: boolean; title: string; description: string; children: ReactNode }) {
  return (
    <section className={`grid items-start gap-4 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-x-8 ${first ? "" : "border-t border-line pt-6"}`}>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-[13px] leading-normal text-muted">{description}</p>
      </div>
      <Card className="flex flex-col gap-5 p-4 sm:p-5">{children}</Card>
    </section>
  );
}

function Locked({ children, hint }: { children: ReactNode; hint: string }) {
  return (
    <div>
      <div className="flex min-h-11 items-center gap-2.5 rounded-control border border-line bg-neutral-soft px-3 text-muted">
        <Lock className="size-4" aria-hidden />{children}
      </div>
      <p className="mt-1.5 text-xs text-muted">{hint}</p>
    </div>
  );
}

function ReadRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-x-4">
      <span className="text-muted">{label}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-1.5 break-words font-medium">{children}</span>
    </div>
  );
}

export function CompanyForm({ company, settings, currencies, canProfile, canSettings, canCurrency }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const home = currencies.find((c) => c.is_home)?.code ?? "";
  const initial = useMemo(() => ({
    name: company?.name ?? "",
    nameLocal: company?.name_local ?? "",
    stock: settings?.cross_branch_stock_visibility ?? false,
    days: String(settings?.attendance_selfie_retention_days ?? 60),
    others: currencies.filter((c) => !c.is_home).map((c) => c.code).sort(),
  }), [company, settings, currencies]);

  const [v, setV] = useState(initial);
  const [base, setBase] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!company || !settings) return <p role="alert" className="text-danger-ink">{t("dash.noClaim")}</p>;

  const readOnly = !canProfile && !canSettings && !canCurrency;
  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const daysNum = /^\d+$/.test(v.days.trim()) ? Number(v.days) : NaN;
  const errors = {
    name: canProfile && !v.name.trim() ? t("wizard.error.name") : undefined,
    days: canSettings && !(daysNum >= 1 && daysNum <= MAX_DAYS) ? t("company.retentionError") : undefined,
  };
  const errorCount = Object.values(errors).filter(Boolean).length;
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((p) => ({ ...p, [k]: val }));
  const toggleCurrency = (code: string, on: boolean) =>
    setV((p) => ({ ...p, others: on ? [...p.others, code].sort() : p.others.filter((c) => c !== code) }));

  const retentionOptions = [...new Set([...RETENTION, ...(Number.isInteger(daysNum) ? [daysNum] : [])])].sort((a, b) => a - b);
  const currencyOptions = [...new Set([...CURRENCIES, ...v.others])].filter((c) => c !== home);
  const regionName = displayName("region", company.country_code, locale);

  async function save() {
    setShowErrors(true);
    if (errorCount) return;
    setBusy(true);
    const supabase = createClient();
    const failed: string[] = [];
    let denied = false;
    const done = (res: { error: unknown; data?: unknown[] | null }) => {
      if (res.error) failed.push("x");
      else if (!res.data?.length) denied = true; // RLS changed nothing: no permission
    };
    const id = company!.id;
    if (canProfile && (v.name !== base.name || v.nameLocal !== base.nameLocal)) {
      done(await supabase.from("companies").update({ name: v.name.trim(), name_local: v.nameLocal.trim() || null }).eq("id", id).select("id"));
    }
    if (canSettings && (v.stock !== base.stock || v.days !== base.days)) {
      done(await supabase.from("company_settings")
        .update({ cross_branch_stock_visibility: v.stock, attendance_selfie_retention_days: daysNum })
        .eq("company_id", id).select("company_id"));
    }
    if (canCurrency) {
      const add = v.others.filter((c) => !base.others.includes(c));
      const remove = base.others.filter((c) => !v.others.includes(c));
      if (add.length) done(await supabase.from("company_currencies").insert(add.map((code) => ({ company_id: id, code, is_home: false }))).select("code"));
      if (remove.length) done(await supabase.from("company_currencies").delete().eq("company_id", id).eq("is_home", false).in("code", remove).select("code"));
    }
    setBusy(false);
    if (failed.length) return toast("error", t("common.saveError"));
    if (denied) return toast("error", t("common.forbidden"));
    setBase(v);
    setShowErrors(false);
    toast("success", t("company.saved"));
    router.refresh();
  }

  function discard() {
    setV(base);
    setShowErrors(false);
    toast("info", t("company.discarded"));
  }

  const initialLetter = (v.name.trim() || "?").charAt(0).toUpperCase();
  const logo = <span aria-hidden className="grid size-[72px] shrink-0 place-items-center rounded-[18px] bg-primary text-3xl font-bold text-white">{initialLetter}</span>;

  const profileEditable = canProfile;
  const statusText = errorCount && showErrors ? t("company.barError") : dirty ? t("company.barDirty") : t("company.barClean");
  const StatusIcon = errorCount && showErrors ? Info : dirty ? Pencil : Check;
  const statusTone = errorCount && showErrors ? "text-danger-ink" : dirty ? "text-link" : "text-muted";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("company.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("company.subtitle")}</p>
        </div>
        {readOnly ? <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("company.viewOnly")}</Badge>
          : dirty ? <Badge tone="info"><Pencil className="size-3" aria-hidden />{t("company.barDirtyShort")}</Badge> : null}
      </div>

      {readOnly && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("company.roTitle")}</b>{t("company.roBody")}</div>
        </div>
      )}

      <Section first title={t("company.profile")} description={t("company.profileDesc")}>
        <div className="flex flex-wrap items-center gap-4">
          {logo}
          {profileEditable && (
            <div className="flex min-w-[200px] flex-1 flex-col items-start gap-2">
              <Button type="button" disabled><Plus className="size-4" aria-hidden />{t("company.logoUpload")}</Button>
              <p className="text-xs text-muted">{t("company.logoHint")}</p>
            </div>
          )}
        </div>
        {profileEditable ? (
          <>
            <Input label={t("wizard.companyName")} value={v.name} maxLength={120} autoComplete="organization"
              onChange={(e) => set("name", e.target.value)} error={showErrors ? errors.name : undefined} />
            <Input label={t("wizard.companyNameLocal")} value={v.nameLocal} maxLength={120}
              onChange={(e) => set("nameLocal", e.target.value)} hint={t("company.nameLocalHint")} />
            <Locked hint={t("company.countryHint")}>
              <b className="font-semibold text-ink">{regionName}</b><span>{company.country_code}</span>
            </Locked>
          </>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ReadRow label={t("wizard.companyName")}>{company.name}</ReadRow>
            <ReadRow label={t("wizard.companyNameLocal")}>{company.name_local ?? <span className="text-muted">–</span>}</ReadRow>
            <ReadRow label={t("wizard.country")}>{regionName} · {company.country_code}</ReadRow>
          </div>
        )}
      </Section>

      <Section title={t("company.currencies")} description={t("company.currenciesDesc")}>
        {canCurrency ? (
          <>
            <Locked hint={t("company.homeHint")}>
              <b className="font-semibold text-ink">{home}</b><span>{displayName("currency", home, locale)}</span>
            </Locked>
            <div role="group" aria-labelledby="oc">
              <span id="oc" className="mb-1.5 block text-[13px] font-semibold text-ink-2">{t("company.otherCurrencies")}</span>
              <div className="flex flex-col">
                {currencyOptions.map((c, i) => (
                  <div key={c} className={`flex min-h-14 items-center gap-3 ${i ? "border-t border-line" : ""}`}>
                    <span className="w-12 shrink-0 font-bold tabular-nums">{c}</span>
                    <span className="min-w-0 flex-1">{displayName("currency", c, locale)}</span>
                    <Switch checked={v.others.includes(c)} onChange={(on) => toggleCurrency(c, on)} label={`${c} ${displayName("currency", c, locale)}`} />
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">{t("company.otherHint")}</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3.5">
            <ReadRow label={t("company.homeCurrency")}><Badge tone="info"><Lock className="size-3" aria-hidden />{home} · {displayName("currency", home, locale)}</Badge></ReadRow>
            <ReadRow label={t("company.otherCurrencies")}>
              {v.others.length ? v.others.map((c) => <Badge key={c} tone="neutral">{c} · {displayName("currency", c, locale)}</Badge>) : <span className="text-muted">–</span>}
            </ReadRow>
          </div>
        )}
      </Section>

      <Section title={t("company.stockTitle")} description={t("company.stockDesc")}>
        {canSettings ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 leading-snug">
              <b className="block font-semibold">{t("company.stockVisibility")}</b>
              <small className="block text-[13px] text-muted">{t("company.stockHint")}</small>
            </div>
            <Switch checked={v.stock} onChange={(x) => set("stock", x)} label={t("company.stockVisibility")} />
          </div>
        ) : (
          <ReadRow label={t("company.stockVisibility")}><Badge tone={v.stock ? "success" : "neutral"}>{v.stock ? t("company.yes") : t("company.no")}</Badge></ReadRow>
        )}
      </Section>

      <Section title={t("company.attendance")} description={t("company.attendanceDesc")}>
        {canSettings ? (
          <div role="radiogroup" aria-labelledby="retl" aria-describedby="days-h">
            <span id="retl" className="mb-1.5 block text-[13px] font-semibold text-ink-2">{t("company.retentionLabel")}</span>
            <div className="flex flex-wrap gap-2.5">
              {retentionOptions.map((d) => {
                const on = daysNum === d;
                return (
                  <button key={d} type="button" role="radio" aria-checked={on} onClick={() => set("days", String(d))}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-[13px] ${on ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line-strong bg-surface font-medium"}`}>
                    {on && <Check className="size-3.5" strokeWidth={2.4} aria-hidden />}{d} {t("company.days")}
                  </button>
                );
              })}
            </div>
            {showErrors && errors.days && <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger-ink">{errors.days}</p>}
            <p id="days-h" className="mt-1.5 text-xs text-muted">{t("company.retentionHint")}</p>
          </div>
        ) : (
          <ReadRow label={t("company.retentionLabel")}>{settings.attendance_selfie_retention_days} {t("company.days")}</ReadRow>
        )}
      </Section>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2 text-[13px] text-muted">
        <ClipboardList className="size-4" aria-hidden />
        <span>{t("company.auditNote")}</span>
        <Link href="/audit" className="inline-flex min-h-9 items-center gap-1 rounded-control px-1.5 font-semibold text-link hover:bg-ground">
          {t("company.auditLink")}<ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {!readOnly && (
        <FloatingBar>
          <div role="status" aria-live="polite" className={`flex min-w-0 items-center gap-2 font-semibold ${statusTone}`}>
            <StatusIcon className="size-[18px] shrink-0" aria-hidden /><span>{statusText}</span>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" className="flex-1 sm:flex-none" disabled={!dirty || busy} onClick={discard}>{t("company.discard")}</Button>
            <Button type="button" variant="primary" className="flex-1 sm:flex-none" loading={busy} disabled={!dirty} onClick={save}>{t("company.save")}</Button>
          </div>
        </FloatingBar>
      )}
    </div>
  );
}
