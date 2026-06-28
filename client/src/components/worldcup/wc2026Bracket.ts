/**
 * البنية الرسمية لشجرة الأدوار الإقصائية — كأس العالم 2026 (FIFA).
 *
 * المصدر (API-Football) يعطينا مباريات دور الـ32 بفرقها الحقيقية لكنه لا يحمل
 * رقم المباراة الرسمي ولا موضعها في الشجرة (كلها `round = "Round of 32"`). لذا
 * نُثبّت هنا البنية الرسمية المعتمدة (أرقام المباريات 73–104 ومصادر كل مباراة)،
 * ونربط مباريات الاشتراك بها:
 *   • دور الـ32: جسر مباشر `fixture.id` → رقم المباراة (مؤكَّد من الاشتراك 2026-06-28).
 *   • الأدوار التالية: تسلسل تلقائي عبر مطابقة فرق المباراة بالفائزَين من مصدريها
 *     (لا أرقام ثابتة — يعمل فور حسم المباريات السابقة).
 */
import type { WcFixture, WcTeam } from "./wcTypes";

export const WC_ROUND_KEYS = [
  "round of 32",
  "round of 16",
  "quarter-finals",
  "semi-finals",
  "final",
] as const;
export type WcRoundKey = (typeof WC_ROUND_KEYS)[number];

export const WC_ROUND_LABELS: Record<WcRoundKey, string> = {
  "round of 32": "دور الـ32",
  "round of 16": "دور الـ16",
  "quarter-finals": "دور الـ8",
  "semi-finals": "دور الـ4",
  final: "النهائي",
};

/**
 * ترتيب الشجرة (أعلى ← أسفل) بأرقام المباريات الرسمية لكل دور. الترتيب مشتقّ من
 * المصادر أدناه بحيث يكون كل زوج متتالٍ في الدور يغذّي مباراة الدور التالي مباشرة
 * (slot[2i], slot[2i+1] ← slot[i])، فتبقى المواجهات المستقبلية صحيحة بنيويًّا.
 */
export const WC2026_TREE: Record<WcRoundKey, number[]> = {
  "round of 32": [74, 77, 73, 75, 83, 84, 81, 82, 76, 78, 79, 80, 86, 88, 85, 87],
  "round of 16": [89, 90, 93, 94, 91, 92, 95, 96],
  "quarter-finals": [97, 98, 99, 100],
  "semi-finals": [101, 102],
  final: [104],
};

/** مصدرا كل مباراة (الفائزان من مباراتَي الدور السابق) — رسميًّا من FIFA. */
export const WC2026_SOURCES: Record<number, [number, number]> = {
  89: [74, 77],
  90: [73, 75],
  91: [76, 78],
  92: [79, 80],
  93: [83, 84],
  94: [81, 82],
  95: [86, 88],
  96: [85, 87],
  97: [89, 90],
  98: [93, 94],
  99: [91, 92],
  100: [95, 96],
  101: [97, 98],
  102: [99, 100],
  104: [101, 102],
};

/** مباراة المركز الثالث — الخاسران من نصفَي النهائي (101 و102). */
export const WC2026_THIRD_PLACE_NO = 103;

/**
 * جسر معرّف مباراة API-Football → رقم المباراة الرسمي لدور الـ32.
 * مؤكَّد من الاشتراك (league=1, season=2026) بتاريخ 2026-06-28. معرّفات API-Football
 * ثابتة لكل مباراة طوال البطولة حتى لو تغيّرت الفرق بعد حسم المجموعات.
 */
