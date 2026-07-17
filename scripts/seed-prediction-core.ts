// Seed المنصة المركزية للتوقعات — البطولات وملفات القواعد الافتتاحية وفق
// مصفوفة المقترح v2 §8 وقرارات 2026-07-17 (توحيد كل البطولات ما عدا كأس
// العالم 2026 الذي يبقى على نظامه القديم حتى نهايته — لا يُزرع هنا).
//
// آمن لإعادة التشغيل: البطولات upsert بالرمز، والملفات لا تُنشأ إذا كان
// للنوع ملف نشط. البطولات تُزرع بحالة draft — التفعيل قرار تشغيلي عبر
// setCompetitionStatus أو لوحة الإدارة لاحقًا.
//
//   tsx scripts/seed-prediction-core.ts

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { eq } from "drizzle-orm";
import { predictionCompetitions } from "../shared/schema";
import { CONTEST_TYPES, STRATEGY_KEYS, type ContestType } from "../shared/predictions";
const { db } = await import("../server/db");
const { createScoringProfile, getActiveProfile } = await import(
  "../server/services/predictions/predictionCoreService"
);

type ProfileSeed = { contestType: ContestType; strategyKey: string; params: Record<string, unknown> };

const TIERED_1000 = {
  strategyKey: STRATEGY_KEYS.TIERED_POOL,
  params: {
    basePool: 1000,
    tiers: { exact: 0.5, signedMargin: 0.3, outcome: 0.2 },
    carryMode: "same_competition_next_contest",
  },
};

const COMPETITIONS: Array<{
  slug: string;
  nameAr: string;
  nameEn: string;
  seasonKey: string;
  profiles: ProfileSeed[];
}> = [
  {
    slug: "rsl-2026",
    nameAr: "دوري روشن السعودي",
    nameEn: "Roshn Saudi League",
    seasonKey: "2026-27",
    profiles: [
      // قرار §26/2: اعتماد المتدرج وإنهاء ازدواج محرك 500/محرك 1000
      { contestType: CONTEST_TYPES.MATCH_SCORE, ...TIERED_1000 },
      {
        contestType: CONTEST_TYPES.CHAMPION,
        strategyKey: STRATEGY_KEYS.LONG_TERM_POOL,
        params: {
          basePool: 10000,
          distribution: "early_weighted",
          earlyTiers: [
            { beforeHours: 2160, weight: 3 }, // ٩٠ يومًا فأكثر قبل الإغلاق
            { beforeHours: 720, weight: 2 }, // ٣٠ يومًا فأكثر
          ],
        },
      },
      {
        contestType: CONTEST_TYPES.TOP_SCORER,
        strategyKey: STRATEGY_KEYS.LONG_TERM_POOL,
        params: { basePool: 3000, distribution: "equal", earlyTiers: [] },
      },
    ],
  },
  {
    slug: "kings-cup-2026",
    nameAr: "كأس خادم الحرمين الشريفين",
    nameEn: "King's Cup",
    seasonKey: "2026-27",
    profiles: [
      // سلوك الكؤوس القائم: 500 للنتيجة الدقيقة فقط دون ترحيل
      {
        contestType: CONTEST_TYPES.MATCH_SCORE,
        strategyKey: STRATEGY_KEYS.SHARED_POOL,
        params: { basePool: 500, winCriterion: "exact", carryMode: "none" },
      },
    ],
  },
  {
    slug: "super-cup-2026",
    nameAr: "كأس السوبر السعودي",
    nameEn: "Saudi Super Cup",
    seasonKey: "2026-27",
    // قرار §26/3: نظام واحد فقط — المتدرج (هدف التفاعل)، ويمنع تشغيل القاعدتين
    profiles: [{ contestType: CONTEST_TYPES.MATCH_SCORE, ...TIERED_1000 }],
  },
  {
    slug: "gulf-cup-27",
    nameAr: "خليجي 27",
    nameEn: "Gulf Cup 27",
    seasonKey: "2026-27",
    profiles: [
      { contestType: CONTEST_TYPES.MATCH_SCORE, ...TIERED_1000 },
      {
        contestType: CONTEST_TYPES.MATCH_SCORER,
        strategyKey: STRATEGY_KEYS.PLAYER_POOL,
        params: { basePool: 300, carryMode: "none" },
      },
      {
        contestType: CONTEST_TYPES.FIRST_SCORER,
        strategyKey: STRATEGY_KEYS.PLAYER_POOL,
        params: { basePool: 200, carryMode: "none" },
      },
      {
        contestType: CONTEST_TYPES.CHAMPION,
        strategyKey: STRATEGY_KEYS.LONG_TERM_POOL,
        params: { basePool: 5000, distribution: "equal", earlyTiers: [] },
      },
      {
        contestType: CONTEST_TYPES.TOP_SCORER,
        strategyKey: STRATEGY_KEYS.LONG_TERM_POOL,
        params: { basePool: 5000, distribution: "equal", earlyTiers: [] },
      },
    ],
  },
  {
    slug: "asian-cup-2027",
    nameAr: "كأس آسيا 2027",
    nameEn: "AFC Asian Cup 2027",
    seasonKey: "2027",
    profiles: [
      {
        contestType: CONTEST_TYPES.MATCH_SCORE,
        strategyKey: STRATEGY_KEYS.SKILL_WEIGHTED,
        params: {
          tierPoints: { exact: 30, signedMargin: 18, outcome: 10 },
          boldnessMultiplierRange: { min: 100, max: 300 },
          streakMultiplierRange: { min: 100, max: 200 },
        },
      },
    ],
  },
];

async function main(): Promise<void> {
  console.log("\n🌱 زرع بطولات المنصة المركزية وملفات قواعدها (كأس العالم مستثنى)\n");

  for (const comp of COMPETITIONS) {
    const [existing] = await db
      .select()
      .from(predictionCompetitions)
      .where(eq(predictionCompetitions.slug, comp.slug))
      .limit(1);

    let competitionId: string;
    if (existing) {
      competitionId = existing.id;
      console.log(`  ⏭️  ${comp.slug} — البطولة موجودة`);
    } else {
      const [row] = await db
        .insert(predictionCompetitions)
        .values({
          slug: comp.slug,
          nameAr: comp.nameAr,
          nameEn: comp.nameEn,
          seasonKey: comp.seasonKey,
          status: "draft",
        })
        .returning();
      competitionId = row.id;
      console.log(`  ✅ ${comp.slug} — أُنشئت (draft)`);
    }

    for (const profile of comp.profiles) {
      const active = await getActiveProfile(competitionId, profile.contestType);
      if (active && active.competitionId === competitionId) {
        console.log(`     ⏭️  ${profile.contestType} — ملف نشط v${active.version}`);
        continue;
      }
      const row = await createScoringProfile({
        competitionId,
        contestType: profile.contestType,
        strategyKey: profile.strategyKey,
        params: profile.params,
        createdBy: "seed-prediction-core",
        activate: true,
      });
      console.log(`     ✅ ${profile.contestType} — ${profile.strategyKey} v${row.version} (active)`);
    }
  }

  console.log("\nاكتمل الزرع. تفعيل بطولة: عدّل status إلى active ثم فعّل PREDICTION_CORE_ENABLED.\n");
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ فشل الزرع:", error);
  process.exit(1);
});
