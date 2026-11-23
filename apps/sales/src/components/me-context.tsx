"use client";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { SalesState } from "@/lib/my-state";
import { goCache, rememberOwner } from "@/lib/offline";

const Ctx = createContext<SalesState | null>(null);

/** The signed-in salesperson's record and permissions, loaded once in the app layout. */
export function MeProvider({ state, children }: { state: SalesState; children: ReactNode }) {
  // Keep a copy for the offline screens, which cannot ask the server who is signed in.
  useEffect(() => {
    if (!state.employee_id) return;
    rememberOwner(state.employee_id);
    void goCache.set(state.employee_id, "me", state);
  }, [state]);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useMe(): SalesState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe needs MeProvider");
  return v;
}
