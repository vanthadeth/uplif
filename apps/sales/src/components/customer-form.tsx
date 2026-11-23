"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, ChevronLeft, MapPin, Plus, Trash2, X } from "lucide-react";
import { Button, Card, Input, Select, Textarea, resizeImage, useToast } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { BUCKET, photoTypes, useSignedUrls, type CustomerDetail, type PhotoType } from "@/lib/customers";
import { useMe } from "./me-context";

interface ContactDraft { key: string; name: string; phone: string; is_default: boolean }
interface PhotoDraft { key: string; path: string; blob: Blob | null; preview: string | null; type: PhotoType; note: string; is_default: boolean }

const uid = () => crypto.randomUUID();

/** Register or edit a customer: details, location, several contacts (one main number) and typed photos. New photos upload when you save. */
export function CustomerForm({ initial }: { initial?: CustomerDetail }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const me = useMe();
  const [id] = useState(() => initial?.id ?? uid());
  const [name, setName] = useState(initial?.name ?? "");
  const [nameLocal, setNameLocal] = useState(initial?.name_local ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [geo, setGeo] = useState<{ lat: number; lon: number; acc: number | null } | null>(
    initial?.latitude != null && initial?.longitude != null ? { lat: initial.latitude, lon: initial.longitude, acc: null } : null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState(false);
  const [contacts, setContacts] = useState<ContactDraft[]>(
    initial?.contacts.length ? initial.contacts.map((c) => ({ key: c.id, name: c.name, phone: c.phone ?? "", is_default: c.is_default }))
      : [{ key: uid(), name: "", phone: "", is_default: true }]);
  const [photos, setPhotos] = useState<PhotoDraft[]>(
    (initial?.photos ?? []).map((p) => ({ key: p.id, path: p.path, blob: null, preview: null, type: p.type, note: p.note ?? "", is_default: p.is_default })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const urls = useSignedUrls(photos.map((p) => (p.blob ? null : p.path)));

  function locate() {
    setLocating(true); setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGeo({ lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy) }); setLocating(false); },
      () => { setGeoError(true); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  async function addPhotos(list: FileList | null) {
    if (!list) return;
    const added: PhotoDraft[] = [];
    for (const f of Array.from(list).slice(0, 10)) {
      const blob = await resizeImage(f, 1280, 0.8);
      const key = uid();
      added.push({ key, path: `${me.company_id}/${id}/${key}.jpg`, blob, preview: URL.createObjectURL(blob), type: "other", note: "", is_default: false });
    }
    setPhotos((p) => [...p, ...added]);
    if (file.current) file.current.value = "";
  }

  const setDefaultContact = (key: string) => setContacts((cs) => cs.map((c) => ({ ...c, is_default: c.key === key })));
  const removeContact = (key: string) => setContacts((cs) => {
    const rest = cs.filter((c) => c.key !== key);
    if (rest.length > 0 && !rest.some((c) => c.is_default)) rest[0] = { ...rest[0], is_default: true };
    return rest;
  });
  const setDefaultPhoto = (key: string, on: boolean) => setPhotos((ps) => ps.map((p) => ({ ...p, is_default: on && p.key === key })));

  async function save() {
    setError(null);
    if (!name.trim()) { setError("go.form.nameRequired"); return; }
    const kept = contacts.filter((c) => c.name.trim() || c.phone.trim());
    if (kept.some((c) => !c.name.trim())) { setError("go.form.contactRequired"); return; }
    setBusy(true);
    const supabase = createClient();
    for (const p of photos) {
      if (!p.blob) continue;
      const up = await supabase.storage.from(BUCKET).upload(p.path, p.blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) { setBusy(false); setError("go.form.uploadFailed"); return; }
    }
    const { error: err } = await supabase.rpc("sales_save_customer", {
      p_id: id, p_name: name, p_name_local: nameLocal || null, p_address: address || null,
      p_latitude: geo?.lat ?? null, p_longitude: geo?.lon ?? null, p_notes: notes || null,
      p_contacts: kept.map((c) => ({ name: c.name, phone: c.phone, is_default: c.is_default })),
      p_photos: photos.map((p) => ({ path: p.path, type: p.type, note: p.note, is_default: p.is_default })),
    });
    setBusy(false);
    if (err) { setError("go.form.saveFailed"); return; }
    toast("success", t("go.form.saved"));
    router.replace(initial ? `/customers/${id}/details` : `/customers/${id}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <div className="flex items-center gap-2 pt-2">
        <Link href={initial ? `/customers/${id}/details` : "/customers"} aria-label={t("go.cancel")} className="grid size-11 place-items-center rounded-full text-muted active:bg-neutral-soft"><ChevronLeft className="size-6" aria-hidden /></Link>
        <h1 className="text-2xl font-bold tracking-tight">{t(initial ? "go.form.editTitle" : "go.form.newTitle")}</h1>
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <Input label={t("go.form.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
        <Input label={t("go.form.nameLocal")} value={nameLocal} onChange={(e) => setNameLocal(e.target.value)} autoComplete="off" />
        <Input label={t("go.form.address")} hint={t("go.form.addressHint")} value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">{t("go.form.location")}</span>
          {geo ? (
            <div className="flex items-center justify-between gap-2 rounded-control bg-success-soft p-3 text-success-ink">
              <span className="flex items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden />{geo.acc != null ? fill(t("go.form.locationSet"), { m: geo.acc }) : `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)}`}</span>
              <button type="button" onClick={() => setGeo(null)} aria-label={t("go.form.locationClear")} className="grid size-9 place-items-center rounded-full"><X className="size-4" aria-hidden /></button>
            </div>
          ) : (
            <Button type="button" onClick={locate} disabled={locating}><MapPin className="size-4" aria-hidden />{locating ? t("go.form.locating") : t("go.form.useLocation")}</Button>
          )}
          {geoError && <p role="alert" className="text-sm text-danger-ink">{t("go.form.locationDenied")}</p>}
        </div>
        <Textarea label={t("go.form.notes")} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-semibold text-muted">{t("go.form.contacts")}</h2>
        {contacts.map((c) => (
          <Card key={c.key} className="flex flex-col gap-3 p-4">
            <Input label={t("go.form.contactName")} value={c.name} onChange={(e) => setContacts((cs) => cs.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))} autoComplete="off" />
            <Input label={t("go.form.contactPhone")} type="tel" inputMode="tel" value={c.phone} onChange={(e) => setContacts((cs) => cs.map((x) => (x.key === c.key ? { ...x, phone: e.target.value } : x)))} autoComplete="off" />
            <div className="flex items-center justify-between gap-3">
              <label className="flex min-h-11 items-center gap-2 font-semibold">
                <input type="radio" name="default-contact" checked={c.is_default} onChange={() => setDefaultContact(c.key)} className="size-5 accent-primary" />{t("go.form.contactDefault")}
              </label>
              {contacts.length > 1 && <Button type="button" variant="quiet" onClick={() => removeContact(c.key)}><Trash2 className="size-4" aria-hidden />{t("go.form.removeContact")}</Button>}
            </div>
          </Card>
        ))}
        <Button type="button" onClick={() => setContacts((cs) => [...cs, { key: uid(), name: "", phone: "", is_default: cs.length === 0 }])}><Plus className="size-4" aria-hidden />{t("go.form.addContact")}</Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-sm font-semibold text-muted">{t("go.form.photos")}</h2>
        {photos.map((p) => {
          const src = p.preview ?? urls[p.path];
          return (
            <Card key={p.key} className="flex gap-3 p-3">
              {src
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={src} alt="" className="size-20 shrink-0 rounded-control object-cover" />
                : <div aria-hidden className="size-20 shrink-0 animate-[uplif-pulse_1.4s_ease-in-out_infinite] rounded-control bg-line" />}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Select label={t("go.form.photoType")} value={p.type} onChange={(e) => setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, type: e.target.value as PhotoType } : x)))}>
                  {photoTypes.map((k) => <option key={k} value={k}>{t(`go.photo.${k}` as MessageKey)}</option>)}
                </Select>
                <Input label={t("go.form.photoNote")} value={p.note} onChange={(e) => setPhotos((ps) => ps.map((x) => (x.key === p.key ? { ...x, note: e.target.value } : x)))} autoComplete="off" />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={p.is_default} onChange={(e) => setDefaultPhoto(p.key, e.target.checked)} className="size-5 accent-primary" />{t("go.form.photoDefault")}
                  </label>
                  <button type="button" aria-label={t("go.form.removePhoto")} onClick={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} className="grid size-11 place-items-center rounded-full text-danger-ink active:bg-danger-soft"><Trash2 className="size-5" aria-hidden /></button>
                </div>
              </div>
            </Card>
          );
        })}
        <input ref={file} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
        <Button type="button" onClick={() => file.current?.click()}><Camera className="size-4" aria-hidden />{t("go.form.addPhoto")}</Button>
      </section>

      {error && <p role="alert" className="rounded-control bg-danger-soft p-3 text-danger-ink">{t(error)}</p>}
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] flex gap-2 rounded-card bg-ground/90 py-2 backdrop-blur">
        <Button variant="primary" className="h-13 flex-1 text-base" onClick={save} disabled={busy}>{busy ? t("go.saving") : t("go.save")}</Button>
      </div>
    </div>
  );
}
