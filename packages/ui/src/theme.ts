"use client";
import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "uplif.theme";

/** The saved choice wins; otherwise the system setting. The same rule runs before paint in layout.tsx. */
function resolve(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {}
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => { setTheme(resolve()); }, []);
  const toggle = useCallback(() => {
    const next: Theme = resolve() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch {}
    setTheme(next);
  }, []);
  return { theme, toggle };
}

/** Inline script text for <head>: applies a saved choice before first paint to avoid a flash. */
export const themeInitScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
