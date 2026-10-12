import type { Run } from "../db/schema";
import type { QuotaManager } from "../youtube/quota";
import type { AppConfig } from "../settings";

export const STAGES = [
  "COLLECT",
  "ENRICH",
  "SCORE",
  "CLUSTER",
  "STAGE",
  "SYNTHESIZE",
  "VALIDATE",
  "RENDER",
  "DELIVER",
] as const;
export type Stage = (typeof STAGES)[number];
export type RunStage = "PENDING" | Stage | "DONE";

export const MAX_STAGE_FAILURES = 3;
/** A single stage may re-invoke itself (checkpointed continuation) at most this many times. */
export const MAX_STAGE_INVOCATIONS = 15;

export function nextStage(s: Stage): RunStage {
  const i = STAGES.indexOf(s);
  return i === STAGES.length - 1 ? "DONE" : STAGES[i + 1];
}

export interface StageContext {
  run: Run;
  config: AppConfig;
  quota: QuotaManager;
  /** Previously saved payload for this stage (resuming a checkpointed stage), else null. */
  checkpoint: unknown;
  /** Epoch ms after which a stage should checkpoint and return { done: false }. */
  deadline: number;
  timeLeft: () => number;
  /** Payload of an earlier stage in this run (null if missing/failed). */
  output: <T = unknown>(stage: Stage) => Promise<T | null>;
  countGemini: () => void;
  note: (msg: string) => void;
}

export interface StageResult {
  done: boolean;
  payload: unknown;
}

export type StageFn = (ctx: StageContext) => Promise<StageResult>;
