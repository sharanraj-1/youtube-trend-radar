import { describe, expect, it } from "vitest";
import { capPerChannel, clusterVideos, type ScoredVideo } from "@/lib/analysis/cluster";
import { buildIdf, cosine, textSimilarity, tokenize, vectorize } from "@/lib/analysis/tfidf";

let n = 0;
function v(p: Partial<ScoredVideo> & { channelId: string; title: string }): ScoredVideo {
  n++;
  return {
    id: p.id ?? `vid${n}`,
    channelTitle: p.channelId,
    publishedAt: "2026-10-10T00:00:00Z",
    durationS: 600,
    isShort: false,
    views: 10000,
    likes: 500,
    comments: 50,
    ageHours: 48,
    viewsPerHour: 200,
    outlierMultiple: 2,
    engagementRate: 0.05,
    velocity72h: null,
    format: "tutorial",
    entities: [],
    topicKey: "misc",
    topicSummary: p.title,
    ...p,
  };
}

describe("TF-IDF", () => {
  it("tokenizes, dropping stopwords and Hinglish filler", () => {
    expect(tokenize("How to use Cursor AI kaise kare in Hindi 2026")).toEqual(["use", "cursor", "ai", "kare"]);
  });
  it("identical docs have cosine 1, disjoint docs 0", () => {
    const docs = ["cursor agent mode coding", "iphone camera review"].map(tokenize);
    const idf = buildIdf(docs);
    expect(cosine(vectorize(docs[0], idf), vectorize(docs[0], idf))).toBeCloseTo(1, 6);
    expect(cosine(vectorize(docs[0], idf), vectorize(docs[1], idf))).toBe(0);
  });
  it("similar titles score above the 0.35 merge threshold, unrelated below", () => {
    const corpus = ["veo 3 ai video generator free", "free ai video generator veo 3 tutorial", "best budget phone under 15000"];
    expect(textSimilarity(corpus[0], corpus[1], corpus)).toBeGreaterThan(0.35);
    expect(textSimilarity(corpus[0], corpus[2], corpus)).toBeLessThan(0.35);
  });
});

describe("clusterVideos", () => {
  it("groups by dominant canonical entity across channels", () => {
    const vids = [
      v({ channelId: "A", title: "Cursor 2.0 agent mode", entities: ["Cursor"] }),
      v({ channelId: "B", title: "cursor tutorial for beginners", entities: ["cursor"] }),
      v({ channelId: "C", title: "Cursor vs Windsurf", entities: ["Cursor", "Windsurf"] }),
      v({ channelId: "D", title: "iPhone 17 review", entities: ["iPhone 17"] }),
    ];
    const cs = clusterVideos(vids);
    expect(cs).toHaveLength(1); // iPhone group has a single channel -> dropped
    expect(cs[0].topEntity?.toLowerCase()).toBe("cursor");
    expect(cs[0].stats.distinct_channels).toBe(3);
  });

  it("merges topic_key groups by TF-IDF similarity >= 0.35", () => {
    const vids = [
      v({ channelId: "A", title: "Free AI video generator tool text to video", topicKey: "free-ai-video-generator" }),
      v({ channelId: "B", title: "Best free AI video generator text to video", topicKey: "ai-video-generator-free" }),
      v({ channelId: "C", title: "Budget laptop under 40000 for students", topicKey: "budget-laptop" }),
      v({ channelId: "D", title: "Gaming phone cooling test", topicKey: "gaming-phone" }),
    ];
    const cs = clusterVideos(vids);
    expect(cs).toHaveLength(1);
    expect(cs[0].videoIds).toHaveLength(2);
    expect(cs[0].stats.distinct_channels).toBe(2);
  });

  it("ignores generic entities when grouping", () => {
    const vids = [
      v({ channelId: "A", title: "AI news roundup", entities: ["AI"], topicKey: "ai-news-a" }),
      v({ channelId: "B", title: "Smartphone deals", entities: ["Smartphone"], topicKey: "phone-deals-b" }),
    ];
    expect(clusterVideos(vids)).toHaveLength(0);
  });

  it("caps any single channel at 2 videos in stats", () => {
    const vids = [
      ...Array.from({ length: 6 }, (_, i) => v({ channelId: "A", title: `Gemini tip ${i}`, entities: ["Gemini"], outlierMultiple: 10 })),
      v({ channelId: "B", title: "Gemini app review", entities: ["Gemini"], outlierMultiple: 1 }),
      v({ channelId: "C", title: "Gemini live hindi", entities: ["Gemini"], outlierMultiple: 1 }),
    ];
    const [c] = clusterVideos(vids);
    expect(c.stats.video_count).toBe(8);
    // capped set = A,A,B,C -> outliers [10,10,1,1] -> median 5.5 (uncapped would be 10)
    expect(c.stats.median_outlier_multiple).toBe(5.5);
    expect(capPerChannel(vids, 2)).toHaveLength(4);
  });

  it("extracts audience questions from comments", () => {
    const a = v({ id: "q1", channelId: "A", title: "Perplexity Comet browser", entities: ["Perplexity"] });
    const b = v({ id: "q2", channelId: "B", title: "Perplexity Pro free for Airtel users", entities: ["Perplexity"] });
    const questions = new Map([
      ["q1", [{ text: "Is it free in India?", likes: 40 }, { text: "great video bro", likes: 900 }]],
      ["q2", [{ text: "kaise activate kare airtel wala offer", likes: 12 }]],
    ]);
    const [c] = clusterVideos([a, b], { questions });
    expect(c.stats.top_comment_questions.map((q) => q.text)).toEqual(["Is it free in India?", "kaise activate kare airtel wala offer"]);
  });

  it("flags already-covered topics from the creator's own uploads", () => {
    const vids = [
      v({ channelId: "A", title: "NotebookLM video overviews", entities: ["NotebookLM"] }),
      v({ channelId: "B", title: "NotebookLM for students", entities: ["NotebookLM"] }),
    ];
    const own = [{ id: "own1", title: "I tried NotebookLM for a week", publishedAt: "2026-09-20T10:00:00Z" }];
    const [c] = clusterVideos(vids, { ownVideos: own });
    expect(c.stats.already_covered_by_ishaan?.video_id).toBe("own1");
  });
});
