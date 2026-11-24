"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Button, EmptyState, Skeleton, resizeImage, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { shownName, type CustomerDetail } from "@/lib/customers";
import { LOG_COLLECTION, LOG_ORDER, LOG_REASONS, LOG_STATUS, type LogJob } from "@/lib/go-outbox";
import { goCache } from "@/lib/offline";
import { useMe } from "./me-context";
import { useGoOutbox } from "./outbox-context";

const uid = () => crypto.randomUUID();
interface Draft { key: string; blob: Blob; preview: string }
interface OpenVisit { id: string; customer_id: string | null; checked_in_at: string; name: string | null; name_local: string | null; outside_range: boolean; distance_m: number | null }
type Next = "" | "tomorrow" | "week";

const dateIn = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function Chips({ label, optional, value, options, onChange, prefix }: { label: string; optional?: boolean; value: string; options: readonly string[]; onChange: (v: string) => void; prefix: string }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-2 font-semibold">{label}{optional && <span className="ms-1 text-xs font-normal text-muted">{t("go.log.optional")}</span>}</div>
      <div role="radiogroup" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(value === o && optional ? "" : o)}
            className={`min-h-11 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors ${value === o ? "bg-primary font-semibold text-white" : "border border-line-strong bg-surface"}`}>{t(`${prefix}.${o}` as MessageKey)}</button>
        ))}
      </div>
    </div>
  );
}

/**
 * The answers after a visit (this also checks out) or a call. Saved on the phone first when there is no signal.
 * A visit comes from the open visit; a call is for the customer in the address.
 */
