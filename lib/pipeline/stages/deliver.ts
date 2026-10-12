import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { baseUrl } from "../../env";
import { alertTelegram, sendEmail } from "../../notify";
import type { BriefJson } from "../../render/types";
import type { StageContext, StageResult } from "../types";

/** Brief is already saved by RENDER. Email/Telegram are best-effort: failures are recorded, never fatal. */
export async function deliver(ctx: StageContext): Promise<StageResult> {
  const [brief] = await db().select().from(schema.briefs).where(eq(schema.briefs.runId, ctx.run.id)).limit(1);
  if (!brief) throw new Error("No brief saved for this run");
  const json = brief.json as BriefJson;
  const url = `${baseUrl()}/briefs/${brief.id}`;

  const email = ctx.config.briefEmail
    ? await sendEmail({
        to: ctx.config.briefEmail,
        subject: `Sunday brief: ${json.clusters.map((c) => c.theme_name).slice(0, 3).join(" · ") || "this week's trends"}`,
        html: brief.html,
      })
    : { sent: false, error: "briefEmail not configured" };

  const lines = json.clusters.map((c, i) => `${i + 1}. ${c.theme_name} (${c.lifecycle})`).join("\n");
  const telegram = await alertTelegram(
    `${json.status === "complete" ? "✅" : "⚠️"} Trend Radar brief ready (${json.status}) — run #${ctx.run.id}\n${lines}\n${url}`,
  );

  const delivery = { web: url, email, telegram, at: new Date().toISOString() };
  await db().update(schema.briefs).set({ deliveredAt: new Date(), delivery }).where(eq(schema.briefs.id, brief.id));
  if (!email.sent && ctx.config.briefEmail) ctx.note(`Email not sent: ${email.error}.`);
  return { done: true, payload: delivery };
}
