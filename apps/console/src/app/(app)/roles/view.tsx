"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Lock, ShieldCheck, Users } from "lucide-react";
import { Badge, Button, Card, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { pick } from "@/lib/format";

type Scope = "own" | "team" | "branch" | "company";
interface Role { id: string; name: string; name_local: string | null; is_system: boolean }
interface Perm { role_id: string; permission_key: string; data_scope: Scope }
interface Props {
  companyId: string;
  roles: Role[];
  permissions: Perm[];
  catalog: { key: string; description: string; description_local: string | null }[];
  counts: Record<string, number>;
  canManage: boolean;
}

/** Read permissions can be limited to your own records or branches; every other permission is all or nothing. */
const READ_KEYS = new Set(["org.branch.read", "org.member.read", "org.role.read", "org.employee.read"]);
const GROUPS: [string, MessageKey, string[]][] = [
  ["company", "roles.group.company", ["company", "settings", "currency", "payment_term"]],
  ["branch", "roles.group.branch", ["branch"]],
  ["people", "roles.group.people", ["member", "invitation"]],
  ["roles", "roles.group.roles", ["role"]],
  ["audit", "roles.group.audit", ["audit"]],
];
const resourceOf = (key: string) => key.split(".")[1] ?? "";

export function RolesView({ companyId, roles, permissions, catalog, counts, canManage }: Props) {
  const { t, locale } = useI18n();
  const n = (v: number) => v.toLocaleString(locale === "km" ? "km-KH" : "en");
  const peopleText = (c: number) => (locale === "km" ? `${n(c)} នាក់` : c === 1 ? "1 person" : `${c} people`);
  const toast = useToast();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const [perms, setPerms] = useState(permissions);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocal, setNewLocal] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [name, setName] = useState<string>();
  const [nameLocal, setNameLocal] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const role = roles.find((r) => r.id === selectedId) ?? roles[0];

  const groups = useMemo(() => {
    const known = new Set(GROUPS.flatMap(([, , r]) => r));
    const out = GROUPS.map(([id, label, resources]) => ({ id, label: t(label), items: catalog.filter((c) => resources.includes(resourceOf(c.key))) }));
    const rest = catalog.filter((c) => !known.has(resourceOf(c.key)));
    if (rest.length) out.push({ id: "other", label: t("roles.group.other"), items: rest });
    return out.filter((g) => g.items.length > 0);
  }, [catalog, t]);

  if (!role) return <p role="alert" className="text-danger-ink">{t("dash.noClaim")}</p>;

  const isOwner = role.is_system && role.name === "Owner";
  const fixed = isOwner || !canManage;
  const label = (r: Role) => (locale === "km" && r.name_local ? r.name_local : r.name);
  const systemRoles = roles.filter((r) => r.is_system);
  const customRoles = roles.filter((r) => !r.is_system);
  const countOf = (r: Role) => counts[r.id] ?? 0;
  const mine = perms.filter((p) => p.role_id === role.id);
  const scopeOf = (key: string) => mine.find((p) => p.permission_key === key)?.data_scope;
  const people = countOf(role);

  async function setScope(key: string, value: Scope | "none") {
    const before = perms;
    const existing = scopeOf(key);
    const supabase = createClient();
    // Optimistic update; rolled back if row-level security or a guard refuses.
    setPerms(value === "none"
      ? perms.filter((p) => !(p.role_id === role.id && p.permission_key === key))
      : existing
        ? perms.map((p) => (p.role_id === role.id && p.permission_key === key ? { ...p, data_scope: value } : p))
        : [...perms, { role_id: role.id, permission_key: key, data_scope: value }]);
    const res = value === "none"
      ? await supabase.from("role_permissions").delete().eq("role_id", role.id).eq("permission_key", key).select("role_id")
      : existing
        ? await supabase.from("role_permissions").update({ data_scope: value }).eq("role_id", role.id).eq("permission_key", key).select("role_id")
        : await supabase.from("role_permissions").insert({ company_id: companyId, role_id: role.id, permission_key: key, data_scope: value }).select("role_id");
    if (res.error || !res.data?.length) {
      setPerms(before);
      return toast("error", res.error && res.error.code !== "42501" ? t("common.saveError") : t("common.forbidden"));
    }
    toast("success", t("roles.scopeSaved"));
  }

  async function createRole() {
    if (!newName.trim()) return setNameError(t("roles.error.name"));
    setBusy(true);
    const { data, error } = await createClient().from("roles")
      .insert({ company_id: companyId, name: newName.trim(), name_local: newLocal.trim() || null }).select("id");
    setBusy(false);
    if (error) return setNameError(error.code === "23505" ? t("roles.error.exists") : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("roles.created"));
    setNewOpen(false); setNewName(""); setNewLocal("");
    if (data?.[0]) setSelectedId(data[0].id);
    router.refresh();
  }

  async function saveName() {
    const next = (name ?? role.name).trim();
    if (!next) return setNameError(t("roles.error.name"));
    const { data, error } = await createClient().from("roles")
      .update({ name: next, name_local: (nameLocal ?? role.name_local ?? "").trim() || null }).eq("id", role.id).select("id");
    if (error || !data?.length) return toast("error", error?.code === "23505" ? t("roles.error.exists") : error?.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    setName(undefined); setNameLocal(undefined); setNameError(undefined);
    toast("success", t("company.saved"));
    router.refresh();
  }

  async function deleteRole() {
    const { error } = await createClient().from("roles").delete().eq("id", role.id);
    setConfirmDelete(false);
    if (error) return toast("error", error.code === "P0001" ? t("roles.inUse") : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("roles.deleted"));
    setSelectedId("");
    router.refresh();
  }

  const scopesFor = (key: string): [Scope | "none", MessageKey][] => READ_KEYS.has(key)
    ? [["none", "roles.scope.none"], ["own", "roles.scope.own"], ["team", "roles.scope.team"], ["branch", "roles.scope.branch"], ["company", "roles.scope.company"]]
    : [["none", "roles.scope.none"], ["company", "roles.scope.company"]];

  const pickRole = (id: string) => { setSelectedId(id); setName(undefined); setNameLocal(undefined); setNameError(undefined); };
  const row = (r: Role) => (
    <li key={r.id}>
      <button type="button" onClick={() => pickRole(r.id)} aria-current={r.id === role.id}
        className={`flex min-h-14 w-full items-center justify-between gap-2 rounded-card border px-3 py-2 text-start ${r.id === role.id ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface hover:bg-ground"}`}>
        <span className="min-w-0">
          <b className="flex items-center gap-1.5 font-semibold">{r.is_system && r.name === "Owner" && <Lock className="size-3.5 shrink-0" aria-hidden />}<span className="truncate">{label(r)}</span></b>
          <small className="block text-xs opacity-75">{peopleText(countOf(r))}</small>
        </span>
      </button>
    </li>
  );

  const dirtyName = name !== undefined || nameLocal !== undefined;

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("roles.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t("roles.subtitle")}</p>
        </div>
        {canManage
          ? <Button variant="primary" className="w-full sm:w-auto" onClick={() => { setNewOpen(true); setNewName(""); setNewLocal(""); setNameError(undefined); }}>{t("roles.new")}</Button>
          : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("users.viewOnly")}</Badge>}
      </div>

      {!canManage && (
        <div className="flex items-start gap-3 rounded-card bg-primary-soft p-3.5 leading-snug text-primary-ink">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div><b className="block">{t("roles.roTitle")}</b>{t("roles.roBody")}</div>
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[16.25rem_minmax(0,1fr)]">
        <nav aria-label={t("roles.title")} className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-0 lg:flex-col lg:overflow-visible lg:pb-0">
          <div className="contents lg:flex lg:flex-col lg:gap-1.5">
            <p className="hidden px-1 pt-1 text-[13px] font-semibold text-muted lg:block">{t("roles.group.system")}</p>
            <ul className="flex gap-2 lg:flex-col lg:gap-1.5">{systemRoles.map(row)}</ul>
            {customRoles.length > 0 && (
              <>
                <p className="hidden px-1 pt-2 text-[13px] font-semibold text-muted lg:block">{t("roles.group.custom")}</p>
                <ul className="flex gap-2 lg:flex-col lg:gap-1.5">{customRoles.map(row)}</ul>
              </>
            )}
          </div>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-[24px] font-bold leading-tight">{label(role)}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-muted">
                  <Badge tone={isOwner ? "warning" : role.is_system ? "info" : "neutral"}>
                    {isOwner ? <><Lock className="size-3" aria-hidden />{t("roles.fixed")}</> : role.is_system ? t("roles.system") : t("roles.custom")}
                  </Badge>
                  <span>{peopleText(people)}</span>
                  <span aria-hidden>·</span>
                  <span>{n(mine.length)} {t("roles.of")} {n(catalog.length)} {t("roles.permissions")}</span>
                </div>
              </div>
              <Link href="/users" className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line-strong bg-surface px-3 font-semibold hover:bg-ground">
                <Users className="size-4" aria-hidden />{t("roles.viewPeople")}
              </Link>
            </div>

            {isOwner && (
              <div className="flex items-start gap-3 rounded-control bg-primary-soft p-3 leading-snug text-primary-ink">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div><b className="block">{t("roles.ownerTitle")}</b>{t("roles.ownerBody")}</div>
              </div>
            )}
            {role.is_system && !isOwner && <p className="text-[14px] text-muted">{t("roles.sysNote")}</p>}

            {!role.is_system && canManage && (
              <div className="grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto]">
                <Input label={t("roles.name")} value={name ?? role.name} error={nameError} onChange={(e) => setName(e.target.value)} />
                <Input label={t("roles.nameLocal")} value={nameLocal ?? role.name_local ?? ""} onChange={(e) => setNameLocal(e.target.value)} />
                <Button onClick={saveName} disabled={!dirtyName}>{t("roles.saveName")}</Button>
              </div>
            )}

            {!role.is_system && canManage && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <div className="min-w-[220px] flex-1 leading-relaxed">
                  <b className="block font-semibold">{t("roles.delete")}</b>
                  <span className="text-[14px] text-muted">{people > 0 ? `${t("roles.delUse")} ${peopleText(people)}.` : t("roles.delBody")}</span>
                </div>
                <Button variant="danger" disabled={people > 0} onClick={() => setConfirmDelete(true)}>{t("roles.delete")}</Button>
              </div>
            )}
          </Card>

          <p className="flex items-center gap-2 text-[14px] text-muted"><Info className="size-4 shrink-0" aria-hidden />{fixed && isOwner ? t("roles.ownerFixed") : t("roles.imm")}</p>

          {groups.map((g) => (
            <Card key={g.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-line bg-ground px-4 py-3 font-semibold">
                {g.label}
                <small className="text-xs font-semibold text-muted">{n(g.items.filter((c) => scopeOf(c.key)).length)} {t("roles.of")} {n(g.items.length)}</small>
              </div>
              {g.items.map((c) => (
                <div key={c.key} className="grid items-center gap-2 border-t border-line px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_auto] md:gap-4">
                  <div className="min-w-0 leading-snug">
                    <b className="font-medium">{pick(locale, c.description, c.description_local)}</b>
                    <code className="mt-0.5 block break-all text-[13px] text-muted">{c.key}</code>
                  </div>
                  <div className="md:w-48">
                    <Select bare disabled={fixed} label={`${pick(locale, c.description, c.description_local)}: ${t("roles.scope")}`}
                      value={isOwner ? "company" : scopeOf(c.key) ?? "none"} onChange={(e) => setScope(c.key, e.target.value as Scope | "none")}>
                      {scopesFor(c.key).map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
                    </Select>
                  </div>
                </div>
              ))}
            </Card>
          ))}
          <p className="text-[14px] leading-relaxed text-muted">{t("roles.cap")}</p>
        </div>
      </div>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} closeLabel={t("common.close")} title={t("roles.new")}
        footer={<><Button onClick={() => setNewOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={createRole}>{t("roles.create")}</Button></>}>
        <div className="flex flex-col gap-4">
          <p className="leading-relaxed text-muted">{t("roles.newBody")}</p>
          <Input label={t("roles.name")} value={newName} onChange={(e) => setNewName(e.target.value)} error={nameError} />
          <Input label={t("roles.nameLocal")} value={newLocal} onChange={(e) => setNewLocal(e.target.value)} />
        </div>
      </Modal>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} closeLabel={t("common.close")} title={t("roles.delQ")}
        footer={<><Button onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</Button><Button variant="danger" onClick={deleteRole}>{t("roles.delete")}</Button></>}>
        <p className="leading-relaxed text-muted">{t("roles.delQBody")}</p>
      </Modal>
    </div>
  );
}
