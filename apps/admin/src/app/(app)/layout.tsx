import { redirect } from "next/navigation";
import { EmptyState } from "@uplif/ui";
import { loadPlatform } from "@/lib/platform";
import { AdminShell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const p = await loadPlatform();
  if (!p.signedIn) redirect("/login");
  // Not a platform admin: show nothing of the app. No menu, no data, and no hint of what exists.
  if (!p.isAdmin) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-4">
        <EmptyState title="This account cannot use Super Admin" body="Sign in with a platform administrator account." />
      </main>
    );
  }
  return <AdminShell userName={p.name} userEmail={p.email}>{children}</AdminShell>;
}
