import { createKvCache } from "@uplif/ui";
import { store } from "./store";

/** What the phone last saw from the server, kept per employee so it can be shown without signal. Read only. */
export const goCache = createKvCache("go");

const OWNER = "uplif.go.owner";
/** The employee whose copy the offline screens show. Set when the app loads online, cleared at sign-in and sign-out. */
export const rememberOwner = (employeeId: string) => store.set(OWNER, employeeId);
export const lastOwner = () => store.get(OWNER);

/** Forgets every saved copy on this phone. Used at sign-out so the next person never sees it. */
export async function forgetSavedCopies() {
  try { localStorage.removeItem(OWNER); } catch {}
  await goCache.clear();
}

/** "10:42" for today, "9 Nov" for earlier days. */
export function savedAtLabel(savedAt: number, tag: string): string {
  const d = new Date(savedAt);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    : d.toLocaleDateString(tag, { day: "numeric", month: "short" });
}
