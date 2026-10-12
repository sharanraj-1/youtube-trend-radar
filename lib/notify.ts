import { Resend } from "resend";
import { log } from "./log";
import { fetchJson, withRetry } from "./retry";

/** Telegram alert; silently no-ops when not configured. Never throws. */
export async function alertTelegram(text: string): Promise<{ sent: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { sent: false, error: "not configured" };
  try {
    await withRetry(
      () =>
        fetchJson("telegram", `https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
        }),
      { service: "telegram" },
    );
    return { sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("telegram send failed", { error });
    return { sent: false, error };
  }
}

/** Email via Resend; returns a result instead of throwing so delivery problems never fail a run. */
export async function sendEmail(p: { to: string; subject: string; html: string }): Promise<{ sent: boolean; id?: string; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "RESEND_API_KEY not configured" };
  if (!p.to) return { sent: false, error: "briefEmail not configured" };
  const from = process.env.RESEND_FROM || "Trend Radar <onboarding@resend.dev>";
  try {
    const resend = new Resend(key);
    const res = await withRetry(
      async () => {
        const r = await Promise.race([
          resend.emails.send({ from, to: p.to, subject: p.subject, html: p.html }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("resend timeout")), 20_000)),
        ]);
        if (r.error) {
          const e = new Error(`${r.error.name}: ${r.error.message}`);
          (e as Error & { retryable?: boolean }).retryable = /rate|internal|timeout/i.test(r.error.name);
          throw e;
        }
        return r.data;
      },
      { service: "resend", shouldRetry: (e) => (e as { retryable?: boolean }).retryable !== false },
    );
    return { sent: true, id: res?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error("email send failed", { error });
    return { sent: false, error };
  }
}
