"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ChevronLeft, MapPin, Pencil, Phone, RotateCcw } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Reveal, Skeleton, useToast } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { initials, shownName, useSignedUrls, type CustomerDetail } from "@/lib/customers";
import { useMe } from "./me-context";

/** Customer details: contacts with tap-to-call, typed photos, notes and location. Visits and calls join this page in later releases. */
export function CustomerView({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const me = useMe();
  const toast = useToast();
  const router = useRouter();
  const [c, setC] = useState<CustomerDetail | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    createClient().rpc("sales_customer_detail", { p_id: id }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setFailed(true); return; }
      setFailed(false); setC((data as unknown as CustomerDetail | null) ?? null);
    });
    return () => { live = false; };
  }, [id, tick]);
  const urls = useSignedUrls((c?.photos ?? []).map((p) => p.path));
  const back = (
    <Link href={`/customers/${id}`} aria-label={t("go.det.back")} className="grid size-11 place-items-center rounded-full text-muted active:bg-neutral-soft"><ChevronLeft className="size-6" aria-hidden /></Link>
  );

  async function archive(on: boolean) {
    const { error } = await createClient().rpc("sales_archive_customer", { p_id: id, p_archived: on });
    if (error) { toast("error", t("go.form.saveFailed")); return; }
    setTick(tick + 1); router.refresh();
  }

  if (failed) return <div className="flex flex-col gap-3 p-4"><div className="pt-2">{back}</div><ErrorState title={t("go.cust.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={() => setTick(tick + 1)}>{t("go.retry")}</Button>} /></div>;
  if (c === undefined) return (
    <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-4 p-4">
      <div className="pt-2">{back}</div>
      <Skeleton className="h-24 w-full rounded-card" /><Skeleton className="h-32 w-full rounded-card" /><Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
  if (c === null) return <div className="flex flex-col gap-3 p-4"><div className="pt-2">{back}</div><EmptyState title={t("go.det.notFound")} body={t("go.det.notFoundBody")} /></div>;

  const name = shownName(c, locale);
  const def = c.photos.find((p) => p.is_default);
  const hero = def ? urls[def.path] : undefined;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between pt-2">
        {back}
        {me.can_update && !c.archived_at && <Link href={`/customers/${id}/edit`}><Button><Pencil className="size-4" aria-hidden />{t("go.det.edit")}</Button></Link>}
      </div>
      <Reveal>
        <div className="flex items-center gap-4">
          {hero
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={hero} alt="" className="size-20 shrink-0 rounded-full object-cover" />
            : <span aria-hidden className="grid size-20 shrink-0 place-items-center rounded-full bg-primary-soft text-2xl font-bold text-primary-ink">{initials(name)}</span>}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-tight">{name}</h1>
            {locale !== "en" && c.name_local && <p className="text-muted">{c.name}</p>}
            <p className="text-sm text-muted">{fill(t("go.det.registered"), { date: new Date(c.created_at).toLocaleDateString(locale === "km" ? "km-KH" : "en-GB", { day: "numeric", month: "short", year: "numeric" }) })}</p>
          </div>
        </div>
      </Reveal>
      {c.archived_at && <p className="flex items-center gap-2 rounded-control bg-warning-soft p-3 text-warning-ink"><Badge tone="warning">{t("go.cust.archived")}</Badge>{t("go.det.archivedNote")}</p>}

      {(c.address || (c.latitude != null && c.longitude != null)) && (
        <Reveal delay={40}>
          <Card className="flex items-start gap-3 p-4">
            <MapPin className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
            <div className="min-w-0 flex-1">
              <b className="block text-sm text-muted">{t("go.det.address")}</b>
              {c.address && <p>{c.address}</p>}
              {c.latitude != null && c.longitude != null && (
                <a href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-semibold text-link">{t("go.det.location")}</a>
              )}
            </div>
          </Card>
        </Reveal>
      )}

      <Reveal delay={80}>
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted">{t("go.det.contacts")}</h2>
          {c.contacts.length === 0 ? <Card className="p-4 text-muted">{t("go.cust.noContact")}</Card> : (
            <Card className="divide-y divide-line">
              {c.contacts.map((ct) => (
                <div key={ct.id} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <b className="flex items-center gap-2">{ct.name}{ct.is_default && <Badge tone="info">{t("go.det.main")}</Badge>}</b>
                    {ct.phone && <span className="text-muted">{ct.phone}</span>}
                  </div>
                  {ct.phone && <a href={`tel:${ct.phone.replace(/[^+\d]/g, "")}`} aria-label={`${t("go.det.call")} ${ct.name}`} className="grid size-12 place-items-center rounded-full bg-success-soft text-success-ink"><Phone className="size-5" aria-hidden /></a>}
                </div>
              ))}
            </Card>
          )}
        </section>
      </Reveal>

      {c.notes && (
        <Reveal delay={120}><section className="flex flex-col gap-2"><h2 className="px-1 text-sm font-semibold text-muted">{t("go.det.notes")}</h2><Card className="whitespace-pre-wrap p-4">{c.notes}</Card></section></Reveal>
      )}

      {c.photos.length > 0 && (
        <Reveal delay={160}>
          <section className="flex flex-col gap-2">
            <h2 className="px-1 text-sm font-semibold text-muted">{t("go.det.photos")}</h2>
            <div className="grid grid-cols-2 gap-2">
              {c.photos.map((p) => (
                <figure key={p.id} className="overflow-hidden rounded-card border border-line bg-surface">
                  {urls[p.path]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={urls[p.path]} alt={p.note ?? t(`go.photo.${p.type}` as MessageKey)} className="aspect-square w-full object-cover" />
                    : <Skeleton className="aspect-square w-full rounded-none" />}
                  <figcaption className="p-2 text-sm"><b className="block">{t(`go.photo.${p.type}` as MessageKey)}</b>{p.note && <span className="text-muted">{p.note}</span>}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        </Reveal>
      )}

      {me.can_manage && (
        <Button variant="quiet" onClick={() => archive(!c.archived_at)}>
          {c.archived_at ? <RotateCcw className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}{t(c.archived_at ? "go.det.unarchive" : "go.det.archive")}
        </Button>
      )}
    </div>
  );
}
