"use client";
import { CloudUpload, WifiOff } from "lucide-react";
import { Button } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useStockOutbox } from "./outbox-context";

/** Shows when there is no signal, how many changes wait on this phone, and any the server refused. */
export function OutboxBar() {
  const { t } = useI18n();
  const ob = useStockOutbox();
  const waiting = ob.items.filter((i) => i.status === "pending");
  const refused = ob.items.filter((i) => i.status === "failed");
  if (ob.online && ob.items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {!ob.online && <p role="status" className="flex items-start gap-3 rounded-card bg-warning-soft p-3 text-warning-ink"><WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />{t("sk.ob.offline")}</p>}
      {waiting.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-card bg-primary-soft p-3 text-primary-ink">
          <CloudUpload className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 font-semibold">{fill(t("sk.ob.waiting"), { n: waiting.length })}</span>
          {ob.online && <Button loading={ob.sending} onClick={() => void ob.flush()}>{t("sk.ob.send")}</Button>}
        </div>
      )}
      {refused.map((i) => (
        <div key={i.id} role="alert" className="flex items-center gap-3 rounded-card bg-danger-soft p-3 text-danger-ink">
          <span className="min-w-0 flex-1"><b className="block">{t(`sk.ob.k.${i.data.kind}` as never)}</b>{t("sk.ob.refused")}{i.error ? ` (${i.error})` : ""}</span>
          <Button onClick={() => void ob.dismiss(i.id)}>{t("sk.ob.remove")}</Button>
        </div>
      ))}
    </div>
  );
}
