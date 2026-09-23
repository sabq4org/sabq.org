/**
 * ترتيب مبدئي لحظي (provisional live standings) — أداة عامة لكل البطولات.
 *
 * تطبّق نتائج المباريات الجارية فوق جدول الترتيب فورًا، فيتحرّك الترتيب مع كل
 * هدف بدل الانتظار حتى صافرة النهاية. لا ازدواج احتساب: المباراة الجارية ليست
 * ضمن «played» الأساسي (لا في API-Football ولا في جدول TheSports الذي لا يضيف
 * النقاط إلا بعد النهاية)، فنضيفها مرّة واحدة فقط ما دامت `live`.
 *
 * وبعد الصافرة تسدّ `selectUnabsorbedFinished` فجوة الاستيعاب: المزوّد يعيد
 * احتساب جدوله بتأخير قد يبلغ ساعة، فكانت نتيجة المباراة المنتهية تختفي من
 * الترتيب رغم ظهورها أثناء اللعب (حادثة الحزم–أبها، افتتاح روشن 2026-08-13).
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
  /** انطلاق المباراة (Unix ثوانٍ) — تستخدمه selectUnabsorbedFinished لنافذة الحداثة. */
  timestamp?: number;
  /** تسمية الجولة كما تعيدها الخدمة — لحصر الالتقاط في جولات تُحسب في الجدول فعلًا. */
  round?: string;
}

function applyResult(row: StandingRowLike, scored: number, conceded: number, asLive: boolean): void {
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
  // المنتهية المعلّقة لا تحمل شارة «مباشر» — الأرقام فقط (المباراة انتهت فعلًا).
  if (asLive) row.live = true;
}

/**
 * يعيد نسخة من الجدول مع تطبيق المباريات الجارية، وكذلك المنتهية المعلّقة
 * (`pendingFinished` من selectUnabsorbedFinished) التي لم يستوعبها جدول المزوّد
 * بعد. يُعيد الصفوف الأصلية كما هي إن لم تمسّ أيّ مباراة هذا الجدول.
 *
 * عقد المُستدعي: مرّر القائمتين من قائمة مباريات موحّدة واحدة (صفّ الجارية يعلو
 * صفّ الموسم بنفس المعرّف) — فكل مباراة إمّا جارية أو منتهية، ولا تُطبَّق مرتين.
 */
