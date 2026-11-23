"use client";
import { useCallback, useEffect, useState } from "react";

/** Auto follows the phone. Light and Dark are saved under the same key the shared theme script reads. */
export type Appearance = "auto" | "light" | "dark";
const KEY = "uplif.theme";

function read(): Appearance {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "auto";
}

export function useAppearance() {
  const [value, setValue] = useState<Appearance>("auto");
  useEffect(() => { setValue(read()); }, []);
  const set = useCallback((next: Appearance) => {
    try {
      if (next === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, next);
    } catch {}
    if (next === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = next;
    setValue(next);
  }, []);
  return { appearance: value, setAppearance: set };
}
