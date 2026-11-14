"use client";
import { useEffect, useState } from "react";
import type { SwitcherData } from "./apps";

const KEY = "uplif.switcher";

/** Forget the remembered switcher data, for example right after switching company. */
export function clearSwitcherCache() {
  try { sessionStorage.removeItem(KEY); } catch {}
}

/**
 * Loads the switcher data once per page view. The last answer is kept for the browser session, so the next page paints
 * the real list at once and the fresh answer replaces it a moment later. Returns null until there is something to show.
 */
export function useSwitcherData(load: () => Promise<SwitcherData>): SwitcherData | null {
  const [data, setData] = useState<SwitcherData | null>(null);
  useEffect(() => {
    let live = true;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setData(JSON.parse(raw) as SwitcherData);
    } catch {}
    load().then((d) => {
      if (!live) return;
      setData(d);
      try { sessionStorage.setItem(KEY, JSON.stringify(d)); } catch {}
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return data;
}
