"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { TimeState } from "@/lib/time-state";

const Ctx = createContext<TimeState | null>(null);
export const TimeProvider = ({ state, children }: { state: TimeState; children: ReactNode }) => <Ctx.Provider value={state}>{children}</Ctx.Provider>;
export function useTime(): TimeState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useTime outside TimeProvider");
  return s;
}
