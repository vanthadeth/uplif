import { getTimeState } from "@/lib/time-state";
import { TimeProvider } from "@/components/time-context";
import { NoAccess } from "@/components/no-access";
import { AppBar } from "@/components/app-bar";
import { TabBar } from "@/components/tab-bar";

export const dynamic = "force-dynamic";

/** Everything behind sign-in: checks the plan has Attendance and the role may look after others, then shows the tabs. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getTimeState();
  if (!state) return <NoAccess kind="access" />;
  if (!state.module) return <NoAccess kind="module" />;
  if (!state.canLook) return <NoAccess kind="access" />;
  return (
    <TimeProvider state={state}>
      <div className="mx-auto min-h-dvh max-w-md pb-[calc(6.5rem+env(safe-area-inset-bottom))]"><AppBar />{children}</div>
      <TabBar />
    </TimeProvider>
  );
}
