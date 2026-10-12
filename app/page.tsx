import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BriefView } from "@/components/BriefView";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/States";
import { activeRun, latestBrief } from "@/lib/queries";
import { log } from "@/lib/log";
import type { BriefJson } from "@/lib/render/types";

export default function HomePage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <LatestBrief />
    </Suspense>
  );
}

async function LatestBrief() {
  await connection();
  let brief: Awaited<ReturnType<typeof latestBrief>> | null = null;
  let running: Awaited<ReturnType<typeof activeRun>> | null = null;
  try {
    [brief, running] = await Promise.all([latestBrief(), activeRun()]);
  } catch (err) {
    log.error("home load failed", { error: err instanceof Error ? err.message : String(err) });
    return <ErrorState what="the latest brief" />;
  }
  return (
    <div className="space-y-6">
      {running && (
        <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
          A new brief is being generated (run #{running.id}, stage {running.currentStage}).{" "}
          <Link href="/runs" className="underline">
            Watch progress
          </Link>
        </p>
      )}
      {brief ? (
        <BriefView brief={brief.json as BriefJson} createdAt={brief.createdAt} />
      ) : (
        <EmptyState title="No brief yet">
          The first Sunday brief appears here once a run completes. Runs fire automatically every Sunday at 05:00 IST, or an admin can start
          one from <Link className="underline" href="/settings">Settings</Link>.
        </EmptyState>
      )}
    </div>
  );
}
