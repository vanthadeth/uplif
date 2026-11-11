"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Preview { company_name: string; company_name_local: string | null; role_name: string; expires_at: string }

export function InviteView({ token, preview }: { token: string; preview: Preview | null }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function accept() {
    setBusy(true); setError(undefined);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("accept_invitation", { p_token: token });
    // The new membership becomes the active company; a refreshed token carries it.
    const refreshed = err ? { error: err } : await supabase.auth.refreshSession();
    setBusy(false);
    if (refreshed.error) {
      return setError(refreshed.error.message === "already a member" ? t("invite.accept.already") : t("invite.accept.invalid"));
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const name = preview && (locale === "km" && preview.company_name_local ? preview.company_name_local : preview.company_name);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
      <Card><CardBody className="flex flex-col gap-4">
        {preview ? (
          <>
            <h1 className="text-xl font-semibold">{t("invite.accept.title")}</h1>
            <p>{t("invite.accept.body")} <strong>{preview.role_name}</strong> {t("invite.accept.at")} <strong>{name}</strong>.</p>
            {error && <p role="alert" className="text-danger-ink">{error}</p>}
            <Button variant="primary" loading={busy} onClick={accept}>{t("invite.accept.button")}</Button>
          </>
        ) : (
          <>
            <p role="alert">{t("invite.accept.invalid")}</p>
            <Link href="/" className="font-semibold text-link">{t("invite.accept.home")}</Link>
          </>
        )}
      </CardBody></Card>
    </main>
  );
}
