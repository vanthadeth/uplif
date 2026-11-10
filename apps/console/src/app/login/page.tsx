"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Input, LanguageToggle } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { toE164 } from "@/lib/auth/phone";
import { safeNext } from "@/lib/auth/safe-next";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [e164, setE164] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function sendCode(ev: React.FormEvent) {
    ev.preventDefault();
    const number = toE164(phone);
    if (!number) return setError(t("auth.error.phone"));
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().auth.signInWithOtp({ phone: number });
    setBusy(false);
    if (err) return setError(t("auth.error.generic"));
    setE164(number);
  }

  async function verify(ev: React.FormEvent) {
    ev.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError(t("auth.error.code"));
    setBusy(true); setError(undefined);
    const { error: err } = await createClient().auth.verifyOtp({ phone: e164!, token: code, type: "sms" });
    setBusy(false);
    if (err) return setError(t("auth.error.generic"));
    router.replace(nextPath());
    router.refresh();
  }

  function nextPath() {
    return safeNext(new URLSearchParams(location.search).get("next")) ?? "/";
  }

  async function google() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextPath())}` },
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex justify-end">
        <LanguageToggle label={t("lang.toggle")} value={locale} onChange={(id) => setLocale(id as "en" | "km")} options={[{ id: "en", label: "English" }, { id: "km", label: "ខ្មែរ" }]} />
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("auth.title")}</h1>
            <p className="text-muted">{t("auth.subtitle")}</p>
          </div>
          {!e164 ? (
            <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
              <Input label={t("auth.phone")} type="tel" inputMode="tel" autoComplete="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} hint={t("auth.phoneHint")} error={error} />
              <Button type="submit" variant="primary" loading={busy}>{t("auth.sendCode")}</Button>
            </form>
          ) : (
            <form onSubmit={verify} className="flex flex-col gap-3" noValidate>
              <Input label={t("auth.code")} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error} />
              <Button type="submit" variant="primary" loading={busy}>{t("auth.verify")}</Button>
              <Button variant="quiet" onClick={() => { setE164(null); setCode(""); setError(undefined); }}>
                {t("auth.resend")}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-muted">{t("auth.or")}</p>
          <Button onClick={google}>{t("auth.google")}</Button>
          <Button disabled title={t("auth.telegramSoon")}>{t("auth.telegram")}</Button>
        </CardBody>
      </Card>
    </main>
  );
}
