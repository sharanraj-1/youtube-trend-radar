import { GoogleGenAI, ApiError, type Schema } from "@google/genai";
import type { z } from "zod";
import { env } from "../env";
import { log } from "../log";
import { withRetry } from "../retry";

/** Gemini free tier has low RPM: never more than 3 requests in flight per process. */
const MAX_CONCURRENCY = 3;
let active = 0;
const waiters: (() => void)[] = [];

async function acquire() {
  if (active < MAX_CONCURRENCY) {
    active++;
    return;
  }
  await new Promise<void>((r) => waiters.push(r));
  active++;
}
function release() {
  active--;
  waiters.shift()?.();
}

let client: GoogleGenAI | null = null;
function ai() {
  if (!client) client = new GoogleGenAI({ apiKey: env().GEMINI_API_KEY });
  return client;
}

/** Every configured Flash model is out of free daily quota (or persistently unavailable). */
export class GeminiQuotaExhaustedError extends Error {
  constructor(public models: string[]) {
    super(`Gemini free-tier quota exhausted / unavailable for: ${models.join(", ")}`);
    this.name = "GeminiQuotaExhaustedError";
  }
}

/** Models that hit their per-day free quota in this process; skipped until the process recycles. */
const exhaustedToday = new Set<string>();

export function isDailyQuotaError(err: unknown) {
  return err instanceof ApiError && err.status === 429 && /PerDay/i.test(err.message);
}

export function modelChain(): string[] {
  const primary = env().GEMINI_MODEL;
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

export class GeminiOutputError extends Error {
  constructor(message: string, public raw: string) {
    super(message);
    this.name = "GeminiOutputError";
  }
}

export interface GenerateJsonOptions<T> {
  system: string;
  prompt: string;
  responseSchema: Schema;
  validator: z.ZodType<T>;
  label: string;
  temperature?: number;
  /** Generation of large structured batches can take longer than the 20s default used elsewhere. */
  timeoutMs?: number;
  onCall?: () => void;
}

/**
 * One structured-output call to Gemini Flash. Retries 429/5xx/timeouts with exponential backoff + jitter.
 * Throws GeminiOutputError when the model returns JSON that fails the zod validator (caller decides to repair).
 */
export async function generateJson<T>(opts: GenerateJsonOptions<T>): Promise<{ data: T; model: string }> {
  const chain = modelChain();
  let text: string | null = null;
  let model = chain[0];
  for (const candidate of chain) {
    if (exhaustedToday.has(candidate)) continue;
    model = candidate;
    try {
      text = await callModel(candidate, opts);
      break;
    } catch (err) {
      if (isDailyQuotaError(err)) {
        exhaustedToday.add(candidate);
        log.warn("gemini daily free quota exhausted; trying next Flash model", { model: candidate });
        continue;
      }
      const timedOut = err instanceof Error && /abort|timeout/i.test(`${err.name} ${err.message}`);
      if ((err instanceof ApiError && err.status >= 500) || timedOut) {
        log.warn("gemini model unavailable after retries; trying next Flash model", { model: candidate, error: err instanceof Error ? err.message.slice(0, 120) : String(err) });
        continue;
      }
      throw err;
    }
  }
  if (text === null) throw new GeminiQuotaExhaustedError(chain);
  return parseOutput(text, opts, model);
}

async function callModel<T>(model: string, opts: GenerateJsonOptions<T>): Promise<string> {
  return withRetry(
    async () => {
      await acquire();
      const started = Date.now();
      try {
        opts.onCall?.();
        const res = await ai().models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
          config: {
            systemInstruction: opts.system,
            responseMimeType: "application/json",
            responseSchema: opts.responseSchema,
            temperature: opts.temperature ?? 0.2,
            thinkingConfig: { thinkingBudget: 0 },
            abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
          },
        });
        log.info("gemini call", {
          label: opts.label,
          model,
          ms: Date.now() - started,
          inTokens: res.usageMetadata?.promptTokenCount,
          outTokens: res.usageMetadata?.candidatesTokenCount,
        });
        const t = res.text;
        if (!t) throw new GeminiOutputError(`Empty response (finish: ${res.candidates?.[0]?.finishReason ?? "unknown"})`, "");
        return t;
      } finally {
        release();
      }
    },
    {
      service: `gemini:${opts.label}:${model}`,
      baseDelayMs: 4000,
      maxDelayMs: 45_000,
      attempts: 3,
      shouldRetry: (err) => {
        if (isDailyQuotaError(err)) return false; // retrying only burns more of the day's requests
        if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
        if (err instanceof GeminiOutputError) return false;
        return true; // timeouts / network
      },
    },
  );
}

function parseOutput<T>(text: string, opts: GenerateJsonOptions<T>, model: string): { data: T; model: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new GeminiOutputError("Response was not valid JSON", text.slice(0, 2000));
  }
  const parsed = opts.validator.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .slice(0, 8)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new GeminiOutputError(`Schema validation failed: ${msg}`, text.slice(0, 2000));
  }
  return { data: parsed.data, model };
}
