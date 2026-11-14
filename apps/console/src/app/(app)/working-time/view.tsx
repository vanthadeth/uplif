"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Info, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, CardBody, Input, Modal, Select, SidePanel, Toggle, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { languageOf } from "@/lib/languages";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";
import { AssignScheduleModal, type Named } from "@/components/assign-schedule-modal";
import {
  DEFAULT_RULES, EPOCH, TIMEZONES, WEEKDAYS, dayHours, hhmm, patternDays, weekHours, weekdayShort,
  type AssignScope, type DayDraft, type DayKind, type RulesDraft,
} from "@/lib/working-time";

interface Schedule { id: string; name: string; name_local: string | null; is_active: boolean }
interface Version extends RulesDraft { id: string; schedule_id: string; valid_from: string }
interface Day { version_id: string; weekday: number; day_kind: DayKind; start_time: string | null; end_time: string | null; break_min: number }
interface Assignment { id: string; scope: AssignScope; target_id: string | null; schedule_id: string | null; effective_from: string }

interface Props {
  companyId: string;
  canManage: boolean;
  timezone: string;
  today: string;
  schedules: Schedule[];
  versions: Version[];
  days: Day[];
  weekHours: Record<string, number>;
  assignments: Assignment[];
  branches: Named[];
  departments: Named[];
  employees: Named[];
}

interface Draft { id: string | null; name: string; nameLocal: string; days: DayDraft[]; rules: RulesDraft; from: string }

const kinds: DayKind[] = ["full", "half", "off"];
const ruleFields: { key: keyof Omit<RulesDraft, "overtime_needs_approval">; label: MessageKey; hint?: MessageKey }[] = [
  { key: "grace_late_min", label: "wt.r.graceLate", hint: "wt.r.graceLateHint" },
  { key: "grace_early_min", label: "wt.r.graceEarly" },
  { key: "earliest_clock_in_min", label: "wt.r.earliest" },
  { key: "half_day_late_min", label: "wt.r.halfLate", hint: "wt.r.halfLateHint" },
  { key: "overtime_after_min", label: "wt.r.otAfter", hint: "wt.r.otAfterHint" },
];

