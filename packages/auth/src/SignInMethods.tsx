"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorState, Modal, useToast } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { telegramLoginUrl } from "./telegram";
import type { SignInMethodsData } from "./types";

type Which = "google" | "telegram";

/** Every word the panel shows. The app passes its own (translated) text; the package has no language of its own. */
export interface SignInMethodsLabels {
  title: string; intro: string;
  google: string; telegram: string; phone: string;
  connected: string; notConnected: string; link: string; unlink: string; cancel: string; close: string;
  phonePaused: string; lastMethod: string; lastMethodHint: string;
  unlinkTitle: { google: string; telegram: string }; unlinkBody: string;
  linkedTelegram: string; unlinked: { google: string; telegram: string };
  errorGeneric: string; errorTelegramTaken: string; loadFailed: string; loadFailedBody: string;
}

/**
 * The "Sign-in methods" screen, shared by every app (console, Super Admin, field apps...). The same user, the same
 * links: this is the single place where Google, Telegram and phone are connected to one account.
 * Put it at /account in each app and pass the app's own labels.
 */
export function SignInMethods({ methods, failed, labels, telegramEnabled, accountPath = "/account" }: {
  methods: SignInMethodsData | null; failed: boolean; labels: SignInMethodsLabels; telegramEnabled: boolean; accountPath?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Which | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The Telegram function sends the person back here with the result in the address.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("linked") === "telegram") toast("success", labels.linkedTelegram);
    else if (q.get("error") === "telegram_taken") toast("error", labels.errorTelegramTaken);
    else if (q.get("error")) toast("error", labels.errorGeneric);
    if (q.has("linked") || q.has("error")) history.replaceState(null, "", location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed || !methods) return <ErrorState title={labels.loadFailed} body={labels.loadFailedBody} />;
  const last = methods.count < 2;

  async function linkGoogle() {
    setBusy("google");
    const { error } = await createClient().auth.linkIdentity({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(accountPath)}` } });
    if (error) { setBusy(null); toast("error", labels.errorGeneric); }
  }
  async function linkTelegram() {
    setBusy("telegram");
    const { data, error } = await createClient().rpc("start_telegram_link");
    if (error || !data) { setBusy(null); return toast("error", labels.errorGeneric); }
    location.href = telegramLoginUrl({ ticket: data, next: accountPath });
  }
  async function unlink() {
    if (!confirm) return;
    setBusy(confirm);
    const supabase = createClient();
    let failedNow = false;
    if (confirm === "telegram") {
      failedNow = !!(await supabase.rpc("unlink_telegram")).error;
    } else {
      const { data } = await supabase.auth.getUserIdentities();
      const g = data?.identities.find((i) => i.provider === "google");
      failedNow = !g || !!(await supabase.auth.unlinkIdentity(g)).error;
    }
    setBusy(null);
    if (failedNow) return toast("error", labels.errorGeneric);
    toast("success", labels.unlinked[confirm]);
    setConfirm(null);
    router.refresh();
  }

  const rows: { id: Which | "phone"; title: string; detail: string; linked: boolean; action?: React.ReactNode }[] = [
    {
      id: "google", title: labels.google, linked: !!methods.google,
      detail: methods.google ? (methods.google.email ?? labels.connected) : labels.notConnected,
      action: methods.google
        ? <Button disabled={last} title={last ? labels.lastMethod : undefined} onClick={() => setConfirm("google")}>{labels.unlink}</Button>
        : <Button variant="primary" loading={busy === "google"} onClick={linkGoogle}>{labels.link}</Button>,
    },
    {
      id: "telegram", title: labels.telegram, linked: !!methods.telegram,
      detail: methods.telegram ? [methods.telegram.name, methods.telegram.username && `@${methods.telegram.username}`].filter(Boolean).join(" · ") || labels.connected : labels.notConnected,
      action: methods.telegram
        ? <Button disabled={last} title={last ? labels.lastMethod : undefined} onClick={() => setConfirm("telegram")}>{labels.unlink}</Button>
        : <Button variant="primary" disabled={!telegramEnabled} loading={busy === "telegram"} onClick={linkTelegram}>{labels.link}</Button>,
    },
    { id: "phone", title: labels.phone, linked: !!methods.phone, detail: methods.phone ?? labels.phonePaused },
  ];

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{labels.title}</h1>
        <p className="text-muted">{labels.intro}</p>
      </div>
      <Card className="overflow-hidden">
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
              <span className="min-w-0 flex-1">
                <b className="block font-semibold">{r.title}</b>
                <small className="block text-muted">{r.detail}</small>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={r.linked ? "success" : "neutral"}>{r.linked ? labels.connected : labels.notConnected}</Badge>
                {r.action}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {last && <p className="text-sm text-muted">{labels.lastMethodHint}</p>}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} closeLabel={labels.close}
        title={confirm ? labels.unlinkTitle[confirm] : ""}
        footer={<><Button onClick={() => setConfirm(null)}>{labels.cancel}</Button>
          <Button variant="primary" loading={!!busy} onClick={unlink}>{labels.unlink}</Button></>}>
        <p>{labels.unlinkBody}</p>
      </Modal>
    </div>
  );
}
