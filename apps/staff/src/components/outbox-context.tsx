"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clockOutbox, flushClockOutbox, type ClockItem } from "@/lib/clock-outbox";
import { useMe } from "./me-context";

interface OutboxState {
  /** Clocks saved on this phone for the signed-in person, oldest first. */
  items: ClockItem[];
  sending: boolean;
  /** Try to send the saved clocks now. */
  flush: () => Promise<void>;
  /** Forget a clock that the server refused. */
  dismiss: (id: string) => Promise<void>;
  save: (job: ClockItem["data"]) => Promise<void>;
}

const Ctx = createContext<OutboxState | null>(null);

/** Keeps clocks tapped without signal and sends them when the phone is back online. */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { employee_id: employeeId } = useMe();
  const router = useRouter();
  const [items, setItems] = useState<ClockItem[]>([]);
  const [sending, setSending] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    if (!employeeId) return;
    const list = await clockOutbox.list(employeeId);
    if (alive.current) setItems(list);
  }, [employeeId]);

  const flush = useCallback(async () => {
    if (!employeeId || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    if ((await clockOutbox.list(employeeId)).every((i) => i.status !== "pending")) return;
    setSending(true);
    const r = await flushClockOutbox(createClient(), employeeId);
    if (alive.current) setSending(false);
    await reload();
    if (r.sent > 0) router.refresh();
  }, [employeeId, reload, router]);

  useEffect(() => {
    void reload().then(() => flush());
    const off = clockOutbox.subscribe(() => void reload());
    const go = () => void flush();
    const vis = () => { if (document.visibilityState === "visible") go(); };
    addEventListener("online", go);
    document.addEventListener("visibilitychange", vis);
    const timer = setInterval(go, 60_000);
    return () => { off(); removeEventListener("online", go); document.removeEventListener("visibilitychange", vis); clearInterval(timer); };
  }, [reload, flush]);

  const value = useMemo<OutboxState>(() => ({
    items, sending, flush,
    dismiss: (id) => clockOutbox.remove(id),
    save: async (job) => { await clockOutbox.add({ id: job.eventId, owner: job.employeeId, data: job }); },
  }), [items, sending, flush]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useClockOutbox(): OutboxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useClockOutbox needs OutboxProvider");
  return v;
}
