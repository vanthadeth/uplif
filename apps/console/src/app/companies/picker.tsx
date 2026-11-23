"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { Badge, Button, Card, CardBody, EmptyState, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Company { membership_id: string; company_id: string; name: string; name_local: string | null; is_active: boolean; is_owner: boolean; deleted_at: string | null; purge_after: string | null }

export function Picker({ companies }: { companies: Company[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
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

  async function restore(companyId: string) {
    setBusy(companyId); setError(undefined);
    const { error: err } = await createClient().rpc("restore_company", { p_company: companyId });
    setBusy(undefined);
    if (err) return setError(err.message === "plan limit: companies" ? t("plan.limit.companies") : t("auth.error.generic"));
    toast("success", t("picker.restored"));
    router.refresh();
  }

  const live = companies.filter((c) => !c.deleted_at);
  const removed = companies.filter((c) => c.deleted_at);
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "");
  const nameOf = (c: Company) => (locale === "km" && c.name_local ? c.name_local : c.name);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">{t("picker.title")}</h1>
        <p className="text-muted">{t("picker.subtitle")}</p>
      </div>
      {error && <p role="alert" className="text-danger-ink">{error}</p>}
      {live.length === 0 ? (
        <EmptyState title={t("picker.empty")}
          action={<Link href="/companies/new" className="inline-flex min-h-(--control-h) items-center rounded-control bg-primary px-4 font-semibold text-white hover:bg-primary-hover">{t("picker.new")}</Link>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {live.map((c) => (
            <li key={c.membership_id}>
              <Card><CardBody className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <Building2 className="size-5 text-link" aria-hidden="true" />
                  <span className="font-semibold">{nameOf(c)}</span>
                </span>
                <Button variant="primary" loading={busy === c.membership_id} onClick={() => open(c.membership_id)}>
                  {t("picker.open")}
                </Button>
              </CardBody></Card>
            </li>
          ))}
        </ul>
      )}
      {removed.length > 0 && (
        <ul className="flex flex-col gap-2">
          {removed.map((c) => (
            <li key={c.membership_id}>
              <Card><CardBody className="flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{nameOf(c)}</span><Badge tone="danger">{t("picker.deleted")}</Badge></span>
                  <span className="mt-1 block text-[14px] text-muted">{t("picker.purgeOn")} {date(c.purge_after)}</span>
                </span>
                <Button loading={busy === c.company_id} onClick={() => restore(c.company_id)}>{t("picker.restore")}</Button>
              </CardBody></Card>
            </li>
          ))}
        </ul>
      )}
      {live.length > 0 && <Link href="/companies/new" className="text-center font-semibold text-link">{t("picker.new")}</Link>}
    </main>
  );
}
