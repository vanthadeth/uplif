"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, ChevronLeft, Clock, Phone, Send, TriangleAlert, X } from "lucide-react";
import { Button, EmptyState, ErrorState, Reveal, Skeleton, isNetworkError, resizeImage } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { initials, shownName, useSignedUrls, type CustomerDetail, type TimelineEvent } from "@/lib/customers";
import { languageOf } from "@/lib/languages";
import { goCache } from "@/lib/offline";
import { useMe } from "./me-context";
import { useGoOutbox } from "./outbox-context";
import type { CommentJob, GoItem, LogJob, NoteJob } from "@/lib/go-outbox";
import type { MessageKey } from "@/lib/messages";
import { OfflineNotice } from "./offline-notice";

const uid = () => crypto.randomUUID();
const dayKey = (iso: string) => new Date(iso).toDateString();

interface Draft { key: string; blob: Blob; preview: string }

/** One customer, one conversation: notes with photos from the team and replies from managers, newest at the bottom. */
export function Conversation({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const ob = useGoOutbox();
  const tag = languageOf(locale).dateTag;
  const [customer, setCustomer] = useState<CustomerDetail | null | undefined>(undefined);
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [asComment, setAsComment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const op = useRef(uid());
  const LIMIT = 50;

  const load = useCallback(async () => {
    const supabase = createClient();
    const [c, tl] = await Promise.all([
      supabase.rpc("sales_customer_detail", { p_id: id }),
      supabase.rpc("sales_timeline", { p_customer_id: id, p_limit: LIMIT }),
    ]);
    const owner = me.employee_id ?? "";
    const err = c.error ?? tl.error;
    if (err) {
      // No signal: show the copy saved on this phone, if this customer was opened before.
      const saved = isNetworkError(err) ? await goCache.get<CustomerDetail>(owner, `detail:${id}`) : undefined;
      if (!saved) { setFailed(true); return; }
      const tl2 = await goCache.get<TimelineEvent[]>(owner, `timeline:${id}`);
      setFailed(false); setSavedAt(saved.savedAt);
      setCustomer(saved.value); setEvents(tl2?.value ?? []); setMore(false);
      return;
    }
    setFailed(false); setSavedAt(null);
    const detail = (c.data as unknown as CustomerDetail | null) ?? null;
    setCustomer(detail);
    const list = (tl.data ?? []) as unknown as TimelineEvent[];
    setEvents(list); setMore(list.length === LIMIT);
    if (detail) { void goCache.set(owner, `detail:${id}`, detail); void goCache.set(owner, `timeline:${id}`, list); }
    void supabase.rpc("sales_mark_read", { p_customer_id: id });
  }, [id, me.employee_id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [events?.length, ob.items.length]);

  async function older() {
    if (!events?.length) return;
    const { data } = await createClient().rpc("sales_timeline", { p_customer_id: id, p_limit: LIMIT, p_before: events[0].created_at });
    const list = (data ?? []) as unknown as TimelineEvent[];
    setEvents([...list, ...events]); setMore(list.length === LIMIT);
  }

  async function addPhotos(list: FileList | null) {
    if (!list) return;
    const add: Draft[] = [];
    for (const f of Array.from(list).slice(0, 10 - drafts.length)) {
      const blob = await resizeImage(f, 1280, 0.8);
      add.push({ key: uid(), blob, preview: URL.createObjectURL(blob) });
    }
    setDrafts((d) => [...d, ...add]);
    if (file.current) file.current.value = "";
  }

  async function send() {
    if (busy || (!text.trim() && drafts.length === 0)) return;
    setBusy(true); setError(false);
    const comment = asComment && me.can_comment && drafts.length === 0;
    const r = await ob.submit(comment
      ? { kind: "comment", customerId: id, opId: op.current, body: text }
      : { kind: "note", customerId: id, companyId: me.company_id ?? "", opId: op.current, body: text, occurredAt: new Date().toISOString(), photos: drafts.map((d) => ({ key: d.key, blob: d.blob })) });
    setBusy(false);
    if (r.error) { setError(true); return; }
    op.current = uid(); setText(""); setDrafts([]);
    if (!r.queued) await load();
  }

  // Notes saved on this phone that the server does not have yet, shown at the bottom of the conversation.
  useEffect(() => ob.onSynced(() => void load()), [ob, load]);
  const mine = ob.items.filter((i) => i.data.kind !== "customer" && i.data.kind !== "checkin" && i.data.kind !== "clock" && i.data.customerId === id);

  const urls = useSignedUrls((events ?? []).flatMap((e) => e.photo_paths));
  const heroUrls = useSignedUrls((customer?.photos ?? []).filter((p) => p.is_default).map((p) => p.path));

  const back = <Link href="/customers" aria-label={t("go.cust.title")} className="grid size-11 place-items-center rounded-full text-muted active:bg-neutral-soft"><ChevronLeft className="size-6" aria-hidden /></Link>;
  if (failed) return <div className="flex flex-col gap-3 p-4"><div className="pt-2">{back}</div><ErrorState title={t("go.cust.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={() => void load()}>{t("go.retry")}</Button>} /></div>;
  if (customer === null) return <div className="flex flex-col gap-3 p-4"><div className="pt-2">{back}</div><EmptyState title={t("go.det.notFound")} body={t("go.det.notFoundBody")} /></div>;

  const name = customer ? shownName(customer, locale) : "";
  const def = customer?.contacts.find((c) => c.is_default) ?? customer?.contacts[0];
  const hero = customer?.photos.find((p) => p.is_default);
  const authorName = (e: TimelineEvent) => (locale !== "en" && e.author_name_local) || e.author_name || "";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface px-3 pt-2">
        <div className="flex h-12 items-center gap-2">
          {back}
          {customer ? (
            <>
              {hero && heroUrls[hero.path]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={heroUrls[hero.path]} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                : <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-neutral-soft text-sm font-semibold text-ink-2">{initials(name)}</span>}
              <div className="min-w-0 flex-1"><b className="block truncate">{name}</b>{def && <span className="block truncate text-xs text-muted">{[def.name, def.phone].filter(Boolean).join(" · ")}</span>}</div>
              {def?.phone && <a href={`tel:${def.phone.replace(/[^+\d]/g, "")}`} aria-label={fill(t("go.conv.call"), { name: def.name })} className="grid size-10 place-items-center rounded-full bg-success-soft text-success-ink"><Phone className="size-5" aria-hidden /></a>}
            </>
          ) : <><Skeleton className="size-9 rounded-full" /><Skeleton className="h-5 w-40" /></>}
        </div>
        <nav className="flex h-10 items-end gap-5 text-[13px]">
          <span className="border-b-2 border-primary pb-2 font-semibold text-link">{t("go.conv.tabConversation")}</span>
          <Link href={`/customers/${id}/details`} className="pb-2 text-muted">{t("go.conv.tabDetails")}</Link>
          <Link href={`/customers/${id}/call`} className="ms-auto pb-2 font-semibold text-link">{t("go.conv.logCall")}</Link>
        </nav>
      </header>

      <div className="flex flex-1 flex-col justify-end gap-2.5 px-4 pb-40 pt-3">
        {savedAt !== null && <OfflineNotice savedAt={savedAt} />}
        {events === null ? (
          <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-3"><Skeleton className="h-20 w-4/5 rounded-card" /><Skeleton className="ms-auto h-16 w-3/4 rounded-card" /><Skeleton className="h-24 w-4/5 rounded-card" /></div>
        ) : events.length === 0 ? (
          <EmptyState title={t("go.conv.empty")} body={t("go.conv.emptyBody")} />
        ) : (
          <>
            {more && <Button variant="quiet" onClick={() => void older()}>{t("go.conv.loadMore")}</Button>}
            {events.map((e, i) => {
              const showDay = i === 0 || dayKey(events[i - 1].created_at) !== dayKey(e.created_at);
              const comment = e.kind === "comment";
              return (
                <div key={e.id} className="flex flex-col gap-2.5">
                  {showDay && <p className="text-center text-xs text-muted">{new Date(e.created_at).toDateString() === new Date().toDateString() ? t("go.conv.today") : new Date(e.created_at).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" })}</p>}
                  <Reveal>
                    <div className={comment ? "ms-auto max-w-[290px] rounded-card border border-primary-soft bg-primary-soft px-3 py-2.5" : "max-w-[300px] rounded-card border border-line bg-surface p-3"}>
                      <p className={`text-xs font-semibold ${comment ? "text-primary-ink" : "text-link"}`}>
                        {comment ? fill(t("go.conv.managerFrom"), { name: e.mine ? t("go.conv.you") : authorName(e) })
                          : fill(t(e.kind === "visit" ? "go.log.tlVisit" : e.kind === "call" ? "go.log.tlCall" : "go.conv.noteFrom"), { name: e.mine ? t("go.conv.you") : authorName(e) })} · {new Date(e.created_at).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
                      </p>
                      {(e.kind === "visit" || e.kind === "call") && e.detail && <LogSummary kind={e.kind} d={e.detail} />}
                      {e.body && <p className="mt-1 whitespace-pre-wrap">{e.body}</p>}
                      {e.photo_paths.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {e.photo_paths.map((p) => urls[p]
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <a key={p} href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" className="size-20 rounded-control object-cover" /></a>
                            : <Skeleton key={p} className="size-20" />)}
                        </div>
                      )}
                    </div>
                  </Reveal>
                </div>
              );
            })}
          </>
        )}
        {mine.map((i) => <PendingBubble key={i.id} item={i} />)}
        <div ref={end} />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-md flex-col gap-2 px-4 pb-3 pt-2">
          {drafts.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {drafts.map((d) => (
                <div key={d.key} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.preview} alt="" className="size-16 rounded-control object-cover" />
                  <button type="button" aria-label={t("go.conv.removePhoto")} onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))}
                    className="absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink text-surface"><X className="size-3.5" aria-hidden /></button>
                </div>
              ))}
            </div>
          )}
          {me.can_comment && (
            <div className="flex gap-2" role="group">
              {([false, true] as const).map((v) => (
                <button key={String(v)} type="button" aria-pressed={asComment === v} onClick={() => setAsComment(v)}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${asComment === v ? "bg-primary text-white" : "bg-neutral-soft text-ink-2"}`}>{t(v ? "go.conv.asComment" : "go.conv.asNote")}</button>
              ))}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-danger-ink">{t("go.conv.sendFailed")}</p>}
          <div className="flex items-center gap-2">
            <input ref={file} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
            {!(asComment && me.can_comment) && (
              <button type="button" aria-label={t("go.conv.addPhoto")} onClick={() => file.current?.click()} className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-soft text-ink-2"><Camera className="size-5" aria-hidden /></button>
            )}
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
              placeholder={t(asComment && me.can_comment ? "go.conv.writeComment" : "go.conv.writeNote")} aria-label={t(asComment && me.can_comment ? "go.conv.writeComment" : "go.conv.writeNote")}
              className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 placeholder:text-muted" />
            <button type="button" aria-label={t("go.conv.send")} onClick={() => void send()} disabled={busy || (!text.trim() && drafts.length === 0)}
              className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-white transition-opacity disabled:opacity-40"><Send className="size-5" aria-hidden /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A note kept on this phone: waiting for signal, or refused by the server with a way to try again or remove it. */
function PendingBubble({ item }: { item: GoItem }) {
  return item.data.kind === "customer" || item.data.kind === "checkin" || item.data.kind === "clock" ? null : <PendingNote item={item} />;
}

function PendingNote({ item }: { item: GoItem }) {
  const { t, locale } = useI18n();
  const ob = useGoOutbox();
  const tag = languageOf(locale).dateTag;
  const job = item.data as NoteJob | CommentJob | LogJob;
  const blobs = job.kind === "note" || job.kind === "log" ? job.photos : [];
  const previews = useMemo(() => blobs.map((p) => ({ key: p.key, url: URL.createObjectURL(p.blob) })), [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  const failed = item.status === "failed";
  return (
    <Reveal>
      <div className={`${job.kind === "comment" ? "ms-auto max-w-[290px]" : "max-w-[300px]"} rounded-card border border-dashed ${failed ? "border-danger-ink bg-danger-soft" : "border-line-strong bg-surface"} p-3`}>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${failed ? "text-danger-ink" : "text-muted"}`}>
          {failed ? <TriangleAlert className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
          {t(failed ? "go.ob.notSent" : "go.ob.pending")} · {new Date(item.createdAt).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}
        </p>
        {job.body && <p className="mt-1 whitespace-pre-wrap">{job.body}</p>}
        {previews.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previews.map((p) => <img key={p.key} src={p.url} alt="" className="size-20 rounded-control object-cover" />)}
          </div>
        )}
        {failed && (
          <div className="mt-2 flex gap-2">
            {item.error && <span className="sr-only">{item.error}</span>}
            <Button onClick={() => void ob.retry(item.id)}>{t("go.ob.retry")}</Button>
            <Button variant="quiet" onClick={() => void ob.dismiss(item.id)}>{t("go.ob.remove")}</Button>
          </div>
        )}
      </div>
    </Reveal>
  );
}

/** The answers of a visit or call as small labels: reason, status, order and collection, with the length. */
function LogSummary({ kind, d }: { kind: "visit" | "call"; d: NonNullable<TimelineEvent["detail"]> }) {
  const { t } = useI18n();
  const label = (group: string, v?: string) => (v ? t(`go.log.${group}.${v}` as MessageKey) : null);
  const parts = [label(`${kind}.reason`, d.reason), label(`${kind}.status`, d.status), label("order", d.order), label("collection", d.collection)].filter(Boolean) as string[];
  const mins = kind === "visit" ? d.minutes : d.seconds != null ? Math.max(1, Math.round(d.seconds / 60)) : undefined;
  if (mins) parts.push(fill(t("go.log.minutes"), { n: mins }));
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {parts.map((p, i) => <span key={i} className="rounded-full bg-neutral-soft px-2 py-0.5 text-xs font-semibold text-ink-2">{p}</span>)}
    </div>
  );
}
