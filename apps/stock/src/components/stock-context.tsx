"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { StockState } from "@/lib/stock-state";

const Ctx = createContext<StockState | null>(null);
export const StockProvider = ({ state, children }: { state: StockState; children: ReactNode }) => <Ctx.Provider value={state}>{children}</Ctx.Provider>;
export function useStock(): StockState {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStock outside StockProvider");
  return s;
}
