import { after, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { findStalledRun, snapshotJob } from "@/lib/jobs";
import { stepAndChain } from "@/lib/pipeline/runner";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily 21:30 UTC = 03:00 IST: refresh stats for recent videos, apply retention, resume any stalled run. */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await snapshotJob();
    const stalled = await findStalledRun();
    if (stalled) after(() => stepAndChain(stalled.id).then(() => undefined));
    return NextResponse.json({ ...result, resumedRun: stalled?.id ?? null });
  } catch (err) {
    log.error("snapshot cron failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}
