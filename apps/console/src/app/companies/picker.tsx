"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Button, Card, CardBody, EmptyState } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Company { membership_id: string; company_id: string; name: string; name_local: string | null; is_active: boolean }

export function Picker({ companies }: { companies: Company[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function open(membershipId: string) {
    setBusy(membershipId); setError(undefined);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("switch_company", { p_membership_id: membershipId });
    // New claims (company_id, membership_id) arrive with a refreshed token.
    const refreshed = err ? { error: err } : await supabase.auth.refreshSession();
    setBusy(undefined);
    if (refreshed.error) return setError(t("auth.error.generic"));
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t("picker.title")}</h1>
        <p className="text-muted">{t("picker.subtitle")}</p>
      </div>
      {error && <p role="alert" className="text-danger-ink">{error}</p>}
      {companies.length === 0 ? (
        <EmptyState title={t("picker.empty")} />
      ) : (
        <ul className="flex flex-col gap-2">
          {companies.map((c) => (
            <li key={c.membership_id}>
              <Card><CardBody className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <Building2 className="size-5 text-link" aria-hidden="true" />
                  <span className="font-semibold">{locale === "km" && c.name_local ? c.name_local : c.name}</span>
                </span>
                <Button variant="primary" loading={busy === c.membership_id} onClick={() => open(c.membership_id)}>
                  {t("picker.open")}
                </Button>
              </CardBody></Card>
            </li>
          ))}
        </ul>
      )}
      <Link href="/companies/new" className="text-center font-semibold text-link">{t("picker.new")}</Link>
    </main>
  );
}
