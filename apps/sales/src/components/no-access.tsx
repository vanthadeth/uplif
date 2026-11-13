"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarX, RefreshCw, ShieldX, UserRound } from "lucide-react";
import { Button } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { LanguageBar } from "./language-bar";
import { createClient } from "@/lib/supabase/client";

/** Shown instead of the app when the account is not linked to an employee, or the plan has no Field sales. */
export function NoAccess({ kind }: { kind: "access" | "module" }) {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  useEffect(() => { createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);
  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }
  const isModule = kind === "module";
  const Icon = isModule ? CalendarX : ShieldX;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold">
          <UserRound className="size-4 shrink-0" aria-hidden /><span className="truncate">{email || t("go.me.signedIn")}</span>
        </span>
        <LanguageBar />
      </div>
      <div className="flex flex-1 flex-col justify-center gap-5 pb-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-22 place-items-center rounded-full bg-neutral-soft text-muted"><Icon className="size-11" aria-hidden /></span>
          <h1 className="text-2xl font-bold tracking-tight">{t(isModule ? "go.noModule.title" : "go.noAccess.title")}</h1>
          <p className="text-muted">{t(isModule ? "go.noModule.body" : "go.noAccess.body")}</p>
        </div>
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
          <h2 className="caps text-xs font-bold text-muted">{t("go.noAccess.next")}</h2>
          {[isModule ? "go.noModule.s1" : "go.noAccess.s1", isModule ? "go.noModule.s2" : "go.noAccess.s2"].map((k, i) => (
            <p key={k} className="flex items-start gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary-ink">{i + 1}</span>{t(k as "go.noAccess.s1")}</p>
          ))}
        </section>
        <div className="flex flex-col gap-2">
          <Button variant="primary" className="h-13" onClick={() => router.refresh()}><RefreshCw className="size-4" aria-hidden />{t("go.retry")}</Button>
          <Button variant="quiet" onClick={signOut}>{t("go.signOut.other")}</Button>
        </div>
      </div>
    </main>
  );
}
