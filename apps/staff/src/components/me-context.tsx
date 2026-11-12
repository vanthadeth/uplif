"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { MyState } from "@/lib/my-state";

const Ctx = createContext<MyState | null>(null);

/** The signed-in employee's record and clock state, loaded once in the app layout. */
export function MeProvider({ state, children }: { state: MyState; children: ReactNode }) {
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useMe(): MyState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMe needs MeProvider");
  return v;
}

/** The name and branch to show, in the chosen language. */
export function useDisplay(state: MyState, locale: string) {
  const local = locale !== "en";
  return {
    name: (local && state.employee_name_local) || state.employee_name || "",
    branch: state.branch ? ((local && state.branch.name_local) || state.branch.name) : null,
  };
}
