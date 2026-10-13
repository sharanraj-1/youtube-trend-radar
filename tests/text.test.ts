import { describe, expect, it } from "vitest";
import { clip, pgSafe } from "@/lib/text";
import { VideoItem } from "@/lib/youtube/client";

const hasLoneSurrogate = (s: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(s);

describe("pgSafe / clip (run #11: COLLECT failed on text Postgres rejects)", () => {
  it("removes NUL and other control chars but keeps newlines, tabs, emoji and Hindi", () => {
    expect(pgSafe("a\u0000b\u0007c\n\td 🎉 हिंदी")).toBe("abc\n\td 🎉 हिंदी");
  });

  it("drops lone surrogates", () => {
    expect(pgSafe("x\uD83D")).toBe("x");
    expect(pgSafe("\uDE00y")).toBe("y");
    expect(pgSafe("ok 😀")).toBe("ok 😀");
  });

  it("never cuts an emoji in half", () => {
    const s = "a".repeat(499) + "😀tail"; // the emoji straddles index 500
    const out = clip(s, 500);
    expect(out).toBe("a".repeat(499));
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(clip("hi 😀", 500)).toBe("hi 😀");
  });

  it("cleans YouTube payloads at parse time", () => {
    const v = VideoItem.parse({
      id: "x",
      snippet: { publishedAt: "2026-10-12T00:00:00Z", channelId: "c", channelTitle: "Ch\u0000an", title: "Bad \uD83D title", description: "d\u0000", tags: ["t\u0000"] },
    });
    expect(v.snippet.title).toBe("Bad  title");
    expect(v.snippet.channelTitle).toBe("Chan");
    expect(v.snippet.description).toBe("d");
    expect(v.snippet.tags).toEqual(["t"]);
    expect(VideoItem.parse({ id: "y", snippet: { publishedAt: "2026-10-12T00:00:00Z", channelId: "c", title: "t" } }).snippet.description).toBe("");
  });
});
