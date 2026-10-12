// Prints the latest brief to the terminal. Usage: npm run brief
import "./_env";
import { desc } from "drizzle-orm";
import { db, schema } from "../lib/db";
import type { BriefJson } from "../lib/render/types";
(async () => {
  const [b] = await db().select().from(schema.briefs).orderBy(desc(schema.briefs.id)).limit(1);
  const j = b.json as BriefJson;
  console.log(`Brief #${b.id} status=${b.status} run=${j.run_id}\nSUMMARY: ${j.week_summary}\n${j.lifecycle_note ?? ""}`);
  for (const c of j.clusters) {
    console.log(`\n[${c.lifecycle}] ${c.theme_name}  (${c.mode}${c.stats_only_reason ? ": " + c.stats_only_reason : ""}, confidence ${c.confidence ?? "-"})`);
    console.log(`  creators=${c.stats.creators} videos=${c.stats.videos} outlier=${c.stats.median_outlier} format=${c.stats.winning_format} len=${c.stats.typical_length_s}s shorts=${c.stats.shorts_share}`);
    if (c.why_now) console.log(`  WHY NOW: ${c.why_now}`);
    for (const a of c.angles ?? []) console.log(`  - ${a}`);
    for (const q of c.questions.slice(0, 3)) console.log(`  ? ${q.text.slice(0, 110)}`);
    for (const e of c.evidence) console.log(`  > ${e.channel}: ${e.title.slice(0, 70)} (${e.views})`);
  }
  console.log(`\nSKIP: ${j.skip.map((s) => s.label).join(", ") || "none"}`);
  console.log(`FOOTER: ${JSON.stringify(j.footer)}`);
})();
