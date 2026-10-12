import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { BriefFlow } from "@/components/brief/BriefFlow";
import { RunProgress } from "@/components/RunProgress";
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
    return <ErrorState what="this week's brief" />;
  }
  return (
    <div className="space-y-8">
      {running && <RunProgress stage={running.currentStage} startedAt={running.startedAt} compact={!!brief} />}
      {brief ? (
        <BriefFlow brief={brief.json as BriefJson} briefId={brief.id} createdAt={brief.createdAt.toISOString()} />
      ) : (
        !running && (
          <EmptyState title="Your first brief is on its way">
            <p>
              A new brief is prepared automatically every Sunday morning and is ready by 11:00 AM IST. If you&apos;re the channel owner, you
              can also <Link className="underline" href="/settings">create one now</Link>.
            </p>
          </EmptyState>
        )
      )}
    </div>
  );
}
