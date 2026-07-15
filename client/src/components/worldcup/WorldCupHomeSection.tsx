import { useQuery } from "@tanstack/react-query";
import WorldCupHomeStrip from "./WorldCupHomeStrip";
import WorldCupNewsBlock, { type WcNewsItem } from "./WorldCupNewsBlock";
import WorldCupStoriesRow from "./WorldCupStoriesRow";
import type { WcOverview } from "./wcTypes";

/**
 * غلاف قسم المونديال في الصفحة الرئيسية: شريط مباراة اليوم + بلوك
 * «أخبار المونديال» فوق خلفية خضراء خفيفة تمتد بعرض الصفحة كاملًا —
 * نفس نمط الحزام كامل العرض المستخدم لقسم الذكاء الاصطناعي في Home.
 *
 * يشترك في مفتاحَي react-query نفسيهما اللذين يستخدمهما الابنان ليقرر
 * الظهور: عندما لا توجد مباراة ولا أخبار يختفي القسم كله، فلا يبقى
 * حزام أخضر فارغ في الصفحة. خيارات الاستعلام مطابقة لخيارات الابنين
 * (الكاش مشترك، فلا نداء شبكة إضافيًا).
 */
export default function WorldCupHomeSection() {
  const { data: overview } = useQuery<WcOverview>({
    queryKey: ["/api/world-cup/overview"],
    // مطابق لـWorldCupHomeStrip: 8ث أثناء المباراة، 60ث غير ذلك (كاش مشترك)
    refetchInterval: (query) => {
      const d = query.state.data;
      const live =
        (d?.live?.length ?? 0) > 0 || Boolean(d?.matchOfTheDay?.fixture?.status.live);
      return live ? 8_000 : 60_000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
  const { data: newsData } = useQuery<{ news: WcNewsItem[] }>({
    queryKey: ["/api/world-cup/news", { limit: 8 }],
    staleTime: 2 * 60 * 1000,
  });

  // المفتاح في لوحة التحكم مُطفأ → القسم كله يختفي (شامل الأخبار والستوريز)
  if (overview?.hidden) return null;

  const hasMatch = Boolean(overview?.matchOfTheDay?.fixture);
  const hasChampion = Boolean(overview?.champion);
  const hasNews = Array.isArray(newsData?.news) && newsData.news.length > 0;
  if (!hasMatch && !hasChampion && !hasNews) return null;

  // مطابق لصيغة الحيّ في WorldCupHomeStrip/refetchInterval أعلاه — نقطة النبض
  // الحمراء على أيقونة «مباراة اليوم» في صفّ الستوريز.
  const isLive =
    (overview?.live?.length ?? 0) > 0 || Boolean(overview?.matchOfTheDay?.fixture?.status.live);

  const motd = overview?.matchOfTheDay ?? null;

  return (
    <div className="bg-emerald-50 dark:bg-emerald-950/25 border-y border-emerald-600/10 dark:border-emerald-400/10 py-8">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <WorldCupStoriesRow
          isLive={isLive}
          teaser={overview?.storiesTeaser ?? null}
          matchFixture={motd?.fixture ?? null}
          matchPrediction={motd?.prediction ?? null}
        />
        <WorldCupHomeStrip />
        <WorldCupNewsBlock />
      </div>
    </div>
  );
}
