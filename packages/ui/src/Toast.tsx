"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
interface ToastItem { id: number; tone: ToastTone; text: string }
const Ctx = createContext<(tone: ToastTone, text: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

const icon = { success: CheckCircle2, error: AlertCircle, info: Info };
const color = { success: "text-success-ink", error: "text-danger-ink", info: "text-link" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((tone: ToastTone, text: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 6000);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2">
        {items.map((t) => {
          const Icon = icon[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto flex max-w-sm items-start gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-pop animate-[uplif-in_0.15s_ease-out]">
              <Icon className={cn("mt-0.5 size-5 shrink-0", color[t.tone])} aria-hidden="true" />
              <span>{t.text}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
