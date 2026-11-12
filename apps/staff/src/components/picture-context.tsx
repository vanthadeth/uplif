"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { resizeImage, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";

interface Picture { src: string | undefined; busy: boolean; change: (file: File) => Promise<void>; remove: () => Promise<void> }
const Ctx = createContext<Picture>({ src: undefined, busy: false, change: async () => {}, remove: async () => {} });

const BUCKET = "profile-pictures";

/** The signed-in person's profile picture: loaded once, shown in the top bar and Profile, and changed from Profile. */
export function PictureProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const toast = useToast();
  const [path, setPath] = useState<string | null>(null);
  const [src, setSrc] = useState<string>();
  const [busy, setBusy] = useState(false);

  const sign = useCallback(async (p: string | null) => {
    setPath(p);
    if (!p) { setSrc(undefined); return; }
    const { data } = await createClient().storage.from(BUCKET).createSignedUrl(p, 3600);
    setSrc(data?.signedUrl);
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      const { data } = await sb.from("profiles").select("picture_path").eq("user_id", u.user.id).maybeSingle();
      if (live) await sign(data?.picture_path ?? null);
    })();
    return () => { live = false; };
  }, [sign]);

  const change = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const sb = createClient();
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error("no user");
      const blob = await resizeImage(file);
      const next = `${u.user.id}/avatar-${Date.now()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(next, blob, { contentType: "image/jpeg" });
      if (up.error) throw up.error;
      const upd = await sb.from("profiles").update({ picture_path: next }).eq("user_id", u.user.id);
      if (upd.error) throw upd.error;
      if (path) void sb.storage.from(BUCKET).remove([path]);
      await sign(next);
      toast("success", t("st.photo.saved"));
    } catch {
      toast("error", t("st.photo.error"));
    } finally {
      setBusy(false);
    }
  }, [path, sign, t, toast]);

  const remove = useCallback(async () => {
    if (!path) return;
    setBusy(true);
    const sb = createClient();
    const { data: u } = await sb.auth.getUser();
    const upd = u.user ? await sb.from("profiles").update({ picture_path: null }).eq("user_id", u.user.id) : { error: new Error("no user") };
    if (upd.error) { toast("error", t("st.photo.error")); setBusy(false); return; }
    void sb.storage.from(BUCKET).remove([path]);
    await sign(null);
    toast("success", t("st.photo.removed"));
    setBusy(false);
  }, [path, sign, t, toast]);

  const value = useMemo(() => ({ src, busy, change, remove }), [src, busy, change, remove]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePicture = () => useContext(Ctx);
