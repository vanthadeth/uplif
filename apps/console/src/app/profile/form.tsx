"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CardBody, Input } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

export function ProfileForm() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [name, setName] = useState("");
  const [local, setLocal] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim()) return setError(t("profile.error.name"));
    setBusy(true); setError(undefined);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    const { error: err } = await supabase.from("profiles").insert({
      user_id: data.user!.id, full_name: name.trim(), full_name_local: local.trim() || null, locale,
    });
    setBusy(false);
    if (err) return setError(t("auth.error.generic"));
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
      <Card><CardBody>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div>
            <h1 className="text-xl font-semibold">{t("profile.title")}</h1>
            <p className="text-muted">{t("profile.subtitle")}</p>
          </div>
          <Input label={t("profile.name")} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label={t("profile.nameLocal")} value={local} onChange={(e) => setLocal(e.target.value)} />
          <Button type="submit" variant="primary" loading={busy}>{t("profile.continue")}</Button>
        </form>
      </CardBody></Card>
    </main>
  );
}
