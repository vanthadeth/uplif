"use client";
import { CloudUpload, WifiOff } from "lucide-react";
import { Button } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { useGoOutbox } from "./outbox-context";

/** Shows when there is no signal and how many notes wait on this phone. Items the server refused show beside their customer. */
export function OutboxBar() {
  const { t } = useI18n();
  const ob = useGoOutbox();
  const waiting = ob.items.filter((i) => i.status === "pending");
  const refused = ob.items.filter((i) => i.status === "failed" && i.data.kind === "customer");
  if (ob.online && waiting.length === 0 && refused.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {!ob.online && <p role="status" className="flex items-start gap-3 rounded-card bg-warning-soft p-3 text-warning-ink"><WifiOff className="mt-0.5 size-5 shrink-0" aria-hidden />{t("go.ob.offline")}</p>}
      {waiting.length > 0 && (
        <div role="status" className="flex items-center gap-3 rounded-card bg-primary-soft p-3 text-primary-ink">
          <CloudUpload className="size-5 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 font-semibold">{fill(t("go.ob.waiting"), { n: waiting.length })}</span>
          {ob.online && <Button loading={ob.sending} onClick={() => void ob.flush()}>{t("go.ob.send")}</Button>}
        </div>
      )}
      {refused.map((i) => (
        <div key={i.id} role="alert" className="flex items-center gap-3 rounded-card bg-danger-soft p-3 text-danger-ink">
          <span className="min-w-0 flex-1"><b className="block truncate">{i.data.kind === "customer" ? i.data.name : ""}</b>{t("go.ob.customerRefused")}</span>
          <Button onClick={() => void ob.retry(i.id)}>{t("go.ob.retry")}</Button>
          <Button variant="quiet" onClick={() => void ob.dismiss(i.id)}>{t("go.ob.remove")}</Button>
        </div>
      ))}
    </div>
  );
}
