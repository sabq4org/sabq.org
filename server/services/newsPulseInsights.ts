import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { categories, userInterests, wcLongPredictions } from "@shared/schema";

export type NewsPulseExtras = {
  topInterest: {
    name: string;
    slug: string | null;
    subscribers: number;
    thisMonthNew: number;
    previousMonthNew: number;
    changePercent: number;
    trend: "up" | "down" | "stable";
  } | null;
  worldCup: {
    champion: {
      teamId: number;
      name: string;
      logo: string | null;
      votes: number;
      sharePercent: number;
    } | null;
    topScorer: {
      playerId: number;
      name: string;
      photo: string | null;
      votes: number;
      sharePercent: number;
    } | null;
    totalChampionVotes: number;
    totalScorerVotes: number;
  } | null;
};

/**
 * Lightweight public "catchy insights" for /news — top registered interest
 * (MoM new subscriptions) + World Cup long-prediction leaders.
 */
export async function getNewsPulseExtras(
  monthAgo: Date,
  prevMonthStart: Date,
): Promise<NewsPulseExtras> {
  const [interestRows, champRows, scorerRows, champTotal, scorerTotal] =
    await Promise.all([
      db
        .select({
          categoryId: userInterests.categoryId,
          name: categories.nameAr,
          slug: categories.slug,
          subscribers: sql<number>`count(*)::int`,
        })
        .from(userInterests)
        .innerJoin(categories, eq(userInterests.categoryId, categories.id))
        .groupBy(userInterests.categoryId, categories.nameAr, categories.slug)
        .orderBy(desc(sql`count(*)`))
        .limit(1),

      db
        .select({
          teamId: wcLongPredictions.teamId,
          name: wcLongPredictions.teamName,
          logo: wcLongPredictions.teamLogo,
          votes: sql<number>`count(*)::int`,
        })
        .from(wcLongPredictions)
        .where(eq(wcLongPredictions.kind, "champion"))
        .groupBy(
          wcLongPredictions.teamId,
          wcLongPredictions.teamName,
          wcLongPredictions.teamLogo,
        )
        .orderBy(desc(sql`count(*)`))
        .limit(1),

      db
        .select({
          playerId: wcLongPredictions.playerId,
          name: wcLongPredictions.playerName,
          photo: wcLongPredictions.playerPhoto,
          votes: sql<number>`count(*)::int`,
        })
        .from(wcLongPredictions)
        .where(eq(wcLongPredictions.kind, "top_scorer"))
        .groupBy(
          wcLongPredictions.playerId,
          wcLongPredictions.playerName,
          wcLongPredictions.playerPhoto,
        )
        .orderBy(desc(sql`count(*)`))
        .limit(1),

      db
        .select({ n: sql<number>`count(*)::int` })
        .from(wcLongPredictions)
        .where(eq(wcLongPredictions.kind, "champion")),

      db
        .select({ n: sql<number>`count(*)::int` })
        .from(wcLongPredictions)
        .where(eq(wcLongPredictions.kind, "top_scorer")),
    ]);

  const top = interestRows[0];
  let topInterest: NewsPulseExtras["topInterest"] = null;

  if (top?.categoryId && top.name) {
    const [[thisMonth], [prevMonth]] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(userInterests)
        .where(
          and(
            eq(userInterests.categoryId, top.categoryId),
            gte(userInterests.createdAt, monthAgo),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(userInterests)
        .where(
          and(
            eq(userInterests.categoryId, top.categoryId),
            gte(userInterests.createdAt, prevMonthStart),
            lt(userInterests.createdAt, monthAgo),
          ),
        ),
    ]);

    const thisMonthNew = thisMonth?.n ?? 0;
    const previousMonthNew = prevMonth?.n ?? 0;
    const changePercent =
      previousMonthNew > 0
        ? Math.round(((thisMonthNew - previousMonthNew) / previousMonthNew) * 1000) / 10
        : thisMonthNew > 0
          ? 100
          : 0;
    const trend: "up" | "down" | "stable" =
      thisMonthNew > previousMonthNew
        ? "up"
        : thisMonthNew < previousMonthNew
          ? "down"
          : "stable";

    topInterest = {
      name: top.name,
      slug: top.slug ?? null,
      subscribers: top.subscribers ?? 0,
      thisMonthNew,
      previousMonthNew,
      changePercent,
      trend,
    };
  }

  const totalChampionVotes = champTotal[0]?.n ?? 0;
  const totalScorerVotes = scorerTotal[0]?.n ?? 0;
  const champ = champRows[0];
  const scorer = scorerRows[0];

  const worldCup =
    totalChampionVotes > 0 || totalScorerVotes > 0
      ? {
          champion:
            champ?.teamId != null && champ.name
              ? {
                  teamId: champ.teamId,
                  name: champ.name,
                  logo: champ.logo ?? null,
                  votes: champ.votes ?? 0,
                  sharePercent:
                    totalChampionVotes > 0
                      ? Math.round(((champ.votes ?? 0) / totalChampionVotes) * 1000) / 10
                      : 0,
                }
              : null,
          topScorer:
            scorer?.playerId != null && scorer.name
              ? {
                  playerId: scorer.playerId,
                  name: scorer.name,
                  photo: scorer.photo ?? null,
                  votes: scorer.votes ?? 0,
                  sharePercent:
                    totalScorerVotes > 0
                      ? Math.round(((scorer.votes ?? 0) / totalScorerVotes) * 1000) / 10
                      : 0,
                }
              : null,
          totalChampionVotes,
          totalScorerVotes,
        }
      : null;

  return { topInterest, worldCup };
}
