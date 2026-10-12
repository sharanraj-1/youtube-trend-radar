import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { backoffDelay, HttpError, withRetry } from "@/lib/retry";
import { COMPONENTS_MERMAID } from "@/lib/architecture";
import { scrub } from "@/lib/log";
import { weekStartIST } from "@/lib/jobs";

describe("withRetry", () => {
  it("retries 429/5xx with backoff, up to 4 attempts", async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const res = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new HttpError("x", 429, "");
        return "ok";
      },
      { service: "test", sleep: async (ms) => void sleeps.push(ms) },
    );
    expect(res).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toHaveLength(2);
  });
  it("does not retry a 400", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError("x", 400, "");
        },
        { service: "test", sleep: async () => {} },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it("jittered backoff stays within [cap/2, cap]", () => {
    expect(backoffDelay(0, 800, 20000, () => 0)).toBe(400);
    expect(backoffDelay(0, 800, 20000, () => 1)).toBe(800);
    expect(backoffDelay(10, 800, 20000, () => 1)).toBe(20000);
  });
});

describe("logging never leaks keys", () => {
  it("redacts key params and secret-looking fields", () => {
    const out = JSON.stringify(scrub({ url: "https://x/y?part=a&key=AIzaSECRET", apiKey: "abc", nested: { token: "t" } }));
    expect(out).not.toContain("AIzaSECRET");
    expect(out).not.toContain('"abc"');
    expect(out).toContain("[redacted]");
  });
});

describe("weekStartIST", () => {
  it("returns Sunday 00:00 IST", () => {
    // Sunday 2026-10-11 06:00 IST = 00:30 UTC
    expect(weekStartIST(new Date("2026-10-11T00:30:00Z")).toISOString()).toBe("2026-10-10T18:30:00.000Z");
    // Saturday 2026-10-17 23:00 IST still belongs to the week that began Sun 11 Oct
    expect(weekStartIST(new Date("2026-10-17T17:30:00Z")).toISOString()).toBe("2026-10-10T18:30:00.000Z");
  });
});

describe("Components Map", () => {
  it("COMPONENTS_MAP.md embeds the exact diagram rendered at /architecture", () => {
    const md = readFileSync("COMPONENTS_MAP.md", "utf8").replace(/\r\n/g, "\n");
    expect(md).toContain(COMPONENTS_MERMAID);
  });
});

import { ApiError } from "@google/genai";
import { isDailyQuotaError } from "@/lib/gemini/client";
describe("Gemini quota classification", () => {
  it("distinguishes per-day free-tier exhaustion (no retry) from per-minute 429s (retry)", () => {
    const daily = new ApiError({ status: 429, message: '{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}' });
    const minute = new ApiError({ status: 429, message: '{"quotaId":"GenerateRequestsPerMinutePerProjectPerModel-FreeTier"}' });
    expect(isDailyQuotaError(daily)).toBe(true);
    expect(isDailyQuotaError(minute)).toBe(false);
    expect(isDailyQuotaError(new ApiError({ status: 503, message: "high demand" }))).toBe(false);
  });
});

import { baseUrl } from "@/lib/env";
describe("baseUrl", () => {
  it("strips a BOM / whitespace that shells add to pasted env values", () => {
    const prev = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = "\uFEFFhttps://example.test/  ";
    expect(baseUrl()).toBe("https://example.test");
    expect(() => new URL(`${baseUrl()}/api/pipeline/step`)).not.toThrow();
    process.env.APP_BASE_URL = prev;
  });
});
