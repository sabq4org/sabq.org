// محوّل المباريات — الجسر بين مصادر المباريات القائمة والمنصة المركزية.
//
// يعيد استخدام نفس الخدمات التي تغذي المحركات القديمة (saudiLeagueService،
// gulfCupService، asianCupService) دون أي مسار جلب جديد، ويحوّل مبارياتها
// إلى مسابقات: إنشاء عند الإعلان، إعادة جدولة عند التأجيل، تثبيت النتيجة
// عند صافرة النهاية، وإلغاء عند CANC/ABD/WO/AWD. القرارات في
// fixtureSyncLogic النقي؛ هنا التطبيق على قاعدة البيانات فقط.
//
// كأس العالم 2026 خارج هذا المحوّل عمدًا — يبقى على نظامه القديم حتى نهايته.
//
// ملاحظة كأس آسيا: الاستراتيجية المهارية تعمل الآن بمضاعفات ×1.0 الافتراضية؛
// إثراء الجرأة/السلسلة من asianCupRatings مرحلة لاحقة قبل انطلاق البطولة.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { predictionCompetitions, predictionContests } from "@shared/schema";
import { CONTEST_TYPES } from "@shared/predictions";
import { createContest, setContestResult } from "./predictionCoreService";
import {
  decideSyncAction,
  type ContestSnapshot,
  type NormalizedFixture,
} from "./fixtureSyncLogic";
import { getCompetition, getFixtures, type SplFixture } from "../saudiLeagueService";
import { getKcFixtures } from "../kingsCupService";
import { getGcFixtures, type GcFixture } from "../gulfCupService";
import { getAcFixtures, type AcFixture } from "../asianCupService";

// ---------------------------------------------------------------------------
// تطبيع المصادر الثلاثة إلى شكل واحد
// ---------------------------------------------------------------------------

function normalizeSpl(fx: SplFixture): NormalizedFixture {
  return {
    externalRef: String(fx.id),
    kickoff: new Date(fx.timestamp * 1000),
    statusCode: fx.status.code,
    live: fx.status.live,
    finished: fx.status.finished,
    homeName: fx.home?.name || null,
    awayName: fx.away?.name || null,
    homeLogo: fx.home?.logo || null,
    awayLogo: fx.away?.logo || null,
    round: fx.round || null,
    venue: fx.venue?.name || null,
    goalsHome: fx.goals.home,
    goalsAway: fx.goals.away,
    penaltiesHome: fx.penalties?.home ?? null,
    penaltiesAway: fx.penalties?.away ?? null,
  };
}

function normalizeGc(fx: GcFixture): NormalizedFixture {
  return {
    externalRef: String(fx.id),
    kickoff: new Date(fx.timestamp * 1000),
    statusCode: fx.status.code,
    live: fx.status.live,
    finished: fx.status.finished,
    homeName: fx.home?.name || null,
    awayName: fx.away?.name || null,
    homeLogo: fx.home?.logo || null,
    awayLogo: fx.away?.logo || null,
    round: fx.round || null,
    venue: fx.venue?.name || null,
    goalsHome: fx.goals.home,
    goalsAway: fx.goals.away,
    penaltiesHome: fx.penalties?.home ?? null,
    penaltiesAway: fx.penalties?.away ?? null,
  };
}

function normalizeAc(fx: AcFixture): NormalizedFixture {
  return {
    externalRef: String(fx.id),
    kickoff: new Date(fx.timestamp * 1000),
    statusCode: fx.status.code,
    live: fx.status.live,
    finished: fx.status.finished,
    homeName: fx.home?.name || null,
    awayName: fx.away?.name || null,
    homeLogo: fx.home?.logo || null,
    awayLogo: fx.away?.logo || null,
    round: fx.round || null,
    venue: fx.venue?.name || null,
    goalsHome: fx.goals.home,
    goalsAway: fx.goals.away,
    penaltiesHome: null,
    penaltiesAway: null,
  };
}

async function splSource(registrySlug: string): Promise<NormalizedFixture[]> {
  const comp = getCompetition(registrySlug);
  if (!comp) return [];
  const fixtures = await getFixtures(comp);
  return fixtures.map(normalizeSpl);
}

/** مفتاح المحوّل = slug بطولة المنصة (prediction_competitions.slug). */
const FIXTURE_SOURCES: Record<string, () => Promise<NormalizedFixture[]>> = {
  "rsl-2026": () => splSource("pro-league"),
  // كأس الملك عبر خدمته المخصصة لا splSource المباشر: نفس موسم KC_SEASON الذي
  // تقرؤه كل أسطح الكأس (fallbackSeason وحده قد ينحرف) + التركيب اللحظي الموحّد.
  "kings-cup-2026": async () => (await getKcFixtures()).map(normalizeSpl),
  "super-cup-2026": () => splSource("super-cup"),
  "gulf-cup-27": async () => (await getGcFixtures()).map(normalizeGc),
  "asian-cup-2027": async () => (await getAcFixtures()).map(normalizeAc),
};

// ---------------------------------------------------------------------------
// المزامنة
// ---------------------------------------------------------------------------