export const WC2026_R32_FIXTURE_TO_MATCH: Record<number, number> = {
  1561329: 73, // South Africa vs Canada
  1565176: 74, // Germany vs Paraguay
  1562345: 75, // Netherlands vs Morocco
  1562344: 76, // Brazil vs Japan
  1565177: 77, // France vs Sweden
  1564789: 78, // Ivory Coast vs Norway
  1567306: 79, // Mexico vs Ecuador
  1567307: 80, // England vs DR Congo
  1562586: 81, // USA vs Bosnia & Herzegovina
  1567308: 82, // Belgium vs Senegal
  1567309: 83, // Portugal vs Croatia
  1567311: 84, // Spain vs Austria
  1567312: 85, // Switzerland vs Algeria
  1565179: 86, // Argentina vs Cape Verde
  1567310: 87, // Colombia vs Ghana
  1565178: 88, // Australia vs Egypt
};

/** الدور الرسمي لكل رقم مباراة (مشتقّ من الشجرة). */
const MATCH_ROUND: Record<number, WcRoundKey> = (() => {
  const out: Record<number, WcRoundKey> = {};
  for (const key of WC_ROUND_KEYS) for (const no of WC2026_TREE[key]) out[no] = key;
  return out;
})();

/** يردّ الدور الإقصائي القانوني لاسم الدور الخام من API-Football (أو null). */
export function canonKnockoutRound(roundEn: string): WcRoundKey | null {
  const r = (roundEn || "").trim().toLowerCase();
  if (r.startsWith("round of 32")) return "round of 32";
  if (r.startsWith("round of 16")) return "round of 16";
  if (r.startsWith("quarter")) return "quarter-finals";
  if (r.startsWith("semi")) return "semi-finals";
  if (r === "final") return "final";
  return null;
}

const THIRD_PLACE_KEYS = new Set(["3rd place final", "third place", "3rd place", "play-off for third place"]);
export function isThirdPlaceRound(roundEn: string): boolean {
  return THIRD_PLACE_KEYS.has((roundEn || "").trim().toLowerCase());
}

/** معرّف الفريق الفائز في مباراة محسومة (يشمل ركلات الترجيح)، وإلا null. */
function winnerTeamId(fx?: WcFixture): number | null {
  if (!fx || !fx.status.finished) return null;
  if (fx.home.winner === true) return fx.home.id || null;
  if (fx.away.winner === true) return fx.away.id || null;
  const hg = fx.goals.home ?? 0;
  const ag = fx.goals.away ?? 0;
  if (hg !== ag) return (hg > ag ? fx.home.id : fx.away.id) || null;
  if (fx.penalties) {
    const hp = fx.penalties.home ?? 0;
    const ap = fx.penalties.away ?? 0;
    if (hp !== ap) return (hp > ap ? fx.home.id : fx.away.id) || null;
  }
  return null;
}

/** الفريق الفائز ككائن كامل (شعار + اسم) — لـ«ترقية» الفائز إلى الفرع التالي بصريًّا. */
function winnerTeam(fx?: WcFixture): WcTeam | undefined {
  const id = winnerTeamId(fx);
  if (!fx || id == null) return undefined;
  return fx.home.id === id ? fx.home : fx.away;
}

/**
 * يربط مباريات الاشتراك بأرقامها الرسمية:
 *   • دور الـ32 عبر الجسر المباشر `fixture.id`.
 *   • بقية الأدوار عبر مطابقة فرق المباراة بالفائزَين من مصدريها (تسلسليًّا).
 * يردّ خريطة رقم المباراة → المباراة الحيّة.
 */
