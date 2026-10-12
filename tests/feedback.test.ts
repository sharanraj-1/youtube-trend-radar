import { describe, expect, it } from "vitest";
import { feedbackUrl, signFeedback, verifyFeedback } from "@/lib/feedback";

const SECRET = "x".repeat(40);

describe("HMAC feedback links", () => {
  it("round-trips a valid signature", () => {
    const sig = signFeedback(42, "up", SECRET);
    expect(verifyFeedback(42, "up", sig, SECRET)).toBe(true);
  });
  it("rejects tampered cluster id, vote, or signature", () => {
    const sig = signFeedback(42, "up", SECRET);
    expect(verifyFeedback(43, "up", sig, SECRET)).toBe(false);
    expect(verifyFeedback(42, "down", sig, SECRET)).toBe(false);
    expect(verifyFeedback(42, "up", sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"), SECRET)).toBe(false);
    expect(verifyFeedback(42, "up", "", SECRET)).toBe(false);
  });
  it("rejects a different secret and unknown votes", () => {
    expect(verifyFeedback(42, "up", signFeedback(42, "up", "y".repeat(40)), SECRET)).toBe(false);
    expect(verifyFeedback(42, "delete", signFeedback(42, "up", SECRET), SECRET)).toBe(false);
  });
  it("builds links that verify", () => {
    const url = new URL(feedbackUrl("https://example.test", 7, "filmed", SECRET));
    expect(url.pathname).toBe("/api/feedback");
    expect(verifyFeedback(Number(url.searchParams.get("c")), url.searchParams.get("v")!, url.searchParams.get("s")!, SECRET)).toBe(true);
  });
});
