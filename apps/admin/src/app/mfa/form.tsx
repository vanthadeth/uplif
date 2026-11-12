"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Input } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";

type Setup = { factorId: string; qr: string; secret: string };

export function MfaForm({ factorId, email }: { factorId: string | null; email: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const enrolling = factorId === null;

  async function start() {
    setBusy(true); setError("");
    const supabase = createClient();
    // An earlier attempt that was never finished would block a new one: remove it first.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Authenticator app", issuer: "UPLIF Super Admin" });
    setBusy(false);
    if (err || !data) { setError("Could not start the setup. Try again."); return; }
    setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const id = factorId ?? setup?.factorId;
    if (!id) return;
    setBusy(true); setError("");
    const { error: err } = await createClient().auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
    if (err) { setBusy(false); setError("That code did not work. Check the 6 digits and try again."); setCode(""); return; }
    router.replace("/overview");
    router.refresh();
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const codeField = (
    <form onSubmit={verify} className="flex flex-col gap-3">
      <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required autoFocus
        value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} error={error || undefined} />
      <Button type="submit" variant="primary" disabled={busy || code.length !== 6}>{enrolling ? "Turn on and continue" : "Verify and continue"}</Button>
    </form>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">{enrolling ? "Set up your second sign-in step" : "Enter your code"}</h1>
            <p className="text-muted">
              {enrolling
                ? "Super Admin needs a code from an authenticator app each time you sign in."
                : "Open your authenticator app and type the 6-digit code for UPLIF Super Admin."}
            </p>
            <p className="text-xs text-muted">Signed in as {email}</p>
          </div>
          {enrolling && !setup && (
            <>
              {error && <p role="alert" className="text-danger-ink">{error}</p>}
              <Button variant="primary" onClick={start} disabled={busy}>Set up authenticator app</Button>
            </>
          )}
          {enrolling && setup && (
            <>
              <ol className="list-decimal pl-5 text-sm text-ink-2">
                <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy).</li>
                <li>Scan this picture, or type the key below.</li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="QR code for the authenticator app" width={176} height={176} className="mx-auto rounded-control bg-white p-2" />
              <p className="break-all text-center font-mono text-sm" aria-label="Setup key">{setup.secret}</p>
              {codeField}
            </>
          )}
          {!enrolling && codeField}
          <Button variant="secondary" onClick={signOut}>Sign out</Button>
        </CardBody>
      </Card>
    </main>
  );
}
