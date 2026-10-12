import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";

export async function latestBrief() {
  const [b] = await db()
    .select()
    .from(schema.briefs)
    .where(inArray(schema.briefs.status, ["complete", "degraded", "fallback"]))
    .orderBy(desc(schema.briefs.createdAt))
    .limit(1);
  return b ?? null;
}

export async function briefById(id: number) {
  const [b] = await db().select().from(schema.briefs).where(eq(schema.briefs.id, id)).limit(1);
  return b ?? null;
}

export async function listBriefs(limit = 50) {
  return db()
    .select({ id: schema.briefs.id, status: schema.briefs.status, createdAt: schema.briefs.createdAt, runId: schema.briefs.runId, json: schema.briefs.json })
    .from(schema.briefs)
    .orderBy(desc(schema.briefs.createdAt))
    .limit(limit);
}

export async function listRuns(limit = 30) {
  const runs = await db().select().from(schema.runs).orderBy(desc(schema.runs.id)).limit(limit);
  const ids = runs.map((r) => r.id);
  const stages = ids.length
    ? await db()
        .select({
          runId: schema.stageOutputs.runId,
          stage: schema.stageOutputs.stage,
          status: schema.stageOutputs.status,
          attempts: schema.stageOutputs.attempts,
          invocations: schema.stageOutputs.invocations,
          durationMs: schema.stageOutputs.durationMs,
          error: schema.stageOutputs.error,
        })
        .from(schema.stageOutputs)
        .where(inArray(schema.stageOutputs.runId, ids))
    : [];
  return runs.map((r) => ({ ...r, stages: stages.filter((s) => s.runId === r.id) }));
}

export async function activeRun() {
  const [r] = await db()
    .select()
    .from(schema.runs)
    .where(and(inArray(schema.runs.status, ["pending", "running"]), inArray(schema.runs.kind, ["weekly", "manual"])))
    .orderBy(desc(schema.runs.id))
    .limit(1);
  return r ?? null;
}
