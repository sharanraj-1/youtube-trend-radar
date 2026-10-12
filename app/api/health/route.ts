import { desc, inArray, sql } from "drizzle-orm";
import { connection, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { envReport } from "@/lib/env";

export async function GET() {
  await connection(); // always evaluate at request time, never at build
  const envs = envReport();
  let dbOk = false;
  let dbError: string | null = null;
  let lastRun: Record<string, unknown> | null = null;
  let latestBrief: Record<string, unknown> | null = null;
  try {
    await db().execute(sql`select 1`);
    dbOk = true;
    const [r] = await db()
      .select({
        id: schema.runs.id,
        kind: schema.runs.kind,
        status: schema.runs.status,
        stage: schema.runs.currentStage,
        startedAt: schema.runs.startedAt,
        finishedAt: schema.runs.finishedAt,
        quotaUsed: schema.runs.quotaUsed,
      })
      .from(schema.runs)
      .where(inArray(schema.runs.kind, ["weekly", "manual"]))
      .orderBy(desc(schema.runs.id))
      .limit(1);
    lastRun = r ?? null;
    const [b] = await db()
      .select({ id: schema.briefs.id, status: schema.briefs.status, createdAt: schema.briefs.createdAt })
      .from(schema.briefs)
      .orderBy(desc(schema.briefs.id))
      .limit(1);
    latestBrief = b ?? null;
  } catch (err) {
    dbError = err instanceof Error ? err.message.replace(/postgres(ql)?:\/\/\S+/g, "[url]") : "db error";
  }
  const ok = dbOk && envs.valid;
  return NextResponse.json(
    { ok, db: { ok: dbOk, error: dbError }, env: { valid: envs.valid, problems: envs.problems, required: envs.required, optional: envs.optional }, lastRun, latestBrief },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
