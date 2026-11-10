"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

export function DashboardView({ company, hasClaim }: { company: { name: string; name_local: string | null } | null; hasClaim: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <Card><CardBody className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">{t("dash.welcome")}</h1>
        {company ? (
          <p><span className="text-muted">{t("dash.company")}: </span><strong>{company.name}</strong></p>
        ) : (
          <p role="alert" className="text-danger-ink">{hasClaim ? t("auth.error.generic") : t("dash.noClaim")}</p>
        )}
        <Link href="/companies" className="font-semibold text-primary">{t("dash.switch")}</Link>
        <Button onClick={signOut}>{t("auth.signOut")}</Button>
      </CardBody></Card>
    </main>
  );
}
