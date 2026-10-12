import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { watchdogJob } from "@/lib/jobs";
import { log } from "@/lib/log";

export const maxDuration = 60;

/** Sunday 04:00 UTC = 09:30 IST (fires within the hour on Hobby, so always before the 11:00 IST deadline). */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await watchdogJob());
  } catch (err) {
    log.error("watchdog failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "watchdog failed" }, { status: 500 });
  }
}