export type FixtureSyncSummary = {
  competitions: number;
  created: number;
  rescheduled: number;
  resultsSet: number;
  voided: number;
  errors: Array<{ slug: string; error: string }>;
};

export async function syncCompetitionFixtures(): Promise<FixtureSyncSummary> {
  const summary: FixtureSyncSummary = {
    competitions: 0,
    created: 0,
    rescheduled: 0,
    resultsSet: 0,
    voided: 0,
    errors: [],
  };

  const active = await db
    .select({ id: predictionCompetitions.id, slug: predictionCompetitions.slug })
    .from(predictionCompetitions)
    .where(eq(predictionCompetitions.status, "active"));

  for (const competition of active) {
    const source = FIXTURE_SOURCES[competition.slug];
    if (!source) continue;
    summary.competitions++;

    try {
      const fixtures = await source();
      if (fixtures.length === 0) continue;

      const existing = await db
        .select({
          id: predictionContests.id,
          externalRef: predictionContests.externalRef,
          status: predictionContests.status,
          locksAt: predictionContests.locksAt,
          resultVersion: predictionContests.resultVersion,
          metadata: predictionContests.metadata,
          resultPayload: predictionContests.resultPayload,
        })
        .from(predictionContests)
        .where(and(
          eq(predictionContests.competitionId, competition.id),
          eq(predictionContests.contestType, CONTEST_TYPES.MATCH_SCORE),
          inArray(predictionContests.externalRef, fixtures.map((f) => f.externalRef)),
        ));
      const contestByRef = new Map<string, ContestSnapshot>(
        existing.map((c) => [c.externalRef, c]),
      );

      const now = new Date();
      for (const fixture of fixtures) {
        const contest = contestByRef.get(fixture.externalRef) ?? null;

        // إثراء المسابقات المسوّاة سابقًا بركلات الترجيح إن توفّرت لدى المزوّد
        if (
          contest &&
          contest.status === "settled" &&
          (fixture.penaltiesHome != null || fixture.penaltiesAway != null)
        ) {
          const pen = { home: fixture.penaltiesHome, away: fixture.penaltiesAway };
          const meta = (contest.metadata ?? {}) as Record<string, unknown>;
          const res = (contest.resultPayload ?? {}) as Record<string, unknown>;
          if (!meta.penalties || !res.penalties) {
            await db
              .update(predictionContests)
              .set({
                metadata: { ...meta, penalties: pen },
                resultPayload: { ...res, penalties: pen },
                updatedAt: now,
              })
              .where(eq(predictionContests.id, contest.id));
            console.log(
              `[Prediction Adapter] backfilled penalties for settled contest ${competition.slug}#${fixture.externalRef} → ${pen.home}-${pen.away}`,
            );
          }
        }

        const action = decideSyncAction(fixture, contest, now);

        switch (action.kind) {
          case "create": {
            const row = await createContest({
              competitionId: competition.id,
              externalRef: fixture.externalRef,
              contestType: CONTEST_TYPES.MATCH_SCORE,
              opensAt: now,
              locksAt: fixture.kickoff,
              metadata: fixtureMetadata(fixture),
              open: true,
            });
            if (row) summary.created++;
            break;
          }
          case "reschedule": {
            await db
              .update(predictionContests)
              .set({
                locksAt: action.locksAt,
                metadata: fixtureMetadata(fixture),
                updatedAt: now,
              })
              .where(eq(predictionContests.id, contest!.id));
            summary.rescheduled++;
            console.log(
              `[Prediction Adapter] rescheduled ${competition.slug}#${fixture.externalRef} → ${action.locksAt.toISOString()}`,
            );
            break;
          }
          case "set_result": {
            const penalties =
              fixture.penaltiesHome != null || fixture.penaltiesAway != null
                ? { home: fixture.penaltiesHome, away: fixture.penaltiesAway }
                : null;
            await db
              .update(predictionContests)
              .set({
                metadata: fixtureMetadata(fixture),
                updatedAt: now,
              })
              .where(eq(predictionContests.id, contest!.id));
            await setContestResult(contest!.id, {
              finalHome: action.finalHome,
              finalAway: action.finalAway,
              penalties,
            });
            summary.resultsSet++;
            break;
          }
          case "void": {
            await db
              .update(predictionContests)
              .set({ status: "void", updatedAt: now })
              .where(eq(predictionContests.id, contest!.id));
            summary.voided++;
            console.log(
              `[Prediction Adapter] voided ${competition.slug}#${fixture.externalRef} (${fixture.statusCode})`,
            );
            break;
          }
          case "none":
            break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push({ slug: competition.slug, error: message });
      console.error(`[Prediction Adapter] sync failed for ${competition.slug}:`, message);
    }
  }

  return summary;
}

function fixtureMetadata(fixture: NormalizedFixture): Record<string, unknown> {
  return {
    home: { name: fixture.homeName, logo: fixture.homeLogo },
    away: { name: fixture.awayName, logo: fixture.awayLogo },
    round: fixture.round,
    venue: fixture.venue,
    kickoffAt: fixture.kickoff.toISOString(),
    penalties:
      fixture.penaltiesHome != null || fixture.penaltiesAway != null
        ? { home: fixture.penaltiesHome, away: fixture.penaltiesAway }
        : null,
  };
}
