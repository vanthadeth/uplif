import { createOutbox, flushOutbox, type FlushResult, type OutboxItem } from "@uplif/ui";
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
export type GoJob = NoteJob | CommentJob;

export const goOutbox = createOutbox<GoJob>("go");
export type GoItem = OutboxItem<GoJob>;

type Failure = { message: string; code?: string } | null;

/** Sends one job to the server now. Returns the server's error, or null when it has the job. */
export async function sendGoJob(supabase: SupabaseClient, job: GoJob): Promise<Failure> {
  if (job.kind === "comment") {
    const { error } = await supabase.rpc("sales_add_comment", { p_customer_id: job.customerId, p_client_op_id: job.opId, p_body: job.body });
    return error;
  }
  const paths: string[] = [];
  for (const p of job.photos) {
    const path = `${job.companyId}/${job.customerId}/${p.key}.jpg`;
    const up = await supabase.storage.from(BUCKET).upload(path, p.blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) return { message: up.error.message };
    paths.push(path);
  }
  const { error } = await supabase.rpc("sales_add_note", { p_customer_id: job.customerId, p_client_op_id: job.opId, p_body: job.body, p_photo_paths: paths, p_occurred_at: job.occurredAt });
  return error;
}

/** Sends the waiting jobs of one employee, oldest first. */
export const flushGoOutbox = (supabase: SupabaseClient, owner: string): Promise<FlushResult> =>
  flushOutbox(goOutbox, owner, (it) => sendGoJob(supabase, it.data));
