import { redirect } from "next/navigation";
import { EmptyState } from "@uplif/ui";
import { loadPlatform } from "@/lib/platform";
import { MfaForm } from "./form";

// The second sign-in step. Platform admins only: it enrolls an authenticator app the first time, then asks for a code.
export default async function MfaPage() {
  const p = await loadPlatform();
  if (!p.signedIn) redirect("/login");
  if (!p.isAdmin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
        <EmptyState title="This account cannot use Super Admin" body="Sign in with a platform administrator account." />
      </main>
    );
  }
  const { data: aal } = await p.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2") redirect("/overview");
  const { data: factors } = await p.supabase.auth.mfa.listFactors();
  const verified = factors?.totp?.[0]; // listFactors returns verified factors here
  return <MfaForm factorId={verified?.id ?? null} email={p.email} />;
}
