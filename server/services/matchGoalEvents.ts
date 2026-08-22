/**
 * أهداف المباراة بعد الإلغاء/التصحيح: لا تُعرض كـ«هدف» إن سقطت من النتيجة.
 * الفار أو تصحيح المزود قد يُبقي حادثة الهدف بينما النتيجة عادت 0-0.
 */

export type GoalEventLike = {
  type: string;
  label: string;
  teamId: number;
  minute?: number | null;
  extra?: number | null;
};

const CANCEL_RE = /ملغ|إلغاء|الغاء|cancel|disallow/i;
const GOAL_WORD_RE = /هدف|goal/i;
const OWN_GOAL_RE = /عكسي|own goal/i;

export function isGoalCancellationText(text: string): boolean {
  return CANCEL_RE.test(text) && GOAL_WORD_RE.test(text);
}

export function isCreditedGoalEvent(e: GoalEventLike): boolean {
  return e.type === "goal" && !isGoalCancellationText(e.label);
}

export function isGoalCancellationEvent(e: GoalEventLike): boolean {
  return isGoalCancellationText(e.label);
}

export function creditsHomeGoal(e: GoalEventLike, homeId: number): boolean {
  const scoredByHome = e.teamId === homeId;
  return OWN_GOAL_RE.test(e.label) ? !scoredByHome : scoredByHome;
}

export function creditedGoalCounts(
  events: GoalEventLike[],
  homeId: number,
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const e of events) {
    if (!isCreditedGoalEvent(e)) continue;
    if (creditsHomeGoal(e, homeId)) home += 1;
    else away += 1;
  }
  return { home, away };
}

function eventSortKey(e: GoalEventLike): number {
  return (e.minute ?? 0) * 100 + (e.extra ?? 0);
}

function dropVarCancelledGoals<T extends GoalEventLike>(events: T[]): T[] {
  const drop = new Set<number>();
  const cancellations = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.type !== "goal" && isGoalCancellationEvent(e));

  for (const { e: cancel } of cancellations) {
    let best = -1;
    let bestKey = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < events.length; i++) {
      if (drop.has(i)) continue;
      const g = events[i];
      if (!isCreditedGoalEvent(g)) continue;
      if (cancel.teamId && g.teamId && cancel.teamId !== g.teamId) continue;
      const gk = eventSortKey(g);
      if (gk > eventSortKey(cancel) + 1) continue;
      if (gk >= bestKey) {
        bestKey = gk;
        best = i;
      }
    }
    if (best >= 0) drop.add(best);
  }

  return events.filter((_, i) => !drop.has(i));
}

function dropGoalsBeyondOfficial<T extends GoalEventLike>(
  events: T[],
  official: { home: number | null; away: number | null },
  homeId: number,
): T[] {
  if (official.home == null && official.away == null) return events;
  const allowedHome = official.home ?? creditedGoalCounts(events, homeId).home;
  const allowedAway = official.away ?? creditedGoalCounts(events, homeId).away;

  const drop = new Set<number>();
  const takeExtras = (wantHome: boolean, allowed: number) => {
    const idxs: number[] = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!isCreditedGoalEvent(e)) continue;
      if (creditsHomeGoal(e, homeId) === wantHome) idxs.push(i);
    }
    idxs.sort((a, b) => eventSortKey(events[a]) - eventSortKey(events[b]));
    for (const i of idxs.slice(Math.max(0, allowed))) drop.add(i);
  };

  takeExtras(true, Math.max(0, allowedHome));
  takeExtras(false, Math.max(0, allowedAway));
  return events.filter((_, i) => !drop.has(i));
}

/**
 * يحذف الهدف المعروض بعد إلغاء الفار، ثم أي أهداف زيادة عن النتيجة الرسمية.
 * أحداث الفار نفسها تبقى (سياق)، وهدف بنص إلغاء لا يُحسب ولا يُعرض كهدف.
 */
export function reconcileMatchGoalEvents<T extends GoalEventLike>(
  events: T[],
  official: { home: number | null; away: number | null },
  homeId: number,
): T[] {
  const withoutFakeGoals = events.filter(
    (e) => !(e.type === "goal" && isGoalCancellationEvent(e)),
  );
  const afterVar = dropVarCancelledGoals(withoutFakeGoals);
  return dropGoalsBeyondOfficial(afterVar, official, homeId);
}
