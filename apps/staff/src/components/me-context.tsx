"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { MyState, MyProfile } from "@/lib/my-state";

const Ctx = createContext<MyState | null>(null);
const ProfileCtx = createContext<MyProfile | null>(null);

/** The signed-in employee's record and clock state, loaded once in the app layout. */
export function MeProvider({ state, profile, children }: { state: MyState; profile: MyProfile | null; children: ReactNode }) {
  return <Ctx.Provider value={state}><ProfileCtx.Provider value={profile}>{children}</ProfileCtx.Provider></Ctx.Provider>;
}

/** Company, position, department and manager. Null when they could not be loaded; show the rest of the app anyway. */
export function useProfile(): MyProfile | null {
  return useContext(ProfileCtx);
}

type Named = { name: string; name_local: string | null } | null | undefined;
/** A name in the chosen language, falling back to English. */
export function localName(n: Named, locale: string): string | null {
  if (!n) return null;
  return (locale !== "en" && n.name_local) || n.name;
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