export function buildMatchIndex(fixtures: WcFixture[]): Map<number, WcFixture> {
  const byMatch = new Map<number, WcFixture>();
  const used = new Set<number>();

  // مباريات الأدوار الإقصائية فقط، مُجمَّعة حسب الدور القانوني (نتجنّب التقاط مباراة
  // دور المجموعات بالخطأ عند مطابقة الفرق في الأدوار التالية).
  const byRound = new Map<WcRoundKey, WcFixture[]>();
  let thirdPlaceFixture: WcFixture | undefined;
  for (const fx of fixtures) {
    if (isThirdPlaceRound(fx.roundEn)) {
      thirdPlaceFixture = thirdPlaceFixture ?? fx;
      continue;
    }
    const round = canonKnockoutRound(fx.roundEn);
    if (!round) continue;
    const arr = byRound.get(round) ?? [];
    arr.push(fx);
    byRound.set(round, arr);
  }

  // دور الـ32: الجسر المباشر بالمعرّف.
  for (const fx of byRound.get("round of 32") ?? []) {
    const no = WC2026_R32_FIXTURE_TO_MATCH[fx.id];
    if (no != null && !byMatch.has(no)) {
      byMatch.set(no, fx);
      used.add(fx.id);
    }
  }

  // الأدوار التالية: مطابقة الفرق بالفائزَين من المصدرين (تصاعديًّا فتُحسب المصادر أولًا).
  const order = [89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 104];
  for (const no of order) {
    if (byMatch.has(no)) continue;
    const [a, b] = WC2026_SOURCES[no];
    const wantA = winnerTeamId(byMatch.get(a));
    const wantB = winnerTeamId(byMatch.get(b));
    if (wantA == null || wantB == null) continue;
    const pool = byRound.get(MATCH_ROUND[no]) ?? [];
    const fx = pool.find(
      (f) =>
        !used.has(f.id) &&
        f.home.id &&
        f.away.id &&
        ((f.home.id === wantA && f.away.id === wantB) || (f.home.id === wantB && f.away.id === wantA)),
    );
    if (fx) {
      byMatch.set(no, fx);
      used.add(fx.id);
    }
  }

  // المركز الثالث: الخاسران من 101 و102 (أو نأخذ مباراة الدور الموسومة مباشرة).
  if (thirdPlaceFixture) {
    byMatch.set(WC2026_THIRD_PLACE_NO, thirdPlaceFixture);
  }

  return byMatch;
}

export interface WcBracketSlot {
  matchNo: number;
  fixture?: WcFixture;
  /** مصدرا المباراة (للوسوم «الفائز من مباراة …») — غير موجود لدور الـ32. */
  sources?: [number, number];
  /** الفائز المُرقَّى من المصدر الأعلى قبل أن يجدول المزوّد هذه المباراة (إن حُسم). */
  topTeam?: WcTeam;
  /** الفائز المُرقَّى من المصدر الأسفل قبل أن يجدول المزوّد هذه المباراة (إن حُسم). */
  bottomTeam?: WcTeam;
}

export interface WcBracketColumn {
  key: WcRoundKey;
  label: string;
  roundIndex: number;
  slots: WcBracketSlot[];
}

export interface WcBracketModel {
  columns: WcBracketColumn[];
  thirdPlace?: WcFixture;
  /** هل تتوفّر أي مباراة إقصائية فعليًّا (تُحدّد عرض الشجرة مقابل شاشة الانتظار). */
  hasAny: boolean;
}

/** يبني نموذج الشجرة الكامل (الأعمدة + الخانات + المركز الثالث) من مباريات الاشتراك. */
export function buildBracketModel(fixtures: WcFixture[]): WcBracketModel {
  const byMatch = buildMatchIndex(fixtures);
  const columns: WcBracketColumn[] = WC_ROUND_KEYS.map((key, roundIndex) => ({
    key,
    label: WC_ROUND_LABELS[key],
    roundIndex,
    slots: WC2026_TREE[key].map((matchNo) => {
      const fixture = byMatch.get(matchNo);
      const sources = WC2026_SOURCES[matchNo];
      const slot: WcBracketSlot = { matchNo, fixture, sources };
      // قبل أن ينشر المزوّد مباراة الدور التالي بفِرَقها: نُرقّي الفائز من كل مصدر
      // محسوم فيظهر مباشرةً في فرعه الصحيح.
      if (!fixture && sources) {
        slot.topTeam = winnerTeam(byMatch.get(sources[0]));
        slot.bottomTeam = winnerTeam(byMatch.get(sources[1]));
      }
      return slot;
    }),
  }));
  const hasAny = columns.some((c) => c.slots.some((s) => s.fixture));
  return { columns, thirdPlace: byMatch.get(WC2026_THIRD_PLACE_NO), hasAny };
}
