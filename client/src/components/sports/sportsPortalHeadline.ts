/**
 * سلّم أهمية نص شريط البوابة الرياضية — منطق نقي بلا React ليغطّيه اختبار الوحدة
 * (tests/unit/sportsPortalHeadline.test.ts) ويستعمله SportsPortalStrip.tsx.
 *
 * أول شرط يتحقّق يفوز:
 *   1) مباراة سعودية أو كبرى جارية الآن       → النتيجة والدقيقة
 *   2) مباراة سعودية أو كبرى اليوم لم تبدأ    → الفريقان وموعد الانطلاق
 *   3) أقرب بطولة كبرى قادمة (السعودية أولًا) → عدّاد الانطلاق
 *   4) احتياط                                 → حجم التغطية بالأرقام
 *
 * لماذا شرط «أحد الطرفين معروف» فوق فلتر البطولات الكبرى؟ لأن champions-league و
 * europa-league كبيرتان بالاسم لكن مبارياتهما في يوليو تصفيات بين أندية مجهولة
 * للقارئ («بافوس × هايدوك سبليت»، «هرايدك كرالوفي × ترومسو»). ذكر أسماء كهذه في
 * الرئيسية يُضعف الشريط بدل أن يقوّيه، فنتجاهلها وننزل درجة في السلّم.
 *
 * الأنواع مستوردة كـ type فقط من صفحة SportsHub الضخمة — تُمحى عند البناء فلا
 * تدخل حزمة الرئيسية. ولنفس السبب قوائم البطولات مكرّرة هنا بدل استيرادها من
 * SportsDashboard (استيراد قيمة منها يسحب صفحة كاملة إلى الرئيسية).
 */
import type { SpCompetition, SpLiveItem } from "@/pages/SportsHub";

// البطولات غير السعودية التي يحقّ لها تصدّر الشريط — مطابقة لقائمة
// SPOTLIGHT_MARQUEE_SLUGS في غلاف /sports حتى لا يتصدّر دوري ثانوي الرئيسية.
const MARQUEE_SLUGS = new Set([
  "world-cup", "club-world-cup", "intercontinental-cup", "afc-champions-league", "asian-cup",
  "champions-league", "europa-league",
  "premier-league", "la-liga", "serie-a", "bundesliga", "ligue-1",
  "gulf-cup", "gulf-club-champions",
]);

// بطولات العدّاد — الكبرى فقط، فلا يقول الشريط «دوري يلو ينطلق» بينما روشن على
// الأبواب. السعودية أولًا ثم البقية بالأقرب موعدًا.
const COUNTDOWN_SLUGS = new Set(["pro-league", "kings-cup", "super-cup", ...MARQUEE_SLUGS]);
const SAUDI_COUNTDOWN_SLUGS = new Set(["pro-league", "kings-cup", "super-cup"]);

// الأندية التي يُسمح بذكر اسمها في الرئيسية: السعودية + عمالقة العالم. القائمة
// مقصودة الضيق — نادٍ غير مذكور هنا ليس مُستبعدًا من البوابة، بل الشريط لا
// يتصدّر باسمه. الأسماء مكتوبة بصيغتها المُوحَّدة (انظر normalizeName).
const HEADLINE_CLUBS = [
  // السعودية — تلزم بالاسم لأن مباريات أبطال آسيا مصنّفة world لا saudi
  "الهلال", "النصر", "الاتحاد", "الاهلي", "الشباب", "القادسيه", "التعاون",
  "الفيحاء", "الاتفاق", "الفتح", "الخليج", "ضمك", "نيوم", "الرياض", "الحزم", "النجمه",
  // عمالقة العالم — بلا أندية الأدوار التمهيدية
  "ريال مدريد", "برشلونه", "اتلتيكو مدريد", "مانشستر سيتي", "مانشستر يونايتد",
  "ليفربول", "ارسنال", "تشيلسي", "توتنهام", "بايرن", "دورتموند",
  "باريس سان جيرمان", "يوفنتوس", "انتر", "ميلان", "نابولي",
];

/**
 * توحيد الرسم العربي قبل المطابقة: همزات الألف وياؤها وتاؤها والتشكيل — فتُطابق
 * «الأهلي» و«الاهلي»، و«القادسية» و«القادسيه». نكتفي بهذا ولا نحذف زوائد مثل
 * «إف سي» لأن المطابقة بالاحتواء تتجاوزها أصلًا.
 */
export function normalizeName(raw: string): string {
  return raw
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ً-ْـ]/g, "") // تشكيل وتطويل
    .replace(/\s+/g, " ")
    .trim();
}

