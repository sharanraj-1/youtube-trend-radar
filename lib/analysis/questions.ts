const EN_START = /^(what|how|which|why|when|where|who|can|could|should|is|are|does|do|did|will|would|any)(?![''’]t)\b/i;
const HI_START = /^(kya|kaise|kaisa|kaun|kaunsa|konsa|kab|kyu|kyun|kitna|kitne|kahan|kidhar|bhai\s+(kya|kaise|konsa|kaunsa))\b/i;

const stripTrailing = (t: string) => t.replace(/[\s\p{Extended_Pictographic}‍️]+$/u, "");

/**
 * Comments that end in "?" or start with a question word. English question-word starts must not end like a
 * statement ("What a great video!"); Hinglish starts ("kaise activate kare") rarely carry a "?" so are accepted.
 */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 300) return false;
  if (/https?:\/\//i.test(t)) return false;
  // Same language gate as videos: mostly Latin (English/Hinglish) or Devanagari (Hindi).
  const letters = t.match(/\p{L}/gu) ?? [];
  if (letters.length && letters.filter((c) => /[A-Za-z\u0900-\u097F]/.test(c)).length / letters.length < 0.7) return false;
  const end = stripTrailing(t);
  if (end.endsWith("?")) return true;
  if (HI_START.test(t)) return true;
  return EN_START.test(t) && !/[.!]$/.test(end) && !/^what an?\b/i.test(t);
}

export interface QuestionCandidate {
  text: string;
  likes: number;
  video_id: string;
}

/** Top N by likes, explicit "?" questions first, de-duplicated. */
export function topQuestions(cands: QuestionCandidate[], n = 5): QuestionCandidate[] {
  const seen = new Set<string>();
  const explicit = (c: QuestionCandidate) => (stripTrailing(c.text.trim()).endsWith("?") ? 1 : 0);
  return cands
    .filter((c) => isQuestion(c.text))
    .sort((a, b) => explicit(b) - explicit(a) || b.likes - a.likes)
    .filter((c) => {
      const k = c.text.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, n)
    .map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() }));
}
