import { createHmac, timingSafeEqual } from "node:crypto";

export const VOTES = ["up", "down", "filmed"] as const;
export type Vote = (typeof VOTES)[number];

export function signFeedback(clusterId: number, vote: Vote, secret: string): string {
  return createHmac("sha256", secret).update(`feedback:${clusterId}:${vote}`).digest("base64url").slice(0, 32);
}

export function verifyFeedback(clusterId: number, vote: string, sig: string, secret: string): vote is Vote {
  if (!VOTES.includes(vote as Vote) || !Number.isInteger(clusterId) || clusterId <= 0 || !sig) return false;
  const expected = Buffer.from(signFeedback(clusterId, vote as Vote, secret));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function feedbackUrl(base: string, clusterId: number, vote: Vote, secret: string) {
  const q = new URLSearchParams({ c: String(clusterId), v: vote, s: signFeedback(clusterId, vote, secret) });
  return `${base}/api/feedback?${q.toString()}`;
}
