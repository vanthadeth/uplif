"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Users } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Reveal, Skeleton } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { languageOf } from "@/lib/languages";
import { createClient } from "@/lib/supabase/client";
import { initials, shortWhen, shownName, useSignedUrls, type InboxRow } from "@/lib/customers";

/** One row per customer conversation, newest first, with a dot for replies you have not opened. */
export function InboxList() {
  const { t, locale } = useI18n();
  const tag = languageOf(locale).dateTag;
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    createClient().rpc("sales_inbox", { p_limit: 100 }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setFailed(true); return; }
      setFailed(false); setRows((data ?? []) as unknown as InboxRow[]);
    });
    return () => { live = false; };
  }, [tick]);
  const urls = useSignedUrls((rows ?? []).map((r) => r.photo_path));
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("go.inbox.title")}</h1>
      {failed ? (
        <ErrorState title={t("go.inbox.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={() => setTick(tick + 1)}>{t("go.retry")}</Button>} />
      ) : rows === null ? (
        <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"><Skeleton className="size-12 rounded-full" /><div className="flex flex-1 flex-col gap-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div></div>)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("go.inbox.emptyTitle")} body={t("go.inbox.emptyBody")}
          action={<Link href="/customers"><Button variant="primary"><Users className="size-4" aria-hidden />{t("go.cust.title")}</Button></Link>} />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r, i) => {
            const name = shownName(r, locale);
            const who = (locale !== "en" && r.author_name_local) || r.author_name || "";
            const prefix = r.mine ? t("go.inbox.youPrefix") : r.kind === "comment" ? fill(t("go.inbox.managerPrefix"), { name: who }) : "";
            const photo = r.photo_path ? urls[r.photo_path] : undefined;
            return (
              <li key={r.customer_id}>
                <Reveal delay={Math.min(i, 8) * 30}>
                  <Link href={`/customers/${r.customer_id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 transition-colors active:bg-neutral-soft">
                    {photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={photo} alt="" className="size-12 shrink-0 rounded-full object-cover" />
                      : <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-primary-soft font-bold text-primary-ink">{initials(name)}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2"><b className="truncate">{name}</b><span className="shrink-0 text-xs text-muted">{shortWhen(r.last_at, tag)}</span></span>
                      <span className={`flex items-center gap-1 truncate text-sm ${r.unread ? "font-semibold text-ink" : "text-muted"}`}>
                        {r.has_photos && <Camera className="size-3.5 shrink-0" aria-label={t("go.inbox.photo")} />}
                        <span className="truncate">{prefix}{r.body || t("go.inbox.photo")}</span>
                      </span>
                    </span>
                    {r.unread && <Badge tone="info">{t("go.inbox.unread")}</Badge>}
                  </Link>
                </Reveal>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
