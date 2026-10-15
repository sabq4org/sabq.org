/**
 * أهداف المباراة بعد الإلغاء/التصحيح: لا تُعرض كـ«هدف» إن سقطت من النتيجة.
 * الفار أو تصحيح المزود قد يُبقي حادثة الهدف بينما النتيجة عادت 0-0.
 *
 * القاعدة الحاكمة: النتيجة الرسمية هي الحكم. لا يُحذف أي هدف ما دام عدد
 * الأهداف المعروضة ≤ النتيجة — فالمزود كثيرًا ما يحذف حادثة الهدف الملغى
 * بنفسه ويُبقي صف الفار وحده كسياق، وحذفٌ إضافي عندنا يأكل هدفًا صحيحًا
 * (حادثة الخلود × التعاون 2026-08-22: هدف الدقيقة 30 اختفى). حوادث الإلغاء
 * تُستخدم فقط لاختيار الهدف الأولى بالحذف عند وجود فائض فعلي.
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

/**
 * يحذف من أهداف جهةٍ واحدة (home أو away) ما زاد عن النتيجة الرسمية.
 * الأولوية بالحذف: الهدف الأقرب قبل حادثة إلغاء (فار) لنفس الجهة، ثم الأحدث.
 */
function dropSideExcess<T extends GoalEventLike>(
  events: T[],
  drop: Set<number>,
  homeId: number,
  wantHome: boolean,
  excess: number,
): void {
  if (excess <= 0) return;

  const goalIdxs: number[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!isCreditedGoalEvent(e)) continue;
    if (creditsHomeGoal(e, homeId) === wantHome) goalIdxs.push(i);
  }

  const cancels = events.filter(
    (e) =>
      e.type !== "goal" &&
      isGoalCancellationEvent(e) &&
      creditsHomeGoal(e, homeId) === wantHome,
  );

  const victims = new Set<number>();

  // أولًا: الهدف المقترن بكل إلغاء — الأحدث الذي وقع حتى دقيقة الإلغاء (+1 سماحية).
  for (const cancel of cancels) {
    if (victims.size >= excess) break;
    let best = -1;
    let bestKey = Number.NEGATIVE_INFINITY;
    for (const i of goalIdxs) {
      if (victims.has(i)) continue;
      const gk = eventSortKey(events[i]);
      if (gk > eventSortKey(cancel) + 1) continue;
      if (gk >= bestKey) {
        bestKey = gk;
        best = i;
      }
    }
    if (best >= 0) victims.add(best);
  }

  // ثم: الأحدث فالأحدث حتى يُستوفى الفائض.
  const byKeyDesc = goalIdxs
    .filter((i) => !victims.has(i))
    .sort((a, b) => eventSortKey(events[b]) - eventSortKey(events[a]));
  for (const i of byKeyDesc) {
    if (victims.size >= excess) break;
    victims.add(i);
  }

  for (const i of victims) drop.add(i);
}

/**
 * يوفّق قائمة الأحداث مع النتيجة الرسمية:
 * - هدفٌ نصُّه نص إلغاء لا يُحسب ولا يُعرض كهدف (يسقط من القائمة).
 * - إن زادت الأهداف المعروضة عن النتيجة الرسمية حُذف الفائض فقط، بدءًا
 *   بالهدف المقترن بإلغاء الفار ثم الأحدث.
 * - إن كانت الأهداف ≤ النتيجة فلا يُحذف شيء — حتى مع وجود حادثة إلغاء،
 *   لأن المزود غالبًا حذف الهدف الملغى بنفسه وأبقى صف الفار كسياق.
 * أحداث الفار نفسها تبقى دائمًا (سياق).
 */
export function reconcileMatchGoalEvents<T extends GoalEventLike>(
  events: T[],
  official: { home: number | null; away: number | null },
  homeId: number,
): T[] {
  const kept = events.filter(
    (e) => !(e.type === "goal" && isGoalCancellationEvent(e)),
  );
  if (official.home == null && official.away == null) return kept;

  const credited = creditedGoalCounts(kept, homeId);
  const drop = new Set<number>();
  if (official.home != null) {
    dropSideExcess(kept, drop, homeId, true, credited.home - official.home);
  }
  if (official.away != null) {
    dropSideExcess(kept, drop, homeId, false, credited.away - official.away);
  }
  if (drop.size === 0) return kept;
  return kept.filter((_, i) => !drop.has(i));
}
