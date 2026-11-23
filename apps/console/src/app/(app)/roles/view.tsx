"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Info, Lock, ShieldCheck, Users } from "lucide-react";
import { AppIcon, Badge, Button, Card, FloatingBar, Input, Modal, Segmented, Select, Steps, Toggle, useToast, type AppKey } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { pick } from "@/lib/format";
import {
  ACCESS_APPS, APP_MODULE, GROUPS, SCOPED_KEYS, SCOPES, applyPreset, changeCount, displayApp, draftFrom, emptyDraft, groupLevel, groupOf,
  isRead, savePayload, type AccessApp, type Draft, type Scope,
} from "@/lib/role-access";

interface Role { id: string; name: string; name_local: string | null; is_system: boolean }
interface Props {
  companyId: string;
  roles: Role[];
  permissions: { role_id: string; permission_key: string; data_scope: Scope }[];
  roleApps: { role_id: string; app_key: string; allowed: boolean }[];
  catalog: { key: string; description: string; description_local: string | null }[];
  counts: Record<string, number>;
  modules: string[];
  canManage: boolean;
}
type StepId = "apps" | "actions" | "summary";
type Status = "on" | "locked" | "soon";

const fmt = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
const copy = (d: Draft): Draft => ({ apps: { ...d.apps }, perms: { ...d.perms } });

