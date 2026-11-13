"use client";
import { useCallback, useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { Badge, Button, Card, Input, SidePanel, Textarea, useToast, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { ymd } from "@/lib/format";

interface Amendment { id: string; work_date: string; in_time: string | null; out_time: string | null; reason: string; status: "pending" | "approved" | "rejected" | "cancelled"; decision_note: string | null }
const TONES: Record<string, BadgeTone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };
const hhmm = (s: string | null) => (s ? s.slice(0, 5) : "");

/** Ask for a missing or wrong clock time on a day, and see the requests. `date` is the day picked on the calendar. */
export function Amendments({ date, onApproved }: { date: string | null; onApproved?: () => void }) {
  const { t } = useI18n();
  const { tag } = useFormat();
  const toast = useToast();
  const [rows, setRows] = useState<Amendment[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const { data } = await createClient().rpc("my_amendments");
    setRows((data ?? []) as Amendment[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const today = ymd(new Date());
  const oldest = ymd(new Date(Date.now() - 31 * 86400000));
  const eligible = !!date && date <= today && date >= oldest;
  const dateLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" });

  async function send() {
    if (!date) return;
    if ((!inTime && !outTime) || reason.trim().length < 3) { setError(t("st.amend.err.need")); return; }
    if (inTime && outTime && outTime <= inTime) { setError(t("st.amend.err.order")); return; }
    setBusy(true); setError("");
    const { error: e } = await createClient().rpc("request_amendment", { p_date: date, p_in: inTime || null, p_out: outTime || null, p_reason: reason });
    setBusy(false);
    if (e) { setError(t(e.message.includes("already open") ? "st.amend.err.open" : e.message.includes("out must") ? "st.amend.err.order" : "st.amend.err.generic")); return; }
    toast("success", t("st.amend.sent"));
    setOpen(false); setInTime(""); setOutTime(""); setReason("");
    void load();
  }
  async function cancel(id: string) {
    const { error: e } = await createClient().rpc("cancel_amendment", { p_id: id });
    if (e) { toast("error", t("st.amend.err.generic")); return; }
    toast("success", t("st.amend.cancelled"));
    void load();
  }

  const times = (r: Amendment) => [r.in_time && fill(t("st.amend.inAt"), { t: hhmm(r.in_time) }), r.out_time && fill(t("st.amend.outAt"), { t: hhmm(r.out_time) })].filter(Boolean).join(" · ");

  return (
    <>
      {eligible && <Button className="h-12" onClick={() => { setError(""); setOpen(true); }}><PenLine className="size-5" aria-hidden />{t("st.amend.ask")}</Button>}

      {rows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted">{t("st.amend.list")}</h2>
          <Card className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><b className="block">{dateLabel(r.work_date)}</b><span className="text-sm text-muted">{times(r)}</span></div>
                  <Badge tone={TONES[r.status]}>{t(`st.amend.status.${r.status}` as MessageKey)}</Badge>
                </div>
                {r.decision_note && <p className="m-0 text-sm text-muted">{fill(t("st.amend.note"), { note: r.decision_note })}</p>}
                {r.status === "pending" && <Button className="self-start" onClick={() => void cancel(r.id)}>{t("st.amend.cancel")}</Button>}
              </div>
            ))}
          </Card>
        </section>
      )}

      <SidePanel sheet open={open} onClose={() => setOpen(false)} title={date ? fill(t("st.amend.title"), { date: dateLabel(date) }) : ""} closeLabel={t("st.account.close")}
        footer={<Button variant="primary" className="h-12 w-full" loading={busy} onClick={() => void send()}>{t("st.amend.send")}</Button>}>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-muted">{t("st.amend.hint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("st.amend.in")} type="time" value={inTime} onChange={(e) => { setInTime(e.target.value); setError(""); }} />
            <Input label={t("st.amend.out")} type="time" value={outTime} onChange={(e) => { setOutTime(e.target.value); setError(""); }} />
          </div>
          <Textarea label={t("st.amend.reason")} value={reason} maxLength={500} rows={3} onChange={(e) => { setReason(e.target.value); setError(""); }} />
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      </SidePanel>
    </>
  );
}
