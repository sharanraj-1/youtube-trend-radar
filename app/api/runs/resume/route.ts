import { after, NextResponse } from "next/server";
import { resumeIfStalled, stepAndChain } from "@/lib/pipeline/runner";
import { log } from "@/lib/log";

export const maxDuration = 300;

/**
 * Public, idempotent "keep it moving" endpoint. Vercel's loop protection (HTTP 508) cuts long self-invocation
 * chains, so open browser tabs and the GitHub Actions pump call this to continue a stalled run. It can only
 * continue an existing active run that has been idle for a while; it never starts a run or spends quota itself.
 */
export async function POST() {
  try {
    const r = await resumeIfStalled();
    if (r.resumed && r.runId) {
      log.info("resuming stalled run", { runId: r.runId, stage: r.stage, reason: r.reason });
      after(() => stepAndChain(r.runId).then(() => undefined));
    }
    return NextResponse.json(r, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    log.error("resume failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ resumed: false, reason: "error" }, { status: 500 });
  }
}