export function WorkingTimeView({ companyId, canManage, timezone, today, schedules, versions, days, weekHours: hoursByVersion, assignments, branches, departments, employees }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const nf = new Intl.NumberFormat(languageOf(locale).dateTag, { maximumFractionDigits: 2 });
  const f = (k: MessageKey, v: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? String(v[x]) : m));

  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const [history, setHistory] = useState(false);
  const [tz, setTz] = useState(timezone);

  const byId = useMemo(() => Object.fromEntries(schedules.map((s) => [s.id, s])), [schedules]);
  const versionsOf = (id: string) => versions.filter((v) => v.schedule_id === id).sort((a, b) => b.valid_from.localeCompare(a.valid_from));
  const currentVersion = (id: string) => versionsOf(id).find((v) => v.valid_from <= today);
  const upcomingVersion = (id: string) => versionsOf(id).filter((v) => v.valid_from > today).at(-1);
  const daysOf = (versionId: string | undefined) => (versionId ? days.filter((d) => d.version_id === versionId) : []);
  const dayName = (n: number) => t(`wt.day.${n}` as MessageKey);
  const active = schedules.filter((s) => s.is_active);

  function openEditor(s: Schedule | "new") {
    setError(undefined);
    if (s === "new") return setDraft({ id: null, name: "", nameLocal: "", days: patternDays("mon_fri_sat_half"), rules: { ...DEFAULT_RULES }, from: today });
    // Edit starts from the newest version, so a change planned for later is not lost.
    const v = upcomingVersion(s.id) ?? currentVersion(s.id) ?? versionsOf(s.id)[0];
    const have = daysOf(v?.id);
    setDraft({
      id: s.id, name: s.name, nameLocal: s.name_local ?? "",
      days: WEEKDAYS.map((w) => {
        const d = have.find((x) => x.weekday === w);
        return { weekday: w, kind: d?.day_kind ?? "off", start: hhmm(d?.start_time) || "08:00", end: hhmm(d?.end_time) || "17:00", break_min: d?.break_min ?? 0 };
      }),
      rules: v ? { grace_late_min: v.grace_late_min, grace_early_min: v.grace_early_min, earliest_clock_in_min: v.earliest_clock_in_min, half_day_late_min: v.half_day_late_min, overtime_after_min: v.overtime_after_min, overtime_needs_approval: v.overtime_needs_approval } : { ...DEFAULT_RULES },
      from: v && v.valid_from > today ? v.valid_from : today,
    });
  }

  const setDay = (w: number, patch: Partial<DayDraft>) => setDraft((d) => d && { ...d, days: d.days.map((x) => (x.weekday === w ? { ...x, ...patch } : x)) });
  const setRule = (patch: Partial<RulesDraft>) => setDraft((d) => d && { ...d, rules: { ...d.rules, ...patch } });

  async function save() {
    if (!draft) return;
    if (!draft.name.trim()) return setError(t("wt.errName"));
    if (draft.days.some((d) => d.kind !== "off" && (!d.start || !d.end || d.start === d.end))) return setError(t("wt.errTimes"));
    if (!draft.days.some((d) => d.kind !== "off")) return setError(t("wt.errNoDays"));
    setBusy(true);
    const { error: err } = await createClient().rpc("save_work_schedule", {
      p_schedule_id: draft.id, p_name: draft.name.trim(), p_name_local: draft.nameLocal.trim() || null,
      p_effective_from: draft.id ? draft.from : null, p_rules: { ...draft.rules },
      p_days: draft.days.map((d) => (d.kind === "off" ? { weekday: d.weekday, kind: "off" } : { weekday: d.weekday, kind: d.kind, start: d.start, end: d.end, break_min: d.break_min })),
    });
    setBusy(false);
    if (err) {
      const m = err.message ?? "";
      return setError(t(err.code === "23505" ? "wt.errDup" : err.code === "42501" ? "common.forbidden" : m.includes("in the past") ? "wt.a.errPast" : m.includes("already starts") ? "wt.errSameVersion" : "common.saveError"));
    }
    toast("success", t(draft.id ? "wt.saved" : "wt.created"));
    setDraft(null);
    router.refresh();
  }

  async function setActive(s: Schedule, on: boolean) {
    const { error: err } = await createClient().rpc("set_work_schedule_active", { p_schedule_id: s.id, p_active: on });
    if (err) return toast("error", t(err.message?.includes("in use") ? "wt.inUse" : err.code === "42501" ? "common.forbidden" : "common.saveError"));
    toast("success", t(on ? "wt.restored" : "wt.archivedDone"));
    router.refresh();
  }

  async function removeAssignment(a: Assignment) {
    setBusy(true);
    const { error: err } = await createClient().rpc("remove_work_assignment", { p_assignment_id: a.id });
    setBusy(false);
    if (err) return toast("error", t(err.code === "42501" ? "common.forbidden" : "common.saveError"));
    setRemoving(null);
    toast("success", t("wt.a.removed"));
    router.refresh();
  }

  async function saveTimezone() {
    const { error: err } = await createClient().from("company_settings").update({ timezone: tz }).eq("company_id", companyId);
    if (err) return toast("error", t(err.code === "42501" ? "common.forbidden" : "common.saveError"));
    toast("success", t("wt.tz.saved"));
    router.refresh();
  }

  // Assignments: the newest one that has started per level and target, plus anything upcoming; the rest is history.
  const targetName = (a: Assignment) => {
    if (a.scope === "company") return t("wt.a.everyone");
    const list = a.scope === "branch" ? branches : a.scope === "department" ? departments : employees;
    const x = list.find((i) => i.id === a.target_id);
    return x ? pick(locale, x.name, x.name_local) : "—";
  };
  const rows = useMemo(() => {
    const groups = new Map<string, Assignment[]>();
    for (const a of assignments) groups.set(`${a.scope}:${a.target_id}`, [...(groups.get(`${a.scope}:${a.target_id}`) ?? []), a]);
    const out: (Assignment & { state: "current" | "upcoming" | "history" })[] = [];
    for (const list of groups.values()) {
      const sorted = [...list].sort((x, y) => y.effective_from.localeCompare(x.effective_from));
      const currentIdx = sorted.findIndex((a) => a.effective_from <= today);
      sorted.forEach((a, i) => out.push({ ...a, state: a.effective_from > today ? "upcoming" : i === currentIdx ? "current" : "history" }));
    }
    const order: Record<AssignScope, number> = { company: 0, branch: 1, department: 2, employee: 3 };
    return out.sort((x, y) => order[x.scope] - order[y.scope] || targetName(x).localeCompare(targetName(y)) || y.effective_from.localeCompare(x.effective_from));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, today, branches, departments, employees, locale]);
  const shownRows = rows.filter((r) => history || r.state !== "history");

  const hours = draft ? weekHours(draft.days) : 0;
  const tzOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">{t("wt.title")}</h1>
          <p className="mt-1 max-w-[66ch] text-muted">{t("wt.subtitle")}</p>
        </div>
        {canManage
          ? <Button variant="primary" className="w-full sm:w-auto" onClick={() => openEditor("new")}><Plus className="size-[18px]" aria-hidden />{t("wt.new")}</Button>
          : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("branches.viewOnly")}</Badge>}
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t("wt.roTitle")}</b>{t("wt.roBody")}</div>
        </div>
      )}

      {/* Schedules */}
      {schedules.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[16px] text-ink">{t("wt.empty")}</b>{t("wt.emptyBody")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-line bg-surface">
          {schedules.map((s) => {
            const cur = currentVersion(s.id);
            const next = upcomingVersion(s.id);
            const cd = daysOf(cur?.id);
            return (
              <div key={s.id} className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3.5 first:border-t-0 ${s.is_active ? "" : "[&_.nm]:text-muted"}`}>
                <div className="nm min-w-0 leading-snug">
                  <b className="block break-words text-[16px] font-semibold">{pick(locale, s.name, s.name_local)}</b>
                  <small className="block text-[14px] text-muted">{f("wt.hours", { n: nf.format(cur ? hoursByVersion[cur.id] ?? 0 : 0) })}</small>
                  <div className="mt-1.5 flex flex-wrap gap-1" aria-label={t("wt.title")}>
                    {WEEKDAYS.map((w) => {
                      const d = cd.find((x) => x.weekday === w);
                      const k = d?.day_kind ?? "off";
                      return (
                        <span key={w} title={k === "off" ? t("wt.kind.off") : `${hhmm(d?.start_time)}–${hhmm(d?.end_time)}`}
                          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${k === "full" ? "bg-primary-soft text-primary-ink" : k === "half" ? "bg-warning-soft text-warning-ink" : "bg-ground text-muted line-through"}`}>
                          {weekdayShort(languageOf(locale).dateTag, w)}
                        </span>
                      );
                    })}
                  </div>
                  {next && <small className="mt-1.5 block text-[14px] text-primary-ink">{f("wt.nextVersion", { date: fmtDate(locale, next.valid_from) })}</small>}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {!s.is_active && <Badge tone="neutral">{t("wt.archived")}</Badge>}
                </div>
                {canManage && (
                  <div className="col-span-2 mt-1 flex gap-2 md:justify-end">
                    {s.is_active && <Button className="flex-1 md:flex-none" onClick={() => openEditor(s)}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Button>}
                    <Button className="flex-1 md:flex-none" onClick={() => setActive(s, !s.is_active)}>
                      {s.is_active ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}{t(s.is_active ? "wt.archive" : "wt.restore")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assignments */}
      {schedules.length > 0 && (
        <Card><CardBody className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="m-0 text-[18px] font-semibold">{t("wt.a.title")}</h2>
              <p className="m-0 text-[14px] text-muted">{t("wt.a.first")}</p>
            </div>
            {canManage && <Button onClick={() => setAssigning(true)}><Plus className="size-4" aria-hidden />{t("wt.a.add")}</Button>}
          </div>
          <div className="overflow-hidden rounded-card border border-line">
            {shownRows.length === 0 ? <div className="px-4 py-6 text-center text-muted">{t("wt.a.none")}</div> : shownRows.map((a) => (
              <div key={a.id} className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 ${a.state === "history" ? "text-muted" : ""}`}>
                <div className="min-w-0 leading-snug">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone="neutral">{t(`wt.level.${a.scope}` as MessageKey)}</Badge><b className="break-words font-semibold">{targetName(a)}</b></div>
                  <small className="mt-1 block text-[14px]">
                    {a.schedule_id ? pick(locale, byId[a.schedule_id]?.name ?? "—", byId[a.schedule_id]?.name_local) : t("wt.a.inheritShort")}
                    {" · "}{a.effective_from === EPOCH ? t("wt.a.always") : a.state === "upcoming" ? f("wt.a.starts", { date: fmtDate(locale, a.effective_from) }) : f("wt.a.since", { date: fmtDate(locale, a.effective_from) })}
                  </small>
                </div>
                {canManage && a.state === "upcoming" && <Button aria-label={t("wt.a.remove")} onClick={() => setRemoving(a)}><Trash2 className="size-4" aria-hidden /></Button>}
              </div>
            ))}
          </div>
          {rows.some((r) => r.state === "history") && (
            <button type="button" className="self-start text-[14px] font-semibold text-primary-ink underline" onClick={() => setHistory((h) => !h)}>{t(history ? "wt.a.hideHistory" : "wt.a.showHistory")}</button>
          )}
        </CardBody></Card>
      )}

      {/* Timezone */}
      <Card><CardBody className="flex flex-col gap-3">
        <h2 className="m-0 text-[18px] font-semibold">{t("wt.tz.title")}</h2>
        {canManage ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1 sm:max-w-sm">
              <Select label={t("wt.tz.label")} value={tz} onChange={(e) => setTz(e.target.value)} hint={t("wt.tz.hint")}>
                {(tzOptions.includes(tz) ? tzOptions : [tz, ...tzOptions]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
              </Select>
            </div>
            <Button disabled={tz === timezone} onClick={saveTimezone}>{t("branches.saveBtn")}</Button>
          </div>
        ) : <p className="m-0 text-muted">{timezone.replace(/_/g, " ")}</p>}
      </CardBody></Card>

      {/* Editor */}
      <SidePanel open={draft !== null} onClose={() => setDraft(null)} closeLabel={t("common.close")} title={draft?.id ? t("wt.edit") : t("wt.new")}
        footer={<><Button onClick={() => setDraft(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t(draft?.id ? "wt.saveVersion" : "wt.saveNew")}</Button></>}>
        {draft && (
          <div className="flex flex-col gap-4">
            <Input label={t("wt.name")} value={draft.name} maxLength={80} onChange={(e) => { setDraft({ ...draft, name: e.target.value }); setError(undefined); }} error={error && !draft.name.trim() ? error : undefined} />
            <Input label={t("wt.nameLocal")} value={draft.nameLocal} maxLength={80} onChange={(e) => setDraft({ ...draft, nameLocal: e.target.value })} hint={t("branches.nameLocalHint")} />

            <div className="flex items-center justify-between gap-2">
              <b className="text-[14px] font-semibold text-ink-2">{t("wt.week")}</b>
              <Badge tone={hours > 48 ? "warning" : "success"}>{f("wt.hours", { n: nf.format(hours) })}</Badge>
            </div>
            {hours > 48 && <p className="m-0 text-[14px] leading-snug text-warning-ink">{t("wt.over48")}</p>}
            <div className="flex flex-col gap-2.5">
              {draft.days.map((d) => (
                <div key={d.weekday} className="rounded-control border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="font-semibold">{dayName(d.weekday)}</b>
                    <div role="radiogroup" aria-label={dayName(d.weekday)} className="inline-flex overflow-hidden rounded-control border border-line-strong">
                      {kinds.map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={d.kind === k}
                          onClick={() => setDay(d.weekday, k === "half" && d.kind === "full" ? { kind: k, end: "12:00", break_min: 0 } : k === "full" && d.kind === "half" ? { kind: k, end: "17:00", break_min: 60 } : { kind: k })}
                          className={`min-h-10 px-3 text-sm font-semibold ${d.kind === k ? "bg-primary text-white" : "bg-surface text-muted"}`}>{t(`wt.kind.${k}` as MessageKey)}</button>
                      ))}
                    </div>
                  </div>
                  {d.kind !== "off" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Input label={t("wt.start")} type="time" value={d.start} onChange={(e) => setDay(d.weekday, { start: e.target.value })} />
                      <Input label={t("wt.end")} type="time" value={d.end} onChange={(e) => setDay(d.weekday, { end: e.target.value })} />
                      <div className="col-span-2"><Input label={t("wt.break")} type="number" inputMode="numeric" min={0} max={480} value={String(d.break_min)} onChange={(e) => setDay(d.weekday, { break_min: Math.min(480, Math.max(0, Number(e.target.value) || 0)) })} /></div>
                      <small className="col-span-2 text-xs text-muted">{f("wt.dayHours", { n: nf.format(dayHours(d)) })}{d.end <= d.start && d.start !== d.end ? ` · ${t("wt.overnight")}` : ""}</small>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="m-0 text-[14px] leading-snug text-muted">{t("wt.nightNote")}</p>
            {error && draft.name.trim() && <p role="alert" className="m-0 text-[14px] text-danger-ink">{error}</p>}

            <b className="text-[14px] font-semibold text-ink-2">{t("wt.rules")}</b>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ruleFields.map((r) => (
                <Input key={r.key} label={t(r.label)} type="number" inputMode="numeric" min={0} max={720} value={String(draft.rules[r.key])}
                  hint={r.hint ? t(r.hint) : undefined} onChange={(e) => setRule({ [r.key]: Math.min(720, Math.max(0, Number(e.target.value) || 0)) })} />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{t("wt.r.otApproval")}</span>
              <Toggle checked={draft.rules.overtime_needs_approval} onChange={(v) => setRule({ overtime_needs_approval: v })} label={t("wt.r.otApproval")} />
            </div>

            {draft.id && (
              <div className="flex flex-col gap-2 rounded-card bg-warning-soft p-3.5">
                <b className="text-warning-ink">{t("wt.v.title")}</b>
                <span className="text-[14px] leading-snug text-warning-ink">{t("wt.v.body")}</span>
                <Input label={t("wt.v.from")} type="date" min={today} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
              </div>
            )}
          </div>
        )}
      </SidePanel>

      <AssignScheduleModal open={assigning} onClose={() => setAssigning(false)} schedules={active} branches={branches} departments={departments} employees={employees} today={today} />

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("common.close")} title={t("wt.a.removeTitle")}
        footer={<><Button onClick={() => setRemoving(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && removeAssignment(removing)}>{t("wt.a.remove")}</Button></>}>
        <p className="leading-relaxed text-muted">{t("wt.a.removeBody")}</p>
      </Modal>
    </div>
  );
}
