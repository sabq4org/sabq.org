// player_pool — بركة اختيار لاعب (هداف المباراة 300 / أول هداف 200 حاليًا)
// تُقسم بالتساوي على من أصابوا. مباراة بلا أهداف = لا فائزين، والبركة
// تُرحَّل أو تعود متبقيًا حسب carryMode.

import {
  playerPickPayloadSchema,
  playerPickResultSchema,
  playerPoolParamsSchema,
  REASON_CODES,
  STRATEGY_KEYS,
  type PlayerPoolParams,
} from "@shared/predictions";
import type { ScoringStrategy, SettlementInput, StrategyAward, StrategyResult } from "../strategyTypes";

function settle(input: SettlementInput, params: PlayerPoolParams): StrategyResult {
  const result = playerPickResultSchema.parse(input.resultPayload);
  const available = params.basePool + input.carryIn;
  const winningIds = new Set(result.winningPlayerIds);

  const winners = input.entries.flatMap((entry) => {
    const parsed = playerPickPayloadSchema.safeParse(entry.payload);
    if (!parsed.success || !winningIds.has(parsed.data.playerId)) return [];
    return [{ entry, pick: parsed.data }];
  });

  const share = winners.length > 0 ? Math.floor(available / winners.length) : 0;
  const awarded = share * winners.length;
  const leftover = available - awarded;
  const carried = params.carryMode === "none" ? 0 : leftover;
  const remainder = params.carryMode === "none" ? leftover : 0;

  const reasonCode =
    input.contestType === "first_scorer" ? REASON_CODES.FIRST_SCORER : REASON_CODES.SCORER;
  const awards: StrategyAward[] = share > 0
    ? winners.map((w) => ({
        entryId: w.entry.entryId,
        userId: w.entry.userId,
        basePoints: share,
        reasonCode,
        breakdown: {
          reasonCode,
          pickId: w.pick.playerId,
          pickName: w.pick.playerName,
          pool: {
            base: params.basePool,
            carriedIn: input.carryIn,
            tierPoints: share,
            winners: winners.length,
          },
        },
      }))
    : [];

  return { awards, pool: { available, awarded, carried, remainder } };
}

export const playerPoolStrategy: ScoringStrategy<PlayerPoolParams> = {
  key: STRATEGY_KEYS.PLAYER_POOL,
  version: 1,
  validateParams: (params) => playerPoolParamsSchema.parse(params),
  settle,
};
