/**
 * ملخّص «ما فاتك» (المرحلة 3ج).
 *
 * يجمع آخر نتائج الفِرق التي يتابعها المستخدم — عبر كل البطولات — في قائمة واحدة
 * مرتّبة من الأحدث وبلا تكرار (مباراة بين فريقين متابَعين تظهر مرّة واحدة).
 *
 * بيانات كل فريق من saudiLeagueService المحميّة بـ SWR (كاش لكل فريق مشترك بين
 * المستخدمين)، فعدد المتابَعين لا يضاعف الضغط على API-Football.
 */
import { listFollows } from "./sportsFollowsService";
import { getTeamRecentResults, type SplLiveBoardItem } from "./saudiLeagueService";

const RECENT_PER_TEAM = 3;

/** آخر نتائج فِرق المستخدم المتابَعة (الأحدث أولًا، مزالة التكرار). */
export async function getMissedResults(userId: string, limit = 12): Promise<SplLiveBoardItem[]> {
  const follows = await listFollows(userId);
  const teamIds = [
    ...new Set(
      follows
        .filter((f) => f.kind === "team")
        .map((f) => Number(f.refId))
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  if (teamIds.length === 0) return [];

  const lists = await Promise.all(
    teamIds.map((id) => getTeamRecentResults(id, RECENT_PER_TEAM).catch(() => [] as SplLiveBoardItem[])),
  );

  const byFixture = new Map<number, SplLiveBoardItem>();
  for (const list of lists) {
    for (const fx of list) byFixture.set(fx.id, fx);
  }

  return [...byFixture.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
