"use client";
import { useEffect, useState } from "react";
import { Button, Card, CardBody } from "@uplif/ui";
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex justify-end"><LanguageBar /></div>
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{t("st.signIn.title")}</h1>
            <p className="text-muted">{t("st.signIn.body")}</p>
          </div>
          {failed && <p role="alert" className="text-danger-ink">{t("st.signIn.failed")}</p>}
          <Button variant="primary" onClick={() => startGoogleSignIn(nextPath())}>{t("st.signIn.google")}</Button>
          {telegramEnabled && <Button onClick={() => startTelegramSignIn(nextPath())}>{t("st.signIn.telegram")}</Button>}
        </CardBody>
      </Card>
    </main>
  );
}
