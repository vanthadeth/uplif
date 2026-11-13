"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

interface Inbox { unread: number; refresh: () => void }
const Ctx = createContext<Inbox>({ unread: 0, refresh: () => {} });

/** The number of unread notifications for the bell. A failure shows no badge; the app keeps working. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(() => {
    void createClient().rpc("my_unread_notifications").then(({ data, error }) => { if (!error && typeof data === "number") setUnread(data); });
  }, []);
  useEffect(() => {
    refresh();
    const vis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", vis);
    addEventListener("online", refresh);
    const timer = setInterval(refresh, 120_000);
    return () => { document.removeEventListener("visibilitychange", vis); removeEventListener("online", refresh); clearInterval(timer); };
  }, [refresh]);
  const value = useMemo(() => ({ unread, refresh }), [unread, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNotifications = () => useContext(Ctx);
