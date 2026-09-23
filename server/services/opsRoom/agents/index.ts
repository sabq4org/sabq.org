/** سجل منفّذي الوكلاء — المفتاح slug من OPS_AGENTS. */
import type { OpsAgentSlug } from "@shared/opsRoom";
import type { OpsAgentHandler } from "../types";
import { adasaAgent, mizanAgent, murasilAgent, muwathiqAgent, qalamAgent, rasedAgent, saaiAgent, sabbaqAgent } from "./core";
import { daleelAgent, haresAgent, infoxAgent, maydanAgent, nabdAgent, omqAgent, rishaAgent, sadaAgent } from "./prompted";

export const OPS_AGENT_HANDLERS: Record<OpsAgentSlug, OpsAgentHandler> = {
  rased: rasedAgent,
  muwathiq: muwathiqAgent,
  murasil: murasilAgent,
  sabbaq: sabbaqAgent,
  qalam: qalamAgent,
  maydan: maydanAgent,
  infox: infoxAgent,
  adasa: adasaAgent,
  risha: rishaAgent,
  sada: sadaAgent,
  hares: haresAgent,
  nabd: nabdAgent,
  daleel: daleelAgent,
  saai: saaiAgent,
  mizan: mizanAgent,
  omq: omqAgent,
};
