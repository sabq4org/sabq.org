export type GcChampionSettlementPick = {
  id: string;
  userId: string;
  teamId: number | null;
  settledAt: Date | null;
};

/**
 * Build a stable retry plan from every champion vote. The pool denominator is
 * all correct voters, not only still-pending rows, so a partial retry cannot
 * increase later winners' shares. Incorrect pending rows remain settleable even
 * when nobody selected the eventual champion.
 */
export function planGcChampionSettlement(
  rows: GcChampionSettlementPick[],
  championId: number,
  pool: number,
) {
  const winners = rows.filter((row) => row.teamId === championId);
  return {
    share: winners.length > 0 ? Math.floor(pool / winners.length) : 0,
    winners,
    pendingWinners: winners.filter((row) => row.settledAt == null),
    pendingLosers: rows.filter((row) => row.teamId !== championId && row.settledAt == null),
  };
}
