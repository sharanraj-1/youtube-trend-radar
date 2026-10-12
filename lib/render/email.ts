import type { BriefJson } from "./types";
import { compactNumber, duration, escapeHtml as e, istDate, istDateTime, multiple, percent } from "./format";
import { FORMAT_PLAIN, LIFECYCLE_GUIDE } from "./guide";

// Email-safe palette (mirrors the site's light theme). Inline styles only: email clients ignore <style>/CSS vars.
const C = {
  bg: "#f7f4ee",
  card: "#fffdf9",
  border: "#e2dccf",
  rule: "#d6cfbf",
  text: "#1d1a16",
  muted: "#6d655a",
  faint: "#9a9184",
  accent: "#b3341f",
  lifecycle: { emerging: "#2f7a4d", rising: "#2c5ea8", peaking: "#b7791f", saturated: "#8c8478" } as Record<string, string>,
};
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Self-contained, inline-styled HTML (works in email clients and as the stored brief html). */
export function renderBriefHtml(b: BriefJson, webUrl?: string): string {
  const cards = b.clusters
    .map((c, i) => {
      const g = LIFECYCLE_GUIDE[c.lifecycle] ?? LIFECYCLE_GUIDE.peaking;
      const tone = C.lifecycle[c.lifecycle] ?? C.muted;
      const fact = (value: string, label: string) =>
        `<td style="padding:10px 12px 10px 0;vertical-align:top;border-top:1px solid ${C.rule}"><div style="font-family:${SERIF};font-size:22px;line-height:1;color:${C.text}">${e(value)}</div><div style="font-family:${SANS};font-size:12px;color:${C.muted};padding-top:4px">${e(label)}</div></td>`;
      const format = c.stats.winning_format ? (FORMAT_PLAIN[c.stats.winning_format] ?? c.stats.winning_format).split(" (")[0] : "Mixed";
      const evidence = c.evidence
        .map(
          (v) => `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:120px"><a href="${e(v.url)}"><img src="${e(v.thumb)}" width="120" height="68" alt="" style="display:block;border-radius:4px;object-fit:cover"></a></td>
          <td style="padding:8px 0;vertical-align:top;font-family:${SANS};font-size:14px;line-height:1.4"><a href="${e(v.url)}" style="color:${C.text};text-decoration:none;font-weight:600">${e(v.title)}</a><br><span style="font-size:12px;color:${C.muted}">${e(v.channel)} · ${compactNumber(v.views)} views · ${e(istDate(v.published_at))}</span></td></tr>`,
        )
        .join("");
      return `
<tr><td style="padding:28px 0 0;border-top:1px solid ${C.rule}">
  <div style="font-family:${SANS};font-size:13px;color:${C.muted}">Trend ${i + 1} of ${b.clusters.length} · <span style="color:${tone};font-weight:600">${e(g.label)}</span></div>
  <h2 style="margin:6px 0 10px;font-family:${SERIF};font-weight:normal;font-size:26px;line-height:1.2;color:${C.text}">${e(c.theme_name)}</h2>
  ${
    c.mode === "full" && c.why_now
      ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:16px;line-height:1.55;color:${C.text}">${e(c.why_now)}</p>`
      : `<p style="margin:0 0 10px;font-family:${SANS};font-size:14px;color:${C.muted}">We couldn't write a reliable summary for this one, so here are the numbers and example videos.</p>`
  }
  <p style="margin:0 0 14px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted}"><span style="color:${tone};font-weight:600">${e(g.label)}.</span> ${e(g.advice)}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    ${fact(String(c.stats.creators), "creators covered it")}${c.stats.median_outlier !== null ? fact(multiple(c.stats.median_outlier), "their usual views") : ""}
  </tr><tr>
    ${fact(format, "format that's working")}${fact(c.stats.typical_length_s ? duration(c.stats.typical_length_s) : "Shorts", c.stats.shorts_share > 0 ? `typical length · ${percent(c.stats.shorts_share)} Shorts` : "typical length")}
  </tr></table>
  ${
    c.covered
      ? `<p style="margin:14px 0 0;padding-left:12px;border-left:2px solid #a2650f;font-family:${SANS};font-size:13px;color:${C.text}"><strong>You covered this on ${e(istDate(c.covered.date))}</strong> in <a href="${e(c.covered.url)}" style="color:${C.text}">${e(c.covered.title)}</a>. Go for a follow-up angle.</p>`
      : ""
  }
  ${
    c.angles?.length
      ? `<h3 style="margin:20px 0 8px;font-family:${SANS};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">Ideas for your video</h3>
         <ol style="margin:0;padding-left:20px;font-family:${SANS};font-size:15px;line-height:1.55;color:${C.text}">${c.angles.map((a) => `<li style="margin-bottom:4px">${e(a)}</li>`).join("")}</ol>`
      : ""
  }
  ${
    c.questions.length
      ? `<h3 style="margin:20px 0 8px;font-family:${SANS};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">What viewers are asking</h3>
         ${c.questions
           .slice(0, 3)
           .map((q) => `<p style="margin:0 0 6px;font-family:${SERIF};font-style:italic;font-size:15px;line-height:1.5;color:${C.text}">&ldquo;${e(q.text)}&rdquo;</p>`)
           .join("")}`
      : ""
  }
  ${evidence ? `<h3 style="margin:20px 0 4px;font-family:${SANS};font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">See the proof</h3><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${evidence}</table>` : ""}
  <p style="margin:16px 0 0;font-family:${SANS};font-size:14px;color:${C.muted}">Will you make a video on this?&nbsp;
    <a href="${e(c.feedback.filmed)}" style="color:${C.accent};font-weight:600">I'll film this</a> &nbsp;·&nbsp;
    <a href="${e(c.feedback.up)}" style="color:${C.text}">Maybe later</a> &nbsp;·&nbsp;
    <a href="${e(c.feedback.down)}" style="color:${C.text}">Not for me</a>
  </p>
</td></tr>
<tr><td style="height:28px"></td></tr>`;
    })
    .join("");

  const skip = b.skip.length
    ? `<tr><td style="padding:20px;background:#efebe2;border-radius:6px;font-family:${SANS}">
        <div style="font-size:15px;font-weight:600;color:${C.text}">Topics to skip this week</div>
        <div style="font-size:13px;color:${C.muted};margin:4px 0 8px">Lots of creators are already on these and views are below normal.</div>
        <div style="font-size:14px;color:${C.text};line-height:1.7">${b.skip.map((s) => `${e(s.label)} <span style="color:${C.muted}">· ${s.creators} creators</span>`).join("<br>")}</div>
      </td></tr><tr><td style="height:24px"></td></tr>`
    : "";

  const banner = b.banner
    ? `<p style="margin:0 0 14px;padding-left:12px;border-left:2px solid ${b.status === "fallback" ? C.accent : "#a2650f"};font-family:${SANS};font-size:14px;line-height:1.5;color:${C.text}">${
        b.status === "fallback"
          ? "This is last week's brief. This week's run didn't finish in time, so double-check before filming."
          : "Some data was limited this week, so a few parts may be thinner than usual."
      }</p>`
    : "";

  const cta = webUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 4px"><tr><td style="background:${C.accent};border-radius:6px"><a href="${e(webUrl)}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Review this week's brief step by step →</a></td></tr></table>`
    : "";

  const f = b.footer;
  const title = b.clusters.length ? `${b.clusters.length} trend${b.clusters.length === 1 ? "" : "s"} worth your attention this week` : "Nothing stood out this week";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Sunday brief</title></head>
<body style="margin:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" style="max-width:620px" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 22px;border-bottom:1px solid ${C.border}">
  <div style="font-family:${SERIF};font-size:20px;font-weight:bold;color:${C.text}">Trend Radar</div>
  <div style="font-family:${SANS};font-size:13px;color:${C.muted};padding-top:14px">Sunday brief · ${e(istDate(b.generated_at))}${b.run_id ? ` · Run ${b.run_id}` : ""}</div>
  <h1 style="margin:6px 0 12px;font-family:${SERIF};font-weight:normal;font-size:32px;line-height:1.15;color:${C.text}">${e(title)}</h1>
  ${banner}
  ${b.week_summary ? `<p style="margin:0;font-family:${SERIF};font-size:18px;line-height:1.55;color:${C.text}">${e(b.week_summary)}</p>` : ""}
  ${b.lifecycle_note ? `<p style="margin:10px 0 0;font-family:${SANS};font-size:12px;color:${C.muted}">Stages are early estimates: we need a few weeks of history to be sure.</p>` : ""}
  ${cta}
</td></tr>
<tr><td style="height:4px"></td></tr>
${b.clusters.length ? cards : `<tr><td style="padding:24px 0;font-family:${SANS};font-size:15px;color:${C.text}">No topic had enough creators and strong enough views to make the cut this week, which makes it a good week for evergreen ideas.</td></tr>`}
${skip}
<tr><td style="padding-top:16px;border-top:1px solid ${C.border};font-family:${SANS};font-size:12px;line-height:1.6;color:${C.faint}">
  Based on ${f.sources.videos_analysed} recent videos from ${f.sources.peer_channels.length} channels you follow, YouTube's trending list and ${f.sources.searches} topic searches. Data collected ${e(istDateTime(b.collected_at))}.
  Every number comes straight from YouTube. The AI only writes the descriptions and ideas.${f.coverage_note ? `<br>Note: ${e(f.coverage_note)}` : ""}
  ${webUrl ? `<br><a href="${e(webUrl)}" style="color:${C.muted}">Open on the web</a>` : ""}
</td></tr>
</table></td></tr></table></body></html>`;
}
