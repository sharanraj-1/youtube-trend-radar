// Builds docs/components-map.html: a swimlane Components Map (rows = actors/services, columns = stages).
// Render to PDF/PNG with headless Edge/Chrome (see README "Components Map").
// Usage: node scripts/build-components-map.mjs
import { writeFileSync } from "node:fs";

const W = 1230;
const C = {
  title: "#7f938a",
  text: "#1f2622",
  body: "#4f5b55",
  label: "#7f938a",
  grid: "#c6cfca",
  gridStrong: "#8fa39a",
  card: "#6f837a",
  cardText: "#7a8a83",
  mono: "#29302c",
  arrow: "#8fa39a",
  cut: "#c0492f",
  cutBorder: "#e7a796",
};

// ---------------- layout ----------------
const LANE_X = 30;
const COL0 = 168;
const COL_W = 200;
const COLS = ["TRIGGER", "INPUT", "CONTEXT", "PROCESSING", "OUTPUT"];
const LANE_TOP = 185;
const LANE_H = 110;
const CARD_W = 162;

const LANES = [
  ["ISHAAN", "Tech creator"],
  ["RESEND · TELEGRAM", "email · alerts"],
  ["VERCEL CRON", "+ GitHub Actions"],
  ["YOUTUBE DATA API", "live, public"],
  ["RADAR APP", "Next.js on Vercel"],
  ["NEON POSTGRES", "database"],
  ["GEMINI FLASH", "LLM"],
];

// [lane, col, text lines, mono detail]
const CARDS = {
  ishTrig: [0, 0, ["Wants to know what to", "film this week"], "before Sunday 11 AM"],
  ishIn: [0, 1, ["Picks topics, peer", "channels and email once"], "/settings · control room"],
  ishOut: [0, 4, ["Swipes the trend slider:", "film, maybe or skip.", "He decides"], "→ Your plan for the week"],
  dlvOut: [1, 4, ["Emails the brief; pings", "Telegram when it's ready", "or a run fails"], "resend.dev · @yttrendppbot"],
  cronTrig: [2, 0, ["Starts the Sunday run;", "GitHub Actions backs it", "up and keeps it moving"], "05:00 IST · 30 23 * * 6"],
  ytIn: [3, 1, ["Peer uploads, India", "trending chart, 15 topic", "searches, top comments"], "≤ 6,000 of 10,000 units"],
  appTrig: [4, 0, ["Starts a run in steps,", "each under 170 s, then", "hands off to the next"], "CRON_SECRET checked"],
  appIn: [4, 1, ["Keeps English/Hindi,", "drops tiny channels and", "paid ads"], "≈ 300 videos kept"],
  appCtx: [4, 2, ["Compares each video", "with its channel's", "normal views"], "views ÷ channel median"],
  appProc: [4, 3, ["Groups videos into", "trends and ranks them", "in plain code"], "TF-IDF · ≥ 2 creators"],
  appOut: [4, 4, ["Fact-checks the AI text,", "then shows a momentum", "board + trend slider"], "/ · /briefs · /runs"],
  dbCtx: [5, 2, ["Stores videos, daily", "stats, settings, runs", "and briefs"], "Neon · 60-day retention"],
  gemIn: [6, 1, ["Reads 50 titles at a", "time: format, products,", "on-topic or not"], "titles are data, not orders"],
  gemCtx: [6, 2, ["Labels each video once", "and reuses them next", "week"], "cached per prompt version"],
  gemProc: [6, 3, ["Writes theme names,", "why-now and video ideas", "for the top trends"], "no numbers allowed"],
};

const laneY = (i) => LANE_TOP + i * LANE_H;
const colX = (i) => COL0 + i * COL_W;
const GRID_BOTTOM = laneY(LANES.length);

