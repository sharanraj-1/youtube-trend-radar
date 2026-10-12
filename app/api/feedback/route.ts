import { env } from "@/lib/env";
import { db, schema } from "@/lib/db";
import { verifyFeedback } from "@/lib/feedback";
import { log } from "@/lib/log";

const MESSAGES: Record<string, string> = {
  up: "Thanks! We'll weigh similar trends higher.",
  down: "Got it — noted as not useful.",
  filmed: "Nice. Marked as filming — good luck with the shoot!",
};

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}
@media(prefers-color-scheme:dark){body{background:#0b1120;color:#e2e8f0}a{color:#93c5fd}}
main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 16px;color:inherit;opacity:.8}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a href="/">Back to the brief</a></main></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** Signed one-click feedback links from the brief/email. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clusterId = Number(url.searchParams.get("c"));
  const vote = url.searchParams.get("v") ?? "";
  const sig = url.searchParams.get("s") ?? "";
  try {
    if (!verifyFeedback(clusterId, vote, sig, env().FEEDBACK_SECRET)) return page("Link not valid", "This feedback link is invalid or has been altered.", 400);
    await db().insert(schema.feedback).values({ clusterId, vote });
    return page("Feedback recorded", MESSAGES[vote]);
  } catch (err) {
    log.error("feedback failed", { error: err instanceof Error ? err.message : String(err) });
    return page("Something went wrong", "We couldn't record that right now. Please try again later.", 500);
  }
}
