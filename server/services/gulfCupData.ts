/**
 * البيانات الثابتة الرسمية لـ«خليجي 27» (كأس الخليج العربي 27 — جدة 2026).
 *
 * لماذا ثابتة: حتى تاريخه لم يُنشئ API-Football موسم 2026 للبطولة (league=25)،
 * فنعتمد الجدول الرسمي المعتمد من اتحاد كأس الخليج (AGCFF) — القرعة سُحبت في جدة
 * (مايو 2026) واعتُمد الجدول الكامل. متى أضاف المزوّد الموسم، يدمج `gulfCupService`
 * النتائج/الحالات الحيّة فوق هذا الأساس تلقائيًّا مع إبقاء معرّف سبق الداخلي
 * ثابتًا؛ معرّف المزوّد يبقى حقل إثراء منفصلًا.
 *
 * المصدر: الجدول الرسمي لقرعة خليجي 27 (AGCFF). كل التوقيتات بتوقيت الرياض (+03:00).
 * معرّفات المنتخبات هي معرّفات API-Football الوطنية (مؤكَّدة من نسخة 2024).
 */

export const GC_HOST = "المملكة العربية السعودية";
export const GC_HOST_CITY = "جدة";

/** ملعبا الاستضافة في جدة. */
export const GC_VENUES = {
  KASC: { name: "مدينة الملك عبدالله الرياضية", city: "جدة" },
  PAF: { name: "ملعب الأمير عبدالله الفيصل", city: "جدة" },
} as const;

type VenueKey = keyof typeof GC_VENUES;

/** عضوية المجموعتين (معرّف API-Football). السعودية المضيف على رأس المجموعة الأولى. */
export const GC_GROUPS: { name: string; teamIds: number[] }[] = [
  { name: "المجموعة الأولى", teamIds: [23, 1567, 1552, 1570] }, // السعودية، العراق، عُمان، الكويت
  { name: "المجموعة الثانية", teamIds: [1563, 1569, 1547, 1550] }, // الإمارات، قطر، البحرين، اليمن
];

/** كل المنتخبات المشاركة (مستخلصة من المجموعات) — مرتّبة لاحقًا في الخدمة. */
export const GC_TEAM_IDS: number[] = GC_GROUPS.flatMap((g) => g.teamIds);

export interface GcSeedFixture {
  /** معرّف سبق الداخلي الدائم؛ لا يُستبدل بمعرّف أي مزوّد. */
  id: number;
  /** رقم المباراة الرسمي في الجدول (1..15). */
  matchNo: number;
  /** وقت الانطلاق ISO بتوقيت الرياض (+03:00). */
  kickoff: string;
  venue: VenueKey;
  /** اسم الدور بالإنجليزية (متوافق مع localizeRound وبناء المجموعات). */
  roundEn: string;
  /** معرّف المضيف/الضيف — null للأدوار الإقصائية قبل تحدّد المتأهلين. */
  homeId: number | null;
  awayId: number | null;
  /** وصف بديل للطرفين في الأدوار الإقصائية (قبل التحديد). */
  homePlaceholder?: string;
  awayPlaceholder?: string;
  /** مجموعات المرشحين لكل فتحة knockout؛ تثبّت الهوية عند التأجيل. */
  homeCandidateIds?: readonly number[];
  awayCandidateIds?: readonly number[];
}

// دور المجموعات (12 مباراة) ثم نصفا النهائي والنهائي (3 مباريات). التوقيتات +03:00.
export const GC_FIXTURES: GcSeedFixture[] = [
  // ── الجولة الأولى ──
  { id: 27000001, matchNo: 1, kickoff: "2026-09-23T21:00:00+03:00", venue: "KASC", roundEn: "Group Stage - 1", homeId: 23, awayId: 1570 },
  { id: 27000002, matchNo: 2, kickoff: "2026-09-23T17:30:00+03:00", venue: "PAF", roundEn: "Group Stage - 1", homeId: 1567, awayId: 1552 },
  { id: 27000003, matchNo: 3, kickoff: "2026-09-24T18:00:00+03:00", venue: "KASC", roundEn: "Group Stage - 1", homeId: 1550, awayId: 1563 },
  { id: 27000004, matchNo: 4, kickoff: "2026-09-24T21:00:00+03:00", venue: "PAF", roundEn: "Group Stage - 1", homeId: 1547, awayId: 1569 },
  // ── الجولة الثانية ──
  { id: 27000005, matchNo: 5, kickoff: "2026-09-26T18:00:00+03:00", venue: "PAF", roundEn: "Group Stage - 2", homeId: 1567, awayId: 1570 },
  { id: 27000006, matchNo: 6, kickoff: "2026-09-26T21:00:00+03:00", venue: "KASC", roundEn: "Group Stage - 2", homeId: 23, awayId: 1552 },
  { id: 27000007, matchNo: 7, kickoff: "2026-09-27T18:00:00+03:00", venue: "KASC", roundEn: "Group Stage - 2", homeId: 1569, awayId: 1550 },
  { id: 27000008, matchNo: 8, kickoff: "2026-09-27T21:00:00+03:00", venue: "PAF", roundEn: "Group Stage - 2", homeId: 1563, awayId: 1547 },
  // ── الجولة الثالثة ──
  { id: 27000009, matchNo: 9, kickoff: "2026-09-29T20:30:00+03:00", venue: "KASC", roundEn: "Group Stage - 3", homeId: 1567, awayId: 23 },
  { id: 27000010, matchNo: 10, kickoff: "2026-09-29T20:30:00+03:00", venue: "PAF", roundEn: "Group Stage - 3", homeId: 1570, awayId: 1552 },
  { id: 27000011, matchNo: 11, kickoff: "2026-09-30T20:30:00+03:00", venue: "KASC", roundEn: "Group Stage - 3", homeId: 1569, awayId: 1563 },
  { id: 27000012, matchNo: 12, kickoff: "2026-09-30T20:30:00+03:00", venue: "PAF", roundEn: "Group Stage - 3", homeId: 1550, awayId: 1547 },
  // ── نصف النهائي ──
  { id: 27000013, matchNo: 13, kickoff: "2026-10-03T18:00:00+03:00", venue: "KASC", roundEn: "Semi-finals", homeId: null, awayId: null, homePlaceholder: "أول المجموعة الأولى", awayPlaceholder: "ثاني المجموعة الثانية", homeCandidateIds: GC_GROUPS[0].teamIds, awayCandidateIds: GC_GROUPS[1].teamIds },
  { id: 27000014, matchNo: 14, kickoff: "2026-10-03T20:30:00+03:00", venue: "PAF", roundEn: "Semi-finals", homeId: null, awayId: null, homePlaceholder: "أول المجموعة الثانية", awayPlaceholder: "ثاني المجموعة الأولى", homeCandidateIds: GC_GROUPS[1].teamIds, awayCandidateIds: GC_GROUPS[0].teamIds },
  // ── النهائي ──
  { id: 27000015, matchNo: 15, kickoff: "2026-10-06T20:30:00+03:00", venue: "KASC", roundEn: "Final", homeId: null, awayId: null, homePlaceholder: "الفائز من نصف النهائي الأول", awayPlaceholder: "الفائز من نصف النهائي الثاني" },
];
