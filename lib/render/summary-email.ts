import type { SummaryResult } from "../prompts/chat";
import { escapeHtml as e } from "./format";

const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Inline-styled recap email (same paper palette as the brief email). */
export function renderSummaryEmail(s: SummaryResult, picks: { theme: string; idea: string }[], briefUrl: string): string {
  const section = (title: string, body: string) =>
    `<tr><td style="padding:22px 0 0"><div style="font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6d655a;padding-bottom:8px">${title}</div>${body}</td></tr>`;
  const videos = s.videos
    .map(
      (v, i) => `<div style="border:1px solid #e2dccf;border-radius:10px;background:#fffdf9;padding:14px 16px;margin-bottom:10px">
        <div style="font-family:${SANS};font-size:12px;color:#b3341f;font-weight:600">Video ${i + 1}</div>
        <div style="font-family:${SERIF};font-size:20px;line-height:1.25;color:#1d1a16;padding:4px 0 6px">${e(v.working_title)}</div>
        <div style="font-family:${SANS};font-size:14px;line-height:1.5;color:#1d1a16">${e(v.angle)}</div>
        ${v.hook ? `<div style="font-family:${SANS};font-size:13px;line-height:1.5;color:#6d655a;padding-top:6px"><strong>Hook:</strong> ${e(v.hook)}</div>` : ""}
      </div>`,
    )
    .join("");
  const list = (items: string[]) =>
    `<ul style="margin:0;padding-left:18px;font-family:${SANS};font-size:14px;line-height:1.6;color:#1d1a16">${items.map((x) => `<li>${e(x)}</li>`).join("")}</ul>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#f7f4ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ee"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" style="max-width:620px" cellpadding="0" cellspacing="0">
<tr><td style="padding-bottom:18px;border-bottom:1px solid #e2dccf">
  <div style="font-family:${SERIF};font-size:18px;font-weight:bold;color:#1d1a16">Trend Radar · Idea Studio</div>
  <h1 style="margin:14px 0 8px;font-family:${SERIF};font-weight:normal;font-size:30px;line-height:1.15;color:#1d1a16">${e(s.title)}</h1>
  <p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:#1d1a16">${e(s.summary)}</p>
</td></tr>
${s.videos.length ? section("Videos to make", videos) : ""}
${picks.length ? section("Ideas you picked from the brief", list(picks.map((p) => `${p.idea} (${p.theme})`))) : ""}
${s.next_steps.length ? section("Next steps", list(s.next_steps)) : ""}
<tr><td style="padding:26px 0 0">
  <a href="${e(briefUrl)}" style="display:inline-block;background:#b3341f;color:#fff;text-decoration:none;font-family:${SANS};font-size:14px;font-weight:600;padding:11px 20px;border-radius:999px">Back to this week's brief →</a>
</td></tr>
<tr><td style="padding-top:22px;font-family:${SANS};font-size:12px;color:#9a9184">Written by Gemini Flash from your Idea Studio chat. You decide what to film.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Plain-text version for Telegram (kept under its 4,096-character limit by the sender). */
export function renderSummaryText(s: SummaryResult, picks: { theme: string; idea: string }[], briefUrl: string): string {
  const lines = [`💡 ${s.title}`, "", s.summary];
  if (s.videos.length) {
    lines.push("", "🎬 Videos to make:");
    s.videos.forEach((v, i) => lines.push(`${i + 1}. ${v.working_title}: ${v.angle}${v.hook ? `\n   Hook: ${v.hook}` : ""}`));
  }
  if (picks.length) {
    lines.push("", "✅ Ideas you picked:");
    picks.forEach((p) => lines.push(`• ${p.idea}`));
  }
  if (s.next_steps.length) {
    lines.push("", "➡️ Next steps:");
    s.next_steps.forEach((n) => lines.push(`• ${n}`));
  }
  lines.push("", briefUrl);
  return lines.join("\n");
}
