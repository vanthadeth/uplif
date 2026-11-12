"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseUrl } from "@uplif/supabase/env";
import { Badge, Button, Card, ErrorState, Modal, useToast } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";

export interface Methods {
  google: { email: string | null } | null;
  telegram: { name: string | null; username: string | null; linked_at: string } | null;
  phone: string | null;
  count: number;
}
type Which = "google" | "telegram";

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

export function AccountView({ methods, failed }: { methods: Methods | null; failed: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<Which | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // The Telegram function sends the person back here with the result in the address.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("linked") === "telegram") toast("success", t("account.linked.telegram"));
    else if (q.get("error") === "telegram_taken") toast("error", t("account.error.telegramTaken"));
    else if (q.get("error")) toast("error", t("account.error.generic"));
    if (q.has("linked") || q.has("error")) history.replaceState(null, "", location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed || !methods) return <ErrorState title={t("account.loadFailed")} body={t("account.loadFailedBody")} />;
  const last = methods.count < 2;

  async function linkGoogle() {
    setBusy("google");
    const { error } = await createClient().auth.linkIdentity({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/account")}` } });
    if (error) { setBusy(null); toast("error", t("account.error.generic")); }
  }
  async function linkTelegram() {
    setBusy("telegram");
    const { data, error } = await createClient().rpc("start_telegram_link");
    if (error || !data) { setBusy(null); return toast("error", t("account.error.generic")); }
    location.href = `${supabaseUrl}/functions/v1/telegram-login?link=${encodeURIComponent(data)}&next=${encodeURIComponent("/account")}`;
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
    if (failedNow) return toast("error", t("account.error.generic"));
    toast("success", t(`account.unlinked.${confirm}` as "account.unlinked.google"));
    setConfirm(null);
    router.refresh();
  }

  const rows: { id: Which | "phone"; title: string; detail: string; linked: boolean; action?: React.ReactNode }[] = [
    {
      id: "google", title: t("account.google"), linked: !!methods.google,
      detail: methods.google ? (methods.google.email ?? t("account.connected")) : t("account.notConnected"),
      action: methods.google
        ? <Button disabled={last} title={last ? t("account.lastMethod") : undefined} onClick={() => setConfirm("google")}>{t("account.unlink")}</Button>
        : <Button variant="primary" loading={busy === "google"} onClick={linkGoogle}>{t("account.link")}</Button>,
    },
    {
      id: "telegram", title: t("account.telegram"), linked: !!methods.telegram,
      detail: methods.telegram ? [methods.telegram.name, methods.telegram.username && `@${methods.telegram.username}`].filter(Boolean).join(" · ") || t("account.connected") : t("account.notConnected"),
      action: methods.telegram
        ? <Button disabled={last} title={last ? t("account.lastMethod") : undefined} onClick={() => setConfirm("telegram")}>{t("account.unlink")}</Button>
        : <Button variant="primary" disabled={!telegramEnabled} loading={busy === "telegram"} onClick={linkTelegram}>{t("account.link")}</Button>,
    },
    {
      id: "phone", title: t("account.phone"), linked: !!methods.phone,
      detail: methods.phone ?? t("account.phonePaused"),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("account.title")}</h1>
        <p className="text-muted">{t("account.intro")}</p>
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
                <Badge tone={r.linked ? "success" : "neutral"}>{r.linked ? t("account.connected") : t("account.notConnected")}</Badge>
                {r.action}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {last && <p className="text-sm text-muted">{t("account.lastMethodHint")}</p>}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} closeLabel={t("common.close")}
        title={confirm ? t(`account.unlinkTitle.${confirm}` as "account.unlinkTitle.google") : ""}
        footer={<><Button onClick={() => setConfirm(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={!!busy} onClick={unlink}>{t("account.unlink")}</Button></>}>
        <p>{t("account.unlinkBody")}</p>
      </Modal>
    </div>
  );
}
