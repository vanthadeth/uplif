"use client";
import { useState } from "react";
import { SignInMethods, type SignInMethodsData } from "@uplif/auth";
import { Avatar, Card, Tabs } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { localName, useDisplay, useMe, useProfile } from "@/components/me-context";

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

/** Profile: who you are at work, and the sign-in methods linked to this account (shared panel from packages/auth). */
export function ProfileView({ methods, failed }: { methods: SignInMethodsData | null; failed: boolean }) {
  const { t, locale } = useI18n();
  const state = useMe();
  const profile = useProfile();
  const { name, branch } = useDisplay(state, locale);
  const [tab, setTab] = useState("work");
  const none = t("st.profile.none");
  const date = profile?.employment_date
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${profile.employment_date}T00:00:00`))
    : null;
  const rows: [string, string | null][] = [
    [t("st.profile.position"), localName(profile?.position, locale)],
    [t("st.profile.branch"), branch],
    [t("st.profile.department"), localName(profile?.department, locale)],
    [t("st.profile.reportsTo"), localName(profile?.reports_to, locale)],
    [t("st.profile.since"), date],
  ];
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.profile.title")}</h1>
      <Card className="flex items-center gap-4 p-4">
        <Avatar name={name || "?"} size="lg" />
        <div className="min-w-0"><b className="block truncate text-lg">{name}</b><span className="block truncate text-muted">{localName(profile?.position, locale) ?? t("st.bar.role")}</span></div>
      </Card>
      <Tabs label={t("st.profile.tabs")} value={tab} onChange={setTab}
        items={[{ id: "work", label: t("st.profile.work") }, { id: "accounts", label: t("st.profile.accounts") }]} />
      {tab === "work" ? (
        <div role="tabpanel" id="panel-work" aria-labelledby="tab-work" className="flex flex-col gap-3">
          {!profile && <p role="alert" className="text-danger-ink">{t("st.profile.error")}</p>}
          <Card className="divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex min-h-14 items-center justify-between gap-4 px-4 py-3">
                <span className="text-muted">{label}</span>
                <b className={`min-w-0 truncate text-end ${value ? "" : "font-normal text-muted"}`}>{value ?? none}</b>
              </div>
            ))}
          </Card>
          <p className="text-sm text-muted">{t("st.profile.note")}</p>
        </div>
      ) : (
        <div role="tabpanel" id="panel-accounts" aria-labelledby="tab-accounts">
          <SignInMethods methods={methods} failed={failed} telegramEnabled={telegramEnabled} labels={{
            title: t("st.account.title"), intro: t("st.account.intro"),
            google: t("st.account.google"), telegram: t("st.account.telegram"), phone: t("st.account.phone"),
            connected: t("st.account.connected"), notConnected: t("st.account.notConnected"),
            link: t("st.account.link"), unlink: t("st.account.unlink"), cancel: t("st.step.cancel"), close: t("st.account.close"),
            phonePaused: t("st.account.phonePaused"), lastMethod: t("st.account.lastMethod"), lastMethodHint: t("st.account.lastMethodHint"),
            unlinkTitle: { google: t("st.account.unlinkTitle.google"), telegram: t("st.account.unlinkTitle.telegram") },
            unlinkBody: t("st.account.unlinkBody"), linkedTelegram: t("st.account.linked.telegram"),
            unlinked: { google: t("st.account.unlinked.google"), telegram: t("st.account.unlinked.telegram") },
            errorGeneric: t("st.account.error.generic"), errorTelegramTaken: t("st.account.error.telegramTaken"),
            loadFailed: t("st.account.loadFailed"), loadFailedBody: t("st.account.loadFailedBody"),
          }} />
        </div>
      )}
    </div>
  );
}
