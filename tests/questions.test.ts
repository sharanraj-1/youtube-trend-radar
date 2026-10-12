import { describe, expect, it } from "vitest";
import { isQuestion, topQuestions } from "@/lib/analysis/questions";

describe("isQuestion (real comments from the first live run)", () => {
  it.each([
    "When does the duo line become available?",
    "So, friends, are you ready to shell out 5,000 for 32GB of unified memory?",
    "Is it free in India",
    "kaise activate kare airtel wala offer",
    "How do I tell this to a non-tech person without sounding flat out bonkers 😂😂",
  ])("accepts %s", (t) => expect(isQuestion(t)).toBe(true));

  it.each([
    "Can’t wait for governments to do nothing about it.",
    "What a shitty voice over, the AI voice sounds like she is talking through CS mic in Skype call.",
    "what decades of greed can push people to achieve.",
    "great video bro",
    "Check this https://example.com?",
  ])("rejects %s", (t) => expect(isQuestion(t)).toBe(false));

  it("ranks explicit '?' questions ahead of more-liked implicit ones", () => {
    const out = topQuestions([
      { text: "kaise kare ye setup", likes: 500, video_id: "a" },
      { text: "Does it work on Windows?", likes: 10, video_id: "b" },
    ]);
    expect(out.map((q) => q.video_id)).toEqual(["b", "a"]);
  });
});
