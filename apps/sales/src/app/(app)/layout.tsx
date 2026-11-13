import { getSalesState } from "@/lib/my-state";
import { MeProvider } from "@/components/me-context";
import { NoAccess } from "@/components/no-access";
import { TabBar } from "@/components/tab-bar";

export const dynamic = "force-dynamic";

/** Everything behind sign-in: checks the account is a linked employee on a plan with Field sales, then shows the tabs. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getSalesState();
  if (!state || !state.linked) return <NoAccess kind="access" />;
  if (!state.module) return <NoAccess kind="module" />;
  return (
    <MeProvider state={state}>
      <div className="mx-auto min-h-dvh max-w-md pb-[calc(5rem+env(safe-area-inset-bottom))]">{children}</div>
      <TabBar />
    </MeProvider>
  );
}
