"use client";
import { useEffect, useState } from "react";
import { Button, Card, CardBody } from "@uplif/ui";
import { startGoogleSignIn, startTelegramSignIn } from "@uplif/auth";
import { safeNext } from "@/lib/safe-next";

const telegramEnabled = process.env.NEXT_PUBLIC_TELEGRAM_LOGIN === "true";

export default function LoginPage() {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(new URLSearchParams(location.search).has("error")); }, []);
  const nextPath = () => safeNext(new URLSearchParams(location.search).get("next")) ?? "/";
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-semibold">UPLIF Platform</h1>
            <p className="text-muted">For platform administrators only. Sign in with Google or Telegram.</p>
          </div>
          {failed && <p role="alert" className="text-danger-ink">Sign-in did not finish. Try again.</p>}
          <Button variant="primary" onClick={() => startGoogleSignIn(nextPath())}>Continue with Google</Button>
          {telegramEnabled && <Button onClick={() => startTelegramSignIn(nextPath())}>Continue with Telegram</Button>}
        </CardBody>
      </Card>
    </main>
  );
}
