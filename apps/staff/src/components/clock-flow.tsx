"use client";
import { useRouter } from "next/navigation";
import { ClockFlow as SharedClockFlow, type ClockSupabase } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useFormat } from "@/lib/use-format";
import { deviceId } from "@/lib/store";
import { useMe, useDisplay } from "./me-context";
import { useClockOutbox } from "./outbox-context";

/** The clock flow itself is shared (@uplif/ui); this wires it to Me's texts, branch, phone queue and history page. */
export function ClockFlow({ kind, onClose, onSaved }: { kind: "in" | "out"; onClose: () => void; onSaved: () => void }) {
  const state = useMe();
  const { t, locale } = useI18n();
  const { branch: branchName } = useDisplay(state, locale);
  const { time } = useFormat();
  const outbox = useClockOutbox();
  const router = useRouter();
  const b = state.branch;
  return (
    <SharedClockFlow
      kind={kind} onClose={onClose} onSaved={onSaved} t={t}
      supabase={createClient() as unknown as ClockSupabase}
      companyId={state.company_id ?? ""} employeeId={state.employee_id ?? ""} deviceId={deviceId()}
      branch={b ? { name: branchName ?? "", latitude: b.latitude, longitude: b.longitude, radius_m: b.radius_m } : null}
      formatTime={time}
      saveOffline={(job) => outbox.save(job)}
      hasPending={outbox.items.some((i) => i.status === "pending")}
      onHistory={() => router.push("/record/attendance")}
    />
  );
}
