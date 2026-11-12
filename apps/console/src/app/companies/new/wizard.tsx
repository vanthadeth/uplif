"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Input, Select } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { planLimitKey } from "@/lib/plan-limit";

const countries = [["KH", "Cambodia", "KHR"], ["TH", "Thailand", "THB"], ["VN", "Vietnam", "VND"], ["US", "United States", "USD"]] as const;
const currencies = ["KHR", "USD", "THB", "VND"];

export function Wizard() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [country, setCountry] = useState("KH");
  const [currency, setCurrency] = useState("KHR");
  const [branch, setBranch] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  function next() {
    if (step === 1 && !name.trim()) return setError(t("wizard.error.name"));
    setError(undefined);
    setStep(step + 1);
  }

  async function create() {
    setBusy(true); setError(undefined);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("create_company", {
      p_name: name, p_name_local: nameLocal, p_country_code: country, p_home_currency: currency, p_branch_name: branch,
    });
    const refreshed = err ? { error: err } : await supabase.auth.refreshSession();
    setBusy(false);
    if (refreshed.error) return setError(t(planLimitKey(err) ?? "wizard.error.create"));
    router.replace("/dashboard");
    router.refresh();
  }

  const steps = [t("wizard.business"), t("wizard.currency"), t("wizard.branch")];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("wizard.title")}</h1>
      <p className="text-muted" aria-live="polite">
        {t("wizard.step")} {step} {t("wizard.of")} 3: {steps[step - 1]}
      </p>
      <Card><CardBody className="flex flex-col gap-4">
        {step === 1 && (<>
          <Input label={t("wizard.companyName")} value={name} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label={t("wizard.companyNameLocal")} value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} />
          <Select label={t("wizard.country")} value={country} onChange={(e) => {
            setCountry(e.target.value);
            setCurrency(countries.find((c) => c[0] === e.target.value)![2]);
          }}>
            {countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </Select>
        </>)}
        {step === 2 && (
          <Select label={t("wizard.homeCurrency")} hint={t("wizard.homeCurrencyHint")} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
        {step === 3 && (
          <Input label={t("wizard.branchName")} hint={t("wizard.branchHint")} value={branch} placeholder="Main"
            onChange={(e) => setBranch(e.target.value)} error={error} />
        )}
        <div className="flex justify-between gap-2">
          <Button variant="quiet" disabled={step === 1 || busy} onClick={() => setStep(step - 1)}>{t("wizard.back")}</Button>
          {step < 3
            ? <Button variant="primary" onClick={next}>{t("wizard.next")}</Button>
            : <Button variant="primary" loading={busy} onClick={create}>{t("wizard.create")}</Button>}
        </div>
      </CardBody></Card>
    </main>
  );
}
