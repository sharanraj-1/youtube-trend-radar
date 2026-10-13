import { NextResponse } from "next/server";
import { ChatRequest, buildChatContext } from "@/lib/chat/context";
import { generateJson, GeminiQuotaExhaustedError } from "@/lib/gemini/client";
import { SUMMARY_SCHEMA, SUMMARY_SYSTEM, SummaryResult } from "@/lib/prompts/chat";
import { neutralize } from "@/lib/prompts/enrich";
import { briefById } from "@/lib/queries";
import { getConfig } from "@/lib/settings";
import { alertTelegram, sendEmail } from "@/lib/notify";
import { renderSummaryEmail, renderSummaryText } from "@/lib/render/summary-email";
import { clientKey, rateLimit } from "@/lib/ratelimit";
import { baseUrl } from "@/lib/env";
import { log } from "@/lib/log";
import type { BriefJson } from "@/lib/render/types";

export const maxDuration = 60;

/**
 * Summarises an Idea Studio chat with Gemini Flash and sends it to the owner's configured email + Telegram.
 * Recipients come only from server config, so this endpoint can't be used to message anyone else.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`summary:${clientKey(req)}`, 5, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: `You just sent one. Try again in ${rl.retryAfterS}s.` }, { status: 429 });

  const parsed = ChatRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Nothing to summarise yet." }, { status: 400 });
  const body = parsed.data;

  let brief: BriefJson;
  try {
    const row = await briefById(body.briefId);
    if (!row) return NextResponse.json({ error: "That brief no longer exists." }, { status: 404 });
    brief = row.json as BriefJson;
  } catch {
    return NextResponse.json({ error: "Couldn't load the brief right now." }, { status: 503 });
  }

  const transcript = body.messages
    .slice(-30)
    .map((m) => `${m.role === "user" ? "Ishaan" : "Strategist"}: ${neutralize(m.text)}`)
    .join("\n\n");

  let summary: SummaryResult;
  try {
    const { data } = await generateJson({
      label: "chat-summary",
      system: SUMMARY_SYSTEM,
      prompt: [
        buildChatContext(brief, body),
        "",
        "Recap this chat for Ishaan: a title, a 2-3 sentence summary, the videos he settled on (working title, angle, hook) and next steps.",
        "<untrusted_chat_transcript>",
        transcript,
        "</untrusted_chat_transcript>",
      ].join("\n"),
      responseSchema: SUMMARY_SCHEMA,
      validator: SummaryResult,
      temperature: 0.3,
      timeoutMs: 60_000,
    });
    summary = data;
  } catch (err) {
    log.error("chat summary failed", { error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    return NextResponse.json(
      { error: err instanceof GeminiQuotaExhaustedError ? "The AI is out of free quota right now. Try again later." : "Couldn't write the summary right now." },
      { status: 503 },
    );
  }

  const url = `${baseUrl()}/briefs/${body.briefId}`;
  const picks = body.selected.map((s) => ({ theme: s.theme, idea: s.idea }));
  const cfg = await getConfig().catch(() => null);
  const [email, telegram] = await Promise.all([
    cfg?.briefEmail
      ? sendEmail({ to: cfg.briefEmail, subject: `Idea Studio: ${summary.title}`, html: renderSummaryEmail(summary, picks, url) })
      : Promise.resolve({ sent: false, error: "no email address saved in Admin" }),
    alertTelegram(renderSummaryText(summary, picks, url)),
  ]);
  return NextResponse.json({ summary, email, telegram });
}
