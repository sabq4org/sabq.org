import { useQuery } from "@tanstack/react-query";
import WorldCupHomeStrip from "./WorldCupHomeStrip";
import WorldCupNewsBlock, { type WcNewsItem } from "./WorldCupNewsBlock";
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

  const hasMatch = Boolean(overview?.matchOfTheDay?.fixture);
  const hasNews = Array.isArray(newsData?.news) && newsData.news.length > 0;
  if (!hasMatch && !hasNews) return null;

  return (
    <div className="border-y border-emerald-600/10 bg-emerald-50/80 py-6 dark:border-emerald-400/10 dark:bg-emerald-950/20 md:bg-emerald-50 md:py-8 md:dark:bg-emerald-950/25">
      <div className="container mx-auto max-w-7xl space-y-6 px-4 md:space-y-8 sm:px-6 lg:px-8">
        <WorldCupHomeStrip />
        <WorldCupNewsBlock />
      </div>
    </div>
  );
}
