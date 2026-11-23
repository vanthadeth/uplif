"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Clock, Info, X } from "lucide-react";
import { AppList, Button, Card, CardBody, visibleApps, type AppInfo } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { fill } from "@/lib/translation/api";
import { fmtDate, pick } from "@/lib/format";

interface Access { role: string; role_local: string | null; branch: string | null; branch_local: string | null }
export interface Preview {
  state: "pending" | "expired" | "revoked" | "accepted";
  company_name: string; company_name_local: string | null;
  employee_name: string | null; employee_name_local: string | null;
  position_name: string | null; position_name_local: string | null;
  access: Access[] | null; invited_by: string | null; note: string | null; expires_at: string | null;
}
type Outcome = "joined" | "already" | "limit" | "invalid" | null;

const button = "inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-4 font-semibold text-white";

function Notice({ tone, icon, title, body, children }: { tone: "warn" | "bad" | "info"; icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  const c = tone === "warn" ? "bg-warning-soft text-warning-ink" : tone === "bad" ? "bg-danger-soft text-danger-ink" : "bg-primary-soft text-primary-ink";
  return (
    <>
      <span aria-hidden className={`grid size-12 place-items-center rounded-full ${c}`}>{icon}</span>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="leading-relaxed text-muted">{body}</p>
      {children}
    </>
  );
}

export function InviteView({ token, preview, signedIn, existingAccount }: { token: string; preview: Preview | null; signedIn: boolean; existingAccount: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [apps, setApps] = useState<AppInfo[] | null>(null);

  const company = preview ? pick(locale, preview.company_name, preview.company_name_local) : "";
  const person = preview?.employee_name ? pick(locale, preview.employee_name, preview.employee_name_local) : "";
  const position = preview?.position_name ? pick(locale, preview.position_name, preview.position_name_local) : "";
  const access = (preview?.access ?? []).map((a) => ({ role: pick(locale, a.role, a.role_local), branch: a.branch ? pick(locale, a.branch, a.branch_local) : t("invite.allBranches") }));

  async function accept() {
    setBusy(true); setError(undefined);
    const supabase = createClient();
    const { error: err } = await supabase.rpc("accept_invitation", { p_token: token });
    if (err) {
      setBusy(false);
      const m = err.message ?? "";
      if (m === "already a member") return setOutcome("already");
      if (m.startsWith("plan limit")) return setOutcome("limit");
      if (m.startsWith("invitation invalid")) return setOutcome("invalid");
      return setError(t("inv.a.error"));
    }
    // The new membership becomes the active company; a refreshed token carries it.
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) { setBusy(false); return setError(t("inv.a.error")); }
    setOutcome("joined");
    // The apps this person can use here: the company's plan modules and their own permissions (cosmetic; RLS still guards the data).
    const [mods, perms] = await Promise.all([supabase.rpc("my_enabled_modules"), supabase.rpc("my_permissions")]);
    setBusy(false);
    setApps(visibleApps((mods.data as string[] | null) ?? [], ((perms.data as { permission_key: string }[] | null) ?? []).map((p) => p.permission_key)));
  }
  function open() { router.replace("/dashboard"); router.refresh(); }

  let body: ReactNode;
  if (!preview || preview.state === "revoked" || preview.state === "accepted" || outcome === "invalid") {
    body = (
      <Notice tone="bad" icon={<X className="size-6" aria-hidden />} title={t("inv.a.invalidTitle")} body={t("inv.a.invalidBody")}>
        <Link href="/" className="font-semibold text-link">{t("invite.accept.home")}</Link>
      </Notice>
    );
  } else if (preview.state === "expired") {
    body = <Notice tone="warn" icon={<Clock className="size-6" aria-hidden />} title={t("inv.a.expiredTitle")} body={fill(t("inv.a.expiredBody"), { company })} />;
  } else if (outcome === "already") {
    body = (
      <Notice tone="info" icon={<Info className="size-6" aria-hidden />} title={fill(t("inv.a.alreadyTitle"), { company })} body={t("inv.a.alreadyBody")}>
        <Button variant="primary" className="min-h-12 w-full" onClick={open}>{t("inv.a.open")}</Button>
      </Notice>
    );
  } else if (outcome === "limit") {
    body = <Notice tone="warn" icon={<Info className="size-6" aria-hidden />} title={fill(t("inv.a.limitTitle"), { company })} body={t("inv.a.limitBody")} />;
  } else if (outcome === "joined") {
    const blurbs = Object.fromEntries((apps ?? []).map((a) => [a.key, t(a.blurbKey as MessageKey)]));
    body = (
      <>
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-success-soft text-success-ink"><Check className="size-6" /></span>
        <h1 className="text-xl font-semibold">{fill(t(existingAccount ? "inv.w.added" : "inv.a.welcome"), { company })}</h1>
        {existingAccount
          ? <p className="text-muted">{t("inv.w.addedBody")}</p>
          : <>
              <p className="text-muted">{t("inv.a.welcomeBody")}</p>
              <ul className="flex flex-col gap-1.5">{access.map((a, i) => <li key={i}><b className="font-semibold">{a.role}</b> <em className="not-italic text-muted">· {a.branch}</em></li>)}</ul>
            </>}
        <h2 className="text-lg font-semibold">{t("inv.w.apps")}</h2>
        {apps === null
          ? <div aria-hidden className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-[uplif-pulse_1.4s_ease-in-out_infinite] rounded-card bg-ground" />)}</div>
          : apps.length > 0
            ? <AppList apps={apps} blurbs={blurbs} openLabel={t("inv.w.openApp")} />
            : <p className="text-muted">{t("inv.w.noApps")}</p>}
        <p className="text-[14px] leading-snug text-muted">{t("inv.w.openHint")}</p>
      </>
    );
  } else {
    body = (
      <>
        <span aria-hidden className="grid size-16 place-items-center self-center rounded-card bg-primary text-3xl font-bold text-white">{company.slice(0, 1).toUpperCase()}</span>
        <h1 className="text-center text-xl font-semibold">{fill(t("inv.w.title"), { company })}</h1>
        {preview.invited_by && <p className="text-center text-muted">{fill(t("inv.w.by"), { name: preview.invited_by })}</p>}
        <dl className="grid gap-3 rounded-card border border-line bg-ground p-4 leading-snug">
          <div><dt className="text-[13px] font-semibold uppercase tracking-wider text-muted">{t("inv.a.joiningAs")}</dt><dd><b className="font-semibold">{person}</b>{position && <span className="text-muted"> · {position}</span>}</dd></div>
          <div><dt className="text-[13px] font-semibold uppercase tracking-wider text-muted">{t("inv.a.access")}</dt>
            <dd className="flex flex-col gap-0.5">{access.map((a, i) => <span key={i}><b className="font-semibold">{a.role}</b> <em className="not-italic text-muted">· {a.branch}</em></span>)}</dd></div>
          {preview.invited_by && <div><dt className="text-[13px] font-semibold uppercase tracking-wider text-muted">{t("inv.a.by")}</dt><dd>{preview.invited_by}</dd></div>}
          {preview.expires_at && <div><dt className="text-[13px] font-semibold uppercase tracking-wider text-muted">{t("invite.expires")}</dt><dd className="tabular-nums">{fmtDate(locale, preview.expires_at)}</dd></div>}
        </dl>
        {preview.note && <p className="rounded-control bg-primary-soft p-3 leading-snug text-primary-ink">{preview.note}</p>}
        {error && <p role="alert" className="text-danger-ink">{error}</p>}
        {signedIn ? (
          <>
            <p className="text-[14px] text-muted">{t("inv.a.signedIn")}</p>
            <Button variant="primary" className="min-h-12 w-full" loading={busy} onClick={accept}>{fill(t("inv.a.join"), { company })}</Button>
          </>
        ) : (
          <>
            <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className={button}>{t("inv.a.continue")}</Link>
            <p className="rounded-control bg-warning-soft p-3 text-[14px] leading-snug text-warning-ink">{t("auth.inviteHint")}</p>
          </>
        )}
        <p className="text-[14px] leading-snug text-muted">{fill(t("inv.a.notYou"), { name: person, company })}</p>
      </>
    );
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
      <Card><CardBody className="flex flex-col gap-4">{body}</CardBody></Card>
    </main>
  );
}
