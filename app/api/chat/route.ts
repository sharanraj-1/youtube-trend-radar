import { NextResponse } from "next/server";
import { ChatRequest, buildChatContext } from "@/lib/chat/context";
import { ChatUnavailableError, streamChat } from "@/lib/gemini/chat";
import { CHAT_SYSTEM } from "@/lib/prompts/chat";
import { briefById } from "@/lib/queries";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { log } from "@/lib/log";
import type { BriefJson } from "@/lib/render/types";

export const maxDuration = 60;

/** Idea Studio: streams a Gemini Flash reply grounded in the brief and Ishaan's picks (plain text stream). */
export async function POST(req: Request) {
  const rl = rateLimit(`chat:${clientKey(req)}`, 25, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: `Easy there — try again in ${rl.retryAfterS}s.` }, { status: 429 });

  const parsed = ChatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That message couldn't be read." }, { status: 400 });
  const body = parsed.data;
  if (body.messages[body.messages.length - 1].role !== "user") return NextResponse.json({ error: "Send a message first." }, { status: 400 });

  let brief: BriefJson;
  try {
    const row = await briefById(body.briefId);
    if (!row) return NextResponse.json({ error: "That brief no longer exists." }, { status: 404 });
    brief = row.json as BriefJson;
  } catch {
    return NextResponse.json({ error: "Couldn't load the brief right now." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const gen = streamChat({ system: CHAT_SYSTEM, context: buildChatContext(brief, body), history: body.messages.slice(-20) });

  // Pull the first chunk before answering so model/quota errors become a clean HTTP error, not a half-open stream.
  let first: IteratorResult<string>;
  try {
    first = await gen.next();
  } catch (err) {
    const busy = err instanceof ChatUnavailableError;
    log.error("chat failed", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    return NextResponse.json(
      { error: busy ? "The AI is out of free quota or busy right now. Try again in a little while." : "The AI couldn't answer that right now." },
      { status: busy ? 503 : 502 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for await (const chunk of gen) controller.enqueue(encoder.encode(chunk));
      } catch (err) {
        log.error("chat stream interrupted", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
        controller.enqueue(encoder.encode("\n\n_(The reply was cut short. Ask me to continue.)_"));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
