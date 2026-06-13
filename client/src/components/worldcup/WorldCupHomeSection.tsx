import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trophy, ChevronLeft } from "lucide-react";
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
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
  const { data: newsData } = useQuery<{ news: WcNewsItem[] }>({
    queryKey: ["/api/world-cup/news", { limit: 8 }],
    staleTime: 2 * 60 * 1000,
  });

  const hasMatch = Boolean(overview?.matchOfTheDay?.fixture);
  const hasNews = Array.isArray(newsData?.news) && newsData.news.length > 0;
  if (!hasMatch && !hasNews) return null;

  return (
    <div className="bg-emerald-50 dark:bg-emerald-950/25 border-y border-emerald-600/10 dark:border-emerald-400/10 py-8">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <WorldCupHomeStrip />

        {/* دعوة بارزة لمسابقة التوقّعات — أسفل مباراة اليوم مباشرة */}
        <Link
          href="/world-cup/predictions"
          className="group flex cursor-pointer items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-bl from-emerald-600 via-emerald-700 to-emerald-800 p-4 text-white shadow-sm transition hover:shadow-md sm:p-5"
          data-testid="home-wc-predictions-cta"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <Trophy className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black sm:text-lg">توقّعات المونديال — توقّع واربح 🏆</p>
            <p className="truncate text-sm text-emerald-50/90">
              توقّع النتيجة الدقيقة لمباريات اليوم والغد واربح من جائزة 500 نقطة ولاء لكل مباراة
            </p>
          </div>
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold text-emerald-700 transition group-hover:bg-emerald-50 sm:inline-flex">
            ابدأ التوقّع
            <ChevronLeft className="h-4 w-4" />
          </span>
          <ChevronLeft className="h-5 w-5 shrink-0 sm:hidden" />
        </Link>

        <WorldCupNewsBlock />
      </div>
    </div>
  );
}
