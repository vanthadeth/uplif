"use client";

import { useEffect } from "react";

// Registers the service worker in production only, so dev hot reload is never intercepted.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    // With a signal, have the worker keep the offline shell and its files up to date.
    if (navigator.onLine) navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: "refresh-shell" })).catch(() => {});
  }, []);
  return null;
}
