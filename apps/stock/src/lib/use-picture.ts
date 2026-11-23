"use client";
import { useRef, useState } from "react";
import { resizeImage } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";

export const IMAGE_BUCKET = "stock-images";

/**
 * The picture of one record in an edit form: shrinks and uploads a chosen photo, keeps the preview, and cleans up.
 * A picture uploaded in the form but never saved is deleted again on cancel, replace or remove.
 * `kind` is the folder under the company (brands, categories, items, ...).
 */
export function usePicture(companyId: string, kind: string) {
  const [path, setPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fresh = useRef<string | null>(null);

  function reset(p: string | null, url: string | null) {
    setPath(p); setPreview(url); setFailed(false); fresh.current = null;
  }
  async function discard() {
    const p = fresh.current;
    fresh.current = null;
    if (p) await createClient().storage.from(IMAGE_BUCKET).remove([p]);
  }
  async function pick(file: File) {
    setUploading(true); setFailed(false);
    try {
      const blob = await resizeImage(file, 512, 0.85);
      const next = `${companyId}/${kind}/${crypto.randomUUID()}.jpg`;
      const up = await createClient().storage.from(IMAGE_BUCKET).upload(next, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      await discard();
      fresh.current = next;
      setPath(next);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setFailed(true);
    } finally {
      setUploading(false);
    }
  }
  function remove() { void discard(); setPath(null); setPreview(null); }
  /** Call after the record is saved: the uploaded picture is now in use. */
  function keep() { fresh.current = null; }
  return { path, preview, failed, uploading, reset, pick, remove, discard, keep };
}

/** Deletes a picture that is no longer used by any record. Failures are ignored; it is only housekeeping. */
export async function removePicture(path: string | null | undefined) {
  if (path) await createClient().storage.from(IMAGE_BUCKET).remove([path]);
}
