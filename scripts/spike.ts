// Data spike: resolve peer handles, run one search and one videos.list against the live API, print quota used.
// Usage: npm run spike   (needs YOUTUBE_API_KEY in .env.local; no database required)
import "./_env";
import defaults from "../config/default.json";
import { YouTubeClient } from "../lib/youtube/client";
import { QuotaManager } from "../lib/youtube/quota";
import { parseIsoDuration, isShort } from "../lib/youtube/duration";

async function main() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Set YOUTUBE_API_KEY in .env.local");
  const quota = new QuotaManager(500);
  const yt = new YouTubeClient(key, quota);

  console.log("\n== Resolving peer handles (channels.list?forHandle, 1 unit each) ==");
  for (const h of defaults.peerChannelHandles) {
    const ch = await yt.channelByHandle(h);
    if (!ch) console.log(`  ${h.padEnd(18)} -> NOT RESOLVED (would be dropped)`);
    else
      console.log(
        `  ${h.padEnd(18)} -> ${ch.id}  "${ch.snippet.title}"  subs=${ch.statistics?.subscriberCount ?? "hidden"}  uploads=${ch.contentDetails?.relatedPlaylists.uploads}`,
      );
  }

  const publishedAfter = new Date(Date.now() - defaults.lookbackDays * 86400_000).toISOString();
  console.log(`\n== search.list q="AI tools" publishedAfter=${publishedAfter} (100 units) ==`);
  const ids = await yt.search({ q: "AI tools", publishedAfter, regionCode: "IN", relevanceLanguage: "en" });
  console.log(`  ${ids.length} video ids`);

  console.log("\n== videos.list hydrate (1 unit) ==");
  const vids = await yt.videosByIds(ids.slice(0, 50));
  for (const v of vids.slice(0, 12)) {
    const d = parseIsoDuration(v.contentDetails?.duration);
    console.log(
      `  ${v.id}  ${String(v.statistics?.viewCount ?? "?").padStart(9)} views  ${String(d).padStart(5)}s${isShort(d) ? " SHORT" : "      "}  ${v.snippet.channelTitle}: ${v.snippet.title.slice(0, 70)}`,
    );
  }

  console.log("\n== Quota ==");
  console.log(JSON.stringify(quota.summary(), null, 2));
}

main().catch((e) => {
  console.error("Spike failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
