import type { Stage, StageFn } from "../types";
import { collect } from "./collect";
import { enrich } from "./enrich";
import { score } from "./score";
import { cluster } from "./cluster";
import { stage } from "./stage";
import { synthesize } from "./synthesize";
import { validate } from "./validate";
import { render } from "./render";
import { deliver } from "./deliver";

export const STAGE_FNS: Record<Stage, StageFn> = {
  COLLECT: collect,
  ENRICH: enrich,
  SCORE: score,
  CLUSTER: cluster,
  STAGE: stage,
  SYNTHESIZE: synthesize,
  VALIDATE: validate,
  RENDER: render,
  DELIVER: deliver,
};
