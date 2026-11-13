import { createOutbox, type OutboxItem } from "@uplif/ui";
import type { SupabaseClient } from "@supabase/supabase-js";

/** One clock-in or clock-out tapped while the phone had no signal. */
export interface ClockJob {
  kind: "in" | "out";
  eventId: string;
  /** When the person tapped, from the phone's clock (ISO). */
  deviceTime: string;
  day: string;
  lat: number | null;
  lon: number | null;
  acc: number | null;
  selfie: Blob | null;
  deviceId: string;
  companyId: string;
  employeeId: string;
}

export const clockOutbox = createOutbox<ClockJob>("clock");
export type ClockItem = OutboxItem<ClockJob>;

/** True for a failure caused by the connection, not by a rule on the server. Those are retried later. */
export function isNetworkError(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  return !e.code && /fetch|network|load failed|timed? ?out|offline/i.test(e.message ?? "");
}

export type FlushResult = { sent: number; failed: number; stalled: boolean };

let flushing: Promise<FlushResult> | null = null;

/** Send the saved clocks for one person, oldest first. Stops at the first connection problem and tries again later. */
export function flushClockOutbox(supabase: SupabaseClient, employeeId: string): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = (async () => {
    const res: FlushResult = { sent: 0, failed: 0, stalled: false };
    const items = (await clockOutbox.list(employeeId)).filter((i) => i.status === "pending");
    for (const it of items) {
      const j = it.data;
      let path: string | null = null;
      if (j.selfie) {
        path = `${j.companyId}/${j.employeeId}/${j.day}/${j.eventId}.jpg`;
        const up = await supabase.storage.from("attendance-selfies").upload(path, j.selfie, { contentType: "image/jpeg", upsert: false });
        if (up.error && !/exist|duplicate/i.test(up.error.message)) {
          if (isNetworkError(up.error)) { res.stalled = true; break; }
          await clockOutbox.update(it.id, { status: "failed", error: "upload" }); res.failed++; continue;
        }
      }
      const { error } = await supabase.rpc("attendance_clock", {
        p_kind: j.kind, p_client_event_id: j.eventId, p_device_time: j.deviceTime,
        p_latitude: j.lat, p_longitude: j.lon, p_accuracy_m: j.acc, p_selfie_path: path, p_device_id: j.deviceId, p_offline: true,
      });
      if (error) {
        if (isNetworkError(error)) { res.stalled = true; break; }
        await clockOutbox.update(it.id, { status: "failed", error: error.message }); res.failed++;
        continue;
      }
      await clockOutbox.remove(it.id);
      res.sent++;
    }
    return res;
  })().finally(() => { flushing = null; });
  return flushing;
}
