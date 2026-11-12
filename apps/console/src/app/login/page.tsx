"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Input, LanguagePicker } from "@uplif/ui";
import { isLocale } from "@/lib/languages";
import { useLanguageOptions } from "@/lib/use-language-options";
import { createClient } from "@/lib/supabase/client";
import { startGoogleSignIn, startTelegramSignIn } from "@uplif/auth";
import { toE164 } from "@/lib/auth/phone";
import { safeNext } from "@/lib/auth/safe-next";
import { useI18n } from "@/lib/i18n";

// Phone sign-in is paused. Set NEXT_PUBLIC_PHONE_LOGIN=true to bring it back; the code is kept.
const phoneEnabled = process.env.NEXT_PUBLIC_PHONE_LOGIN === "true";
// Telegram sign-in needs the telegram-login Edge Function deployed in Supabase.
// Set NEXT_PUBLIC_TELEGRAM_LOGIN=true once it is; until then the button stays disabled.
const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const languageOptions = useLanguageOptions().options;
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

  // Same sign-in calls in every UPLIF app (packages/auth), so linked accounts work everywhere.
  const google = () => startGoogleSignIn(nextPath());
  const telegram = () => startTelegramSignIn(nextPath());

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex justify-end">
        <LanguagePicker variant="button" label={t("lang.toggle")} value={locale} options={languageOptions} onChange={(c) => isLocale(c) && setLocale(c)} />
      </div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("auth.title")}</h1>
            <p className="text-muted">{t(phoneEnabled ? "auth.subtitle" : "auth.subtitleGoogle")}</p>
          </div>
          {phoneEnabled && (!e164 ? (
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
          ))}
          {phoneEnabled && <p className="text-center text-sm text-muted">{t("auth.or")}</p>}
          <Button variant={phoneEnabled ? "secondary" : "primary"} onClick={google}>{t("auth.google")}</Button>
          {telegramEnabled
            ? <Button onClick={telegram}>{t("auth.telegram")}</Button>
            : <Button disabled title={t("auth.telegramSoon")}>{t("auth.telegram")}</Button>}
          {error && !phoneEnabled && <p role="alert" className="text-danger-ink">{error}</p>}
        </CardBody>
      </Card>
    </main>
  );
}
