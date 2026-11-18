"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA registration is best-effort; the app remains fully usable without it.
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}
