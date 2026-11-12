"use client";
import { useEffect, useState } from "react";
import { CircleAlert, Info } from "lucide-react";
import { Button } from "@uplif/ui";
import { startGoogleSignIn, startTelegramSignIn } from "@uplif/auth";
import { safeNext } from "@/lib/safe-next";
import { useI18n } from "@/lib/i18n";
import { LanguageBar } from "@/components/language-bar";

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

export default function LoginPage() {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(new URLSearchParams(location.search).has("error")); }, []);
  const nextPath = () => safeNext(new URLSearchParams(location.search).get("next")) ?? "/";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <div className="flex justify-end"><LanguageBar /></div>
      <div className="flex flex-1 flex-col justify-center gap-7 pb-14">
        <div className="flex flex-col items-start gap-4">
          <span aria-hidden className="grid size-14 place-items-center rounded-2xl bg-primary text-3xl font-extrabold text-white">U</span>
          <div className="flex flex-col gap-2">
            <span className="caps text-xs font-bold text-muted">{t("st.app")}</span>
            <h1 className="text-3xl font-bold tracking-tight">{t("st.signIn.title")}</h1>
            <p className="text-muted">{t("st.signIn.body")}</p>
          </div>
        </div>
        {failed && <p role="alert" className="flex items-start gap-3 rounded-card bg-danger-soft p-3 text-danger-ink"><CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />{t("st.signIn.failed")}</p>}
        <div className="flex flex-col gap-3">
          <Button variant="primary" className="h-13 text-base" onClick={() => startGoogleSignIn(nextPath())}>{t("st.signIn.google")}</Button>
          {telegramEnabled && <Button className="h-13 text-base" onClick={() => startTelegramSignIn(nextPath())}>{t("st.signIn.telegram")}</Button>}
        </div>
        <p className="flex items-start gap-3 rounded-card bg-primary-soft p-3 text-sm text-primary-ink"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("st.signIn.help")}</p>
      </div>
    </main>
  );
}
