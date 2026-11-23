"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isNetworkError, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { flushOrdersOutbox, ordersOutbox, type OrdersItem, type OrdersJob } from "@/lib/orders-outbox";
import { useOrders } from "./orders-context";

type Result = { error: { code?: string; message: string } | null; queued: boolean };

interface OutboxState {
  items: OrdersItem[];
  sending: boolean;
  online: boolean;
  flush: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  /** Sends the change now. With no signal it is saved on the phone instead, and `queued` is true. */
  submit: (job: OrdersJob) => Promise<Result>;
}

const Ctx = createContext<OutboxState | null>(null);

/** Keeps changes made without signal and sends them when the phone is back online. */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { userId } = useOrders();
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<OrdersItem[]>([]);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    const list = await ordersOutbox.list(userId);
    if (alive.current) setItems(list);
  }, [userId]);

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if ((await ordersOutbox.list(userId)).every((i) => i.status !== "pending")) return;
    setSending(true);
    const r = await flushOrdersOutbox(createClient(), userId);
    if (alive.current) setSending(false);
    await reload();
    if (r.sent > 0) { toast("success", fill(t("od.ob.sent"), { n: r.sent })); router.refresh(); }
  }, [userId, reload, router, toast, t]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    void reload().then(() => flush());
    const off = ordersOutbox.subscribe(() => void reload());
    const go = () => { sync(); void flush(); };
    const vis = () => { if (document.visibilityState === "visible") go(); };
    addEventListener("online", go); addEventListener("offline", sync);
    document.addEventListener("visibilitychange", vis);
    const timer = setInterval(go, 60_000);
    return () => { off(); removeEventListener("online", go); removeEventListener("offline", sync); document.removeEventListener("visibilitychange", vis); clearInterval(timer); };
  }, [reload, flush]);

  const submit = useCallback(async (job: OrdersJob): Promise<Result> => {
    const save = async (): Promise<Result> => {
      await ordersOutbox.add({ id: crypto.randomUUID(), owner: userId, data: job });
      return { error: null, queued: true };
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) return save();
    const { error } = await createClient().rpc(job.fn as never, job.args as never);
    if (error && isNetworkError(error)) return save();
    return { error, queued: false };
  }, [userId]);

  const value = useMemo<OutboxState>(() => ({ items, sending, online, flush, dismiss: (id) => ordersOutbox.remove(id), submit }), [items, sending, online, flush, submit]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrdersOutbox(): OutboxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrdersOutbox needs OutboxProvider");
  return v;
}
