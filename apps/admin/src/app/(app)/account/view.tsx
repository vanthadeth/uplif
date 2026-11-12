"use client";
import { SignInMethods, type SignInMethodsData } from "@uplif/auth";

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

/** The shared sign-in methods panel (packages/auth). Super Admin is English only for now. */
export function AccountView({ methods, failed }: { methods: SignInMethodsData | null; failed: boolean }) {
  return (
    <SignInMethods methods={methods} failed={failed} telegramEnabled={telegramEnabled} labels={{
      title: "Sign-in methods", intro: "Link your accounts so you can sign in to the same UPLIF account in any of these ways.",
      google: "Google", telegram: "Telegram", phone: "Phone",
      connected: "Connected", notConnected: "Not connected", link: "Connect", unlink: "Disconnect", cancel: "Cancel", close: "Close",
      phonePaused: "Phone sign-in is paused for now.", lastMethod: "This is your only way to sign in.",
      lastMethodHint: "Connect another method before you disconnect this one, so you cannot lock yourself out.",
      unlinkTitle: { google: "Disconnect Google?", telegram: "Disconnect Telegram?" },
      unlinkBody: "You will no longer be able to sign in with it. You can connect it again later.",
      linkedTelegram: "Telegram is connected.", unlinked: { google: "Google is disconnected.", telegram: "Telegram is disconnected." },
      errorGeneric: "Could not do that. Try again.", errorTelegramTaken: "That Telegram account is already used by another UPLIF account.",
      loadFailed: "Could not load your sign-in methods", loadFailedBody: "Reload the page and try again.",
    }} />
  );
}
