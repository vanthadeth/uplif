"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Download, Info, List, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Input, Modal, Select, SidePanel, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { languageOf } from "@/lib/languages";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";
import { HolidayNotice, type HolidayNotice as Notice } from "@/components/holiday-notice-card";
import { isHistory, monthShape, occurrencesIn, type Holiday } from "@/lib/holidays";
import { weekdayShort } from "@/lib/working-time";

interface Named { id: string; name: string; name_local: string | null }
interface Preset { holiday_date: string; name: string; name_local: string | null; provisional: boolean }
interface Draft { id: string | null; name: string; nameLocal: string; date: string; yearly: boolean; observed: boolean; observedDate: string; branch: string }

interface Props {
  canManage: boolean; today: string; country: string;
  holidays: Holiday[]; branches: Named[]; presets: Preset[];
  notice: Notice | null; openImport: number | null;
}

export function HolidaysView({ canManage, today, country, holidays, branches, presets, notice, openImport }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const tag = languageOf(locale).dateTag;
  const thisYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(openImport && openImport >= thisYear ? openImport : thisYear);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const [importYear, setImportYear] = useState<number | null>(openImport && openImport >= thisYear ? openImport : null);

  const branchName = (id: string | null) => { const b = branches.find((x) => x.id === id); return b ? pick(locale, b.name, b.name_local) : "—"; };
  const occ = useMemo(() => occurrencesIn(holidays, year), [holidays, year]);
  const weekday = (iso: string) => weekdayShort(tag, ((new Date(iso + "T00:00:00Z").getUTCDay() + 6) % 7) + 1);
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));

  function openEditor(h: Holiday | "new") {
    setError(undefined);
    if (h === "new") return setDraft({ id: null, name: "", nameLocal: "", date: today, yearly: false, observed: false, observedDate: "", branch: "" });
    setDraft({ id: h.id, name: h.name, nameLocal: h.name_local ?? "", date: h.holiday_date, yearly: h.repeats_yearly, observed: !!h.observed_date, observedDate: h.observed_date ?? "", branch: h.branch_id ?? "" });
  }

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError(t("hol.errName"));
    if (!draft.date) return setError(t("hol.errDate"));
    if (draft.observed && (!draft.observedDate || draft.observedDate === draft.date)) return setError(t("hol.errObserved"));
    setBusy(true);
    const { error: err } = await createClient().rpc("save_company_holiday", {
      p_id: draft.id, p_name: draft.name.trim(), p_name_local: draft.nameLocal.trim() || null, p_date: draft.date,
      p_repeats_yearly: draft.yearly, p_observed_date: draft.observed && !draft.yearly ? draft.observedDate : null, p_branch_id: draft.branch || null,
    });
    setBusy(false);
    if (err) {
      const m = err.message ?? "";
      return setError(t(err.code === "23505" ? "hol.errDup" : err.code === "42501" ? "common.forbidden" : m.includes("in the past") ? "hol.errPast" : m.includes("has passed") ? "hol.errHistory" : "common.saveError"));
    }
    toast("success", t(draft.id ? "hol.saved" : "hol.created"));
    setDraft(null);
    router.refresh();
  }

  async function remove(h: Holiday) {
    setBusy(true);
    const { error: err } = await createClient().rpc("delete_company_holiday", { p_id: h.id });
    setBusy(false);
    if (err) return toast("error", t(err.message?.includes("has passed") ? "hol.errHistory" : err.code === "42501" ? "common.forbidden" : "common.saveError"));
    setDeleting(null);
    setDraft(null);
    toast("success", t("hol.deleted"));
    router.refresh();
  }

  async function runImport(y: number) {
    setBusy(true);
    const { data, error: err } = await createClient().rpc("import_holiday_presets", { p_year: y });
    setBusy(false);
    if (err) return toast("error", t(err.code === "42501" ? "common.forbidden" : "common.saveError"));
    setImportYear(null);
    setYear(y);
    toast("success", f(data ? "hol.imp.done" : "hol.imp.nothing", { n: data ?? 0 }));
    router.refresh();
  }

  const badges = (o: { holiday: Holiday; original: string | null }) => (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {o.holiday.repeats_yearly && <Badge tone="info">{t("hol.yearly")}</Badge>}
      {o.holiday.branch_id && <Badge tone="neutral">{branchName(o.holiday.branch_id)}</Badge>}
      {o.original && <Badge tone="warning">{f("hol.observedFor", { date: fmtDate(locale, o.original) })}</Badge>}
      {o.holiday.provisional && <Badge tone="warning">{t("hol.provisional")}</Badge>}
    </div>
  );

  const importList = importYear === null ? [] : presets.filter((p) => p.holiday_date.startsWith(String(importYear)) && p.holiday_date >= today);
  const importYears = [thisYear, thisYear + 1];
  const editingHistory = !!draft?.id && !!holidays.find((h) => h.id === draft.id) && isHistory(holidays.find((h) => h.id === draft.id)!, today);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("hol.title")}</h1>
          <p className="mt-1 max-w-[66ch] text-muted">{t("hol.subtitle")}</p>
        </div>
        {canManage ? (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button className="flex-1 sm:flex-none" onClick={() => setImportYear(year >= thisYear ? year : thisYear)}><Download className="size-[18px]" aria-hidden />{t("hol.import")}</Button>
            <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => openEditor("new")}><Plus className="size-[18px]" aria-hidden />{t("hol.add")}</Button>
          </div>
        ) : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("branches.viewOnly")}</Badge>}
      </div>

      {notice && canManage && <HolidayNotice notice={notice} variant="banner" onReview={() => setImportYear(notice.year)} />}
      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("hol.roTitle")}</b>{t("hol.roBody")}</div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button aria-label={t("hol.prevYear")} onClick={() => setYear(year - 1)}><ChevronLeft className="size-4" aria-hidden /></Button>
          <b className="min-w-16 text-center text-[17px] tabular-nums">{year}</b>
          <Button aria-label={t("hol.nextYear")} onClick={() => setYear(year + 1)}><ChevronRight className="size-4" aria-hidden /></Button>
        </div>
        {/* The calendar is a desktop view; the phone shows the list only. */}
        <div className="hidden gap-1 md:flex" role="group" aria-label={t("hol.view")}>
          <Button variant={view === "list" ? "primary" : "secondary"} aria-pressed={view === "list"} onClick={() => setView("list")}><List className="size-4" aria-hidden />{t("hol.view.list")}</Button>
          <Button variant={view === "calendar" ? "primary" : "secondary"} aria-pressed={view === "calendar"} onClick={() => setView("calendar")}><CalendarDays className="size-4" aria-hidden />{t("hol.view.calendar")}</Button>
        </div>
      </div>

      {view === "calendar" && (
        <div className="hidden grid-cols-3 gap-4 md:grid xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
            const { offset, days } = monthShape(year, m);
            const byDay = new Map<number, string[]>();
            for (const o of occ) if (Number(o.date.slice(5, 7)) === m) byDay.set(Number(o.date.slice(8)), [...(byDay.get(Number(o.date.slice(8))) ?? []), pick(locale, o.holiday.name, o.holiday.name_local)]);
            return (
              <section key={m} aria-label={new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(tag, { month: "long", timeZone: "UTC" })} className="rounded-card border border-line bg-surface p-3">
                <h3 className="m-0 mb-2 text-sm font-semibold">{new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(tag, { month: "long", timeZone: "UTC" })}</h3>
                <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
                  {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} />)}
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const names = byDay.get(d);
                    const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    return names
                      ? <span key={d} title={names.join(", ")} className="mx-auto grid size-7 place-items-center rounded-full bg-primary font-bold text-white">{d}</span>
                      : <span key={d} className={`mx-auto grid size-7 place-items-center rounded-full tabular-nums ${iso === today ? "border border-primary" : ""} ${((offset + d - 1) % 7) >= 5 ? "text-muted" : ""}`}>{d}</span>;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {occ.length === 0 ? (
        <div className={`rounded-card border border-line bg-surface px-4 py-9 text-center text-muted ${view === "calendar" ? "md:hidden" : ""}`}>
          <b className="mb-1 block text-[15px] text-ink">{f("hol.empty", { year })}</b>{t(canManage ? "hol.emptyBody" : "hol.emptyBodyRo")}
        </div>
      ) : (
        <div className={`overflow-hidden rounded-card border border-line bg-surface ${view === "calendar" ? "md:mt-0" : ""}`}>
          {occ.map((o) => (
            <div key={`${o.holiday.id}-${o.date}`} className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 ${o.date < today ? "text-muted" : ""}`}>
              <div className="w-14 text-center leading-tight">
                <b className="block text-[19px] tabular-nums">{Number(o.date.slice(8))}</b>
                <small className="block text-xs uppercase">{new Date(o.date + "T00:00:00Z").toLocaleDateString(tag, { month: "short", timeZone: "UTC" })} · {weekday(o.date)}</small>
              </div>
              <div className="min-w-0 leading-snug">
                <b className="block break-words font-semibold">{pick(locale, o.holiday.name, o.holiday.name_local)}</b>
                {badges(o)}
              </div>
              {canManage && !isHistory(o.holiday, today) && <Button aria-label={t("common.edit")} onClick={() => openEditor(o.holiday)}><Pencil className="size-4" aria-hidden /></Button>}
            </div>
          ))}
        </div>
      )}

      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("hol.edit") : t("hol.add")}
        footer={<>
          {draft?.id && !editingHistory && <Button variant="danger" className="mr-auto" onClick={() => setDeleting(holidays.find((h) => h.id === draft.id) ?? null)}><Trash2 className="size-4" aria-hidden />{t("hol.delete")}</Button>}
          <Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
          {!editingHistory && <Button variant="primary" loading={busy} onClick={save}>{t("hol.save")}</Button>}
        </>}>
        {draft && (
          <div className="flex flex-col gap-4">
            {editingHistory && <p className="m-0 text-[13px] leading-snug text-muted">{t("hol.errHistory")}</p>}
            <Input label={t("hol.name")} value={draft.name} maxLength={120} disabled={editingHistory} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(undefined); }} error={error && !draft.name.trim() ? error : undefined} />
            <Input label={t("hol.nameLocal")} value={draft.nameLocal} maxLength={120} disabled={editingHistory} onChange={(e) => setDraft({ ...draft, nameLocal: e.target.value })} hint={t("branches.nameLocalHint")} />
            <Input label={t("hol.date")} type="date" value={draft.date} disabled={editingHistory} onChange={(e) => { setDraft({ ...draft, date: e.target.value }); setError(undefined); }} />
            <div className="flex flex-col gap-1">
              <Toggle checked={draft.yearly} label={t("hol.repeats")} disabled={editingHistory} onChange={(v) => setDraft({ ...draft, yearly: v, observed: v ? false : draft.observed })} />
              <small className="text-[13px] text-muted">{t("hol.repeatsHint")}</small>
            </div>
            {!draft.yearly && (
              <div className="flex flex-col gap-3">
                <Toggle checked={draft.observed} label={t("hol.observed")} disabled={editingHistory} onChange={(v) => setDraft({ ...draft, observed: v })} />
                {draft.observed
                  ? <Input label={t("hol.observedDate")} type="date" value={draft.observedDate} disabled={editingHistory} onChange={(e) => { setDraft({ ...draft, observedDate: e.target.value }); setError(undefined); }} hint={t("hol.observedHint")} />
                  : <small className="text-[13px] text-muted">{t("hol.observedOff")}</small>}
              </div>
            )}
            {branches.length > 0 && (
              <Select label={t("hol.branch")} value={draft.branch} disabled={editingHistory} onChange={(e) => setDraft({ ...draft, branch: e.target.value })} hint={t("hol.branchHint")}>
                <option value="">{t("hol.allBranches")}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{pick(locale, b.name, b.name_local)}</option>)}
              </Select>
            )}
            {error && (draft.name.trim() || !error.includes(t("hol.errName"))) && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
          </div>
        )}
      </SidePanel>

      <Modal open={deleting !== null} onClose={() => setDeleting(null)} closeLabel={t("common.close")} title={t("hol.deleteTitle")}
        footer={<><Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => deleting && remove(deleting)}>{t("hol.delete")}</Button></>}>
        <p className="leading-relaxed text-muted">{deleting && f("hol.deleteBody", { name: pick(locale, deleting.name, deleting.name_local) })}</p>
      </Modal>

      <Modal open={importYear !== null} onClose={() => setImportYear(null)} closeLabel={t("common.close")} title={t("hol.imp.title")}
        footer={<><Button onClick={() => setImportYear(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} disabled={importList.length === 0} onClick={() => importYear && runImport(importYear)}>{importYear ? f("hol.imp.go", { year: importYear }) : ""}</Button></>}>
        <div className="flex flex-col gap-3">
          <Select label={t("hol.imp.year")} value={String(importYear ?? thisYear)} onChange={(e) => setImportYear(Number(e.target.value))}>
            {importYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <p className="m-0 text-[13px] leading-snug text-muted">{f("hol.imp.body", { country: country || "—" })}</p>
          {importList.length === 0 ? (
            <p className="m-0 rounded-card bg-ground p-3 text-[13px] leading-snug">{f("hol.imp.none", { year: importYear ?? thisYear, country: country || "—" })}</p>
          ) : (
            <ul className="m-0 max-h-64 list-none overflow-auto rounded-card border border-line p-0">
              {importList.map((p) => (
                <li key={p.holiday_date + p.name} className="flex items-baseline justify-between gap-3 border-t border-line px-3 py-2 text-[13px] first:border-t-0">
                  <span className="min-w-0 break-words">{pick(locale, p.name, p.name_local)}</span>
                  <span className="shrink-0 tabular-nums text-muted">{fmtDate(locale, p.holiday_date)}{p.provisional ? " *" : ""}</span>
                </li>
              ))}
            </ul>
          )}
          {importList.some((p) => p.provisional) && <p className="m-0 text-[13px] leading-snug text-warning-ink">{t("hol.imp.provisional")}</p>}
          <p className="m-0 text-[13px] leading-snug text-muted">{t("hol.imp.safe")}</p>
        </div>
      </Modal>
    </div>
  );
}
