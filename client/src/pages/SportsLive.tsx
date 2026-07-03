/**
 * البث المباشر · العالم — /sports/live
 *
 * المباريات المباشرة في البطولات العالمية التي موسمها قائم الآن (بطولاتنا
 * المنتقاة دائمًا + أي دوري عالمي موسمه جارٍ، مع استبعاد الودّيات والفئات
 * السنّية)، مجمّعة حسب الدولة ثم الدوري — كما في تطبيقات النتائج المتخصّصة.
 * يكمّل البوابة الرياضية (/sports) ولوحة مبارياتنا (/sports/matches) دون مساسهما.
 *
 * المصدر: GET /api/sports/world-live (fixtures?live=all مُرشّح على الدوريات
 * القائمة عبر leagues?current=true، خلف كاش SWR). الأسماء المعروفة معرّبة؛
 * الدوريات الصغيرة تظهر بأسمائها الإنجليزية (fallback آمن).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Radio, Trophy } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { ACCENT, MatchDialog, competitionHref, type SpLiveItem } from "./SportsHub";
import { MatchRow } from "./SportsMatchesBoard";

const LIVE_REFETCH_MS = 15_000;

// مباراة من البث المباشر العالمي — توسعة SpLiveItem بحقول الدولة/الدوري للتجميع.
interface SpWorldLiveItem extends SpLiveItem {
  country: string;
  countryAr: string;
  flag: string | null;
  leagueId: number;
  leagueLogo: string | null;
}

// أولوية ظهور الدول: السعودية ثم الخليج ثم العرب ثم كبار أوروبا، والبقية بعدها
// حسب عدد المباريات المباشرة. (مطابقة لأهمية جمهور سبق.)
const COUNTRY_PRIORITY = [
  "Saudi Arabia", "United Arab Emirates", "Qatar", "Kuwait", "Bahrain", "Oman",
  "Egypt", "Morocco", "Tunisia", "Algeria", "Iraq", "Jordan", "Lebanon", "Syria",
  "England", "Spain", "Italy", "Germany", "France", "Portugal", "Netherlands",
];

interface LeagueGroup {
  leagueId: number;
  name: string;
  logo: string | null;
  slug: string | null;
  matches: SpWorldLiveItem[];
}
interface CountryGroup {
  country: string;
  countryAr: string;
  flag: string | null;
  liveCount: number;
  leagues: LeagueGroup[];
}

export default function SportsLive() {
  const { user } = useAuth();
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  useEffect(() => {
    document.title = "البث المباشر · العالم | سبق";
  }, []);
  useCanonical("https://sabq.org/sports/live");

  const { data, isLoading, isFetching, refetch } = useQuery<{ matches: SpWorldLiveItem[] }>({
    queryKey: ["/api/sports/world-live"],
    staleTime: LIVE_REFETCH_MS,
    refetchInterval: LIVE_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
  const matches = Array.isArray(data?.matches) ? data!.matches : [];

  // تحديث فوري عند عودة المستخدم للتبويب/الشبكة (الجوال يُجمّد التبويبات).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") refetch();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [refetch]);

  // التجميع: الدولة ← الدوري. ترتيب الدول بالأولوية ثم عدد المباشر، والمباريات
  // داخل كل دوري بالأكثر تقدّمًا في الوقت (elapsed) أولًا.
  const countries = useMemo<CountryGroup[]>(() => {
    const byCountry = new Map<string, SpWorldLiveItem[]>();
    for (const m of matches) {
      const key = m.country || "—";
      if (!byCountry.has(key)) byCountry.set(key, []);
      byCountry.get(key)!.push(m);
    }
    const groups: CountryGroup[] = Array.from(byCountry.entries()).map(([country, list]) => {
      const byLeague = new Map<number, LeagueGroup>();
      for (const m of list) {
        if (!byLeague.has(m.leagueId)) {
          byLeague.set(m.leagueId, {
            leagueId: m.leagueId, name: m.competition, logo: m.leagueLogo, slug: m.competitionSlug, matches: [],
          });
        }
        byLeague.get(m.leagueId)!.matches.push(m);
      }
      const leagues = Array.from(byLeague.values())
        .map((l) => ({ ...l, matches: [...l.matches].sort((a, b) => (b.status.elapsed ?? 0) - (a.status.elapsed ?? 0)) }))
        .sort((a, b) => a.name.localeCompare(b.name, "ar"));
      const first = list[0];
      return {
        country,
        countryAr: first?.countryAr || country,
        flag: first?.flag ?? null,
        liveCount: list.length,
        leagues,
      };
    });
    return groups.sort((a, b) => {
      const ap = COUNTRY_PRIORITY.indexOf(a.country);
      const bp = COUNTRY_PRIORITY.indexOf(b.country);
      const aa = ap === -1 ? 999 : ap;
      const bb = bp === -1 ? 999 : bp;
      if (aa !== bb) return aa - bb;
      if (a.liveCount !== b.liveCount) return b.liveCount - a.liveCount;
      return a.countryAr.localeCompare(b.countryAr, "ar");
    });
  }, [matches]);

  const total = matches.length;

  const toggle = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} sticky={false} />

      <main className="flex-1">
        {/* ترويسة — عبارة كبيرة في المنتصف بأسلوب /sabq-ai */}
        <section className="border-b border-border bg-card px-4 pt-10 pb-8 text-center sm:pt-12 sm:pb-9" data-testid="live-hero">
          <span className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/10 px-5 py-1.5 text-xs font-bold text-primary md:text-[13px]">
            سبق سبورت — البث المباشر
          </span>
          <h1 className="mx-auto max-w-2xl text-balance text-3xl font-extrabold leading-[1.4] text-foreground md:text-4xl">
            كل ملاعب <span className="text-primary">العالم</span>… على الهواء الآن
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
            المباريات المباشرة في البطولات العالمية التي موسمها قائم — مجمّعة حسب الدولة والدوري.
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {total > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-[12px] font-bold tabular-nums text-white">
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {total} مباشر الآن
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground">
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5 text-red-500" />}
              تحديث تلقائي
            </span>
            <Link
              href="/sports/matches"
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              مباريات اليوم <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
            </Link>
            <Link
              href="/sports"
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              البوابة الرياضية <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
            </Link>
          </div>
        </section>

        {/* المحتوى */}
        <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 sm:py-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> جارٍ تحميل المباريات المباشرة…
            </div>
          ) : total === 0 ? (
            <div className="text-center text-muted-foreground py-20 bg-card rounded-2xl border border-dashed border-border">
              <Radio className="w-10 h-10 mx-auto mb-3 opacity-40" />
              لا توجد مباريات مباشرة الآن في البطولات العالمية القائمة — عُد عند انطلاق المباريات.
            </div>
          ) : (
            <div className="space-y-6">
              {countries.map((c) => (
                <section key={c.country}>
                  {/* رأس الدولة */}
                  <div className="flex items-center gap-2.5 px-1 pb-2.5">
                    {c.flag ? (
                      <img src={c.flag} alt="" className="w-7 h-5 object-cover rounded-sm ring-1 ring-border shrink-0" loading="lazy" />
                    ) : (
                      <span className="w-7 h-5 rounded-sm bg-muted shrink-0" />
                    )}
                    <h2 className="text-base font-black text-foreground">{c.countryAr}</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      {c.liveCount} مباشر
                    </span>
                  </div>

                  {/* دوريات الدولة */}
                  <div className="space-y-3">
                    {c.leagues.map((l) => (
                      <div key={l.leagueId} className="overflow-hidden rounded-2xl border border-border bg-card">
                        <div className="flex items-center gap-2.5 border-b border-border bg-muted/60 px-3 py-2.5 sm:px-4 sm:py-3">
                          {l.slug ? (
                            <Link href={competitionHref(l.slug)} className="group flex min-w-0 flex-1 items-center gap-2.5" title={`صفحة بطولة ${l.name}`}>
                              {l.logo ? (
                                <img src={l.logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />
                              ) : (
                                <Trophy className={`w-5 h-5 shrink-0 ${ACCENT}`} />
                              )}
                              <span className="font-black text-foreground truncate group-hover:text-primary transition-colors">{l.name}</span>
                              <ChevronLeft className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                            </Link>
                          ) : (
                            <>
                              {l.logo ? (
                                <img src={l.logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />
                              ) : (
                                <Trophy className={`w-5 h-5 shrink-0 ${ACCENT}`} />
                              )}
                              <span className="font-black text-foreground truncate flex-1">{l.name}</span>
                            </>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            {l.matches.length} مباشر
                          </span>
                        </div>
                        <div>
                          {l.matches.map((m) => (
                            <MatchRow key={m.id} f={m} expanded={expandedIds.has(m.id)} onToggle={() => toggle(m.id)} onOpen={setOpenMatch} flat />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
