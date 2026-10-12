// Runs the pipeline in-process against live APIs (no HTTP self-triggering), printing each stage's stored output.
// Usage:
//   npm run pipeline                      # create a manual run (or resume the active one) and run to DONE
//   npm run pipeline -- --until=ENRICH    # stop after the given stage completes
//   npm run pipeline -- --run=12          # resume a specific run
import "./_env";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../lib/db";
import { createRun, runNextStage } from "../lib/pipeline/runner";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

function summarize(stage: string, payload: unknown): string {
  const p = payload as Record<string, unknown>;
  if (!p) return "(no payload)";
  const shallow: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (Array.isArray(v)) shallow[k] = v.length > 6 ? `[${v.length} items] ${JSON.stringify(v.slice(0, 3)).slice(0, 300)}…` : v;
    else if (v && typeof v === "object") {
      const keys = Object.keys(v);
      shallow[k] = keys.length > 8 ? `{${keys.length} keys}` : v;
    } else shallow[k] = v;
  }
  return `${stage}: ${JSON.stringify(shallow, null, 2).slice(0, 4000)}`;
}

async function main() {
  const until = arg("until")?.toUpperCase();
  let runId = arg("run") ? Number(arg("run")) : undefined;
  if (!runId) {
    const { run, created } = await createRun("manual");
    runId = run.id;
    console.log(`${created ? "Created" : "Resuming active"} run #${runId}`);
  }
  for (let i = 0; i < 80; i++) {
    const o = await runNextStage(runId);
    console.log(`→ ${JSON.stringify(o)}`);
    if (o.outcome === "finished" || o.outcome === "idle" || o.outcome === "busy") break;
    if ((o.outcome === "advanced" || o.outcome === "degraded") && "stage" in o) {
      const [row] = await db()
        .select()
        .from(schema.stageOutputs)
        .where(and(eq(schema.stageOutputs.runId, runId), eq(schema.stageOutputs.stage, o.stage)));
      console.log(summarize(o.stage, row?.payload));
      if (until && o.stage === until) break;
    }
    if (o.outcome === "failed") await new Promise((r) => setTimeout(r, 5000));
  }
  const [run] = await db().select().from(schema.runs).where(eq(schema.runs.id, runId));
  console.log(`\nRun #${run.id}: status=${run.status} stage=${run.currentStage} quota=${run.quotaUsed} gemini=${run.geminiCalls}`);
  if (run.coverageNote) console.log(`Coverage: ${run.coverageNote}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
