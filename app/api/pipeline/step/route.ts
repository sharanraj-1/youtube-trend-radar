import { after, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/auth";
import { stepAndChain } from "@/lib/pipeline/runner";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Pipeline runner. Responds 202 immediately, then executes one stage (or one checkpointed slice) in after()
 * and triggers itself for the next stage. The DB claim makes duplicate invocations harmless.
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let runId: number | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as { runId?: unknown };
    if (typeof body.runId === "number" && Number.isInteger(body.runId)) runId = body.runId;
  } catch {
    // empty body: use the active run
  }
  after(async () => {
    try {
      const outcome = await stepAndChain(runId);
      log.info("step outcome", { ...outcome });
    } catch (err) {
      log.error("pipeline step crashed", { runId, error: err instanceof Error ? err.message : String(err) });
    }
  });
  return NextResponse.json({ accepted: true, runId: runId ?? "active" }, { status: 202 });
}
