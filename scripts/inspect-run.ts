// Prints a run's stages, errors and the parts of VALIDATE/COLLECT that decide "degraded".
// Usage: npx tsx scripts/inspect-run.ts <runId>
import "./_env";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

async function main() {
  const id = Number(process.argv[2]);
  const [run] = await db().select().from(schema.runs).where(eq(schema.runs.id, id));
  if (!run) throw new Error(`run ${id} not found`);
  console.log({ ...run });
  const outs = await db().select().from(schema.stageOutputs).where(eq(schema.stageOutputs.runId, id)).orderBy(schema.stageOutputs.id);
  for (const o of outs) {
    const p = (o.payload ?? {}) as Record<string, unknown>;
    const brief = Object.fromEntries(
      Object.entries(p).filter(([k]) => ["statsOnly", "staleSnapshotVideos", "quotaExhausted", "enriched", "failed", "skippedReason", "geminiExhausted"].includes(k) || typeof p[k] !== "object"),
    );
    console.log(`${o.stage.padEnd(10)} ${o.status.padEnd(8)} attempts=${o.attempts} ${o.durationMs}ms ${o.error ?? ""}`, brief);
  }
}

main().then(() => process.exit(0), (e) => (console.error(e), process.exit(1)));
