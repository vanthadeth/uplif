"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorState, Input, ProgressBar, Select, SidePanel, Skeleton, Textarea, useToast, type BadgeTone } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill, type MessageKey } from "@/lib/messages";
import { useFormat } from "@/lib/use-format";
import { ymd } from "@/lib/format";
import type { MyLeave } from "@/lib/leave";

const HALVES = [
  { id: "full", key: "st.leave.full" }, { id: "start", key: "st.leave.halfStart" }, { id: "end", key: "st.leave.halfEnd" },
] as const satisfies readonly { id: string; key: MessageKey }[];
const TONES: Record<string, BadgeTone> = { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" };

/** Leave balances, a request form in a bottom sheet, and the person's own requests. */
export function LeaveView() {
  const { t, locale } = useI18n();
  const { tag } = useFormat();
  const toast = useToast();
  const [data, setData] = useState<MyLeave | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [typeId, setTypeId] = useState("");
  const [from, setFrom] = useState(ymd(new Date()));
  const [to, setTo] = useState(ymd(new Date()));
  const [half, setHalf] = useState<"full" | "start" | "end">("full");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setFailed(false);
    const { data: d, error: e } = await createClient().rpc("my_leave");
    if (e || !d) { setFailed(true); return; }
    setData(d);
    setTypeId((cur) => cur || d.types[0]?.id || "");
  }, []);
  useEffect(() => { void load(); }, [load]);

  const name = (n: { name: string; name_local: string | null }) => (locale !== "en" && n.name_local) || n.name;
  const days = (n: number) => (n === 1 ? t("st.leave.day.one") : fill(t("st.leave.days"), { n }));
  const date = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString(tag, { weekday: "short", day: "numeric", month: "short" });
  const errorText = (msg: string) =>
    msg.includes("overlaps") ? t("st.leave.err.overlaps") : msg.includes("balance") ? t("st.leave.err.balance")
    : msg.includes("no working days") ? t("st.leave.err.noDays") : msg.includes("leave: dates") ? t("st.leave.err.dates") : t("st.leave.err.generic");

  function openForm() {
    const today = ymd(new Date());
    setFrom(today); setTo(today); setHalf("full"); setReason(""); setError(""); setOpen(true);
  }
  async function send() {
    setBusy(true); setError("");
    const { error: e } = await createClient().rpc("request_leave", { p_type_id: typeId, p_start: from, p_end: half === "full" ? to : from, p_half: half, p_reason: reason.trim() || null });
    setBusy(false);
    if (e) { setError(errorText(e.message)); return; }
    setOpen(false);
    toast("success", t("st.leave.sent"));
    void load();
  }
  async function cancel(id: string) {
    const { error: e } = await createClient().rpc("cancel_leave", { p_id: id });
    if (e) { toast("error", t("st.leave.err.cancel")); return; }
    toast("success", t("st.leave.cancelled"));
    void load();
  }

  if (failed) return <ErrorState title={t("st.leave.error")} action={<Button onClick={() => void load()}>{t("st.retry")}</Button>} />;
  if (!data) return <div className="flex flex-col gap-3" role="status" aria-label={t("st.leave.loading")}><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;

  const today = ymd(new Date());
  const single = half !== "full" || from === to;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {data.types.map((ty) => {
          const left = ty.annual_days == null ? null : Math.max(0, ty.annual_days - ty.used - ty.pending);
          return (
            <Card key={ty.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <b>{name(ty)}</b>
                <Badge tone="info">{ty.code}</Badge>
              </div>
              {left != null && ty.annual_days != null ? (
                <>
                  <ProgressBar value={ty.annual_days ? (left / ty.annual_days) * 100 : 0} label={fill(t("st.leave.left"), { n: left, total: ty.annual_days })} />
                  <span className="text-sm text-muted">{fill(t("st.leave.left"), { n: left, total: ty.annual_days })}</span>
                </>
              ) : <span className="text-sm text-muted">{fill(t("st.leave.taken"), { n: ty.used })}</span>}
              {ty.pending > 0 && <span className="text-sm text-warning-ink">{fill(t("st.leave.waiting"), { n: days(ty.pending) })}</span>}
            </Card>
          );
        })}
      </div>

      <Button variant="primary" className="h-13" onClick={openForm}><Plus className="size-5" aria-hidden />{t("st.leave.request")}</Button>

      <h2 className="px-1 pt-2 text-sm font-semibold text-muted">{t("st.leave.history")}</h2>
      {data.requests.length === 0 ? <EmptyState title={t("st.leave.empty.title")} body={t("st.leave.empty.body")} /> : (
        <Card className="divide-y divide-line">
          {data.requests.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <b className="block">{name(r)} · {days(r.days)}</b>
                  <span className="text-sm text-muted">
                    {r.start_date === r.end_date ? date(r.start_date) : `${date(r.start_date)} – ${date(r.end_date)}`}
                    {r.half !== "full" ? ` · ${t(r.half === "start" ? "st.leave.halfStart" : "st.leave.halfEnd")}` : ""}
                  </span>
                </div>
                <Badge tone={TONES[r.status]}>{t(`st.leave.status.${r.status}` as MessageKey)}</Badge>
              </div>
              {r.decision_note && <p className="text-sm text-muted">{fill(t("st.leave.note"), { note: r.decision_note })}</p>}
              {(r.status === "pending" || (r.status === "approved" && r.start_date > today)) && (
                <Button className="self-start" onClick={() => void cancel(r.id)}>{t("st.leave.cancel")}</Button>
              )}
            </div>
          ))}
        </Card>
      )}

      <SidePanel sheet open={open} onClose={() => setOpen(false)} title={t("st.leave.request")} closeLabel={t("st.account.close")}
        footer={<Button variant="primary" className="h-12 w-full" loading={busy} onClick={() => void send()}>{t("st.leave.send")}</Button>}>
        <div className="flex flex-col gap-4">
          <Select label={t("st.leave.type")} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {data.types.map((ty) => <option key={ty.id} value={ty.id}>{name(ty)}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("st.leave.from")} type="date" value={from} min={ymd(new Date(Date.now() - 31 * 86400000))}
              onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
            <Input label={t("st.leave.to")} type="date" value={half === "full" ? to : from} min={from} disabled={half !== "full"} onChange={(e) => setTo(e.target.value)} />
          </div>
          {single && (
            <div role="radiogroup" aria-label={t("st.leave.duration")} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">{t("st.leave.duration")}</span>
              <div className="grid grid-cols-3 gap-1 rounded-control bg-primary-soft p-1">
                {HALVES.map(({ id, key }) => (
                  <button key={id} type="button" role="radio" aria-checked={half === id} onClick={() => setHalf(id)}
                    className={`min-h-11 rounded-control px-2 text-sm font-semibold transition-colors ${half === id ? "bg-surface text-link shadow-sm" : "text-muted"}`}>{t(key)}</button>
                ))}
              </div>
            </div>
          )}
          <Textarea label={t("st.leave.reason")} value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} />
          {error && <p role="alert" className="text-danger-ink">{error}</p>}
        </div>
      </SidePanel>
    </div>
  );
}
