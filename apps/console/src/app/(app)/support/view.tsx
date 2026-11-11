"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, ErrorState, Modal, Tabs, useToast, type BadgeTone } from "@uplif/ui";
import { useI18n } from "@/lib/i18n";
import type { MessageKey } from "@/lib/messages";
import { fmtDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

interface Grant { id: string; reason: string; hours: number; status: string; requested_at: string; decided_at: string | null; expires_at: string | null }
type Act = "approve" | "decline" | "end";
const tones: Record<string, BadgeTone> = { requested: "warning", approved: "success", declined: "neutral", cancelled: "neutral", ended: "neutral", expired: "neutral" };
const live = (g: Grant) => g.status === "requested" || g.status === "approved";

export function SupportView({ isOwner, grants, failed }: { isOwner: boolean; grants: Grant[]; failed: boolean }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<"cur" | "past">("cur");
  const [target, setTarget] = useState<{ g: Grant; act: Act } | null>(null);
  const [busy, setBusy] = useState(false);
  const current = grants.filter(live);
  const past = grants.filter((g) => !live(g));
  const shown = tab === "cur" ? current : past;

  async function run() {
    if (!target) return;
    setBusy(true);
    const supabase = createClient();
    const { error } = target.act === "end"
      ? await supabase.rpc("end_support_access", { p_id: target.g.id })
      : await supabase.rpc("respond_support_access", { p_id: target.g.id, p_approve: target.act === "approve" });
    setBusy(false);
    if (error) return toast("error", t("support.failed"));
    toast("success", t(`support.done.${target.act}` as MessageKey));
    setTarget(null);
    router.refresh();
  }
  const fill = (s: string, v: Record<string, string | number>) => Object.entries(v).reduce((a, [k, x]) => a.replace(`{${k}}`, String(x)), s);

  return (
    <div className="mx-auto flex w-full max-w-(--content-max) flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">{t("support.title")}</h1>
        <p className="text-muted">{t("support.intro")}</p>
      </div>
      {!isOwner ? <EmptyState title={t("support.title")} body={t("support.notOwner")} />
        : failed ? <ErrorState title={t("support.loadFailed")} body={t("support.loadFailedBody")} /> : (
          <>
            <Tabs label={t("support.title")} value={tab} onChange={(v) => setTab(v as "cur" | "past")}
              items={[{ id: "cur", label: `${t("support.tabCurrent")} ${current.length}` }, { id: "past", label: `${t("support.tabPast")} ${past.length}` }]} />
            {shown.length === 0 ? (
              <EmptyState title={t(tab === "cur" ? "support.emptyCurrent" : "support.emptyPast")} body={t(tab === "cur" ? "support.emptyCurrentBody" : "support.emptyPastBody")} />
            ) : (
              <Card className="overflow-hidden">
                <ul>
                  {shown.map((g) => (
                    <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span className="min-w-0 flex-1">
                        <b className="block font-semibold">{g.reason}</b>
                        <small className="block text-muted">
                          {fill(t("support.asked"), { when: fmtDateTime(locale, g.requested_at), hours: g.hours })}
                          {g.status === "approved" && g.expires_at ? ` · ${fill(t("support.until"), { when: fmtDateTime(locale, g.expires_at) })}` : ""}
                        </small>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={tones[g.status] ?? "neutral"}>{t(`support.status.${g.status}` as MessageKey)}</Badge>
                        {g.status === "requested" && <>
                          <Button onClick={() => setTarget({ g, act: "decline" })}>{t("support.decline")}</Button>
                          <Button variant="primary" onClick={() => setTarget({ g, act: "approve" })}>{t("support.approve")}</Button>
                        </>}
                        {g.status === "approved" && <Button onClick={() => setTarget({ g, act: "end" })}>{t("support.end")}</Button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      <Modal open={!!target} onClose={() => setTarget(null)} closeLabel={t("common.close")}
        title={target ? t(`support.${target.act}Title` as MessageKey) : ""}
        footer={<><Button onClick={() => setTarget(null)}>{t("common.cancel")}</Button>
          <Button variant="primary" loading={busy} onClick={run}>{target ? t(`support.${target.act}` as MessageKey) : ""}</Button></>}>
        <p>{target ? fill(t(`support.${target.act}Body` as MessageKey), { hours: target.g.hours }) : ""}</p>
      </Modal>
    </div>
  );
}
