"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While a brief is being made and this page is open: nudge the pipeline if it has stalled
 * (POST /api/runs/resume is a safe no-op otherwise) and refresh the server-rendered progress.
 */
export function RunPinger({ everyMs = 20_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        await fetch("/api/runs/resume", { method: "POST", cache: "no-store" });
      } catch {
        // offline or transient: try again next tick
      }
      if (!stopped) router.refresh();
    };
    const id = setInterval(tick, everyMs);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [router, everyMs]);
  return null;
}
