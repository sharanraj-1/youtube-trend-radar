// Copies every row from one Postgres database to another (same schema), preserving IDs, then resets sequences
// and verifies row counts. Used to move the app's data between Neon projects.
// Usage: SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... npx tsx scripts/copy-db.ts [--truncate]
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "../lib/db/schema";

const src = drizzle(neon(process.env.SOURCE_DATABASE_URL!), { schema });
const dst = drizzle(neon(process.env.TARGET_DATABASE_URL!), { schema });
const truncate = process.argv.includes("--truncate");

// Parents before children (foreign keys).
const TABLES: [string, PgTable, number][] = [
  ["settings", schema.settings, 100],
  ["channels", schema.channels, 300],
  ["videos", schema.videos, 200],
  ["video_snapshots", schema.videoSnapshots, 500],
  ["enrichments", schema.enrichments, 300],
  ["runs", schema.runs, 100],
  ["stage_outputs", schema.stageOutputs, 1], // large JSON payloads: one row per request
  ["clusters", schema.clusters, 50],
  ["briefs", schema.briefs, 1],
  ["feedback", schema.feedback, 500],
];
const SERIALS = ["video_snapshots", "runs", "stage_outputs", "clusters", "briefs", "feedback"];

const count = async (db: typeof src, table: string) =>
  Number(((await db.execute(sql.raw(`select count(*)::int n from "${table}"`))).rows[0] as { n: number }).n);

async function main() {
  if (!process.env.SOURCE_DATABASE_URL || !process.env.TARGET_DATABASE_URL) throw new Error("Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL");
  if (process.env.SOURCE_DATABASE_URL === process.env.TARGET_DATABASE_URL) throw new Error("Source and target are the same database");

  for (const [name] of TABLES) {
    const n = await count(dst, name);
    if (n > 0 && !truncate) throw new Error(`Target table ${name} already has ${n} rows (use --truncate to replace)`);
  }
  if (truncate) await dst.execute(sql.raw(`truncate ${TABLES.map(([n]) => `"${n}"`).join(", ")} restart identity cascade`));

  for (const [name, table, batch] of TABLES) {
    const rows = await src.select().from(table);
    for (let i = 0; i < rows.length; i += batch) await dst.insert(table).values(rows.slice(i, i + batch));
    console.log(`${name.padEnd(16)} copied ${rows.length}`);
  }
  for (const t of SERIALS) {
    const q: SQL = sql.raw(`select setval(pg_get_serial_sequence('"${t}"', 'id'), coalesce((select max(id) from "${t}"), 0) + 1, false)`);
    await dst.execute(q);
  }

  let ok = true;
  for (const [name] of TABLES) {
    const [a, b] = [await count(src, name), await count(dst, name)];
    if (a !== b) ok = false;
    console.log(`verify ${name.padEnd(16)} source=${a} target=${b} ${a === b ? "OK" : "MISMATCH"}`);
  }
  if (!ok) throw new Error("Row counts differ");
  console.log("All tables copied and verified.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
