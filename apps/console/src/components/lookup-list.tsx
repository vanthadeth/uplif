"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Info, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge, Button, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pick } from "@/lib/format";

export interface LookupItem { id: string; name: string; name_local: string | null; department_id?: string | null; default_role_id?: string | null }
interface Named { id: string; name: string; name_local: string | null }

interface Props {
  /** Departments and positions share one list; positions also carry a department and a suggested role. */
  kind: "dept" | "pos";
  items: LookupItem[];
  /** Item id to number of employees; null when the user may not read employees. */
  counts: Record<string, number> | null;
  departments: Named[];
  roles: Named[];
  companyId: string;
  canManage: boolean;
}

export function LookupList({ kind, items, counts, departments, roles, companyId, canManage }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const p = kind;
  const table = kind === "dept" ? "departments" : "positions";
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LookupItem | "new" | null>(null);
  const [removing, setRemoving] = useState<LookupItem | null>(null);
  const [name, setName] = useState("");
  const [nameLocal, setNameLocal] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || `${i.name} ${i.name_local ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);
  const deptName = (id: string | null | undefined) => { const d = departments.find((x) => x.id === id); return d ? pick(locale, d.name, d.name_local) : ""; };
  const roleName = (id: string | null | undefined) => { const r = roles.find((x) => x.id === id); return r ? pick(locale, r.name, r.name_local) : ""; };
  const n = (v: number) => v.toLocaleString(locale === "km" ? "km-KH" : "en");

  function open(i: LookupItem | "new") {
    setEditing(i);
    setName(i === "new" ? "" : i.name);
    setNameLocal(i === "new" ? "" : i.name_local ?? "");
    setDepartmentId(i === "new" ? "" : i.department_id ?? "");
    setRoleId(i === "new" ? "" : i.default_role_id ?? "");
    setError(undefined);
  }

  function failure(code: string | undefined, message: string | undefined) {
    if (code === "23505") return t(`${p}.dup`);
    if (code === "42501") return t("common.forbidden");
    if (kind === "pos" && message?.includes("Owner role")) return t("pos.ownerRole");
    return t("common.saveError");
  }

  async function save() {
    if (!name.trim()) return setError(t(`${p}.error.name`));
    setBusy(true);
    const supabase = createClient();
    const base = { name: name.trim(), name_local: nameLocal.trim() || null };
    const values = kind === "pos" ? { ...base, department_id: departmentId || null, default_role_id: roleId || null } : base;
    const res = editing === "new"
      ? await supabase.from(table).insert({ company_id: companyId, ...values }).select("id")
      : await supabase.from(table).update(values).eq("id", (editing as LookupItem).id).select("id");
    setBusy(false);
    if (res.error) return toast("error", failure(res.error.code, res.error.message));
    if (!res.data?.length) return toast("error", t("common.forbidden"));
    toast("success", editing === "new" ? t(`${p}.added`) : t(`${p}.saved`));
    setEditing(null);
    router.refresh();
  }

  async function remove(i: LookupItem) {
    setBusy(true);
    const { data, error: err } = await createClient().from(table).delete().eq("id", i.id).select("id");
    setBusy(false);
    if (err) return toast("error", err.code === "42501" ? t("common.forbidden") : t("common.saveError"));
    if (!data?.length) return toast("error", t("common.forbidden"));
    setRemoving(null);
    toast("success", t(`${p}.deleted`));
    router.refresh();
  }

  const add = <Button variant="primary" className="w-full sm:w-auto" onClick={() => open("new")}><Plus className="size-[18px]" aria-hidden />{t(`${p}.add`)}</Button>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t(`${p}.title`)}</h1>
          <p className="mt-1 max-w-[62ch] text-muted">{t(`${p}.subtitle`)}</p>
        </div>
        {canManage ? add : <Badge tone="neutral"><Lock className="size-3" aria-hidden />{t("branches.viewOnly")}</Badge>}
      </div>

      {!canManage && (
        <div role="note" className="flex items-start gap-3 rounded-card bg-primary-soft p-4 leading-normal text-primary-ink">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden />
          <div><b className="block">{t(`${p}.roTitle`)}</b>{t(`${p}.roBody`)}</div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-4 py-9 text-center text-muted">
          <b className="mb-1 block text-[15px] text-ink">{t(`${p}.empty`)}</b>
          {t(`${p}.emptyBody`)}
          {canManage && <div className="mt-3.5">{add}</div>}
        </div>
      ) : (
        <>
          <label className="flex min-h-11 max-w-none items-center gap-2 rounded-control border border-line-strong bg-surface px-3 sm:max-w-[380px]">
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("emp.search")} aria-label={t("emp.search")}
              className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted" />
          </label>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {shown.length === 0 ? (
              <div className="px-4 py-9 text-center text-muted"><b className="mb-1 block text-[15px] text-ink">{t("emp.noMatch")}</b>{t("emp.noMatchBody")}</div>
            ) : shown.map((i) => (
              <div key={i.id} className="grid min-h-[68px] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 border-t border-line px-4 py-3.5 first:border-t-0">
                <div className="min-w-0 leading-snug">
                  <b className="block break-words text-[15px] font-semibold">{pick(locale, i.name, i.name_local)}</b>
                  {(kind === "pos" ? [deptName(i.department_id), roleName(i.default_role_id)] : []).filter(Boolean).map((x, k) => <small key={k} className="block break-words text-[13px] text-muted">{x}</small>)}
                </div>
                <span className="tabular-nums text-muted">{counts ? `${t(`${p}.people`)}: ${n(counts[i.id] ?? 0)}` : ""}</span>
                {canManage && (
                  <div className="col-span-2 mt-1.5 flex gap-2 md:justify-end">
                    <Button className="flex-1 md:flex-none" onClick={() => open(i)}><Pencil className="size-4" aria-hidden />{t("common.edit")}</Button>
                    <Button className="flex-1 md:flex-none" onClick={() => setRemoving(i)}><Trash2 className="size-4" aria-hidden />{t("dept.delete")}</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} closeLabel={t("common.close")} title={editing === "new" ? t(`${p}.add`) : t(`${p}.edit`)}
        footer={<><Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} onClick={save}>{t("branches.saveBtn")}</Button></>}>
        <div className="flex flex-col gap-4">
          <Input label={t(`${p}.name`)} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} error={error} />
          <Input label={t(`${p}.nameLocal`)} value={nameLocal} maxLength={120} onChange={(e) => setNameLocal(e.target.value)} hint={t("branches.nameLocalHint")} />
          {kind === "pos" && (
            <>
              <Select label={t("pos.department")} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">{t("emp.none")}</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{pick(locale, d.name, d.name_local)}</option>)}
              </Select>
              <Select label={t("pos.defaultRole")} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                <option value="">{t("emp.none")}</option>
                {roles.filter((r) => r.name !== "Owner").map((r) => <option key={r.id} value={r.id}>{pick(locale, r.name, r.name_local)}</option>)}
              </Select>
            </>
          )}
        </div>
      </Modal>

      <Modal open={removing !== null} onClose={() => setRemoving(null)} closeLabel={t("common.close")} title={t(`${p}.deleteTitle`)}
        footer={<><Button onClick={() => setRemoving(null)}>{t("common.cancel")}</Button><Button variant="danger" loading={busy} onClick={() => removing && remove(removing)}>{t("dept.delete")}</Button></>}>
        <div className="flex flex-col gap-3">
          {removing && <p className="font-semibold">{pick(locale, removing.name, removing.name_local)}</p>}
          <p className="leading-relaxed text-muted">{t(`${p}.deleteBody`)}</p>
        </div>
      </Modal>
    </div>
  );
}
