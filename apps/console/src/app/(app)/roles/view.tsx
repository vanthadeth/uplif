"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, Input, Modal, Table, TBody, TD, TH, THead, TR, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";

type Scope = "own" | "branch" | "company";
interface Role { id: string; name: string; name_local: string | null; is_system: boolean }
interface Perm { role_id: string; permission_key: string; data_scope: Scope }
interface Props {
  companyId: string;
  roles: Role[];
  permissions: Perm[];
  catalog: { key: string; description: string }[];
  counts: Record<string, number>;
}

export function RolesView({ companyId, roles, permissions, catalog, counts }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const [perms, setPerms] = useState(permissions);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string>();
  const [name, setName] = useState<string>();
  const [busy, setBusy] = useState(false);

  const role = roles.find((r) => r.id === selectedId) ?? roles[0];
  if (!role) return <p role="alert" className="text-danger-ink">{t("dash.noClaim")}</p>;
  const locked = role.is_system && role.name === "Owner";
  const label = (r: Role) => (locale === "km" && r.name_local ? r.name_local : r.name);
  const scopeOf = (key: string) => perms.find((p) => p.role_id === role.id && p.permission_key === key)?.data_scope;

  async function setScope(key: string, value: Scope | "none") {
    const before = perms;
    const existing = scopeOf(key);
    const supabase = createClient();
    // Optimistic update; rolled back if RLS or a guard refuses.
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
  }

  async function createRole() {
    if (!newName.trim()) return setNameError(t("roles.error.name"));
    setBusy(true);
    const { data, error } = await createClient().from("roles").insert({ company_id: companyId, name: newName.trim() }).select("id");
    setBusy(false);
    if (error) return setNameError(error.code === "23505" ? t("roles.error.exists") : error.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    toast("success", t("roles.created"));
    setNewOpen(false); setNewName("");
    if (data?.[0]) setSelectedId(data[0].id);
    router.refresh();
  }

  async function saveName() {
    if (!name?.trim()) return;
    const { data, error } = await createClient().from("roles").update({ name: name.trim() }).eq("id", role.id).select("id");
    if (error || !data?.length) return toast("error", error?.code === "23505" ? t("roles.error.exists") : t("common.saveError"));
    toast("success", t("company.saved"));
    router.refresh();
  }

  async function deleteRole() {
    const { error } = await createClient().from("roles").delete().eq("id", role.id);
    if (error) return toast("error", error.code === "P0001" ? t("roles.inUse") : t("common.saveError"));
    toast("success", t("roles.deleted"));
    setSelectedId("");
    router.refresh();
  }

  const scopes: [Scope | "none", MessageKey][] = [
    ["none", "roles.scope.none"], ["own", "roles.scope.own"], ["branch", "roles.scope.branch"], ["company", "roles.scope.company"],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("roles.title")}</h1>
          <p className="text-muted">{t("roles.subtitle")}</p>
        </div>
        <Button variant="primary" onClick={() => { setNewOpen(true); setNewName(""); setNameError(undefined); }}>{t("roles.new")}</Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <nav aria-label={t("roles.title")}>
          <ul className="flex flex-col gap-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => { setSelectedId(r.id); setName(undefined); }} aria-current={r.id === role.id}
                  className={`flex w-full items-center justify-between gap-2 rounded-control border px-3 py-2 text-start ${r.id === role.id ? "border-primary bg-primary-soft" : "border-line bg-surface hover:bg-ground"}`}>
                  <span className="font-semibold">{label(r)}</span>
                  <span className="text-xs text-muted">{counts[r.id] ?? 0} {t("roles.members")}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <Card><CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <Input label={t("roles.name")} value={name ?? role.name} disabled={role.is_system} onChange={(e) => setName(e.target.value)} />
            </div>
            <Badge tone={role.is_system ? "info" : "neutral"}>{role.is_system ? t("roles.system") : t("roles.custom")}</Badge>
            {!role.is_system && (
              <>
                <Button onClick={saveName} disabled={!name || name === role.name}>{t("roles.saveName")}</Button>
                <Button variant="danger" onClick={deleteRole}>{t("roles.delete")}</Button>
              </>
            )}
          </div>
          {locked && <p className="text-muted">{t("roles.ownerFixed")}</p>}
          <Table>
            <THead><TR><TH>{t("roles.permission")}</TH><TH>{t("roles.scope")}</TH></TR></THead>
            <TBody>
              {catalog.map((c) => (
                <TR key={c.key}>
                  <TD><div>{c.description}</div><code className="text-xs text-muted">{c.key}</code></TD>
                  <TD>
                    <label className="sr-only" htmlFor={`scope-${c.key}`}>{`${c.description}: ${t("roles.scope")}`}</label>
                    <select id={`scope-${c.key}`} disabled={locked} value={scopeOf(c.key) ?? "none"}
                      onChange={(e) => setScope(c.key, e.target.value as Scope | "none")}
                      className="h-(--control-h) w-full min-w-40 rounded-control border border-line-strong bg-surface px-3 disabled:bg-ground disabled:text-muted">
                      {scopes.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}
                    </select>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardBody></Card>
      </div>
      <Modal open={newOpen} onClose={() => setNewOpen(false)} closeLabel={t("common.close")} title={t("roles.new")}
        footer={<><Button onClick={() => setNewOpen(false)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={createRole}>{t("roles.new")}</Button></>}>
        <Input label={t("roles.name")} value={newName} onChange={(e) => setNewName(e.target.value)} error={nameError} />
      </Modal>
    </div>
  );
}
