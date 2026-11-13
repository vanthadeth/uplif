"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Award, CalendarDays, CircleCheck, FilePenLine, TrendingUp } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Reveal, Skeleton, Toggle } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { useNotifications } from "@/components/notifications-context";

interface Note { id: string; kind: string; data: Record<string, unknown>; created_at: string; read_at: string | null }

const KINDS: Record<string, { key: MessageKey; href: string; icon: typeof Award }> = {
  leave_approved: { key: "st.notif.leave_approved", href: "/record/leave", icon: CalendarDays },
  leave_rejected: { key: "st.notif.leave_rejected", href: "/record/leave", icon: CalendarDays },
  amendment_approved: { key: "st.notif.amendment_approved", href: "/record/attendance", icon: FilePenLine },
  amendment_rejected: { key: "st.notif.amendment_rejected", href: "/record/attendance", icon: FilePenLine },
  performance_review: { key: "st.notif.performance_review", href: "/record/performance", icon: TrendingUp },
  promotion: { key: "st.notif.promotion", href: "/record/job", icon: Award },
  transfer: { key: "st.notif.transfer", href: "/record/job", icon: Award },
};

/** The person's inbox: what happened to them (decisions, reviews, promotions), with one switch for new updates. */
export default function NotificationsPage() {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const inbox = useNotifications();
  const [items, setItems] = useState<Note[] | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const sb = createClient();
    const [n, s] = await Promise.all([sb.rpc("my_notifications", { p_limit: 50 }), sb.rpc("my_notification_setting")]);
    if (n.error || s.error) { setFailed(true); return; }
    setItems(n.data as Note[]); setOn(s.data as boolean);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const day = (iso: unknown, o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) => new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString(tag, o);
  const text = (n: Note): string => {
    const k = KINDS[n.kind];
    if (!k) return "";
    const d = n.data;
    const base = fill(t(k.key), {
      range: d.start === d.end ? day(d.start) : `${day(d.start)} – ${day(d.end)}`,
      date: d.date ? day(d.date) : "",
      month: d.period ? day(d.period, { month: "long", year: "numeric" }) : "",
      percent: Number(d.percent ?? 0),
      position: String((locale !== "en" && d.to_local) || d.to || ""),
    });
    return d.note ? `${base} ${fill(t("st.job.note"), { note: String(d.note) })}` : base;
  };
  const ago = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  async function toggle(v: boolean) {
    setOn(v);
    const { error } = await createClient().rpc("set_my_notification_setting", { p_on: v });
    if (error) setOn(!v);
  }
  async function markAll() {
    await createClient().rpc("mark_notifications_read", {});
    setItems((l) => l && l.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    inbox.refresh();
  }

  const unread = items?.filter((n) => !n.read_at).length ?? 0;
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("st.notif.title")}</h1>
      {failed ? <ErrorState title={t("st.notif.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />
        : !items || on === null ? <div className="flex flex-col gap-3" role="status" aria-label={t("st.notif.loading")}><Skeleton className="h-16" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        : (
          <Reveal className="flex flex-col gap-4">
            <Card className="flex flex-col gap-1 p-4">
              <Toggle checked={on} onChange={(v) => void toggle(v)} label={t("st.notif.toggle")} />
              <p className="m-0 text-sm text-muted">{t("st.notif.toggle.hint")}</p>
            </Card>
            {items.length === 0 ? <EmptyState title={t("st.notif.empty.title")} body={t("st.notif.empty.body")} /> : (
              <>
                {unread > 0 && <div className="flex justify-end"><Button onClick={() => void markAll()}><CircleCheck className="size-4" aria-hidden />{t("st.notif.markAll")}</Button></div>}
                <Card className="divide-y divide-line overflow-hidden">
                  {items.map((n) => {
                    const k = KINDS[n.kind];
                    if (!k) return null;
                    const Icon = k.icon;
                    return (
                      <Link key={n.id} href={k.href} className={`flex items-start gap-3 p-4 hover:bg-ground ${n.read_at ? "" : "bg-primary-soft/40"}`}>
                        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft text-primary-ink"><Icon className="size-4" aria-hidden /></span>
                        <span className="min-w-0 flex-1"><span className="block break-words">{text(n)}</span><span className="text-sm text-muted">{ago(n.created_at)}</span></span>
                        {!n.read_at && <Badge tone="info">•</Badge>}
                      </Link>
                    );
                  })}
                </Card>
              </>
            )}
          </Reveal>
        )}
    </div>
  );
}
