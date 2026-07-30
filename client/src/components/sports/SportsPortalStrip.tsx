/**
 * شريط المدخل إلى البوابة الرياضية — سطر واحد تحت الهيرو مهمته الوحيدة أن يكون
 * الباب إلى /sports. قبل 2026-07-30 لم يكن للبوابة أي رابط من الرئيسية ولا من
 * القائمة العلوية، فكان الوصول إليها يتطلّب كتابة الرابط يدويًا.
 *
 * سلّم أهمية النص ومبرّراته في sportsPortalHeadline.ts (منطق نقي مُغطّى باختبار).
 * الارتفاع ثابت دائمًا فلا يزحزح الشريط ما تحته عند وصول البيانات.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import type { SpCompetition, SpLiveItem } from "@/pages/SportsHub";
import { pickHeadline, type Headline } from "./sportsPortalHeadline";

export default function SportsPortalStrip() {
  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({
    queryKey: ["/api/sports/competitions"],
    staleTime: 60 * 60_000,
  });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];

  // مباريات اليوم تحمل حالة المباشر أصلًا، فنكتفي بها ونتجنّب نداء /api/sports/live
  // بنبضه السريع (7ث) على الرئيسية. النبض يبقى داخل البوابة نفسها.
  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"],
    staleTime: 60_000,
    // لا نُشغّل التحديث الدوري إلا في يوم فيه مباريات — أغلب أيام ما قبل الموسم
    // لا تستحق نبضًا متكرّرًا على الرئيسية.
    refetchInterval: (query) => {
      const rows = query.state.data?.today;
      return Array.isArray(rows) && rows.length > 0 ? 60_000 : false;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData.today : [];

  const headline = useMemo<Headline>(
    () => pickHeadline(todayMatches, competitions),
    [todayMatches, competitions],
  );

  return (
    <div className="border-y border-border/60 bg-muted/40" data-testid="strip-sports-portal">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link
          href="/sports"
          className="group flex h-12 items-center gap-2.5 text-sm no-underline"
          data-testid="link-sports-portal"
        >
          {headline.live ? (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-black text-red-600 dark:text-red-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
              مباشر
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
              البوابة الرياضية
            </span>
          )}

          <span className="flex min-w-0 flex-1 items-center gap-2">
            {headline.match ? (
              <span className="flex min-w-0 items-center gap-1.5 font-bold text-foreground">
                <span className="truncate">{headline.match.home.name}</span>
                {headline.live ? (
                  // RTL: المضيف يمينًا، فتُعرض الأرقام (ضيف - مضيف) لأنها لا تنعكس مع dir.
                  <span className="shrink-0 font-black tabular-nums" dir="ltr">
                    {headline.match.goals.away ?? 0}
                    <span className="mx-0.5 text-muted-foreground">-</span>
                    {headline.match.goals.home ?? 0}
                  </span>
                ) : (
                  <span className="shrink-0 text-muted-foreground">×</span>
                )}
                <span className="truncate">{headline.match.away.name}</span>
              </span>
            ) : (
              <span className="truncate font-bold text-foreground">{headline.text}</span>
            )}
            {/* الذيل يختفي على الجوال حيث لا يتّسع السطر للاسمين والدعوة معًا */}
            <span className="hidden truncate text-muted-foreground sm:inline">· {headline.tail}</span>
          </span>

          <span className="flex shrink-0 items-center gap-0.5 font-bold text-primary">
            <span className="hidden sm:inline">ادخل البوابة</span>
            <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.2} />
          </span>
        </Link>
      </div>
    </div>
  );
}
