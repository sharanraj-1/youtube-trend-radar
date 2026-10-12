import { generateJson, GeminiOutputError } from "./client";
import {
  buildEnrichPrompt,
  ENRICH_RESPONSE_SCHEMA,
  ENRICH_SYSTEM,
  EnrichResponse,
  type EnrichInput,
  type EnrichResult,
} from "../prompts/enrich";
import { log } from "../log";

export interface EnrichOutcome {
  results: EnrichResult[];
  model: string;
  /** IDs that fell back to format "other" after two invalid responses (or were missing from the output). */
  fallbackIds: string[];
}

export function fallbackEnrichment(v: EnrichInput): EnrichResult {
  const slug = v.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("-");
  return {
    video_id: v.video_id,
    format: "other",
    entities: [],
    topic_key: slug || `video-${v.video_id.toLowerCase()}`,
    topic_summary: v.title.slice(0, 200),
  };
}

/**
 * Classify one batch (~40 videos) with Gemini Flash. Invalid output -> one repair retry with the
 * validation error; second failure -> those videos get format "other" so the pipeline continues.
 */
export async function enrichBatch(items: EnrichInput[], onCall?: () => void): Promise<EnrichOutcome> {
  const ids = new Set(items.map((i) => i.video_id));
  let repair: string | undefined;
  let model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, model: m } = await generateJson({
        label: "enrich",
        system: ENRICH_SYSTEM,
        prompt: buildEnrichPrompt(items, repair),
        responseSchema: ENRICH_RESPONSE_SCHEMA,
        validator: EnrichResponse,
        temperature: 0.1,
        onCall,
      });
      model = m;
      const byId = new Map<string, EnrichResult>();
      for (const r of data.results) if (ids.has(r.video_id) && !byId.has(r.video_id)) byId.set(r.video_id, r);
      const missing = items.filter((i) => !byId.has(i.video_id));
      if (missing.length > items.length / 2 && attempt === 0) {
        repair = `you returned ${byId.size} results for ${items.length} videos; return one per video_id`;
        continue;
      }
      // Shorts are a format in their own right.
      const results = items.map((i) => {
        const r = byId.get(i.video_id) ?? fallbackEnrichment(i);
        return i.is_short && r.format !== "short" ? { ...r, format: "short" as const } : r;
      });
      return { results, model, fallbackIds: missing.map((m) => m.video_id) };
    } catch (err) {
      if (err instanceof GeminiOutputError && attempt === 0) {
        repair = err.message;
        log.warn("enrich output invalid; retrying once with error", { error: err.message });
        continue;
      }
      if (err instanceof GeminiOutputError) break;
      throw err; // transport / 429 after retries: let the stage retry
    }
  }
  log.warn("enrich batch fell back to format=other", { size: items.length });
  return { results: items.map(fallbackEnrichment), model, fallbackIds: items.map((i) => i.video_id) };
}
