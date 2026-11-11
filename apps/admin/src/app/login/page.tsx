"use client";
import { useEffect, useState } from "react";
import { Button, Card, CardBody } from "@uplif/ui";
import { createClient } from "@uplif/supabase/client";
import { safeNext } from "@/lib/safe-next";

export default function LoginPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(new URLSearchParams(location.search).has("error")); }, []);
  async function google() {
    const next = safeNext(new URLSearchParams(location.search).get("next")) ?? "/";
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">UPLIF Super Admin</h1>
            <p className="text-muted">For platform administrators only. Sign in with your Google account.</p>
          </div>
          {failed && <p role="alert" className="text-danger-ink">Sign-in did not finish. Try again.</p>}
          <Button variant="primary" onClick={google}>Continue with Google</Button>
        </CardBody>
      </Card>
    </main>
  );
}
