"use client";
import { SignInMethods, type SignInMethodsData } from "@uplif/auth";
import { useI18n } from "@/lib/i18n";

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

/** The shared sign-in methods panel (packages/auth) with this app's translated text. */
export function AccountView({ methods, failed }: { methods: SignInMethodsData | null; failed: boolean }) {
  const { t } = useI18n();
  return (
    <SignInMethods methods={methods} failed={failed} telegramEnabled={telegramEnabled} labels={{
      title: t("account.title"), intro: t("account.intro"),
      google: t("account.google"), telegram: t("account.telegram"), phone: t("account.phone"),
      connected: t("account.connected"), notConnected: t("account.notConnected"),
      link: t("account.link"), unlink: t("account.unlink"), cancel: t("common.cancel"), close: t("common.close"),
      phonePaused: t("account.phonePaused"), lastMethod: t("account.lastMethod"), lastMethodHint: t("account.lastMethodHint"),
      unlinkTitle: { google: t("account.unlinkTitle.google"), telegram: t("account.unlinkTitle.telegram") },
      unlinkBody: t("account.unlinkBody"), linkedTelegram: t("account.linked.telegram"),
      unlinked: { google: t("account.unlinked.google"), telegram: t("account.unlinked.telegram") },
      errorGeneric: t("account.error.generic"), errorTelegramTaken: t("account.error.telegramTaken"),
      loadFailed: t("account.loadFailed"), loadFailedBody: t("account.loadFailedBody"),
    }} />
  );
}
