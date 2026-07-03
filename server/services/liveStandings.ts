/**
 * ترتيب مبدئي لحظي (provisional live standings) — أداة عامة لكل البطولات.
 *
 * تطبّق نتائج المباريات الجارية فوق جدول الترتيب فورًا، فيتحرّك الترتيب مع كل
 * هدف بدل الانتظار حتى صافرة النهاية. لا ازدواج احتساب: المباراة الجارية ليست
 * ضمن «played» الأساسي (لا في API-Football ولا في جدول TheSports الذي لا يضيف
 * النقاط إلا بعد النهاية)، فنضيفها مرّة واحدة فقط ما دامت `live`.
 *
 * تعمل على أي صفّ/مباراة يحقّق الواجهتين الصغيرتين أدناه — فيستخدمها كأس العالم
 * (مجموعات) والبوابة الرياضية (جدول دوري مسطّح) بلا تكرار منطق.
 */

export interface StandingRowLike {
  team: { id: number };
  rank: number;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  live?: boolean;
  // فرق المركز الناتج عن نتائج المباريات الجارية مقارنةً بالجدول الرسمي:
  // موجب = صعد، سالب = هبط، 0/غياب = بلا حراك لحظي (سهم الاتجاه في الواجهة).
  liveDelta?: number;
}

export interface LiveFixtureLike {
  home: { id: number };
  away: { id: number };
  goals: { home: number | null; away: number | null };
  status: { live: boolean; finished: boolean };
}

function applyResult(row: StandingRowLike, scored: number, conceded: number): void {
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalsDiff = row.goalsFor - row.goalsAgainst;
  if (scored > conceded) {
    row.win += 1;
    row.points += 3;
  } else if (scored === conceded) {
    row.draw += 1;
    row.points += 1;
  } else {
    row.lose += 1;
  }
  row.live = true;
}

/**
 * يعيد نسخة من الجدول مع تطبيق المباريات الجارية. يُعيد الصفوف الأصلية كما هي إن
 * لم تمسّ أيّ مباراة جارية هذا الجدول (لا فرز/إعادة ترقيم بلا داعٍ).
 */
export function applyProvisionalTable<T extends StandingRowLike>(
  rows: T[],
  liveFixtures: LiveFixtureLike[],
): T[] {
  const live = liveFixtures.filter((f) => f.status.live && !f.status.finished);
  if (live.length === 0) return rows;
  // المركز الرسمي قبل تطبيق المباريات الجارية — مرجع حساب سهم الحراك اللحظي.
  const baseRank = new Map<number, number>(rows.map((r) => [r.team.id, r.rank]));
  const draft = new Map<number, T>(rows.map((r) => [r.team.id, { ...r }]));
  let changed = false;
  for (const f of live) {
    const home = draft.get(f.home.id);
    const away = draft.get(f.away.id);
    if (!home || !away) continue; // المباراة ليست داخل هذا الجدول
    const gh = f.goals.home ?? 0;
    const ga = f.goals.away ?? 0;
    applyResult(home, gh, ga);
    applyResult(away, ga, gh);
    changed = true;
  }
  if (!changed) return rows;
  const out = [...draft.values()];
  out.sort(
    (a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor,
  );
  out.forEach((r, i) => {
    r.rank = i + 1;
    // موجب = صعد (مركزه الجديد أصغر رقمًا). يشمل فرقًا لم تلعب لكن تخطّاها غيرها.
    const br = baseRank.get(r.team.id);
    r.liveDelta = typeof br === "number" ? br - r.rank : 0;
  });
  return out;
}
