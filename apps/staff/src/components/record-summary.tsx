"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, Clock } from "lucide-react";
import { Card, Skeleton } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { startOfDay, ymd } from "@/lib/format";
import { useMe } from "./me-context";

interface Day { status: string }
const COUNTED = new Set(["on_time", "late", "early_leave", "absent", "incomplete"]);

/** Two live tiles for the top of Record: this month's attendance and the achievements earned. */
export function RecordSummary() {
  const state = useMe();
  const { t } = useI18n();
  const [pct, setPct] = useState<number | null | undefined>(undefined);
  const [earned, setEarned] = useState<number | null | undefined>(undefined);
  const employeeId = state.employee_id;

  useEffect(() => {
    if (!employeeId) return;
    const supabase = createClient();
    const today = startOfDay(new Date());
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const days = Math.round((today.getTime() - first.getTime()) / 86400000) + 1;
    void supabase.rpc("employee_attendance_days", { p_employee_id: employeeId, p_from: ymd(first), p_days: days }).then(({ data, error }) => {
      if (error || !data) { setPct(null); return; }
      const counted = (data as Day[]).filter((d) => COUNTED.has(d.status));
      setPct(counted.length ? Math.round((counted.filter((d) => d.status === "on_time").length / counted.length) * 100) : null);
    });
    void supabase.rpc("my_achievements").then(({ data, error }) => {
      setEarned(error || !data ? null : (data as { kind: string }[]).filter((r) => r.kind !== "progress").length);
    });
  }, [employeeId]);

  const tile = (href: string, icon: React.ReactNode, label: string, value: number | null | undefined, unit: string, sub: string) => (
    <Link href={href} className="block">
      <Card className="flex h-full flex-col gap-2 p-4 transition-colors hover:bg-ground">
        <span className="flex items-center justify-between text-muted">{icon}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></span>
        <span className="text-sm font-semibold text-muted">{label}</span>
        {value === undefined ? <Skeleton className="h-8 w-16" /> : (
          <b className="text-3xl tracking-tight">{value === null ? "–" : value}{value !== null && <span className="text-lg text-muted">{unit}</span>}</b>
        )}
        <span className="text-xs text-muted">{sub}</span>
      </Card>
    </Link>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {tile("/record/attendance", <Clock className="size-5" aria-hidden />, t("st.record.attendance"), pct, "%", t("st.record.tile.onTime"))}
      {tile("/record/achievements", <Award className="size-5" aria-hidden />, t("st.record.ach"), earned, "", t("st.record.tile.earned"))}
    </div>
  );
}