export default function LogForm({ type, customerId }: { type: "visit" | "call"; customerId?: string }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const ob = useGoOutbox();
  const router = useRouter();
  const toast = useToast();
  const [visit, setVisit] = useState<OpenVisit | null | undefined>(type === "visit" ? undefined : null);
  const [name, setName] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [order, setOrder] = useState("");
  const [collection, setCollection] = useState("");
  const [next, setNext] = useState<Next>("");
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const op = useRef(uid());
  const file = useRef<HTMLInputElement>(null);
  const started = useRef(new Date());
  const itemsRef = useRef(ob.items);
  itemsRef.current = ob.items;

  useEffect(() => {
    const supabase = createClient();
    const owner = me.employee_id ?? "";
    if (type === "visit") {
      supabase.rpc("sales_open_visit").then(async ({ data, error: e }) => {
        if (!e) { setVisit((data as unknown as OpenVisit) ?? null); return; }
        // No signal: a check-in still waiting on the phone is the open visit.
        const waiting = itemsRef.current.find((i) => i.data.kind === "checkin");
        setVisit(waiting && waiting.data.kind === "checkin"
          ? { id: waiting.data.opId, customer_id: waiting.data.customerId || null, checked_in_at: waiting.data.at, name: waiting.data.name || null, name_local: null, outside_range: false, distance_m: null } : null);
      });
    } else if (customerId) {
      void goCache.get<CustomerDetail>(owner, `detail:${customerId}`).then((c) => c && setName(shownName(c.value, locale)));
      supabase.rpc("sales_customer_detail", { p_id: customerId }).then(({ data }) => { const d = data as unknown as CustomerDetail | null; if (d) setName(shownName(d, locale)); });
    }
  }, [type, customerId, me.employee_id, locale]);

  const cid = type === "visit" ? visit?.customer_id ?? "" : customerId ?? "";
  const shown = type === "visit" ? (visit?.name ? shownName({ name: visit.name, name_local: visit.name_local }, locale) : null) : name;
  const canPhoto = !!cid;

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

  async function save() {
    if (busy) return;
    if (!reason || !status || !order || !collection) { setError(t("go.log.missing")); return; }
    setBusy(true); setError("");
    let lat: number | null = null, lon: number | null = null;
    if (type === "visit" && navigator.geolocation) {
      await new Promise<void>((res) => navigator.geolocation.getCurrentPosition((p) => { lat = p.coords.latitude; lon = p.coords.longitude; res(); }, () => res(), { timeout: 5000, maximumAge: 60000 }));
    }
    const job: LogJob = {
      kind: "log", type, customerId: cid, companyId: me.company_id ?? "", visitId: visit?.id ?? null, opId: op.current,
      reason, status, order, collection, next: next === "tomorrow" ? dateIn(1) : next === "week" ? dateIn(7) : null,
      body: body.trim(), at: new Date().toISOString(), lat, lon,
      seconds: Math.round((Date.now() - started.current.getTime()) / 1000), photos: drafts.map((d) => ({ key: d.key, blob: d.blob })),
    };
    const r = await ob.submit(job);
    setBusy(false);
    if (r.error) { setError(t("go.log.failed")); return; }
    toast("success", t(r.queued ? "go.form.savedOffline" : type === "visit" ? "go.log.savedVisit" : "go.log.savedCall"));
    router.replace(cid ? `/customers/${cid}` : "/");
  }

  const title = type === "visit" ? t("go.log.visitTitle") : t("go.log.callTitle");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <Link href={cid ? `/customers/${cid}` : "/"} aria-label={t("go.cancel")} className="grid size-10 place-items-center"><X className="size-5" aria-hidden /></Link>
        <div className="min-w-0 flex-1"><h1 className="m-0 truncate text-base font-semibold leading-tight">{shown ? fill(t(type === "visit" ? "go.log.visitOf" : "go.log.callOf"), { name: shown }) : title}</h1></div>
      </header>
      {visit === undefined ? (
        <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-3 p-4"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
      ) : type === "visit" && visit === null ? (
        <div className="p-4"><EmptyState title={t("go.log.noVisitTitle")} body={t("go.log.noVisitBody")} action={<Link href="/check-in"><Button variant="primary">{t("go.today.checkIn")}</Button></Link>} /></div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4.5 p-4 pb-36">
            {type === "visit" && visit && visit.distance_m !== null && visit.outside_range && (
              <p role="status" className="m-0 rounded-card bg-warning-soft p-3 text-sm text-warning-ink">{fill(t("go.log.farWarn"), { m: visit.distance_m })}</p>
            )}
            <Chips label={t("go.log.reason")} value={reason} options={LOG_REASONS[type]} onChange={setReason} prefix={`go.log.${type}.reason`} />
            <Chips label={t(type === "visit" ? "go.log.visitStatus" : "go.log.callStatus")} value={status} options={LOG_STATUS[type]} onChange={setStatus} prefix={`go.log.${type}.status`} />
            <Chips label={t("go.log.order")} value={order} options={LOG_ORDER} onChange={setOrder} prefix="go.log.order" />
            <Chips label={t("go.log.collection")} value={collection} options={LOG_COLLECTION} onChange={setCollection} prefix="go.log.collection" />
            <Chips label={t(type === "visit" ? "go.log.nextVisit" : "go.log.nextCall")} optional value={next} options={["tomorrow", "week"]} onChange={(v) => setNext(v as Next)} prefix="go.log.next" />
            <div>
              <label htmlFor="log-notes" className="mb-2 block font-semibold">{t("go.log.notes")}<span className="ms-1 text-xs font-normal text-muted">{t("go.log.optional")}</span></label>
              <textarea id="log-notes" value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} className="min-h-24 w-full rounded-control border border-line-strong bg-surface p-3" />
            </div>
            {canPhoto && (
              <div>
                <div className="mb-2 font-semibold">{t("go.log.photos")}<span className="ms-1 text-xs font-normal text-muted">{t("go.log.optional")}</span></div>
                <div className="flex flex-wrap gap-2">
                  {drafts.map((d) => (
                    <span key={d.key} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={d.preview} alt="" className="size-20 rounded-control object-cover" />
                      <button type="button" aria-label={t("go.conv.removePhoto")} onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))} className="absolute -end-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-ink text-white"><X className="size-3.5" aria-hidden /></button>
                    </span>
                  ))}
                  <input ref={file} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
                  <button type="button" onClick={() => file.current?.click()} className="flex min-h-12 items-center gap-2 rounded-card border-[1.5px] border-dashed border-muted px-4 font-semibold text-ink-2"><Camera className="size-5" aria-hidden />{t("go.log.addPhoto")}</button>
                </div>
              </div>
            )}
          </div>
          <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-md flex-col gap-2 border-t border-line bg-surface px-4 pb-6 pt-3">
            {error && <p role="alert" className="m-0 rounded-card bg-danger-soft p-2 text-sm text-danger-ink">{error}</p>}
            {type === "visit" && <p className="m-0 text-center text-xs text-muted">{t("go.log.savedFirst")}</p>}
            <Button variant="primary" className="h-12 w-full" loading={busy} onClick={save}>{t(type === "visit" ? "go.log.checkOut" : "go.log.saveCall")}</Button>
          </footer>
        </>
      )}
    </div>
  );
}
