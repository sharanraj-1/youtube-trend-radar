// Runs the production enrichment prompt on a stored fixture of 40 real titles and scores it against hand labels.
// Usage: npm run eval   (needs GEMINI_API_KEY; fixture: tests/fixtures/eval-titles.json)
import "./_env";
import { readFileSync } from "node:fs";
import { enrichBatch } from "../lib/gemini/enrich";
import { ENRICH_PROMPT_VERSION } from "../lib/prompts/enrich";

interface Item {
  video_id: string;
  title: string;
  description: string;
  is_short: boolean;
  duration_s: number | null;
  label: { format: string; entities: string[] };
}

const norm = (e: string) => e.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function main() {
  const items: Item[] = JSON.parse(readFileSync("tests/fixtures/eval-titles.json", "utf8"));
  const out = await enrichBatch(items.map((i) => ({ ...i, tags: [] })));
  const byId = new Map(out.results.map((r) => [r.video_id, r]));

  let formatHits = 0;
  let tp = 0;
  let fp = 0;
  let fn = 0;
  const misses: string[] = [];
  const confusion = new Map<string, number>();
  for (const it of items) {
    const r = byId.get(it.video_id);
    if (!r) continue;
    if (r.format === it.label.format) formatHits++;
    else {
      confusion.set(`${it.label.format}→${r.format}`, (confusion.get(`${it.label.format}→${r.format}`) ?? 0) + 1);
      misses.push(`  format  ${it.label.format.padEnd(13)} got ${r.format.padEnd(13)} ${it.title.slice(0, 70)}`);
    }
    const gold = new Set(it.label.entities.map(norm));
    const pred = new Set(r.entities.map(norm));
    for (const p of pred) (gold.has(p) ? tp++ : fp++);
    for (const g of gold) if (!pred.has(g)) fn++;
    const missing = [...gold].filter((g) => !pred.has(g));
    if (missing.length) misses.push(`  entity  missing ${missing.join(", ")}  (got: ${r.entities.join(", ") || "none"})  ${it.title.slice(0, 60)}`);
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);

  console.log(`\nEnrichment eval — ${ENRICH_PROMPT_VERSION}, model ${out.model}, ${items.length} hand-labelled titles`);
  console.log(`Format accuracy:   ${formatHits}/${items.length} = ${((formatHits / items.length) * 100).toFixed(1)}%`);
  console.log(`Entity precision:  ${(precision * 100).toFixed(1)}%   recall: ${(recall * 100).toFixed(1)}%   F1: ${(f1 * 100).toFixed(1)}%`);
  if (out.fallbackIds.length) console.log(`Fallbacks (format=other due to invalid output): ${out.fallbackIds.length}`);
  if (confusion.size) console.log(`Format confusions: ${[...confusion.entries()].map(([k, v]) => `${k} ×${v}`).join(", ")}`);
  if (misses.length) console.log(`\nDetails:\n${misses.join("\n")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
