"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Skeleton } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { goCache } from "@/lib/offline";
import type { CustomerDetail } from "@/lib/customers";
import { useMe } from "./me-context";
import { CustomerForm } from "./customer-form";

/** The edit form drawn from the copy saved on this phone, for use without signal. */
export function EditFromSaved({ id }: { id: string }) {
  const { t } = useI18n();
  const me = useMe();
  const [c, setC] = useState<CustomerDetail | null | undefined>(undefined);
  useEffect(() => { void goCache.get<CustomerDetail>(me.employee_id ?? "", `detail:${id}`).then((r) => setC(r?.value ?? null)); }, [id, me.employee_id]);
  if (c === undefined) return <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-3 p-4"><Skeleton className="h-8 w-40" /><Skeleton className="h-40 w-full rounded-card" /></div>;
  if (c === null) return <div className="p-4 pt-6"><EmptyState title={t("go.off.nothingTitle")} body={t("go.off.nothingBody")} action={<Link href="/customers"><Button variant="primary">{t("go.off.toCustomers")}</Button></Link>} /></div>;
  return <CustomerForm initial={c} />;
}