const isHeadlineClub = (name: string): boolean => {
  const n = normalizeName(name);
  return HEADLINE_CLUBS.some((club) => n.includes(club));
};

/** هل يحقّ لهذه المباراة أن تتصدّر الرئيسية بأسماء فريقيها؟ */
const canHeadline = (f: SpLiveItem, saudiSlugs: Set<string>): boolean => {
  const slug = f.competitionSlug ?? "";
  if (!saudiSlugs.has(slug) && !MARQUEE_SLUGS.has(slug)) return false;
  // بطولة سعودية = أنديتها معروفة للقارئ بالتعريف؛ غيرها يلزمها طرف معروف.
  return saudiSlugs.has(slug) || isHeadlineClub(f.home.name) || isHeadlineClub(f.away.name);
};

const kickoffFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  hour: "2-digit", minute: "2-digit", hour12: true,
});

const daysPhrase = (d: number): string =>
  d <= 0 ? "ينطلق اليوم" : d === 1 ? "ينطلق غدًا" : d === 2 ? "ينطلق بعد يومين"
    : d <= 10 ? `ينطلق بعد ${d} أيام` : `ينطلق بعد ${d} يومًا`;

// نقتصر على جزء التاريخ لأن الخادم قد يعيد «2026-08-13» أو ISO كاملًا.
const daysUntil = (iso: string, now: number): number =>
  Math.ceil((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - now) / 86_400_000);

/** شكل واحد لكل درجات السلّم: إمّا مباراة بأسماء فريقيها وإمّا نص جاهز. */
export interface Headline {
  live: boolean;
  tail: string;
  match?: SpLiveItem;
  text?: string;
}

export function pickHeadline(
  todayMatches: SpLiveItem[],
  competitions: SpCompetition[],
  now: number = Date.now(),
): Headline {
  // البطولات السعودية تُعرف من التصنيف لا من قائمة ثابتة، فإضافة بطولة سعودية
  // جديدة في الخادم تدخل الشريط بلا تعديل هنا.
  const saudiSlugs = new Set(
    competitions.filter((c) => (c.category ?? "saudi") === "saudi").map((c) => c.slug),
  );
  const saudiRank = (f: SpLiveItem) => (saudiSlugs.has(f.competitionSlug ?? "") ? 0 : 1);
  const eligible = todayMatches.filter((f) => canHeadline(f, saudiSlugs));

  // 1) جارية الآن — السعودية أولًا ثم الأقرب انطلاقًا
  const live = eligible
    .filter((f) => f.status.live)
    .sort((a, b) => saudiRank(a) - saudiRank(b) || a.timestamp - b.timestamp)[0];
  if (live) {
    return {
      live: true,
      match: live,
      tail: live.status.elapsed != null
        ? `د${live.status.elapsed} — تابعها لحظة بلحظة`
        : "تابعها لحظة بلحظة",
    };
  }

  // 2) اليوم ولم تبدأ
  const upcoming = eligible
    .filter((f) => !f.status.live && !f.status.finished)
    .sort((a, b) => a.timestamp - b.timestamp)[0];
  if (upcoming) {
    return {
      live: false,
      match: upcoming,
      tail: `${kickoffFmt.format(new Date(upcoming.timestamp * 1000))} — التشكيل المتوقّع والترتيب`,
    };
  }

  // 3) عدّاد أقرب بطولة كبرى — السعودية تسبق غيرها دائمًا حتى لا يتصدّر عدّاد
  //    بطولة أوروبية بينما روشن على الأبواب بعده بيومين.
  const pending = competitions
    .filter((c) => COUNTDOWN_SLUGS.has(c.slug) && c.start && daysUntil(c.start, now) >= 0)
    .sort((a, b) => a.start!.localeCompare(b.start!));
  const next = pending.find((c) => SAUDI_COUNTDOWN_SLUGS.has(c.slug)) ?? pending[0];
  if (next?.start) {
    return {
      live: false,
      text: `${next.name} ${daysPhrase(daysUntil(next.start, now))}`,
      tail: "الجدول والترتيب والتوقّعات",
    };
  }

  // 4) احتياط — قبل وصول البيانات وفي الأيام الخالية تمامًا
  return {
    live: false,
    text: competitions.length > 0
      ? `${competitions.length} بطولة في مكان واحد`
      : "كل البطولات في مكان واحد",
    tail: "نتائج مباشرة · ترتيب · توقّعات",
  };
}
