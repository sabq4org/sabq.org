/**
 * اختيار الجولة النشطة لمتصفّح الجولات.
 *
 * المزود (`fixtures/rounds?current=true`) كثيرًا ما يُبقي الجولة المنتهية
 * «حالية» حتى تبدأ التالية. نحن نتقدّم تلقائيًا لأول جولة لم تكتمل كل
 * مبارياتها (أو أول جولة بلا مباريات بعد اكتمال ما قبلها).
 */

export interface RoundChoice {
  key: string;
  label: string;
}

export interface RoundFixtureHint {
  /** تسمية الجولة كما تظهر على المباراة (بعد التعريب) — تطابق `RoundChoice.label`. */
  round: string;
  status: { finished: boolean };
}

/**
 * @param rounds قائمة الجولات بالترتيب الموسمي
 * @param apiCurrent مفتاح المزود الاحتياطي عند غياب المباريات
 * @param fixtures مباريات الموسم (يكفي الحقلان round + finished)
 */
export function pickActiveRoundKey(
  rounds: RoundChoice[],
  apiCurrent: string | null,
  fixtures: RoundFixtureHint[],
): string | null {
  if (rounds.length === 0) return null;

  if (fixtures.length === 0) {
    const idx = apiCurrent ? rounds.findIndex((r) => r.key === apiCurrent) : -1;
    return idx >= 0 ? apiCurrent : rounds[0].key;
  }

  const unfinishedLabels = new Set<string>();
  const seenLabels = new Set<string>();
  for (const f of fixtures) {
    if (!f.round) continue;
    seenLabels.add(f.round);
    if (!f.status.finished) unfinishedLabels.add(f.round);
  }

  for (const r of rounds) {
    if (!seenLabels.has(r.label)) return r.key;
    if (unfinishedLabels.has(r.label)) return r.key;
  }

  return rounds[rounds.length - 1].key;
}
