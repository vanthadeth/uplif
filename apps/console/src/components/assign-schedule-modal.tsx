"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { pick } from "@/lib/format";
import type { MessageKey } from "@/lib/messages";
import type { AssignScope } from "@/lib/working-time";

export interface Named { id: string; name: string; name_local: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  schedules: Named[];
  branches: Named[];
  departments: Named[];
  employees: Named[];
  today: string;
  /** Preselected level and target, for example from an employee's page. */
  scope?: AssignScope;
  targetId?: string;
  /** When true the level and target cannot be changed. */
  fixedTarget?: boolean;
}

const levels: AssignScope[] = ["company", "branch", "department", "employee"];

/** Says who uses a schedule from a date. A blank schedule on a branch, department or employee means "inherit". */
export function AssignScheduleModal({ open, onClose, schedules, branches, departments, employees, today, scope: scope0 = "company", targetId: target0 = "", fixedTarget }: Props) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [scope, setScope] = useState<AssignScope>(scope0);
  const [target, setTarget] = useState(target0);
  const [schedule, setSchedule] = useState("");
  const [from, setFrom] = useState(today);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScope(scope0);
    setTarget(target0);
    setSchedule(schedules[0]?.id ?? "");
    setFrom(today);
  }, [open, scope0, target0, today, schedules]);

  const targets = scope === "branch" ? branches : scope === "department" ? departments : scope === "employee" ? employees : [];
  const needsTarget = scope !== "company";
  const ok = (!needsTarget || !!target) && (scope !== "company" || !!schedule) && !!from;

  async function save() {
    setBusy(true);
    const { error } = await createClient().rpc("assign_work_schedule", {
      p_scope: scope, p_target_id: needsTarget ? target : null, p_schedule_id: schedule || null, p_effective_from: from,
    });
    setBusy(false);
    if (error) {
      const m = error.message ?? "";
      const key: MessageKey = error.code === "42501" ? "common.forbidden" : m.includes("in the past") ? "wt.a.errPast" : m.includes("already starts") ? "wt.a.errSame" : "common.saveError";
      return toast("error", t(key));
    }
    toast("success", t("wt.a.saved"));
    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} closeLabel={t("common.close")} title={t("wt.a.add")}
      footer={<><Button onClick={onClose}>{t("common.cancel")}</Button><Button variant="primary" loading={busy} disabled={!ok} onClick={save}>{t("wt.a.save")}</Button></>}>
      <div className="flex flex-col gap-4">
        <Select label={t("wt.col.level")} value={scope} disabled={fixedTarget} onChange={(e) => { setScope(e.target.value as AssignScope); setTarget(""); }}>
          {levels.map((l) => <option key={l} value={l}>{t(`wt.level.${l}` as MessageKey)}</option>)}
        </Select>
        {needsTarget && (
          <Select label={t("wt.a.target")} value={target} disabled={fixedTarget} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t("wt.a.pick")}</option>
            {targets.map((x) => <option key={x.id} value={x.id}>{pick(locale, x.name, x.name_local)}</option>)}
          </Select>
        )}
        <Select label={t("wt.col.schedule")} value={schedule} onChange={(e) => setSchedule(e.target.value)} hint={needsTarget ? t("wt.a.inheritHint") : undefined}>
          {needsTarget && <option value="">{t("wt.a.inherit")}</option>}
          {schedules.map((x) => <option key={x.id} value={x.id}>{pick(locale, x.name, x.name_local)}</option>)}
        </Select>
        <Input label={t("wt.a.from")} type="date" min={today} value={from} onChange={(e) => setFrom(e.target.value)} hint={t("wt.a.fromHint")} />
      </div>
    </Modal>
  );
}
