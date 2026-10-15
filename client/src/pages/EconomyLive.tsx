/**
 * /economy — «الاقتصاد بالأرقام»: صفحة مستقلة لبيانات البنك المركزي السعودي الحية
 * (ترويسة بأسلوب بوابة الرياضة، شريط الأرقام، وحدة إنفاق الأسبوع، إعلانات ساما).
 * قسم «أعمال» يبقى للأخبار فقط.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, Landmark, Radio } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Skeleton } from "@/components/ui/skeleton";
import { EconomyTicker } from "@/components/economy/EconomyTicker";
import { WeeklySpendingModule } from "@/components/economy/WeeklySpendingModule";
import { MonthlyModule } from "@/components/economy/MonthlyModule";
import { SamaNewsFeed } from "@/components/economy/SamaNewsFeed";
import { useEconomyStream } from "@/components/economy/useEconomyStream";
import { fmtDateAr } from "@/components/economy/format";
import type { EconomySnapshot } from "@/components/economy/types";

export default function EconomyLive() {
  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({ queryKey: ["/api/auth/user"], retry: false });
  const { data, isLoading } = useQuery<EconomySnapshot | null>({ queryKey: ["/api/economy/snapshot"], staleTime: 60_000, refetchInterval: 5 * 60_000 });
  const { last, connected } = useEconomyStream(true);
  const [flashKey, setFlashKey] = useState<string | null>(null);

  useEffect(() => { document.title = "الاقتصاد بالأرقام — بيانات البنك المركزي السعودي حيًا | سبق"; }, []);
  useEffect(() => {
    if (!last) return;
    setFlashKey(last.kind === "indicator" ? last.key : last.kind);
    const t = setTimeout(() => setFlashKey(null), 4000);
    return () => clearTimeout(t);
  }, [last]);

  const repo = data?.indicators.find((i) => i.key === "repo");
  // آخر «بيان» صدر من ساما (لا وقت فحصنا): أحدث asOf بين المؤشرات والصرف وتقرير الأسبوع
  const latestAsOf = data
    ? [
        ...data.indicators.map((i) => i.asOf ?? ""),
        data.fxAsOf ?? "",
        data.weekly?.periodEnd ?? "",
      ].filter(Boolean).sort().pop() ?? null
    : null;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header user={user} />

      <section className="border-b border-border bg-card px-4 pt-7 pb-6 text-center sm:px-6 sm:pt-12 sm:pb-10" data-testid="economy-hero">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:h-14 sm:w-14">
          <Landmark className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
        </div>
        <h1 className="mx-auto max-w-3xl text-balance text-[26px] font-extrabold leading-[1.3] text-foreground sm:text-4xl md:text-5xl">
          الاقتصاد السعودي بالأرقام…
          <br />
          <span className="text-primary">من البنك المركزي إلى شاشتك</span>
        </h1>
        <p className="mx-auto mt-2.5 max-w-2xl text-[14px] font-medium leading-relaxed text-foreground/70 sm:mt-3.5 sm:text-base md:text-lg">
          إنفاق الأسبوع، السعوديون في شهر، أسعار الصرف، الفائدة والتضخم — أرقام رسمية تتحدث تلقائيًا لحظة صدورها من البنك المركزي السعودي.
        </p>
        <div className="mt-5 flex flex-col items-center gap-2.5 sm:mt-6">
          <Link href="/category/business" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-[14px] font-bold text-primary-foreground transition-opacity hover:opacity-90">
            أخبار الأعمال <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Radio className={connected ? "h-3 w-3 text-emerald-500 motion-safe:animate-pulse" : "h-3 w-3"} aria-hidden="true" />
            يتحدث تلقائيًا فور صدور بيانات البنك المركزي{latestAsOf ? ` · آخر بيان: ${fmtDateAr(latestAsOf)}` : ""}
          </span>
        </div>
      </section>

      <main className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {isLoading && <Skeleton className="h-28 w-full rounded-xl" />}
        {!isLoading && (!data || data.indicators.length === 0) && (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">البيانات قيد التحميل من البنك المركزي — عُد بعد دقائق.</div>
        )}
        {data && data.indicators.length > 0 && (
          <>
            <section aria-label="الاقتصاد بالأرقام">
              <EconomyTicker snapshot={data} flashKey={flashKey} layout="grid" />
              {data.decision.isDecisionNight && repo ? (
                <div className="mt-4 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 flex flex-wrap items-center justify-between gap-2" role="status">
                  <div>
                    <div className="font-bold">قرار الفائدة الليلة</div>
                    <div className="text-xs text-muted-foreground">نتابع البنك المركزي لحظة بلحظة — الريبو الآن {repo.valueText}، وسيتحدث هنا فور الإعلان.</div>
                  </div>
                  <span className="text-xs font-semibold text-primary">رصد كل 60 ثانية</span>
                </div>
              ) : data.decision.nextDecisionDate && repo ? (
                <p className="mt-2 text-[11px] text-muted-foreground">قرار الفائدة القادم: {fmtDateAr(data.decision.nextDecisionDate)} — الريبو ثابت عند {repo.valueText} منذ {fmtDateAr(repo.asOf)}. المصدر: البنك المركزي السعودي.</p>
              ) : null}
            </section>

            {data.weekly && <WeeklySpendingModule />}

            {data.monthly && <MonthlyModule />}

            <SamaNewsFeed items={data.samaNews} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