export function RolesView({ companyId, roles, permissions, roleApps, catalog, counts, modules, canManage }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const n = (v: number) => v.toLocaleString(locale === "km" ? "km-KH" : "en");
  const peopleText = (c: number) => (c === 1 ? t("ra.people1") : fmt(t("ra.peopleN"), { n: n(c) }));

  const [list, setList] = useState(roles);
  const [bases, setBases] = useState<Record<string, Draft>>(() => Object.fromEntries(roles.map((r) => [r.id, draftFrom(
    roleApps.filter((a) => a.role_id === r.id), permissions.filter((p) => p.role_id === r.id), r.is_system && r.name === "Owner")])));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [step, setStep] = useState<StepId>("apps");
  const [appKey, setAppKey] = useState<AccessApp>("admin");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [tpl, setTpl] = useState<"blank" | "viewer" | "copy">("blank");
  const [copyFrom, setCopyFrom] = useState("");
  const [newName, setNewName] = useState("");
  const [newLocal, setNewLocal] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [name, setName] = useState<string>();
  const [nameLocal, setNameLocal] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const role = list.find((r) => r.id === selectedId) ?? null;
  const label = (r: Role) => (locale === "km" && r.name_local ? r.name_local : r.name);
  const desc = (c: Props["catalog"][number]) => pick(locale, c.description, c.description_local);
  const isOwner = !!role && role.is_system && role.name === "Owner";
  const readOnly = isOwner || !canManage;
  const base = role ? bases[role.id] : undefined;
  const changes = base ? changeCount(base, draft) : 0;

  /** An app is on when it has actions here and the plan includes it, locked when the plan does not, soon with no actions. */
  const keysOf = useMemo(() => {
    const m: Record<string, string[]> = {};
    catalog.forEach((c) => { const a = displayApp(c.key); if (a) (m[a] ??= []).push(c.key); });
    return m;
  }, [catalog]);
  const statusOf = (a: AccessApp): Status => {
    if (!(keysOf[a]?.length)) return "soon";
    const mod = APP_MODULE[a];
    return mod && !modules.includes(mod) ? "locked" : "on";
  };
  const actionKeys = (a: AccessApp) => (keysOf[a] ?? []).filter((k) => k !== "org.branch.read");
  const heldCount = (a: AccessApp, d: Draft) => actionKeys(a).filter((k) => d.perms[k]).length;

  function open(r: Role) {
    setSelectedId(r.id); setDraft(copy(bases[r.id])); setStep("apps"); setName(undefined); setNameLocal(undefined); setNameError(undefined);
    setAppKey(ACCESS_APPS.find((a) => statusOf(a) === "on" && bases[r.id].apps[a]) ?? "admin");
  }
  function leave() { setSelectedId(null); setConfirmLeave(false); }
  const back = () => (changes ? setConfirmLeave(true) : leave());

  async function save() {
    if (!role) return;
    setBusy(true);
    const { apps, perms } = savePayload(draft);
    const { error } = await createClient().rpc("save_role_access", { p_role_id: role.id, p_apps: apps, p_perms: perms });
    setBusy(false);
    if (error) return toast("error", error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    setBases((b) => ({ ...b, [role.id]: copy(draft) }));
    toast("success", t("ra.saved"));
    router.refresh();
  }

  async function createRole() {
    if (!newName.trim()) return setNameError(t("roles.error.name"));
    const source = tpl === "copy" ? bases[copyFrom] : undefined;
    if (tpl === "copy" && !source) return;
    setBusy(true);
    const supabase = createClient();
    const { data, error } = await supabase.from("roles")
      .insert({ company_id: companyId, name: newName.trim(), name_local: newLocal.trim() || null }).select("id, name, name_local, is_system");
    const created = data?.[0];
    if (error || !created) {
      setBusy(false);
      return setNameError(error?.code === "23505" ? t("roles.error.exists") : error?.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    }
    const seed = emptyDraft();
    if (source) { Object.assign(seed.apps, source.apps); Object.assign(seed.perms, source.perms); }
    if (tpl === "viewer") {
      catalog.filter((c) => isRead(c.key)).forEach((c) => { seed.perms[c.key] = "company"; });
      ACCESS_APPS.forEach((a) => { seed.apps[a] = statusOf(a) === "on" && actionKeys(a).some((k) => seed.perms[k]); });
    }
    const { apps, perms } = savePayload(seed);
    const res = await supabase.rpc("save_role_access", { p_role_id: created.id, p_apps: apps, p_perms: perms });
    setBusy(false);
    if (res.error) toast("error", t("common.saveError"));
    else toast("success", t("roles.created"));
    setList((l) => [...l, created]);
    setBases((b) => ({ ...b, [created.id]: res.error ? emptyDraft() : seed }));
    setNewOpen(false); setNewName(""); setNewLocal("");
    setSelectedId(created.id); setDraft(res.error ? emptyDraft() : copy(seed)); setStep("apps");
    router.refresh();
  }

  async function saveName() {
    if (!role) return;
    const next = (name ?? role.name).trim();
    if (!next) return setNameError(t("roles.error.name"));
    const nextLocal = (nameLocal ?? role.name_local ?? "").trim() || null;
    const { data, error } = await createClient().from("roles").update({ name: next, name_local: nextLocal }).eq("id", role.id).select("id");
    if (error || !data?.length) return toast("error", error?.code === "23505" ? t("roles.error.exists") : error?.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    setList((l) => l.map((r) => (r.id === role.id ? { ...r, name: next, name_local: nextLocal } : r)));
    setName(undefined); setNameLocal(undefined); setNameError(undefined);
    toast("success", t("company.saved"));
  }

  async function deleteRole() {
    if (!role) return;
    const { error } = await createClient().from("roles").delete().eq("id", role.id);
    setConfirmDelete(false);
    if (error) return toast("error", error.code === "P0001" ? t("roles.inUse") : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("roles.deleted"));
    setList((l) => l.filter((r) => r.id !== role.id));
    setSelectedId(null);
    router.refresh();
  }

  const badge = (r: Role) => {
    const owner = r.is_system && r.name === "Owner";
    return <Badge tone={owner ? "warning" : r.is_system ? "info" : "neutral"}>{owner ? <><Lock className="me-1 size-3" aria-hidden />{t("roles.fixed")}</> : r.is_system ? t("roles.system") : t("roles.custom")}</Badge>;
  };
  const appName = (a: AccessApp) => `UPLIF ${a === "pos" ? "POS" : a[0].toUpperCase() + a.slice(1)}`;
  const appBlurb = (a: AccessApp) => t(`app.${a}.blurb` as MessageKey);
  const scopeText = (s: Scope) => t(`ra.scope.${s}` as MessageKey);

  /* ------------------------------------------------------------------ list */
  if (!role) {
    const shown = list.filter((r) => label(r).toLowerCase().includes(q.trim().toLowerCase()));
    return (
      <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("roles.title")}</h1>
            <p className="mt-1 max-w-[62ch] text-muted">{t("ra.sub")}</p>
          </div>
          {canManage
            ? <Button variant="primary" className="w-full sm:w-auto" onClick={() => { setNewOpen(true); setTpl("blank"); setCopyFrom(list[0]?.id ?? ""); setNewName(""); setNewLocal(""); setNameError(undefined); }}>{t("roles.new")}</Button>
            : <Badge tone="neutral"><Lock className="me-1 size-3" aria-hidden />{t("users.viewOnly")}</Badge>}
        </div>
        {!canManage && (
          <div className="flex items-start gap-3 rounded-card bg-primary-soft p-3.5 leading-snug text-primary-ink">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div><b className="block">{t("roles.roTitle")}</b>{t("roles.roBody")}</div>
          </div>
        )}
        <Input label={t("ra.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="grid animate-[uplif-in_0.28s_ease_both] gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const d = bases[r.id];
            const on = ACCESS_APPS.filter((a) => d?.apps[a] && statusOf(a) !== "soon");
            return (
              <li key={r.id}>
                <button type="button" onClick={() => open(r)} className="flex h-full w-full flex-col gap-3 rounded-card border border-line bg-surface p-4 text-start transition-colors hover:border-primary">
                  <span className="flex items-start justify-between gap-2"><b className="text-lg">{label(r)}</b>{badge(r)}</span>
                  <span className="text-muted">{peopleText(counts[r.id] ?? 0)}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <AppIcon app="me" size={24} />
                    {on.map((a) => <AppIcon key={a} app={a as AppKey} size={24} dim={statusOf(a) === "locked"} />)}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="text-muted">{t("ra.noMatch")}</li>}
        </ul>
        {newRoleModal()}
      </div>
    );
  }

  /* ---------------------------------------------------------------- editor */
  const stepItems = [{ id: "apps", label: t("ra.step.apps") }, { id: "actions", label: t("ra.step.actions") }, { id: "summary", label: t("ra.step.summary") }];
  const setApp = (a: AccessApp, v: boolean) => setDraft((d) => ({ ...d, apps: { ...d.apps, [a]: v } }));
  const drill = (a: AccessApp) => { setAppKey(a); setStep("actions"); };

  const appsStep = (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-[14px] leading-relaxed text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden />{t("ra.appHint")}</p>
      <ul className="grid gap-3 md:grid-cols-2">
        <li>
          <Card className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <AppIcon app="me" size={44} />
              <div className="min-w-0 flex-1"><b className="text-[17px]">UPLIF Me</b><p className="text-muted">{appBlurb("me" as AccessApp)}</p></div>
            </div>
            <Badge tone="info">{t("ra.alwaysOn")}</Badge>
            <p className="text-[14px] text-muted">{t("ra.meNote")}</p>
          </Card>
        </li>
        {ACCESS_APPS.map((a) => {
          const st = statusOf(a), on = draft.apps[a];
          const held = heldCount(a, draft), total = actionKeys(a).length;
          return (
            <li key={a}>
              <Card className={`flex h-full flex-col gap-3 p-4 ${on && st === "on" ? "border-primary" : ""} ${st === "on" ? "" : "bg-ground"}`}>
                <div className="flex items-start gap-3">
                  <AppIcon app={a as AppKey} size={44} dim={st !== "on"} />
                  <div className="min-w-0 flex-1"><b className="text-[17px]">{appName(a)}</b><p className="text-muted">{appBlurb(a)}</p></div>
                  {st === "on" && <Toggle checked={on} disabled={readOnly} onChange={(v) => setApp(a, v)} label={appName(a)} />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {st === "soon" && <Badge>{t("ra.soon")}</Badge>}
                  {st === "locked" && <Badge tone="warning"><Lock className="me-1 size-3" aria-hidden />{t("ra.notInPlan")}</Badge>}
                  {st === "on" && <Badge tone={on ? "success" : "danger"}>{on ? t("ra.allowed") : t("ra.denied")}</Badge>}
                </div>
                {st === "locked" && on && <p className="text-[14px] text-warning-ink">{t("ra.inactive")}</p>}
                {st !== "soon" && on && total > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] text-muted">{fmt(t("ra.count"), { a: n(held), b: n(total) })}</span>
                    <button type="button" className="font-semibold text-link" onClick={() => drill(a)}>{t("ra.chooseActions")} →</button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const groupsOf = (a: AccessApp) => GROUPS.filter((g) => g.app === a)
    .map((g) => ({ g, items: catalog.filter((c) => groupOf(c.key)?.id === g.id) })).filter((x) => x.items.length > 0);

  const scopesFor = (key: string): Scope[] => (SCOPED_KEYS.has(key) ? [...SCOPES] : ["company"]);
  const setPerm = (key: string, v: Scope | "none") => setDraft((d) => {
    const perms = { ...d.perms };
    if (v === "none") delete perms[key]; else perms[key] = v;
    return { ...d, perms };
  });

  const actionsStep = (() => {
    const st = statusOf(appKey), appOn = draft.apps[appKey];
    const frozen = readOnly || !appOn || st !== "on";
    return (
      <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={t("ra.pickApp")} className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-0 lg:flex-col lg:overflow-visible">
          {ACCESS_APPS.map((a) => {
            const s = statusOf(a), on = draft.apps[a] && s === "on";
            return (
              <button key={a} type="button" aria-current={a === appKey} onClick={() => setAppKey(a)}
                className={`flex min-h-14 min-w-44 items-center gap-2.5 rounded-card border px-2.5 py-2 text-start lg:min-w-0 ${a === appKey ? "border-primary bg-primary-soft" : "border-line bg-surface hover:bg-ground"}`}>
                <AppIcon app={a as AppKey} size={28} dim={!on} />
                <span className="min-w-0"><b className={`block truncate font-semibold ${on ? "" : "text-muted"}`}>{appName(a)}</b>
                  <small className="block text-[13px] text-muted">{s === "soon" ? t("ra.soon") : s === "locked" ? t("ra.notInPlan") : on ? `${n(heldCount(a, draft))}/${n(actionKeys(a).length)}` : t("ra.denied")}</small></span>
              </button>
            );
          })}
        </nav>
        <div key={appKey} className="flex min-w-0 animate-[uplif-in_0.28s_ease_both] flex-col gap-4">
          <div className="flex items-center gap-3"><AppIcon app={appKey as AppKey} size={40} /><div><h2 className="text-xl font-bold">{appName(appKey)}</h2><p className="text-muted">{appBlurb(appKey)}</p></div></div>
          {st === "on" && !appOn && (
            <div className="flex flex-wrap items-center gap-3 rounded-card bg-warning-soft p-3.5 text-warning-ink">
              <Info className="size-4 shrink-0" aria-hidden />{t("ra.appOff")}
              {!readOnly && <button type="button" className="font-semibold underline" onClick={() => setApp(appKey, true)}>{t("ra.turnOn")}</button>}
            </div>
          )}
          {st === "locked" && <div className="flex items-center gap-3 rounded-card bg-warning-soft p-3.5 text-warning-ink"><Lock className="size-4 shrink-0" aria-hidden />{t("ra.notInPlan")}. {t("ra.planNote")}</div>}
          {st === "soon" && <div className="flex items-center gap-3 rounded-card bg-primary-soft p-3.5 text-primary-ink"><Info className="size-4 shrink-0" aria-hidden />{t("ra.soonBody")}</div>}
          {groupsOf(appKey).map(({ g, items }) => {
            const keys = items.map((c) => c.key).filter((k) => k !== "org.branch.read");
            const lv = groupLevel(keys, draft.perms);
            return (
              <Card key={g.id} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ground px-4 py-3">
                  <span className="font-semibold">{t(g.labelKey as MessageKey)} <small className="ms-2 text-[13px] font-normal text-muted">{n(lv.on)}/{n(keys.length)}</small></span>
                  {keys.length > 0 && (
                    <Segmented label={t("ra.quickSet")} disabled={frozen} value={lv.level === "custom" ? null : lv.level}
                      items={[{ id: "none", label: t("ra.preset.none") }, ...(keys.some(isRead) ? [{ id: "view", label: t("ra.preset.view") }] : []), { id: "full", label: t("ra.preset.full") }]}
                      onChange={(m) => setDraft((d) => ({ ...d, perms: applyPreset(keys, d.perms, m as "none" | "view" | "full") }))} />
                  )}
                </div>
                {items.map((c) => {
                  const always = c.key === "org.branch.read";
                  const v = draft.perms[c.key];
                  return (
                    <div key={c.key} className="grid items-center gap-2 border-t border-line px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto] md:gap-4">
                      <div className="min-w-0 leading-snug">
                        <b className="font-medium">{desc(c)}</b>
                        <code className="mt-0.5 block break-all text-[13px] text-muted">{c.key}</code>
                        {always && <small className="text-[13px] text-muted">{t("ra.branchNote")}</small>}
                      </div>
                      <div className="md:w-52">
                        {scopesFor(c.key).length > 1 || always ? (
                          <Select bare disabled={readOnly || (!always && frozen)} label={`${desc(c)}: ${t("roles.scope")}`}
                            value={v ?? "none"} onChange={(e) => setPerm(c.key, e.target.value as Scope | "none")}>
                            <option value="none">{t("roles.scope.none")}</option>
                            {SCOPES.map((s) => <option key={s} value={s}>{t(`roles.scope.${s}` as MessageKey)}</option>)}
                          </Select>
                        ) : (
                          <Toggle checked={!!v} disabled={frozen} onChange={(on) => setPerm(c.key, on ? "company" : "none")} label={t(v ? "ra.allowed" : "ra.denied")} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </Card>
            );
          })}
          <p className="text-[14px] leading-relaxed text-muted">{t("roles.cap")}</p>
        </div>
      </div>
    );
  })();

  const summaryStep = (() => {
    const visible = ACCESS_APPS.filter((a) => draft.apps[a] && statusOf(a) !== "soon");
    const hidden = ACCESS_APPS.filter((a) => !draft.apps[a] && statusOf(a) !== "soon");
    return (
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-1 p-4">
          <h2 className="text-xl font-bold">{t("ra.sumTitle")}</h2>
          <p className="text-muted">{peopleText(counts[role.id] ?? 0)}</p>
        </Card>
        <Card className="flex flex-col gap-3 p-4">
          <h3 className="text-[17px] font-semibold">{t("ra.switcher")}</h3>
          <p className="text-muted">{t("ra.switcherNote")}</p>
          <div className="flex flex-wrap gap-4">
            <span className="flex w-20 flex-col items-center gap-1 text-center text-[13px]"><AppIcon app="me" size={52} />Me</span>
            {visible.map((a) => (
              <span key={a} className="flex w-20 flex-col items-center gap-1 text-center text-[13px]"><AppIcon app={a as AppKey} size={52} dim={statusOf(a) === "locked"} />{appName(a).replace("UPLIF ", "")}</span>
            ))}
          </div>
        </Card>
        {visible.length === 0 && <p className="text-muted">{t("ra.sumNothing")}</p>}
        {visible.map((a) => (
          <Card key={a} className="flex flex-col gap-3 p-4">
            <h3 className="flex flex-wrap items-center gap-2.5 text-[17px] font-semibold"><AppIcon app={a as AppKey} size={28} />{appName(a)}{statusOf(a) === "locked" && <Badge tone="warning">{t("ra.notInPlan")}</Badge>}</h3>
            <ul className="flex flex-wrap gap-2">
              {groupsOf(a).map(({ g, items }) => {
                const keys = items.map((c) => c.key).filter((k) => k !== "org.branch.read");
                if (!keys.length) return null;
                const lv = groupLevel(keys, draft.perms);
                const tone = lv.level === "none" ? "bg-danger-soft text-danger-ink" : lv.level === "full" ? "bg-success-soft text-success-ink" : lv.level === "view" ? "bg-primary-soft text-primary-ink" : "bg-warning-soft text-warning-ink";
                const text = lv.level === "none" ? "✕" : lv.level === "full" ? t("ra.manage") : lv.level === "view" ? fmt(t("ra.viewScope"), { scope: scopeText(lv.scope as Scope) }) : fmt(t("ra.some"), { a: n(lv.on), b: n(lv.total) });
                return <li key={g.id} className={`rounded-control px-2.5 py-1 text-[14px] ${tone}`}>{t(g.labelKey as MessageKey)}: {text}</li>;
              })}
            </ul>
          </Card>
        ))}
        {hidden.length > 0 && (
          <Card className="flex flex-col gap-3 p-4">
            <h3 className="text-[17px] font-semibold">{t("ra.sumNo")}</h3>
            <ul className="flex flex-wrap gap-2">{hidden.map((a) => <li key={a} className="rounded-control bg-danger-soft px-2.5 py-1 text-[14px] text-danger-ink">{appName(a)}</li>)}</ul>
          </Card>
        )}
      </div>
    );
  })();

  const idx = stepItems.findIndex((s) => s.id === step);
  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-5">
      <div><button type="button" onClick={back} className="inline-flex items-center gap-1.5 font-semibold text-link"><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("ra.back")}</button></div>
      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold">{label(role)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-muted">{badge(role)}<span>{peopleText(counts[role.id] ?? 0)}</span></div>
          </div>
          <Link href="/users" className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 font-semibold hover:bg-ground"><Users className="size-4" aria-hidden />{t("roles.viewPeople")}</Link>
        </div>
        {isOwner && <div className="flex items-start gap-3 rounded-control bg-primary-soft p-3 leading-snug text-primary-ink"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /><div><b className="block">{t("roles.ownerTitle")}</b>{t("roles.ownerBody")}</div></div>}
        {role.is_system && !isOwner && <p className="text-[14px] text-muted">{t("roles.sysNote")}</p>}
        {!role.is_system && canManage && (
          <div className="grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto]">
            <Input label={t("roles.name")} value={name ?? role.name} error={nameError} onChange={(e) => setName(e.target.value)} />
            <Input label={t("roles.nameLocal")} value={nameLocal ?? role.name_local ?? ""} onChange={(e) => setNameLocal(e.target.value)} />
            <Button onClick={saveName} disabled={name === undefined && nameLocal === undefined}>{t("roles.saveName")}</Button>
          </div>
        )}
        {!role.is_system && canManage && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <div className="min-w-[220px] flex-1 leading-relaxed"><b className="block font-semibold">{t("roles.delete")}</b>
              <span className="text-[14px] text-muted">{(counts[role.id] ?? 0) > 0 ? `${t("roles.delUse")} ${peopleText(counts[role.id] ?? 0)}.` : t("roles.delBody")}</span></div>
            <Button variant="danger" disabled={(counts[role.id] ?? 0) > 0} onClick={() => setConfirmDelete(true)}>{t("roles.delete")}</Button>
          </div>
        )}
      </Card>
      <Steps label={t("ra.step.label")} items={stepItems} value={step} onChange={(s) => setStep(s as StepId)} />
      <div key={step} className="animate-[uplif-in_0.28s_ease_both]">{step === "apps" ? appsStep : step === "actions" ? actionsStep : summaryStep}</div>
      <div className="flex justify-between gap-3">
        <Button disabled={idx === 0} onClick={() => setStep(stepItems[idx - 1].id as StepId)}><ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />{t("ra.prev")}</Button>
        <Button variant="primary" disabled={idx === stepItems.length - 1} onClick={() => setStep(stepItems[idx + 1].id as StepId)}>{t("ra.next")}<ArrowRight className="size-4 rtl:rotate-180" aria-hidden /></Button>
      </div>
      {changes > 0 && !readOnly && (
        <FloatingBar>
          <span className="font-semibold">{fmt(t("ra.unsaved"), { n: n(changes) })}</span>
          <span className="flex gap-2"><Button onClick={() => setDraft(copy(base as Draft))}>{t("ra.discard")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("ra.save")}</Button></span>
        </FloatingBar>
      )}
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} closeLabel={t("common.close")} title={t("roles.delQ")}
        footer={<><Button onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button><Button variant="danger" onClick={deleteRole}>{t("roles.delete")}</Button></>}>
        <p className="leading-relaxed text-muted">{t("roles.delQBody")}</p>
      </Modal>
      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} closeLabel={t("common.close")} title={t("ra.leaveTitle")}
        footer={<><Button onClick={() => setConfirmLeave(false)}>{t("ra.stay")}</Button><Button variant="danger" onClick={leave}>{t("ra.leave")}</Button></>}>
        <p className="leading-relaxed text-muted">{t("ra.leaveBody")}</p>
      </Modal>
    </div>
  );

  function newRoleModal() {
    const tpls: { id: "blank" | "viewer" | "copy"; title: MessageKey; body: MessageKey }[] = [
      { id: "blank", title: "ra.tpl.blank", body: "ra.tpl.blankBody" },
      { id: "viewer", title: "ra.tpl.viewer", body: "ra.tpl.viewerBody" },
      { id: "copy", title: "ra.tpl.copy", body: "ra.tpl.copyBody" },
    ];
    return (
      <Modal open={newOpen} onClose={() => setNewOpen(false)} closeLabel={t("common.close")} title={t("roles.new")}
        footer={<><Button onClick={() => setNewOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={createRole}>{t("roles.create")}</Button></>}>
        <div className="flex flex-col gap-4">
          <p className="leading-relaxed text-muted">{t("ra.newBody")}</p>
          <div role="group" aria-label={t("ra.startFrom")} className="grid gap-2 sm:grid-cols-3">
            {tpls.map((x) => (
              <button key={x.id} type="button" aria-pressed={tpl === x.id} onClick={() => setTpl(x.id)}
                className={`flex flex-col gap-0.5 rounded-card border p-3 text-start ${tpl === x.id ? "border-primary bg-primary-soft" : "border-line-strong bg-surface hover:bg-ground"}`}>
                <b>{t(x.title)}</b><small className="text-[13px] text-muted">{t(x.body)}</small>
              </button>
            ))}
          </div>
          {tpl === "copy" && (
            <Select label={t("ra.copyPick")} value={copyFrom} onChange={(e) => {
              setCopyFrom(e.target.value);
              const src = list.find((r) => r.id === e.target.value);
              if (src && !newName) setNewName(fmt(t("ra.copyOf"), { name: src.name }));
            }}>
              {list.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
            </Select>
          )}
          <Input label={t("roles.name")} value={newName} onChange={(e) => setNewName(e.target.value)} error={nameError} />
          <Input label={t("roles.nameLocal")} value={newLocal} onChange={(e) => setNewLocal(e.target.value)} />
        </div>
      </Modal>
    );
  }
}
