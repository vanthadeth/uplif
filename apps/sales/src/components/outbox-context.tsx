"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isNetworkError, useToast } from "@uplif/ui";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { fill } from "@/lib/messages";
import { flushGoOutbox, goOutbox, sendGoJob, type GoItem, type GoJob } from "@/lib/go-outbox";
import { useMe } from "./me-context";

type Result = { error: { code?: string; message: string } | null; queued: boolean };

interface OutboxState {
  items: GoItem[];
  sending: boolean;
  online: boolean;
  flush: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  retry: (id: string) => Promise<void>;
  /** Sends the job now. With no signal it is saved on the phone instead, and `queued` is true. */
  submit: (job: GoJob) => Promise<Result>;
  /** Called after waiting jobs reached the server, so screens can reload. */
  onSynced: (fn: () => void) => () => void;
}

const Ctx = createContext<OutboxState | null>(null);

/** Keeps notes and photos made without signal on the phone and sends them when it is back online. */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const me = useMe();
  const owner = me.employee_id ?? "";
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<GoItem[]>([]);
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(true);
  const alive = useRef(true);
  const listeners = useRef(new Set<() => void>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const reload = useCallback(async () => {
    const list = await goOutbox.list(owner);
    if (alive.current) setItems(list);
  }, [owner]);

  const flush = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    if ((await goOutbox.list(owner)).every((i) => i.status !== "pending")) return;
    setSending(true);
    const r = await flushGoOutbox(createClient(), owner);
    if (alive.current) setSending(false);
    await reload();
    if (r.sent > 0) { toast("success", fill(t("go.ob.sent"), { n: r.sent })); listeners.current.forEach((fn) => fn()); }
  }, [owner, reload, toast, t]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    void reload().then(() => flush());
    const off = goOutbox.subscribe(() => void reload());
    const go = () => { sync(); void flush(); };
    const vis = () => { if (document.visibilityState === "visible") go(); };
    addEventListener("online", go); addEventListener("offline", sync);
    document.addEventListener("visibilitychange", vis);
    const timer = setInterval(go, 60_000);
    return () => { off(); removeEventListener("online", go); removeEventListener("offline", sync); document.removeEventListener("visibilitychange", vis); clearInterval(timer); };
  }, [reload, flush]);

  const submit = useCallback(async (job: GoJob): Promise<Result> => {
    const save = async (): Promise<Result> => {
      await goOutbox.add({ id: job.opId, owner, data: job });
      return { error: null, queued: true };
    };
    if (typeof navigator !== "undefined" && !navigator.onLine) return save();
    const error = await sendGoJob(createClient(), job);
    if (error && isNetworkError(error)) return save();
    return { error, queued: false };
  }, [owner]);

  const retry = useCallback(async (id: string) => { await goOutbox.update(id, { status: "pending", error: undefined }); await flush(); }, [flush]);
  const onSynced = useCallback((fn: () => void) => { listeners.current.add(fn); return () => { listeners.current.delete(fn); }; }, []);
  const value = useMemo<OutboxState>(() => ({ items, sending, online, flush, dismiss: (id) => goOutbox.remove(id), retry, submit, onSynced }), [items, sending, online, flush, retry, submit, onSynced]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoOutbox(): OutboxState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGoOutbox needs OutboxProvider");
  return v;
}
