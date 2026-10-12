import type { BriefJson } from "./types";
import { compactNumber, duration, escapeHtml as e, FORMAT_LABEL, istDate, istDateTime, LIFECYCLE_META, multiple, percent } from "./format";

/** Self-contained, inline-styled HTML (works in email clients and as the stored brief html). */
export function renderBriefHtml(b: BriefJson, webUrl?: string): string {
  const card = b.clusters
    .map((c) => {
      const lc = LIFECYCLE_META[c.lifecycle] ?? LIFECYCLE_META.peaking;
      const stat = (label: string, value: string) =>
        `<td style="padding:6px 10px 6px 0;vertical-align:top"><div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">${label}</div><div style="font-size:15px;font-weight:600;color:#111827">${e(value)}</div></td>`;
      return `
<tr><td style="padding:0 0 20px 0">
<table role="presentation" width="100%" style="border:1px solid #e5e7eb;border-radius:12px;background:#ffffff" cellpadding="0" cellspacing="0"><tr><td style="padding:18px 20px">
  <div><span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;color:#fff;background:${lc.color}">${lc.label}</span>
  ${c.lifecycle_confidence === "low" ? `<span style="font-size:11px;color:#6b7280;margin-left:6px">low confidence</span>` : ""}</div>
  <h2 style="margin:10px 0 6px;font-size:20px;line-height:1.3;color:#111827">${e(c.theme_name)}</h2>
  ${c.mode === "full" && c.why_now ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#374151">${e(c.why_now)}</p>` : `<p style="margin:0 0 12px;font-size:13px;color:#6b7280">Stats-only card (narrative withheld by validator).</p>`}
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    ${stat("Creators", String(c.stats.creators))}${stat("Videos", String(c.stats.videos))}${stat("Median outlier", multiple(c.stats.median_outlier))}
  </tr><tr>
    ${stat("Winning format", c.stats.winning_format ? FORMAT_LABEL[c.stats.winning_format] ?? c.stats.winning_format : "—")}${stat("Typical length", duration(c.stats.typical_length_s))}${stat("Shorts share", percent(c.stats.shorts_share))}
  </tr></table>
  ${c.covered ? `<p style="margin:10px 0 0;font-size:13px;color:#92400e;background:#fef3c7;padding:6px 10px;border-radius:8px">You covered this on ${e(istDate(c.covered.date))}: <a href="${e(c.covered.url)}" style="color:#92400e">${e(c.covered.title)}</a></p>` : ""}
  ${c.questions.length ? `<h3 style="margin:16px 0 6px;font-size:13px;color:#111827">Audience is asking</h3><ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.5">${c.questions.map((q) => `<li>${e(q.text)}</li>`).join("")}</ul>` : ""}
  ${c.angles?.length ? `<h3 style="margin:16px 0 6px;font-size:13px;color:#111827">Suggested angles</h3><ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.5">${c.angles.map((a) => `<li>${e(a)}</li>`).join("")}</ul>` : ""}
  <h3 style="margin:16px 0 6px;font-size:13px;color:#111827">Evidence</h3>
  ${c.evidence
    .map(
      (v) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px"><tr>
      <td style="vertical-align:top;padding-right:10px"><a href="${e(v.url)}"><img src="${e(v.thumb)}" width="120" height="68" alt="" style="border-radius:6px;display:block;object-fit:cover"></a></td>
      <td style="vertical-align:top;font-size:13px;line-height:1.4"><a href="${e(v.url)}" style="color:#111827;font-weight:600;text-decoration:none">${e(v.title)}</a><br><span style="color:#6b7280">${e(v.channel)} · ${compactNumber(v.views)} views · ${e(istDate(v.published_at))}</span></td>
    </tr></table>`,
    )
    .join("")}
  <p style="margin:14px 0 0;font-size:13px">
    <a href="${e(c.feedback.up)}" style="margin-right:14px;color:#1a73e8;text-decoration:none">👍 Useful</a>
    <a href="${e(c.feedback.down)}" style="margin-right:14px;color:#1a73e8;text-decoration:none">👎 Not for me</a>
    <a href="${e(c.feedback.filmed)}" style="color:#1a73e8;text-decoration:none">🎬 Filming this</a>
  </p>
</td></tr></table>
</td></tr>`;
    })
    .join("");

  const skip = b.skip.length
    ? `<tr><td style="padding:0 0 20px"><h3 style="margin:0 0 8px;font-size:15px;color:#111827">Skip this week</h3><ul style="margin:0;padding-left:18px;color:#6b7280;font-size:14px;line-height:1.6">${b.skip
        .map((s) => `<li>${e(s.label)} — ${s.creators} creators, median ${multiple(s.median_outlier)}</li>`)
        .join("")}</ul></td></tr>`
    : "";

  const f = b.footer;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sunday Content Strategy Brief</title></head>
<body style="margin:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:640px" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 16px">
  <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em">YouTube Trend Radar</div>
  <h1 style="margin:4px 0 8px;font-size:26px;color:#111827">Sunday Content Strategy Brief</h1>
  ${b.banner ? `<p style="margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#fee2e2;color:#991b1b;font-size:14px">${e(b.banner)}</p>` : ""}
  ${b.week_summary ? `<p style="margin:0;font-size:16px;line-height:1.5;color:#374151">${e(b.week_summary)}</p>` : ""}
  ${b.lifecycle_note ? `<p style="margin:8px 0 0;font-size:13px;color:#6b7280">${e(b.lifecycle_note)}</p>` : ""}
  ${webUrl ? `<p style="margin:8px 0 0;font-size:13px"><a href="${e(webUrl)}" style="color:#1a73e8">Open the web version</a></p>` : ""}
</td></tr>
${b.clusters.length ? card : `<tr><td style="padding:0 0 20px;color:#374151">No trend cluster met the evidence bar this week.</td></tr>`}
${skip}
<tr><td style="font-size:12px;color:#6b7280;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:12px">
  Data collected ${e(istDateTime(b.collected_at))} · Sources: ${f.sources.peer_channels.length} peer channels, ${e(f.sources.chart)}, ${f.sources.searches} keyword searches · ${f.sources.videos_analysed} videos analysed<br>
  YouTube quota used: ${f.quota_used} units · Gemini calls: ${f.gemini_calls}${f.coverage_note ? `<br>Coverage: ${e(f.coverage_note)}` : ""}<br>
  Run #${b.run_id ?? "—"} · ${e(f.prompt_versions.join(", "))}
</td></tr>
</table></td></tr></table></body></html>`;
}
