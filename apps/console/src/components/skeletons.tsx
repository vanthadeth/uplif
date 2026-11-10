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

/** Dashboard: welcome title and one card. */
export function CardSkeleton() {
  return (
    <Frame>
      <Skeleton className="h-8 w-64" />
      <Card className="max-w-xl"><CardBody className="flex flex-col gap-3">
        <Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-24" /><Skeleton className="h-(--control-h) w-28" />
      </CardBody></Card>
    </Frame>
  );
}