function cardBox(key) {
  const [lane, col, lines] = CARDS[key];
  const h = 18 + lines.length * 14.5 + 20;
  const x = colX(col) + (COL_W - CARD_W) / 2;
  const y = laneY(lane) + (LANE_H - h) / 2;
  return { x, y, w: CARD_W, h, cx: x + CARD_W / 2, cy: y + h / 2, right: x + CARD_W, bottom: y + h };
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------- svg pieces ----------------
let svg = "";

// column headers
COLS.forEach((name, i) => {
  const cx = colX(i) + COL_W / 2;
  const half = name.length * 5.4 + 12; // letter-spaced label width / 2 + breathing room
  svg += `<line x1="${colX(i) + 8}" y1="167" x2="${cx - half}" y2="167" stroke="${C.grid}" stroke-dasharray="1 2"/>`;
  svg += `<line x1="${cx + half}" y1="167" x2="${colX(i) + COL_W - 8}" y2="167" stroke="${C.grid}" stroke-dasharray="1 2"/>`;
  svg += `<text x="${cx}" y="171" text-anchor="middle" class="col">${name.split("").join(" ")}</text>`;
});

// lanes + grid
svg += `<line x1="${LANE_X}" y1="${LANE_TOP}" x2="${colX(5)}" y2="${LANE_TOP}" stroke="${C.gridStrong}"/>`;
LANES.forEach(([name, sub], i) => {
  const y = laneY(i);
  svg += `<line x1="${LANE_X}" y1="${y + LANE_H}" x2="${colX(5)}" y2="${y + LANE_H}" stroke="${i === LANES.length - 1 ? C.gridStrong : C.grid}"/>`;
  svg += `<text x="${(LANE_X + COL0) / 2}" y="${y + LANE_H / 2 - 3}" text-anchor="middle" class="lane">${esc(name)}</text>`;
  svg += `<text x="${(LANE_X + COL0) / 2}" y="${y + LANE_H / 2 + 14}" text-anchor="middle" class="sub">${esc(sub)}</text>`;
});
for (let i = 0; i <= COLS.length; i++) {
  const x = colX(i);
  svg += `<line x1="${x}" y1="${LANE_TOP}" x2="${x}" y2="${GRID_BOTTOM}" stroke="${C.grid}"/>`;
}
svg += `<line x1="${LANE_X}" y1="${LANE_TOP}" x2="${LANE_X}" y2="${GRID_BOTTOM}" stroke="${C.gridStrong}"/>`;

// arrows (drawn before cards so cards sit on top)
function path(points) {
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [sx, sy] = points[0];
  return `<path d="${d}" fill="none" stroke="${C.arrow}" stroke-width="1.2" stroke-dasharray="2 3" marker-end="url(#arrow)"/><circle cx="${sx}" cy="${sy}" r="2.6" fill="${C.arrow}"/>`;
}
const B = (k) => cardBox(k);
const right = (k) => [B(k).right, B(k).cy];
const left = (k) => [B(k).x - 2, B(k).cy];
const top = (k) => [B(k).cx, B(k).y - 2];
const bottom = (k) => [B(k).cx, B(k).bottom];

const arrows = [
  [right("ishTrig"), left("ishIn")],
  // settings feed the run's context: across, then down into the app lane
  [right("ishIn"), [B("appCtx").cx, B("ishIn").cy], top("appCtx")],
  [bottom("cronTrig"), top("appTrig")],
  [right("appTrig"), left("appIn")],
  [bottom("ytIn"), top("appIn")],
  // titles go to Gemini (passes behind the database lane)
  [bottom("appIn"), top("gemIn")],
  [right("gemIn"), left("gemCtx")],
  // labels are saved and reused next week
  [top("gemCtx"), [B("dbCtx").cx, B("dbCtx").bottom + 2]],
  [right("appIn"), left("appCtx")],
  [bottom("appCtx"), top("dbCtx")],
  [right("appCtx"), left("appProc")],
  [bottom("appProc"), top("gemProc")],
  [right("appProc"), left("appOut")],
  // Gemini's words come back to be fact-checked
  [right("gemProc"), [B("appOut").cx, B("gemProc").cy], [B("appOut").cx, B("appOut").bottom + 2]],
  [top("appOut"), [B("dlvOut").cx, B("dlvOut").bottom + 2]],
  [top("dlvOut"), [B("ishOut").cx, B("ishOut").bottom + 2]],
];
arrows.forEach((pts) => (svg += path(pts)));

// cards
for (const key of Object.keys(CARDS)) {
  const [, , lines, mono] = CARDS[key];
  const b = cardBox(key);
  svg += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fff" stroke="${C.card}" stroke-width="0.9"/>`;
  svg += `<line x1="${b.x}" y1="${b.bottom}" x2="${b.right}" y2="${b.bottom}" stroke="${C.card}" stroke-width="2"/>`;
  lines.forEach((ln, i) => {
    svg += `<text x="${b.cx}" y="${b.y + 18 + i * 14.5}" text-anchor="middle" class="card">${esc(ln)}</text>`;
  });
  svg += `<text x="${b.cx}" y="${b.y + 18 + lines.length * 14.5 + 6}" text-anchor="middle" class="mono">${esc(mono)}</text>`;
}

// ---------------- html ----------------
const H = 1192;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>YouTube Trend Radar · Components Map</title>
<style>
  @page { size: ${W}px ${H}px; margin: 0; }
  html, body { margin: 0; background: #fff; }
  body { width: ${W}px; height: ${H}px; position: relative; font-family: Inter, "Segoe UI", Helvetica, Arial, sans-serif; color: ${C.text}; }
  .head { position: absolute; left: 30px; top: 30px; width: 860px; }
  h1 { margin: 0; font-size: 33px; font-weight: 600; color: ${C.title}; letter-spacing: -0.2px; }
  .lede { margin: 12px 0 0; font-size: 15px; line-height: 1.55; color: #34403a; }
  svg { position: absolute; left: 0; top: 0; }
  svg text.col { font-size: 10.5px; letter-spacing: 1.5px; fill: ${C.label}; }
  svg text.lane { font-size: 12.5px; font-weight: 600; letter-spacing: 0.6px; fill: ${C.label}; }
  svg text.sub { font-size: 11.5px; fill: ${C.text}; }
  svg text.card { font-size: 11.3px; fill: ${C.cardText}; }
  svg text.mono { font-family: "Cascadia Mono", Consolas, "SFMono-Regular", Menlo, monospace; font-size: 9.6px; fill: ${C.mono}; }
  .notes { position: absolute; left: 30px; top: ${GRID_BOTTOM + 30}px; width: ${colX(5) - 30}px; display: grid; grid-template-columns: 382px 1fr 1fr; gap: 30px; }
  .cut { border: 1px solid ${C.cutBorder}; border-radius: 8px; padding: 16px 16px 14px; }
  .cut h3 { color: ${C.cut}; }
  h3 { margin: 0 0 9px; font-size: 14.5px; font-weight: 600; color: ${C.label}; }
  .cut p { margin: 0; font-size: 12px; line-height: 1.6; color: #34403a; }
  ul { margin: 0; padding-left: 15px; font-size: 12px; line-height: 1.75; color: #34403a; }
  .foot { position: absolute; left: 30px; right: ${W - colX(5)}px; top: ${H - 52}px; border-top: 1px solid #e3e7e4; padding-top: 12px; display: flex; justify-content: space-between; font-size: 11.5px; color: #4f5b55; }
  .foot b { color: ${C.text}; font-weight: 600; }
</style></head>
<body>
  <div class="head">
    <h1>YouTube Trend Radar · Components Map</h1>
    <p class="lede">Live YouTube data is collected every Sunday at 5 AM, ranked in plain code and delivered by 11 AM as a swipeable brief, so Ishaan picks what to film in minutes. Gemini Flash writes the words; it never decides.</p>
  </div>
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="${C.arrow}"/></marker></defs>
    ${svg}
  </svg>
  <div class="notes">
    <div class="cut">
      <h3>The Cut</h3>
      <p>The AI never decides what's trending. Gemini only labels titles and writes the words; plain code finds the trends, ranks them and fact-checks every sentence. Every number comes straight from YouTube, and the AI isn't allowed to write any.</p>
    </div>
    <div>
      <h3>Humans stay here</h3>
      <ul>
        <li>Ishaan decides what to film; the brief only recommends</li>
        <li>He picks the topics and peer channels to track</li>
        <li>Every "film / maybe / skip" call is his, saved to his plan</li>
      </ul>
    </div>
    <div>
      <h3>Never miss a Sunday</h3>
      <ul>
        <li>A step that fails 3× still publishes a partial brief</li>
        <li>Run stalls? GitHub Actions and open tabs resume it</li>
        <li>No brief by 9:30 AM → backup brief + Telegram alert</li>
        <li>107 automated tests cover scoring, trends and fact-checks</li>
      </ul>
    </div>
  </div>
  <div class="foot">
    <span><b>YouTube Trend Radar</b> · live YouTube data → plain-code trends → Sunday brief</span>
    <span><b>Live:</b> youtube-trend-radar-nine.vercel.app</span>
  </div>
</body></html>`;

writeFileSync(new URL("../docs/components-map.html", import.meta.url), html);
console.log("wrote docs/components-map.html");
