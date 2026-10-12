import { env } from "@/lib/env";
import { db, schema } from "@/lib/db";
import { verifyFeedback } from "@/lib/feedback";
import { log } from "@/lib/log";

const MESSAGES: Record<string, string> = {
  up: "Saved as “maybe later”. Thanks, this helps future briefs.",
  down: "Got it. We'll treat this as not a fit for your channel.",
  filmed: "Added to your plan. Good luck with the shoot!",
};

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Trend Radar</title>
<style>:root{--bg:#f7f4ee;--text:#1d1a16;--muted:#6d655a;--accent:#b3341f}
@media(prefers-color-scheme:dark){:root{--bg:#151412;--text:#ece7de;--muted:#a59d90;--accent:#ec6a50}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,sans-serif}
main{max-width:26rem;padding:2rem}h1{font:500 1.9rem/1.2 Georgia,serif;margin:0 0 .5rem}p{margin:0 0 1.25rem;color:var(--muted)}a{color:var(--accent)}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><a href="/">Back to this week's brief →</a></main></body></html>`;
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
