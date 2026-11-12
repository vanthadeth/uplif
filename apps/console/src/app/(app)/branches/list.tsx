"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, Lock, MapPin, Pencil, Plus, Search, X } from "lucide-react";
import { Badge, Button, Input, Modal, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { planLimitKey } from "@/lib/plan-limit";

interface Branch { id: string; name: string; name_local: string | null; is_active: boolean; created_at: string; latitude: number | null; longitude: number | null; geofence_radius_m: number | null }
type Filter = "all" | "active" | "inactive";

interface Props {
  branches: Branch[];
  /** Branch id to number of people with a role at it; null when the user may not read role assignments. */
  people: Record<string, number> | null;
  companyId: string;
  canCreate: boolean;
  canUpdate: boolean;
}

export function BranchList({ branches, people, companyId, canCreate, canUpdate }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [deactivating, setDeactivating] = useState<Branch | null>(null);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [radius, setRadius] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const readOnly = !canCreate && !canUpdate;
  const activeCount = branches.filter((b) => b.is_active).length;
  const counts = { all: branches.length, active: activeCount, inactive: branches.length - activeCount };
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return branches.filter((b) =>
      (filter === "all" || (filter === "active") === b.is_active) &&
      (!q || `${b.name} ${b.name_local ?? ""}`.toLowerCase().includes(q)));
  }, [branches, query, filter]);

  const label = (b: Branch) => (locale === "km" && b.name_local ? b.name_local : b.name);
  const other = (b: Branch) => (locale === "km" ? (b.name_local ? b.name : "") : b.name_local ?? "");
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "km" ? "km-KH" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  const peopleText = (n: number) => (locale === "km" ? `${n.toLocaleString("km-KH")} នាក់` : n === 1 ? "1 person" : `${n} people`);

  function open(b: Branch | "new") {
    setEditing(b);
    setName(b === "new" ? "" : b.name);
    setNameLocal(b === "new" ? "" : b.name_local ?? "");
    setLat(b === "new" || b.latitude == null ? "" : String(b.latitude));
    setLon(b === "new" || b.longitude == null ? "" : String(b.longitude));
    setRadius(b === "new" || b.geofence_radius_m == null ? "" : String(b.geofence_radius_m));
    setError(undefined);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return toast("error", t("branches.locationDenied"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(p.coords.latitude.toFixed(6)); setLon(p.coords.longitude.toFixed(6)); setLocating(false); },
      () => { setLocating(false); toast("error", t("branches.locationDenied")); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function save() {
    if (!name.trim()) return setError(t("branches.error.name"));
    setBusy(true);
    const supabase = createClient();
    const hasLat = lat.trim() !== "", hasLon = lon.trim() !== "";
    if (hasLat !== hasLon) { setBusy(false); return toast("error", t("branches.error.location")); }
    const latN = hasLat ? Number(lat) : null, lonN = hasLon ? Number(lon) : null;
    if ((latN !== null && (!Number.isFinite(latN) || latN < -90 || latN > 90)) || (lonN !== null && (!Number.isFinite(lonN) || lonN < -180 || lonN > 180))) {
      setBusy(false); return toast("error", t("branches.error.range"));
    }
    const radiusN = radius.trim() === "" ? null : Number(radius);
    if (radiusN !== null && (!Number.isInteger(radiusN) || radiusN < 20 || radiusN > 5000)) { setBusy(false); return toast("error", t("branches.error.radius")); }
    const values = { name: name.trim(), name_local: nameLocal.trim() || null, latitude: latN, longitude: lonN, geofence_radius_m: latN === null ? null : radiusN };
    // .select() returns the rows row-level security let us change; an empty result means no permission.
    const res = editing === "new"
      ? await supabase.from("branches").insert({ company_id: companyId, ...values }).select("id")
      : await supabase.from("branches").update(values).eq("id", (editing as Branch).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", planLimitKey(res.error) ? t(planLimitKey(res.error)!) : res.error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    if (!res.data?.length) return toast("error", t("common.forbidden"));
    toast("success", editing === "new" ? t("branches.added") : t("branches.saved"));
    setEditing(null);
    router.refresh();
  }

  async function setActive(b: Branch, active: boolean) {
    setBusy(true);
    const { data, error: err } = await createClient().from("branches").update({ is_active: active }).eq("id", b.id).select("id");
    setBusy(false);
    if (err) return toast("error", err.code === "23514" ? t("branches.lastActive") : err.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    if (!data?.length) return toast("error", t("common.forbidden"));
    setDeactivating(null);
    toast("success", active ? t("branches.activatedToast") : t("branches.deactivatedToast"));
    router.refresh();
  }

  const lastActive = deactivating?.is_active && activeCount <= 1;
  const grid = readOnly
    ? "md:grid-cols-[minmax(0,2.2fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,1fr)]"
    : "md:grid-cols-[minmax(0,2.2fr)_minmax(0,.9fr)_minmax(0,.9fr)_minmax(0,1fr)_232px]";
  const peopleVisible = people !== null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("branches.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("branches.subtitle")}</p>
        </div>
        {readOnly ? <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("branches.viewOnly")}</Badge>
          : canCreate && <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("branches.add")}</Button>}
      </div>

      {readOnly && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("branches.roTitle")}</b>{t("branches.roBody")}</div>
        </div>
      )}

      {branches.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t("branches.empty")}</b>
          {t("branches.emptyBody")}
          {canCreate && <div className="mt-3.5"><Button variant="primary" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t("branches.add")}</Button></div>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-h-11 max-w-none flex-1 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 sm:max-w-[380px] sm:min-w-[200px]">
              <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("branches.search")} aria-label={t("branches.search")}
                className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
            </label>
            <div role="group" aria-label={t("common.status")} className="flex flex-wrap gap-2">
              {(["all", "active", "inactive"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-[13px] ${filter === f ? "border-primary bg-primary-soft font-semibold text-primary-ink" : "border-line-strong bg-surface font-medium"}`}>
                  {t(`branches.filter.${f}`)} <em className="not-italic tabular-nums opacity-70">{counts[f].toLocaleString(locale === "km" ? "km-KH" : "en")}</em>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {shown.length === 0 ? (
              <div className="px-4 py-9 text-center text-muted">
                <b className="mb-1 block text-[15px] text-ink">{t("branches.noMatch")}</b>{t("branches.noMatchBody")}
                <div className="mt-3"><Button onClick={() => { setQuery(""); setFilter("all"); }}>{t("branches.clearSearch")}</Button></div>
              </div>
            ) : (
              <>
                <div aria-hidden className={`hidden items-center gap-4 border-b border-line bg-ground px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted md:grid ${grid}`}>
                  <span>{t("branches.name")}</span><span>{t("common.status")}</span><span>{peopleVisible ? t("branches.people") : ""}</span><span>{t("branches.created")}</span>{!readOnly && <span />}
                </div>
                {shown.map((b) => (
                  <div key={b.id} className={`grid min-h-[68px] grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0 md:gap-x-4 ${grid} ${b.is_active ? "" : "[&_.nm]:text-muted"}`}>
                    <div className="nm min-w-0 leading-snug">
                      <b className="block break-words text-[15px] font-semibold">{label(b)}</b>
                      {other(b) && <small className="block break-words text-[13px] text-muted">{other(b)}</small>}
                    </div>
                    <span className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                      {b.is_active ? <Badge tone="success"><Check className="me-1 size-3" aria-hidden />{t("status.active")}</Badge> : <Badge tone="neutral"><X className="me-1 size-3" aria-hidden />{t("status.inactive")}</Badge>}
                    </span>
                    <span className="tabular-nums text-muted md:text-ink">{peopleVisible ? peopleText(people[b.id] ?? 0) : ""}</span>
                    <span className="hidden tabular-nums text-muted md:block">{date(b.created_at)}</span>
                    {canUpdate && (
                      <div className="col-span-2 mt-1.5 flex gap-2 md:col-span-1 md:mt-0 md:justify-end">
                        <Button className="flex-1 md:flex-none" onClick={() => open(b)}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Button>
                        {b.is_active
                          ? <Button className="flex-1 md:flex-none" onClick={() => setDeactivating(b)}>{t("branches.deactivate")}</Button>
                          : <Button className="flex-1 md:flex-none" loading={busy} onClick={() => setActive(b, true)}>{t("branches.activate")}</Button>}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      <Modal
        open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("common.close")}
        title={editing === "new" ? t("branches.add") : t("branches.edit")}
        footer={<>
          <Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={save}>{t("branches.saveBtn")}</Button>
        </>}
      >
        <div className="flex flex-col gap-4">
          <Input label={t("branches.name")} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label={t("branches.nameLocal")} value={nameLocal} maxLength={120} onChange={(e) => setNameLocal(e.target.value)} hint={t("branches.nameLocalHint")} />
          <fieldset className="flex flex-col gap-3 rounded-control border border-line p-3">
            <legend className="px-1 font-semibold">{t("branches.location")}</legend>
            <p className="text-[13px] text-muted">{t("branches.locationHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t("branches.lat")} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} />
              <Input label={t("branches.lon")} inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} />
            </div>
            <Input label={t("branches.radius")} inputMode="numeric" value={radius} onChange={(e) => setRadius(e.target.value)} />
            <Button loading={locating} onClick={useMyLocation}><MapPin className="size-4" aria-hidden />{locating ? t("branches.locating") : t("branches.useMyLocation")}</Button>
          </fieldset>
        </div>
      </Modal>

      <Modal
        open={deactivating !== null} onClose={() => setDeactivating(null)} closeLabel={t("common.close")}
        title={t("branches.deactivateTitle")}
        footer={<>
          <Button onClick={() => setDeactivating(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={busy} disabled={lastActive} onClick={() => deactivating && setActive(deactivating, false)}>{t("branches.deactivate")}</Button>
        </>}
      >
        <div className="flex flex-col gap-3">
          {deactivating && <p className="font-semibold">{label(deactivating)}</p>}
          <p className="leading-relaxed text-muted">{t("branches.deactivateBody")}</p>
          {lastActive && (
            <div role="alert" className="flex items-start gap-2 rounded-control bg-warning-soft p-3 text-[13px] leading-snug text-warning-ink">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden /><span>{t("branches.lastActive")}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
