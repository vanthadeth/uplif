"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Skeleton } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { goCache, lastOwner } from "@/lib/offline";
import { safeNext } from "@/lib/safe-next";
import type { SalesState } from "@/lib/my-state";
import { MeProvider } from "./me-context";
import { TabBar } from "./tab-bar";
import { CustomersList } from "./customers-list";
import { Conversation } from "./conversation";
import { CustomerView } from "./customer-view";

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The app opened without signal: the same screens, drawn from what this phone saved, with tabs and the customer list. */
export function OfflineShell() {
  const { t } = useI18n();
  const [state, setState] = useState<SalesState | null | undefined>(undefined);
  const [to, setTo] = useState("/customers");

  useEffect(() => {
    const wanted = safeNext(new URLSearchParams(location.search).get("to")) ?? "/customers";
    setTo(wanted);
    // Back online: go to the real screen.
    const online = () => location.replace(wanted);
    addEventListener("online", online);
    // Opening another screen needs a fresh page load (the worker answers it with this shell), not an in-app jump.
    const tap = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      e.preventDefault(); e.stopPropagation();
      location.assign(u.pathname + u.search);
    };
    document.addEventListener("click", tap, true);
    const owner = lastOwner();
    (owner ? goCache.get<SalesState>(owner, "me") : Promise.resolve(undefined)).then((r) => setState(r?.value ?? null));
    return () => { removeEventListener("online", online); document.removeEventListener("click", tap, true); };
  }, []);

  if (state === undefined) return <div role="status" aria-label={t("go.loading")} className="mx-auto flex max-w-md flex-col gap-3 p-4 pt-6"><Skeleton className="h-8 w-40" /><Skeleton className="h-12 w-full" /><Skeleton className="h-16 w-full rounded-card" /><Skeleton className="h-16 w-full rounded-card" /></div>;
  if (state === null) return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <EmptyState title={t("go.off.notReadyTitle")} body={t("go.off.notReadyBody")} action={<Button onClick={() => location.reload()}>{t("go.retry")}</Button>} />
    </div>
  );

  const path = to.split("?")[0].replace(/\/+$/, "") || "/";
  let screen: React.ReactNode;
  let m: RegExpMatchArray | null;
  if (path === "/customers") screen = <CustomersList />;
  else if ((m = path.match(new RegExp(`^/customers/(${uuid})$`)))) screen = <Conversation id={m[1]} />;
  else if ((m = path.match(new RegExp(`^/customers/(${uuid})/details$`)))) screen = <CustomerView id={m[1]} />;
  else screen = (
    <div className="flex flex-col gap-3 p-4 pt-6">
      <EmptyState title={t("go.off.needSignalTitle")} body={t("go.off.needSignalBody")} action={<Link href="/customers"><Button variant="primary">{t("go.off.toCustomers")}</Button></Link>} />
    </div>
  );
  return (
    <MeProvider state={state}>
      <div className="mx-auto min-h-dvh max-w-md pb-[calc(5rem+env(safe-area-inset-bottom))]">{screen}</div>
      <TabBar path={path} />
    </MeProvider>
  );
}
