// إنشاء مسابقتَي الموسم لدوري روشن — «بطل الموسم» (بركة 10,000) و«هدّاف
// الموسم» (بركة 3,000) في المنصة المركزية للتوقعات. ملفات القواعد مزروعة
// من seed-prediction-core.ts، لكن لا شيء كان ينشئ المسابقتين نفسيهما
// (fixtureAdapter ينشئ مسابقات المباريات فقط)، فكان وعد «توقّع بطل الموسم»
// في هيرو /roshn بلا مسابقة خلفه.
//
//   tsx scripts/create-rsl-longterm-contests.ts
//
// آمنة للإعادة: createContest تتجاهل الموجود (المفتاح الخارجي الموحد §22).
// الخيارات تُدمج في metadata.options فتعرضها الواجهة قائمة اختيار جاهزة
// (أندية الجدول المنشور للبطل، وأبرز 30 هدّافًا من الموسم الماضي للهدّاف)،
// والتسوية آخر الموسم تقارن pickId بمعرّفات API-Football نفسها.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { eq } from "drizzle-orm";
import { predictionCompetitions } from "../shared/schema";
const { db } = await import("../server/db");
const { createContest } = await import("../server/services/predictions/predictionCoreService");
const { getCompetition, getFixtures, getSeasonOutlook, getTopScorers } = await import(
  "../server/services/saudiLeagueService"
);

const SLUG = "rsl-2026";

async function main(): Promise<void> {
  console.log("\n🏆 إنشاء مسابقتي الموسم لدوري روشن\n");

  const [competition] = await db
    .select()
    .from(predictionCompetitions)
    .where(eq(predictionCompetitions.slug, SLUG))
    .limit(1);
  if (!competition) throw new Error(`البطولة ${SLUG} غير مزروعة — شغّل seed-prediction-core.ts أولًا`);

  const comp = getCompetition("pro-league");
  if (!comp) throw new Error("pro-league غير معرّفة في saudiLeagueService");

  const fixtures = await getFixtures(comp);
  if (fixtures.length === 0) throw new Error("لا جدول منشورًا بعد — أعد المحاولة بعد اعتماد جدول الموسم");
  const firstKickoff = new Date(Math.min(...fixtures.map((f) => f.timestamp)) * 1000);
  if (firstKickoff.getTime() <= Date.now()) {
    throw new Error("الموسم انطلق بالفعل — مسابقات الموسم تُفتح قبل أول صافرة فقط");
  }

  // خيارات البطل: أندية الموسم من الجدول المنشور.
  const teams = new Map<number, { id: string; name: string; logo: string | null }>();
  for (const f of fixtures) {
    for (const t of [f.home, f.away]) {
      if (t.id > 0 && !teams.has(t.id)) teams.set(t.id, { id: String(t.id), name: t.name, logo: t.logo ?? null });
    }
  }

  // خيارات الهدّاف: أبرز 30 هدّافًا من الموسم الماضي — مرشّحون واقعيون للسباق.
  const outlook = await getSeasonOutlook(comp);
  const previousSeason = (outlook.nextSeason ?? outlook.season) - 1;
  const scorers = await getTopScorers(comp, previousSeason).catch(() => []);
  const players = scorers.slice(0, 30).map((s) => ({ id: String(s.id), name: s.name, logo: s.photo || null }));

  const champion = await createContest({
    competitionId: competition.id,
    externalRef: `${SLUG}-champion`,
    contestType: "champion",
    opensAt: new Date(),
    locksAt: firstKickoff,
    metadata: {
      title: "بطل الموسم",
      options: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name, "ar")),
    },
    open: true,
  });
  console.log(champion
    ? `  ✅ بطل الموسم (${teams.size} ناديًا) — يُقفل مع أول صافرة: ${firstKickoff.toISOString()}`
    : "  ⏭️  بطل الموسم — المسابقة موجودة");

  const topScorer = await createContest({
    competitionId: competition.id,
    externalRef: `${SLUG}-top-scorer`,
    contestType: "top_scorer",
    opensAt: new Date(),
    locksAt: firstKickoff,
    metadata: { title: "هدّاف الموسم", options: players },
    open: true,
  });
  console.log(topScorer
    ? `  ✅ هدّاف الموسم (${players.length} مرشّحًا) — يُقفل مع أول صافرة`
    : "  ⏭️  هدّاف الموسم — المسابقة موجودة");

  console.log("\nاكتمل. المسابقتان تظهران في /predictions?competition=rsl-2026 تحت «توقّعات الموسم».\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ فشل الإنشاء:", error);
  process.exit(1);
});
