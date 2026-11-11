"use client";
import { Card, CardBody, Skeleton } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";

/** Announces loading to screen readers; the grey shapes are decoration. */
function Frame({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">{t("loading.page")}</span>
      {children}
    </div>
  );
}

const Title = () => <Skeleton className="h-8 w-48" />;

/** Page title, a toolbar and a table: users, branches, roles, audit. */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Frame>
      <div className="flex items-center justify-between gap-3"><Title /><Skeleton className="h-(--control-h) w-32" /></div>
      <Card>
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="ms-auto h-4 w-1/5" />
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  );
}

/** Page title and a stack of fields: company settings. */
export function FormSkeleton() {
  return (
    <Frame>
      <Title />
      <Card><CardBody className="flex max-w-xl flex-col gap-5">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-(--control-h) w-full" /></div>
        ))}
        <Skeleton className="h-(--control-h) w-28" />
      </CardBody></Card>
    </Frame>
  );
}

/** Dashboard: four summary cards, the activity list, then invitations beside the plan card. */
export function DashboardSkeleton() {
  return (
    <Frame>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}><CardBody className="flex flex-col gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /><Skeleton className="h-3 w-3/4" /></CardBody></Card>
        ))}
      </div>
      <Card><CardBody className="flex flex-col gap-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</CardBody></Card>
      <div className="grid gap-4 lg:grid-cols-[2.2fr_1fr]">
        <Card><CardBody className="flex flex-col gap-3"><Skeleton className="h-4 w-40" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></CardBody></Card>
        <Card><CardBody className="flex flex-col gap-3"><Skeleton className="h-4 w-20" /><Skeleton className="h-6 w-32" /><Skeleton className="h-2 w-full" /></CardBody></Card>
      </div>
    </Frame>
  );
}

/**
 * The whole console frame, for the first load or a switch into it, when the layout itself is still
 * fetching and there is no real shell to show yet. Matches AppShell so nothing jumps when it arrives.
 */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <aside aria-hidden="true" className="hidden w-72 shrink-0 flex-col gap-2 border-e border-(--sb-line) bg-(--sb-bg) p-2 md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-(--sb-line) px-1">
          <span className="inline-flex size-8 items-center justify-center rounded-[9px] bg-(--sb-acc) font-bold text-(--sb-mark-fg)">U</span>
          <span className="text-lg font-bold text-(--sb-fg)">UPLIF</span>
        </div>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-11 animate-[uplif-pulse_1.4s_ease-in-out_infinite] rounded-[10px] bg-(--sb-hover)" />)}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header aria-hidden="true" className="flex min-h-16 items-center gap-2 border-b border-line bg-surface px-4 sm:px-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="ms-auto size-9 rounded-full" />
        </header>
        <main className="flex-1 p-4 sm:p-6"><DashboardSkeleton /></main>
      </div>
    </div>
  );
}
