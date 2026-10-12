import { after, NextResponse } from "next/server";
import { isAdmin, isCronAuthorized } from "@/lib/auth";
import { manualRun, RateLimitedError } from "@/lib/jobs";
import { stepAndChain } from "@/lib/pipeline/runner";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Admin only (session cookie, or CRON_SECRET bearer for scripted triggers). One run per 30 min globally. */
export async function POST(req: Request) {
  if (!(isCronAuthorized(req) || (await isAdmin()))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { run, created } = await manualRun();
    if (created) after(() => stepAndChain(run.id).then(() => undefined));
    return NextResponse.json({ runId: run.id, created }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof RateLimitedError) return NextResponse.json({ error: err.message }, { status: 429 });
    log.error("manual run failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "could not start run" }, { status: 500 });
  }
}
