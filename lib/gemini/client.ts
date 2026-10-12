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
  const model = env().GEMINI_MODEL;
  const text = await withRetry(
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
      service: `gemini:${opts.label}`,
      attempts: 4,
      baseDelayMs: 4000,
      maxDelayMs: 45_000,
      shouldRetry: (err) => {
        if (err instanceof ApiError) return err.status === 429 || err.status >= 500;
        if (err instanceof GeminiOutputError) return false;
        return true; // timeouts / network
      },
    },
  );

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
