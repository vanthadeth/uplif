import { getStockState } from "@/lib/stock-state";
import { StockProvider } from "@/components/stock-context";
import { NoAccess } from "@/components/no-access";
import { AppBar } from "@/components/app-bar";
import { TabBar } from "@/components/tab-bar";
import { OutboxProvider } from "@/components/outbox-context";
import { OutboxBar } from "@/components/outbox-bar";

export const dynamic = "force-dynamic";

/** Everything behind sign-in: checks the plan has Stock and the role may use it, then shows the tabs. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const state = await getStockState();
  if (!state) return <NoAccess kind="access" />;
  if (!state.module) return <NoAccess kind="module" />;
  if (!state.canRead) return <NoAccess kind="access" />;
  return (
    <StockProvider state={state}><OutboxProvider>
      <div className="mx-auto min-h-dvh max-w-md pb-[calc(6.5rem+env(safe-area-inset-bottom))]"><AppBar /><OutboxBar />{children}</div>
      <TabBar />
    </OutboxProvider></StockProvider>
  );
}
