"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Input, Modal, Select } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fmtDate, pick } from "@/lib/format";
import { READ_KEYS, scopeKey, type PermissionDef, type Scope } from "./overrides";

/** One permission change typed into an invitation. The database checks every rule again when the invite is made. */
export interface DraftOverride { permission_key: string; effect: "grant" | "deny"; data_scope: Scope | null; reason: string; expires_at: string | null }

interface Props { catalog: PermissionDef[]; value: DraftOverride[]; onChange: (v: DraftOverride[]) => void; onClose: () => void }

/** The same fields as the permission-overrides dialog, but kept in the invite until the person accepts. */
export function DraftOverridesDialog({ catalog, value, onChange, onClose }: Props) {
  const { t, locale } = useI18n();
  const [key, setKey] = useState("");
  const [effect, setEffect] = useState<"grant" | "deny">("deny");
  const [scope, setScope] = useState<Scope>("company");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [error, setError] = useState<string>();
  const label = (k: string) => { const p = catalog.find((x) => x.key === k); return p ? pick(locale, p.description, p.description_local) : k; };
  const scopes: Scope[] = READ_KEYS.has(key) ? ["own", "team", "branch", "company"] : ["company"];
  const free = catalog.filter((p) => !value.some((v) => v.permission_key === p.key));

  function add() {
    if (!key) return setError(t("ovr.err.pick"));
    if (!reason.trim()) return setError(t("ovr.err.reason"));
    setError(undefined);
    const ends = expires ? new Date(`${expires}T23:59:59`).toISOString() : null;
    onChange([...value, { permission_key: key, effect, data_scope: effect === "grant" ? (scopes.includes(scope) ? scope : "company") : null, reason: reason.trim(), expires_at: ends }]);
    setKey(""); setReason(""); setExpires("");
  }

  return (
    <Modal open onClose={onClose} closeLabel={t("common.close")} title={t("inv.overridesTitle")}
      footer={<><Button variant="primary" onClick={onClose}>{t("inv.overridesDone")}</Button></>}>
      <div className="flex flex-col gap-4">
        <p className="leading-relaxed text-muted">{t("inv.overridesIntro")}</p>
        {value.length === 0 ? <p className="rounded-control bg-ground p-3 text-muted">{t("ovr.empty")}</p> : (
          <ul className="flex flex-col gap-2">
            {value.map((o, i) => (
              <li key={o.permission_key} className="flex items-start gap-3 rounded-control border border-line p-3">
                <div className="min-w-0 flex-1 leading-snug">
                  <b className="block break-words">{label(o.permission_key)}</b>
                  <small className="block text-muted">{o.effect === "deny" ? t("ovr.deny") : `${t("ovr.grant")}: ${t(scopeKey[o.data_scope ?? "company"])}`} · {o.expires_at ? t("ovr.until").replace("{date}", fmtDate(locale, o.expires_at)) : t("ovr.noEnd")}</small>
                  <small className="block break-words text-muted">{o.reason}</small>
                </div>
                <Button aria-label={t("ovr.clear")} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden /></Button>
              </li>
            ))}
          </ul>
        )}
        <h3 className="text-[16px] font-semibold">{t("ovr.add")}</h3>
        <Select label={t("ovr.permission")} value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">—</option>
          {free.map((p) => <option key={p.key} value={p.key}>{pick(locale, p.description, p.description_local)}</option>)}
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
        <div><Button onClick={add}>{t("ovr.add")}</Button></div>
      </div>
    </Modal>
  );
}
