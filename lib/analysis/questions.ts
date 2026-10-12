const QUESTION_START =
  /^(what|how|which|why|when|where|who|can|could|should|is|are|does|do|did|will|would|any|kya|kaise|kaisa|kaun|kaunsa|konsa|kab|kyu|kyun|kitna|kitne|kahan|kidhar|bhai\s+(kya|kaise|konsa|kaunsa))\b/i;

/** Comments that end in "?" or start with an (English/Hinglish) question word. */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8 || t.length > 300) return false;
  if (/https?:\/\//i.test(t)) return false;
  const stripped = t.replace(/[\s\p{Extended_Pictographic}‍️]+$/u, "");
  return stripped.endsWith("?") || QUESTION_START.test(t);
}

export interface QuestionCandidate {
  text: string;
  likes: number;
  video_id: string;
}

export function topQuestions(cands: QuestionCandidate[], n = 5): QuestionCandidate[] {
  const seen = new Set<string>();
  return cands
    .filter((c) => isQuestion(c.text))
    .sort((a, b) => b.likes - a.likes)
    .filter((c) => {
      const k = c.text.toLowerCase().replace(/\W+/g, " ").trim().slice(0, 60);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, n)
    .map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() }));
}
