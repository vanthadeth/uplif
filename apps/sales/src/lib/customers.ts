"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const photoTypes = ["storefront", "display_shelf", "damage_proof", "competitor_product", "other"] as const;
export type PhotoType = (typeof photoTypes)[number];

export interface CustomerRow {
  id: string; name: string; name_local: string | null; address: string | null; archived_at: string | null;
  contact_name: string | null; contact_phone: string | null; photo_path: string | null;
}
export interface ContactRow { id: string; name: string; phone: string | null; is_default: boolean }
export interface PhotoRow { id: string; path: string; type: PhotoType; note: string | null; is_default: boolean }
export interface CustomerDetail {
  id: string; name: string; name_local: string | null; address: string | null; latitude: number | null; longitude: number | null;
  notes: string | null; credit_limit_cents: number | null; archived_at: string | null; owner_employee_id: string | null; created_at: string;
  contacts: ContactRow[]; photos: PhotoRow[];
}

export const BUCKET = "sales-attachments";

/** A name in the chosen language, falling back to English. */
export const shownName = (c: { name: string; name_local: string | null }, locale: string) => (locale !== "en" && c.name_local) || c.name;

/** Signed links for private photos, cached for the life of the page. The links last an hour. */
const cache = new Map<string, string>();
export function useSignedUrls(paths: (string | null | undefined)[]): Record<string, string> {
  const key = paths.filter(Boolean).join("|");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const want = key ? key.split("|") : [];
    const known: Record<string, string> = {};
    const missing: string[] = [];
    for (const p of want) { const u = cache.get(p); if (u) known[p] = u; else missing.push(p); }
    setUrls(known);
    if (missing.length === 0) return;
    let live = true;
    createClient().storage.from(BUCKET).createSignedUrls(missing, 3600).then(({ data }) => {
      if (!live || !data) return;
      const next = { ...known };
      for (const r of data) if (r.path && r.signedUrl) { cache.set(r.path, r.signedUrl); next[r.path] = r.signedUrl; }
      setUrls(next);
    });
    return () => { live = false; };
  }, [key]);
  return urls;
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
