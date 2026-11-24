"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { Badge, Button, EmptyState, ErrorState, Reveal, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { shownName } from "@/lib/customers";
import { addDays, daysFrom, type TaskRow } from "@/lib/plan";

/** Reminders: open ones with the oldest first, overdue marked. Tick one to finish it. */
export default function Page() {
  const { t, locale } = useI18n();
  const [rows, setRows] = useState<TaskRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<0 | 1 | 7>(0);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc("sales_task_list");
    if (error) { setFailed(true); return; }
    setFailed(false); setRows((data ?? []) as unknown as TaskRow[]);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const { error } = await createClient().rpc("sales_task_add", { p_id: crypto.randomUUID(), p_title: title.trim(), p_customer_id: null, p_due: addDays(due) });
    setBusy(false);
    if (!error) { setTitle(""); await load(); }
  }
  async function toggle(r: TaskRow) {
    setRows((x) => x && x.map((y) => (y.id === r.id ? { ...y, done_at: y.done_at ? null : new Date().toISOString() } : y)));
    await createClient().rpc("sales_task_done", { p_id: r.id, p_done: !r.done_at });
    void load();
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-2xl font-bold tracking-tight">{t("go.tasks.title")}</h1>
      <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={t("go.tasks.new")} aria-label={t("go.tasks.new")} className="h-11 rounded-control border border-line-strong bg-surface px-3" />
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label={t("go.tasks.due")} className="flex flex-1 gap-1.5">
            {([[0, "go.tasks.today"], [1, "go.log.next.tomorrow"], [7, "go.log.next.week"]] as const).map(([n, k]) => (
              <button key={n} type="button" role="radio" aria-checked={due === n} onClick={() => setDue(n)}
                className={`min-h-10 rounded-full px-3 text-sm ${due === n ? "bg-primary font-semibold text-white" : "border border-line-strong"}`}>{t(k)}</button>
            ))}
          </div>
          <Button variant="primary" loading={busy} disabled={!title.trim()} onClick={add}><Plus className="size-4" aria-hidden />{t("go.tasks.add")}</Button>
        </div>
      </div>
      {failed ? (
        <ErrorState title={t("go.tasks.loadError")} body={t("go.cust.loadErrorBody")} action={<Button onClick={() => void load()}>{t("go.retry")}</Button>} />
      ) : rows === null ? (
        <div role="status" aria-label={t("go.loading")} className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full rounded-card" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState title={t("go.tasks.emptyTitle")} body={t("go.tasks.empty")} />
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((r, i) => {
            const late = !r.done_at && daysFrom(r.due_date) < 0;
            return (
              <li key={r.id}>
                <Reveal delay={Math.min(i, 8) * 30}>
                  <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
                    <button type="button" role="checkbox" aria-checked={!!r.done_at} aria-label={r.title} onClick={() => void toggle(r)}
                      className={`grid size-8 shrink-0 place-items-center rounded-full border-2 ${r.done_at ? "border-success bg-success text-white" : "border-muted"}`}>{r.done_at && <Check className="size-4" aria-hidden />}</button>
                    <span className="min-w-0 flex-1">
                      <b className={`block truncate ${r.done_at ? "text-muted line-through" : ""}`}>{r.title}</b>
                      <span className="block truncate text-xs text-muted">{r.customer_id && r.name ? <Link href={`/customers/${r.customer_id}`}>{shownName({ name: r.name, name_local: r.name_local }, locale)} · </Link> : null}{late ? fill(t("go.tasks.late"), { n: -daysFrom(r.due_date) }) : r.done_at ? t("go.tasks.done") : daysFrom(r.due_date) === 0 ? t("go.tasks.today") : r.due_date}</span>
                    </span>
                    {late && <Badge tone="danger">{t("go.tasks.overdue")}</Badge>}
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
