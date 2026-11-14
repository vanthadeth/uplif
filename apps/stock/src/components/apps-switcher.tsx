"use client";
import { AppSwitcher, appSwitcherText, clearSwitcherCache, loadSwitcherData, useSwitcherData } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

/** UPLIF Stock's apps switcher: the shared component with this app's data, text and company switching. */
export function AppsSwitcher({ className }: { className?: string }) {
  const { t, locale } = useI18n();
  const data = useSwitcherData(() => loadSwitcherData((fn) => createClient().rpc(fn as never) as unknown as PromiseLike<{ data: unknown }>));
  const { labels, blurbs } = appSwitcherText((k) => t(k as MessageKey));

  async function switchCompany(membershipId: string) {
    const supabase = createClient();
    const { error } = await supabase.rpc("switch_company", { p_membership_id: membershipId });
    // New claims (company_id, membership_id) arrive with a refreshed token.
    const refreshed = error ? { error } : await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    clearSwitcherCache();
    window.location.assign("/");
  }

  return (
    <AppSwitcher current="stock" data={data} locale={locale} labels={labels} blurbs={blurbs} onSwitchCompany={switchCompany}
      canManagePlan={false} className={className} />
  );
}
