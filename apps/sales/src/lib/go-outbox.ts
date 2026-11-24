import { createOutbox, flushOutbox, sendClockJob, type ClockJob, type ClockSupabase, type FlushResult, type OutboxItem } from "@uplif/ui";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET } from "./customers";

/**
 * Work done on the phone without signal. Every job carries the id the server uses to recognise it, and photos
 * upload to a path made from that id, so sending a job twice never stores it twice.
 */
export type NoteJob = {
  kind: "note";
  customerId: string;
  companyId: string;
  opId: string;
  body: string;
  occurredAt: string;
  photos: { key: string; blob: Blob }[];
};
export type CommentJob = { kind: "comment"; customerId: string; opId: string; body: string };
/** A new or edited customer. `args` are the sales_save_customer arguments; `photos` are the new pictures still to upload. */
export type CustomerJob = {
  kind: "customer";
  customerId: string;
  opId: string;
  isNew: boolean;
  name: string;
  args: Record<string, unknown>;
  photos: { path: string; blob: Blob }[];
};
/** A check-in made without signal. `opId` is also the visit id, so sending it twice stores one visit. */
export type CheckInJob = {
  kind: "checkin";
  customerId: string;
  name: string;
  opId: string;
  lat: number | null;
  lon: number | null;
  acc: number | null;
  at: string;
};
export const LOG_REASONS = {
  visit: ["regular", "appointment", "sale_follow_up", "delivery", "collection_follow_up", "resolve_conflict"],
  call: ["customer_care", "sale_follow_up", "delivery_confirm", "collection_notify", "collection_follow_up", "resolve_conflict"],
} as const;
export const LOG_STATUS = { visit: ["met_owner", "met_staff", "nobody", "closed"], call: ["spoke_owner", "spoke_staff", "no_answer"] } as const;
export const LOG_ORDER = ["ordered", "will_order", "no_order"] as const;
export const LOG_COLLECTION = ["fully_paid", "partially_paid", "delay_payment", "not_yet_due", "nothing_to_collect"] as const;
/** The answers after a visit (which also checks out) or a call. `visitId` is set for a visit; `customerId` is empty for a visit with no customer. */
export type LogJob = {
  kind: "log";
  type: "visit" | "call";
  customerId: string;
  companyId: string;
  visitId: string | null;
  opId: string;
  reason: string;
  status: string;
  order: string;
  collection: string;
  next: string | null;
  body: string;
  at: string;
  lat: number | null;
  lon: number | null;
  seconds: number;
  photos: { key: string; blob: Blob }[];
};
/** A clock-in or clock-out made without signal, with its selfie. Sent as UPLIF Me sends it. */
export type ClockOutJob = { kind: "clock"; opId: string; job: ClockJob };
export type GoJob = NoteJob | CommentJob | CustomerJob | CheckInJob | LogJob | ClockOutJob;

export const goOutbox = createOutbox<GoJob>("go");
export type GoItem = OutboxItem<GoJob>;

type Failure = { message: string; code?: string } | null;

/** Sends one job to the server now. Returns the server's error, or null when it has the job. */
export async function sendGoJob(supabase: SupabaseClient, job: GoJob): Promise<Failure> {
  if (job.kind === "comment") {
    const { error } = await supabase.rpc("sales_add_comment", { p_customer_id: job.customerId, p_client_op_id: job.opId, p_body: job.body });
    return error;
  }
  if (job.kind === "customer") {
    for (const p of job.photos) {
      const up = await supabase.storage.from(BUCKET).upload(p.path, p.blob, { contentType: "image/jpeg", upsert: true });
      if (up.error) return { message: up.error.message };
    }
    const { error } = await supabase.rpc("sales_save_customer", job.args as never);
    return error;
  }
  if (job.kind === "clock") {
    const res = await sendClockJob(supabase as unknown as ClockSupabase, job.job, true);
    return res.error;
  }
  if (job.kind === "checkin") {
    const { error } = await supabase.rpc("sales_check_in", { p_id: job.opId, p_customer_id: job.customerId || null, p_latitude: job.lat, p_longitude: job.lon, p_accuracy_m: job.acc, p_at: job.at });
    return error;
  }
  const paths: string[] = [];
  for (const p of job.photos) {
    const path = `${job.companyId}/${job.customerId}/${p.key}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, p.blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) return { message: up.error.message };
    paths.push(path);
  }
  if (job.kind === "log") {
    const { error } = job.type === "visit"
      ? await supabase.rpc("sales_log_visit", { p_visit_id: job.visitId ?? "", p_client_op_id: job.opId, p_reason: job.reason, p_status: job.status, p_order: job.order, p_collection: job.collection, p_next: job.next, p_notes: job.body, p_photo_paths: paths, p_latitude: job.lat, p_longitude: job.lon, p_at: job.at })
      : await supabase.rpc("sales_log_call", { p_customer_id: job.customerId, p_client_op_id: job.opId, p_reason: job.reason, p_status: job.status, p_order: job.order, p_collection: job.collection, p_next: job.next, p_notes: job.body, p_photo_paths: paths, p_started_at: job.at, p_duration_s: job.seconds });
    return error;
  }
  const { error } = await supabase.rpc("sales_add_note", { p_customer_id: job.customerId, p_client_op_id: job.opId, p_body: job.body, p_photo_paths: paths, p_occurred_at: job.occurredAt });
  return error;
}

/** Sends the waiting jobs of one employee, oldest first. */
export const flushGoOutbox = (supabase: SupabaseClient, owner: string): Promise<FlushResult> =>
  flushOutbox(goOutbox, owner, (it) => sendGoJob(supabase, it.data));
