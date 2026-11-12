"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge, Button, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";

export type Scope = "own" | "team" | "branch" | "company";
export interface PermissionDef { key: string; description: string; description_local: string | null }
export interface Override { id: string; membership_id: string; permission_key: string; effect: "grant" | "deny"; data_scope: Scope | null; reason: string; expires_at: string | null }

export const scopeKey: Record<Scope, MessageKey> = { own: "roles.scope.own", team: "roles.scope.team", branch: "roles.scope.branch", company: "roles.scope.company" };
// Keys that are only ever granted at company level (they have no narrower meaning).
export const READ_KEYS = new Set(["org.branch.read", "org.member.read", "org.role.read", "org.employee.read"]);

interface Props { memberId: string; memberName: string; overrides: Override[]; catalog: PermissionDef[]; onClose: () => void }

/** Per-user permission overrides. A live override wins over the user's roles; the database enforces every rule again. */
export function OverridesDialog({ memberId, memberName, overrides, catalog, onClose }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const mine = overrides.filter((o) => o.membership_id === memberId);
  const [key, setKey] = useState("");
  const [effect, setEffect] = useState<"grant" | "deny">("deny");
  const [scope, setScope] = useState<Scope>("company");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const label = (k: string) => { const p = catalog.find((x) => x.key === k); return p ? pick(locale, p.description, p.description_local) : k; };
  const scopes: Scope[] = READ_KEYS.has(key) ? ["own", "team", "branch", "company"] : ["company"];

  function failure(code: string | undefined, message: string | undefined) {
    const m = message ?? "";
    if (m.includes("more than you have")) return t("ovr.err.beyond");
    if (m.includes("owner cannot")) return t("ovr.err.owner");
    if (m.includes("your own")) return t("ovr.err.self");
    if (m.includes("reason")) return t("ovr.err.reason");
    return code === "42501" ? t("common.forbidden") : t("common.saveError");
  }

  async function save() {
    if (!key) return setError(t("ovr.err.pick"));
    if (!reason.trim()) return setError(t("ovr.err.reason"));
    setError(undefined);
    setBusy(true);
    // The expiry is the end of the chosen day, local time.
    const ends = expires ? new Date(`${expires}T23:59:59`).toISOString() : null;
    const { error: err } = await createClient().rpc("set_permission_override", {
      p_membership_id: memberId, p_permission_key: key, p_effect: effect, p_scope: effect === "grant" ? (scopes.includes(scope) ? scope : "company") : null,
      p_reason: reason.trim(), p_expires_at: ends,
    });
    setBusy(false);
    if (err) return toast("error", failure(err.code, err.message));
    toast("success", t("ovr.saved"));
    setKey(""); setReason(""); setExpires("");
    router.refresh();
  }

  async function clear(k: string) {
    setBusy(true);
    const { error: err } = await createClient().rpc("clear_permission_override", { p_membership_id: memberId, p_permission_key: k });
    setBusy(false);
    if (err) return toast("error", failure(err.code, err.message));
    toast("success", t("ovr.cleared"));
    router.refresh();
  }

  return (
    <Modal open onClose={onClose} closeLabel={t("common.close")} title={`${t("ovr.title")} ${memberName}`}
      footer={<><Button onClick={onClose}>{t("common.close")}</Button><Button variant="primary" loading={busy} disabled={!key} onClick={save}>{t("ovr.save")}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="leading-relaxed text-muted">{t("ovr.intro")}</p>
        {mine.length === 0 ? <p className="rounded-control bg-ground p-3 text-muted">{t("ovr.empty")}</p> : (
          <ul className="flex flex-col gap-2">
            {mine.map((o) => {
              const ended = o.expires_at != null && new Date(o.expires_at) < new Date();
              return (
                <li key={o.id} className="flex items-start gap-3 rounded-control border border-line p-3">
                  <div className="min-w-0 flex-1 leading-snug">
                    <b className="block break-words">{label(o.permission_key)}</b>
                    <small className="block text-muted">{o.effect === "deny" ? t("ovr.deny") : `${t("ovr.grant")}: ${t(scopeKey[o.data_scope ?? "company"])}`} · {o.expires_at ? t("ovr.until").replace("{date}", fmtDate(locale, o.expires_at)) : t("ovr.noEnd")}</small>
                    <small className="block break-words text-muted">{o.reason}</small>
                  </div>
                  {ended && <Badge tone="neutral">{t("ovr.ended")}</Badge>}
                  <Button aria-label={t("ovr.clear")} loading={busy} onClick={() => clear(o.permission_key)}><Trash2 className="size-4" aria-hidden /></Button>
                </li>
              );
            })}
          </ul>
        )}
        <h3 className="text-[15px] font-semibold">{t("ovr.add")}</h3>
        <Select label={t("ovr.permission")} value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">—</option>
          {catalog.map((p) => <option key={p.key} value={p.key}>{pick(locale, p.description, p.description_local)}</option>)}
        </Select>
        <Select label={t("ovr.effect")} value={effect} onChange={(e) => setEffect(e.target.value as "grant" | "deny")}>
          <option value="deny">{t("ovr.deny")}</option>
          <option value="grant">{t("ovr.grant")}</option>
        </Select>
        {effect === "grant" && (
          <Select label={t("ovr.scope")} value={scopes.includes(scope) ? scope : "company"} onChange={(e) => setScope(e.target.value as Scope)}>
            {scopes.map((s) => <option key={s} value={s}>{t(scopeKey[s])}</option>)}
          </Select>
        )}
        <Input label={t("ovr.reason")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} hint={t("ovr.reasonHint")} error={error} />
        <Input label={t("ovr.expires")} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
    </Modal>
  );
}