export function applyProvisionalTable<T extends StandingRowLike>(
  rows: T[],
  liveFixtures: LiveFixtureLike[],
  pendingFinished: LiveFixtureLike[] = [],
): T[] {
  const live = liveFixtures.filter((f) => f.status.live && !f.status.finished);
  const pending = pendingFinished.filter((f) => f.status.finished);
  if (live.length === 0 && pending.length === 0) return rows;
  // المركز الرسمي قبل تطبيق المباريات الجارية — مرجع حساب سهم الحراك اللحظي.
  const baseRank = new Map<number, number>(rows.map((r) => [r.team.id, r.rank]));
  const draft = new Map<number, T>(rows.map((r) => [r.team.id, { ...r }]));
  let changed = false;
  for (const asLive of [true, false]) {
    for (const f of asLive ? live : pending) {
      const home = draft.get(f.home.id);
      const away = draft.get(f.away.id);
      if (!home || !away) continue; // المباراة ليست داخل هذا الجدول
      const gh = f.goals.home ?? 0;
      const ga = f.goals.away ?? 0;
      applyResult(home, gh, ga, asLive);
      applyResult(away, ga, gh, asLive);
      changed = true;
    }
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

// لا تُلتقط إلا المنتهية حديثًا: يحدّ من أثر أي شذوذ في بيانات المزوّد (مباراة
// محسومة إداريًّا لا يعدّها الجدول مثلًا) — بعد النافذة يعود الرسمي مرجعًا وحيدًا.
const PENDING_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * يلتقط المباريات المنتهية التي لم يستوعبها جدول المزوّد الرسمي بعد، لتُطبَّق
 * مبدئيًّا عبر `applyProvisionalTable` فلا تختفي نتيجتها في فجوة ما بعد الصافرة.
 *
 * الكشف بفرق العدّاد لا بطوابع الوقت: المباراة «معلّقة» إذا كان `played` لكلا
 * فريقيها في الجدول الرسمي أقلّ من عدد مبارياتهما المنتهية المحسوبة — فيستحيل
 * الازدواج (إن استوعبها المزوّد تطابق العدّان وسقطت تلقائيًّا). الاستيعاب يجري
 * زمنيًّا، فالمعلّقة لكل فريق هي الأحدث في قائمة منتهياته، وتُشترط في الفريقين
 * معًا حتى لا يُنسب نقصُ فريقٍ لمباراة أخرى.
 *
 * `fixtures` قائمة الموسم الكاملة (بعد إعلاء صفوف الجارية) — عالم العدّ نفسه
 * الذي يعدّه المزوّد؛ و`isCountedRound` يحصر العدّ في جولات تدخل الجدول فعلًا
 * (يستبعد الملحق والأدوار الإقصائية).
 */
export function selectUnabsorbedFinished<F extends LiveFixtureLike>(
  rows: StandingRowLike[],
  fixtures: F[],
  opts: {
    isCountedRound?: (round: string | undefined) => boolean;
    nowMs?: number;
    windowMs?: number;
  } = {},
): F[] {
  if (rows.length === 0 || fixtures.length === 0) return [];
  const counted = opts.isCountedRound ?? (() => true);
  const nowMs = opts.nowMs ?? Date.now();
  const windowMs = opts.windowMs ?? PENDING_WINDOW_MS;
  const played = new Map<number, number>(rows.map((r) => [r.team.id, r.played]));
  const eligible = fixtures
    .filter(
      (f) =>
        f.status.finished && counted(f.round) && played.has(f.home.id) && played.has(f.away.id),
    )
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  if (eligible.length === 0) return [];
  const byTeam = new Map<number, F[]>();
  for (const f of eligible) {
    for (const id of [f.home.id, f.away.id]) {
      const list = byTeam.get(id);
      if (list) list.push(f);
      else byTeam.set(id, [f]);
    }
  }
  // عدد ترشيحات المباراة (من فريقيها): تُختار فقط إذا رشّحها الاثنان معًا.
  const votes = new Map<F, number>();
  for (const [teamId, list] of byTeam) {
    const missing = list.length - (played.get(teamId) ?? 0);
    for (let i = Math.max(0, list.length - missing); i < list.length; i++) {
      votes.set(list[i], (votes.get(list[i]) ?? 0) + 1);
    }
  }
  return eligible.filter(
    (f) =>
      votes.get(f) === 2 &&
      f.goals.home != null &&
      f.goals.away != null &&
      typeof f.timestamp === "number" &&
      nowMs - f.timestamp * 1000 <= windowMs,
  );
}

/**
 * يطبّق الترتيب المبدئي على جداول مجموعات (كأس آسيا / خليجي / …).
 * المباريات الجارية تُفلتر داخليًّا؛ إن لم تمسّ مجموعةً تُعاد كما هي.
 */
export function applyProvisionalGroups<T extends StandingRowLike, G extends { rows: T[] }>(
  groups: G[],
  liveFixtures: LiveFixtureLike[],
): G[] {
  const live = liveFixtures.filter((f) => f.status.live && !f.status.finished);
  if (live.length === 0) return groups;
  return groups.map((g) => ({
    ...g,
    rows: applyProvisionalTable(g.rows, live),
  }));
}

/**
 * جولات تُحسب في جدول الترتيب: «الجولة N» للدوريات (وصيغتها الإنجليزية Round N)
 * و«مرحلة الدوري» لأبطال أوروبا/يوروبا — دون الملحق والأدوار الإقصائية التي لا
 * يعدّها جدول المزوّد. حقل round معرَّب في SplFixture، فالمطابقة على التسميات.
 */
export function isLeagueTableRound(round: string | undefined): boolean {
  if (!round) return false;
  return /^(الجولة|Round)\s*\d+$/.test(round) || /مرحلة الدوري|League (Phase|Stage)/i.test(round);
}

/**
 * قائمة موسم موحّدة: صفّ المباراة الجارية (الأدقّ لحظيًّا — TheSports يعلن النهاية
 * قبل كاش الموسم) يعلو صفّ الموسم بنفس المعرّف، فكل مباراة تظهر مرة واحدة إمّا
 * جارية أو منتهية — شرط applyProvisionalTable ضد الازدواج.
 */
export function mergeSeasonWithLive<F extends { id: number }>(seasonFx: F[], live: F[]): F[] {
  if (live.length === 0) return seasonFx;
  const liveById = new Map(live.map((f) => [f.id, f]));
  const seen = new Set(seasonFx.map((f) => f.id));
  return [...seasonFx.map((f) => liveById.get(f.id) ?? f), ...live.filter((f) => !seen.has(f.id))];
}

