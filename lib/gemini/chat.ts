import { ApiError } from "@google/genai";
import { geminiSdk, isDailyQuotaError, markModelExhausted, usableModels } from "./client";
import { log } from "../log";

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export class ChatUnavailableError extends Error {
  constructor(message = "All Gemini Flash models are busy or out of free quota right now") {
    super(message);
    this.name = "ChatUnavailableError";
  }
}

/**
 * Streams a Gemini Flash reply. Falls back across Flash models (daily quota / overload) as long as nothing
 * has been streamed yet; once text has started we finish (or stop) on that model.
 */
export async function* streamChat(p: { system: string; context: string; history: ChatTurn[] }): AsyncGenerator<string> {
  const contents = [
    { role: "user" as const, parts: [{ text: p.context }] },
    { role: "model" as const, parts: [{ text: "Got it. I have this week's brief and your picks. What would you like to work on?" }] },
    ...p.history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
  ];
  const models = usableModels();
  for (const model of models) {
    let started = false;
    try {
      const stream = await geminiSdk().models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: p.system,
          temperature: 0.8,
          maxOutputTokens: 1200,
          thinkingConfig: { thinkingBudget: 0 },
          abortSignal: AbortSignal.timeout(60_000),
        },
      });
      for await (const chunk of stream) {
        const t = chunk.text;
        if (t) {
          started = true;
          yield t;
        }
      }
      log.info("chat reply", { model });
      return;
    } catch (err) {
      if (started) throw err; // can't switch models mid-reply
      if (isDailyQuotaError(err)) markModelExhausted(model);
      const retryable = isDailyQuotaError(err) || (err instanceof ApiError && (err.status === 429 || err.status >= 500)) || (err instanceof Error && /abort|timeout/i.test(err.message));
      log.warn("chat model failed; trying next Flash model", { model, error: err instanceof Error ? err.message.slice(0, 160) : String(err) });
      if (!retryable) throw err;
    }
  }
  throw new ChatUnavailableError();
}
