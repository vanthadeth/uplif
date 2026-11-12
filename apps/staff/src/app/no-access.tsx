"use client";
import { Button, EmptyState } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { LanguageBar } from "@/components/language-bar";
import { createClient } from "@/lib/supabase/client";

export function NoAccess({ kind }: { kind: "access" | "module" }) {
  const { t } = useI18n();
  async function signOut() {
    await createClient().auth.signOut();
    location.href = "/login";
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <div className="flex justify-end"><LanguageBar /></div>
      <EmptyState title={t(kind === "module" ? "st.noModule.title" : "st.noAccess.title")} body={t(kind === "module" ? "st.noModule.body" : "st.noAccess.body")}
        action={<Button onClick={signOut}>{t("st.signOut")}</Button>} />
    </main>
  );
}
