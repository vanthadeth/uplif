"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isNetworkError, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { flushStockOutbox, stockOutbox, type StockItem, type StockJob } from "@/lib/stock-outbox";
import { useStock } from "./stock-context";

type Result = { error: { code?: string; message: string } | null; queued: boolean };

interface OutboxState {
  items: StockItem[];
  sending: boolean;
  online: boolean;
  flush: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  /** Sends the change now. With no signal it is saved on the phone instead, and `queued` is true. */
  submit: (job: StockJob) => Promise<Result>;
}

const Ctx = createContext<OutboxState | null>(null);

/** Keeps stock changes made without signal and sends them when the phone is back online. */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { userId } = useStock();
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [items, setItems] = useState<StockItem[]>([]);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    const list = await stockOutbox.list(userId);
    if (alive.current) setItems(list);
  }, [userId]);

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if ((await stockOutbox.list(userId)).every((i) => i.status !== "pending")) return;
    setSending(true);
    const r = await flushStockOutbox(createClient(), userId);
    if (alive.current) setSending(false);
    await reload();
    if (r.sent > 0) { toast("success", fill(t("sk.ob.sent"), { n: r.sent })); router.refresh(); }
  }, [userId, reload, router, toast, t]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    void reload().then(() => flush());
    const off = stockOutbox.subscribe(() => void reload());
    const go = () => { sync(); void flush(); };
    const vis = () => { if (document.visibilityState === "visible") go(); };
    addEventListener("online", go); addEventListener("offline", sync);
    document.addEventListener("visibilitychange", vis);
    const timer = setInterval(go, 60_000);
    return () => { off(); removeEventListener("online", go); removeEventListener("offline", sync); document.removeEventListener("visibilitychange", vis); clearInterval(timer); };
  }, [reload, flush]);

  const submit = useCallback(async (job: StockJob): Promise<Result> => {
    const save = async (): Promise<Result> => {
      await stockOutbox.add({ id: crypto.randomUUID(), owner: userId, data: job });
      return { error: null, queued: true };
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) return save();
    const { error } = await createClient().rpc(job.fn, job.args as never);
    if (error && isNetworkError(error)) return save();
    return { error, queued: false };
  }, [userId]);

  const value = useMemo<OutboxState>(() => ({ items, sending, online, flush, dismiss: (id) => stockOutbox.remove(id), submit }), [items, sending, online, flush, submit]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStockOutbox(): OutboxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStockOutbox needs OutboxProvider");
  return v;
}
