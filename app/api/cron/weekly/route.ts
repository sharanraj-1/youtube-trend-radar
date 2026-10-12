import { after, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { weeklyJob } from "@/lib/jobs";
import { stepAndChain } from "@/lib/pipeline/runner";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Sat 23:30 UTC = Sun 05:00 IST (Vercel cron + GitHub Actions backup; duplicates are no-ops). */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await weeklyJob();
    after(async () => {
      try {
        await stepAndChain(result.runId);
      } catch (err) {
        log.error("weekly kickoff failed", { error: err instanceof Error ? err.message : String(err) });
      }
    });
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (err) {
    log.error("weekly cron failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "weekly trigger failed" }, { status: 500 });
  }
}
