"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { SalesState } from "@/lib/my-state";

const Ctx = createContext<SalesState | null>(null);

/** The signed-in salesperson's record and permissions, loaded once in the app layout. */
export function MeProvider({ state, children }: { state: SalesState; children: ReactNode }) {
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useMe(): SalesState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe needs MeProvider");
  return v;
}
