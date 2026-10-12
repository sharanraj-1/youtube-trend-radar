import { describe, expect, it } from "vitest";
import { isShort, parseIsoDuration } from "@/lib/youtube/duration";

describe("parseIsoDuration", () => {
  it.each([
    ["PT45S", 45],
    ["PT1M", 60],
    ["PT3M", 180],
    ["PT3M1S", 181],
    ["PT1H2M3S", 3723],
    ["PT10H", 36000],
    ["P1DT2H", 93600],
    ["P0D", 0],
    ["PT1.5S", 2],
    ["P1W", 604800],
  ])("%s -> %d", (iso, secs) => expect(parseIsoDuration(iso)).toBe(secs));

  it.each([null, undefined, "", "P", "PT", "1H2M", "garbage", "PT-5S"])("rejects %s", (iso) =>
    expect(parseIsoDuration(iso as string)).toBeNull(),
  );
});

describe("isShort", () => {
  it("treats <= 180s as a Short", () => {
    expect(isShort(59)).toBe(true);
    expect(isShort(180)).toBe(true);
    expect(isShort(181)).toBe(false);
    expect(isShort(0)).toBe(false);
    expect(isShort(null)).toBe(false);
  });
});

import { languageAllowed } from "@/lib/pipeline/stages/collect";
describe("languageAllowed", () => {
  const mk = (title: string, lang?: string) =>
    ({ id: "x", snippet: { title, publishedAt: "", channelId: "c", description: "", defaultAudioLanguage: lang } }) as never;
  it("keeps English, Hindi and Hinglish; drops other declared languages and scripts", () => {
    expect(languageAllowed(mk("Best AI tools 2026"), ["en", "hi"])).toBe(true);
    expect(languageAllowed(mk("Cursor AI से कोडिंग कैसे करें"), ["en", "hi"])).toBe(true);
    expect(languageAllowed(mk("Anything", "en-IN"), ["en", "hi"])).toBe(true);
    expect(languageAllowed(mk("Ragazzino sviluppa un tool AI", "it"), ["en", "hi"])).toBe(false);
    expect(languageAllowed(mk("ИИ-БЛОГЕР ДЛЯ ТВОЕГО БИЗНЕСА"), ["en", "hi"])).toBe(false);
    expect(languageAllowed(mk("બારેજાધામના તમામ સેવકો માટે અગત્યની સૂચના"), ["en", "hi"])).toBe(false);
  });
});
