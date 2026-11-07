/**
 * حارس «المباراة لم تعد قائمة» للقطات فارا قبل المباراة (upcoming_match /
 * behavioral_big_match).
 *
 * اللقطات تُولَّد ساعيًا وتُخزَّن بصلاحية حتى موعد المباراة، ودورة الدفع (كل
 * 15 دقيقة) ترسلها قبل الموعد بـ20–28 ساعة (أو حتى 72 لمشاهدي الفريق). حين
 * أُجّلت الجولة 13 من روشن (2026-11-03) بقيت لقطات سابقة في الجدول وأُرسلت
 * إشعارات «غدًا/بعد غد» عن مباريات مؤجلة. نعيد فحص حالة كل مباراة قبل الإرسال
 * والعرض: المؤجلة/الملغاة تُسقط. الفحص من كاش getMatchLite (SWR)، وعند تعذّره
 * نُبقي السلوك السابق (لا نوقف إشعارات صحيحة بسبب عطل مزوّد).
 */
import { getMatchLite } from "../saudiLeagueService";
import { isPostponedFixture } from "../sports/fixtureBuckets";

const PRE_MATCH_KINDS = new Set(["upcoming_match", "behavioral_big_match"]);

export function isPreMatchSnapKind(kind: string): boolean {
  return PRE_MATCH_KINDS.has(kind);
}

/** مجموعة معرّفات المباريات المؤجلة/الملغاة من بين المعطاة. */
export async function findPostponedFixtureIds(
  fixtureIds: number[],
  lookup: (id: number) => Promise<{ timestamp: number; status: { code: string; live: boolean; finished: boolean } } | null> = getMatchLite,
): Promise<Set<number>> {
  const unique = [...new Set(fixtureIds.filter((id) => Number.isFinite(id) && id > 0))];
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const fx = await lookup(id);
        return fx && isPostponedFixture(fx) ? id : null;
      } catch {
        return null;
      }
    }),
  );
  return new Set(results.filter((id): id is number => id != null));
}
