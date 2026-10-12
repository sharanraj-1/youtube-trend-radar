// Non-AI text similarity: TF-IDF vectors + cosine similarity.

const STOPWORDS = new Set(
  (
    "a an the and or of to in on for with by at from is are was were be this that these those it its as your you we our my i me " +
    "how what why which who when where can will should do does did not no yes vs v/s new latest best top full video videos shorts short " +
    "official hindi english channel subscribe live today week day free tips tricks guide step update updates part ep episode " +
    "hai ke ki ka aur se me mein ko ye yeh wo woh kya kaise kyu kyun bhi par tak hi ho hain hoga sab sabse wala wali wale ek " +
    "2024 2025 2026 2027"
  ).split(/\s+/),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+(?:[.+#][\p{L}\p{N}]+)*/gu) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t),
  );
}

export type Vector = Map<string, number>;

export function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** Smoothed IDF over a corpus of token lists. */
export function buildIdf(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [t, c] of df) idf.set(t, Math.log((1 + n) / (1 + c)) + 1);
  return idf;
}

export function vectorize(tokens: string[], idf: Map<string, number>, defaultIdf = 1): Vector {
  const tf = termFreq(tokens);
  const v: Vector = new Map();
  let norm = 0;
  for (const [t, c] of tf) {
    const w = (1 + Math.log(c)) * (idf.get(t) ?? defaultIdf);
    v.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) for (const [t, w] of v) v.set(t, w / norm);
  return v;
}

/** Cosine similarity of two L2-normalised vectors. */
export function cosine(a: Vector, b: Vector): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) dot += w * o;
  }
  return dot;
}

/** Convenience: similarity of two raw texts within a corpus. */
export function textSimilarity(a: string, b: string, corpus: string[] = [a, b]): number {
  const idf = buildIdf(corpus.map(tokenize));
  return cosine(vectorize(tokenize(a), idf), vectorize(tokenize(b), idf));
}
