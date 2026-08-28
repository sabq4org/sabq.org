/**
 * الرأس الحي لقسم الاقتصاد — يُركَّب فوق قائمة أخبار تصنيف الاقتصاد (business في الإنتاج / economy محليًا):
 *   1) شريط «الاقتصاد بالأرقام» (يتحدث عبر SSE)  2) لافتة ليلة قرار الفائدة
 *   3) وحدة إنفاق الأسبوع  4) إعلانات ساما.
 * يختفي كليًا إن لم تتوفر بيانات (لا أصفار ولا أخطاء مرئية).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Radio } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EconomyTicker } from "./EconomyTicker";
import { WeeklySpendingModule } from "./WeeklySpendingModule";
import { SamaNewsFeed } from "./SamaNewsFeed";
import { useEconomyStream } from "./useEconomyStream";
import { fmtDateAr, relativeAr } from "./format";
import type { EconomySnapshot } from "./types";

export function EconomyLiveHeader() {
  const { data, isLoading } = useQuery<EconomySnapshot | null>({ queryKey: ["/api/economy/snapshot"], staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const { last, connected } = useEconomyStream(true);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  useEffect(() => {
    if (!last) return;
    setFlashKey(last.kind === "indicator" ? last.key : last.kind);
    const t = setTimeout(() => setFlashKey(null), 4000);
    return () => clearTimeout(t);
  }, [last]);

  if (isLoading) {
    return (
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 pt-4">
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (!data || data.indicators.length === 0) return null;

  const repo = data.indicators.find((i) => i.key === "repo");
  const latest = data.indicators.reduce((m, i) => (i.observedAt > m ? i.observedAt : m), data.updatedAt);

  return (
    <div className="container mx-auto px-3 sm:px-6 lg:px-8 pt-4 space-y-6" data-testid="economy-live-header">
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold">الاقتصاد بالأرقام</h2>
            <span className="text-[11px] text-muted-foreground hidden sm:inline">المصدر: البنك المركزي السعودي</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" title={connected ? "متصل ببث التحديثات" : "يتحدث كل 5 دقائق"}>
            <Radio className={connected ? "h-3.5 w-3.5 text-emerald-500 motion-safe:animate-pulse" : "h-3.5 w-3.5"} aria-hidden="true" />
            {connected ? "مباشر" : "تلقائي"} · حُدّث {relativeAr(latest)}
          </span>
        </div>
        <EconomyTicker snapshot={data} flashKey={flashKey} />
      </div>

      {data.decision.isDecisionNight && repo && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2" role="status">
          <div>
            <div className="font-bold">قرار الفائدة الليلة</div>
            <div className="text-xs text-muted-foreground">نتابع البنك المركزي لحظة بلحظة — الريبو الآن {repo.valueText}، وسيتحدث هنا فور الإعلان.</div>
          </div>
          <span className="text-xs font-semibold text-primary">رصد كل 60 ثانية</span>
        </div>
      )}
      {!data.decision.isDecisionNight && data.decision.nextDecisionDate && repo && (
        <p className="text-[11px] text-muted-foreground -mt-4">قرار الفائدة القادم: {fmtDateAr(data.decision.nextDecisionDate)} — الريبو ثابت عند {repo.valueText} منذ {fmtDateAr(repo.asOf)}.</p>
      )}

      {data.weekly && <WeeklySpendingModule />}

      <SamaNewsFeed items={data.samaNews} />
    </div>
  );
}

export default EconomyLiveHeader;
