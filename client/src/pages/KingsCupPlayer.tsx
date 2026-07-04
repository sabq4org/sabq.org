/**
 * صفحة اللاعب في كأس خادم الحرمين الشريفين — /kings-cup/player/:id
 *
 * هيرو داكن بهوية الكأس ثم «أرقام اللاعب في كأس الملك» مُبرزة بالذهبي قبل
 * بقية البطولات، وكامل عمق ملف اللاعب بإعادة استخدام بطاقات صفحة لاعب
 * البوابة (القيمة السوقية/الفورمة/تطوّر الأداء/الانتقالات/الإصابات):
 * البيانات من /api/kings-cup/player/:id?with=extras وتوابعها /form و/market.
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Cake, ChevronRight, MapPin, Ruler, Trophy, User, Weight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { SportsNewsBlock } from "@/components/sports/SportsNewsBlock";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BioItem,
  InjuriesCard,
  MarketValueCard,
  PerformanceChart,
  RecentFormCard,
  TransfersCard,
  type SpPlayerCard,
  type SpPlayerForm,
  type SpPlayerMarket,
  type SpPlayerSeasonStats,
} from "./SportsPlayer";

const birthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
function fmtBirth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : birthFmt.format(d);
}

function seasonsRange(seasons: number[]): string {
  if (seasons.length === 0) return "";
  const min = Math.min(...seasons);
  const max = Math.max(...seasons);
  return min === max ? String(min) : `${min}–${max}`;
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/40">
      <div className={`text-lg font-black tabular-nums ${accent ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function isKingsCupCompetition(name: string): boolean {
  return name.includes("خادم الحرمين") || name.includes("كأس الملك");
}

/** أرقام اللاعب في الكأس — بطاقة مُبرزة بإطار ذهبي تتصدّر الصفحة */
function KcSeasonHighlight({ stats, isGk }: { stats: SpPlayerSeasonStats; isGk: boolean }) {
  return (
    <Card className="p-5 border-amber-300/40 bg-amber-400/5">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-amber-500" />
        <h2 className="font-bold text-lg">أرقامه في كأس الملك</h2>
        <Badge variant="secondary" className="text-[10px]">{stats.team.name}</Badge>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <Stat label="مباريات" value={stats.matches} accent />
        {isGk ? (
          <>
            <Stat label="تصديات" value={stats.saves} />
            <Stat label="استقبل" value={stats.conceded} />
          </>
        ) : (
          <>
            <Stat label="أهداف" value={stats.goals} accent />
            <Stat label="صناعة" value={stats.assists} />
          </>
        )}
        <Stat label="دقائق" value={stats.minutes} />
        <Stat label="🟨" value={stats.yellow} />
        <Stat label="🟥" value={stats.red} />
      </div>
      {stats.rating != null && (
        <p className="text-xs text-muted-foreground mt-3">
          التقييم في البطولة: <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">{stats.rating.toFixed(2)}</span>
        </p>
      )}
    </Card>
  );
}

export default function KingsCupPlayer() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data, isLoading, isError } = useQuery<SpPlayerCard>({
    queryKey: [`/api/kings-cup/player/${id}`, { with: "extras" }],
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 10 * 60_000,
  });

  const { data: market } = useQuery<SpPlayerMarket>({
    queryKey: [`/api/kings-cup/player/${id}/market`],
    enabled: Number.isFinite(id) && id > 0 && !!data,
    staleTime: 30 * 60_000,
  });

  const { data: form } = useQuery<SpPlayerForm>({
    queryKey: [`/api/kings-cup/player/${id}/form`],
    enabled: Number.isFinite(id) && id > 0 && !!data,
    staleTime: 30 * 60_000,
  });

  useEffect(() => {
    document.title = data?.name
      ? `${data.name} — كأس خادم الحرمين الشريفين | سبق`
      : "اللاعب — كأس خادم الحرمين الشريفين | سبق";
  }, [data?.name]);
  useCanonical(`https://sabq.org/kings-cup/player/${id}`);

  const notFound = isError || (!isLoading && !data);
  const isGk = Boolean(data?.position?.includes("حراسة"));
  const currentClub = data?.currentTeam ?? data?.seasonStats?.[0]?.team ?? null;
  const kcStats = (data?.seasonStats ?? []).find((s) => isKingsCupCompetition(s.competition)) ?? null;
  const otherStats = (data?.seasonStats ?? []).filter((s) => !isKingsCupCompetition(s.competition));

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {/* هيرو اللاعب — أرضية الكأس الليلية */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828]" />
          <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" />
          <div className="relative container max-w-4xl mx-auto px-4 sm:px-6 py-8">
            <Link href="/kings-cup">
              <a className="inline-flex items-center gap-1 text-xs text-emerald-100/70 hover:text-white mb-5">
                <ChevronRight className="h-4 w-4" />
                العودة لمركز كأس الملك
              </a>
            </Link>
            {isLoading ? (
              <div className="flex items-center gap-5">
                <Skeleton className="h-24 w-24 rounded-full bg-white/10" />
                <div className="space-y-2">
                  <Skeleton className="h-7 w-48 bg-white/10" />
                  <Skeleton className="h-4 w-32 bg-white/10" />
                </div>
              </div>
            ) : data ? (
              <div className="flex items-center gap-5 flex-wrap">
                {data.photo ? (
                  <img
                    src={data.photo}
                    alt={data.name}
                    className="w-24 h-24 rounded-full object-cover bg-white ring-4 ring-amber-300/40 shadow-2xl"
                  />
                ) : (
                  <span className="w-24 h-24 rounded-full bg-white/10 ring-4 ring-amber-300/20" />
                )}
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-black text-white">{data.name}</h1>
                  {data.fullName && <p className="text-sm text-emerald-100/70 mt-0.5">{data.fullName}</p>}
                  {currentClub && (
                    <Link
                      href={currentClub.id ? `/kings-cup/team/${currentClub.id}` : "#"}
                      className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-white hover:text-amber-300 transition-colors"
                    >
                      {currentClub.logo && (
                        <span className="h-6 w-6 rounded-full bg-white p-0.5">
                          <img src={currentClub.logo} alt="" className="h-full w-full object-contain" loading="lazy" />
                        </span>
                      )}
                      {currentClub.name}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {data.position && <Badge className="bg-white/10 text-emerald-100 border-0">{data.position}</Badge>}
                    {data.number != null && (
                      <Badge className="bg-amber-400/15 text-amber-200 border border-amber-300/30 tabular-nums">#{data.number}</Badge>
                    )}
                    {data.nationality && <Badge className="bg-white/10 text-emerald-100 border-0">{data.nationality}</Badge>}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <div className="container max-w-4xl mx-auto px-4 sm:px-6 py-8">
          {notFound ? (
            <Card className="p-10 text-center">
              <User className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-bold text-foreground">ملف اللاعب غير متاح حاليًا</p>
              <p className="text-sm text-muted-foreground mt-1">تعذّر جلب بيانات هذا اللاعب من المزوّد.</p>
              <Link href="/kings-cup" className="inline-block mt-4 text-sm text-primary font-semibold">
                العودة لمركز كأس الملك
              </Link>
            </Card>
          ) : data ? (
            <div className="space-y-6">
              {/* أرقامه في الكأس أولًا — سياق الصفحة */}
              {kcStats && <KcSeasonHighlight stats={kcStats} isGk={isGk} />}

              {/* المعلومات الشخصية */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <BioItem icon={<User className="w-4 h-4" />} label="العمر" value={data.age != null ? `${data.age} سنة` : ""} />
                <BioItem icon={<Cake className="w-4 h-4" />} label="تاريخ الميلاد" value={fmtBirth(data.birthDate)} />
                <BioItem icon={<MapPin className="w-4 h-4" />} label="مكان الميلاد" value={data.birthPlace ?? ""} />
                <BioItem icon={<Ruler className="w-4 h-4" />} label="الطول" value={data.height != null ? `${data.height} سم` : ""} />
                <BioItem icon={<Weight className="w-4 h-4" />} label="الوزن" value={data.weight != null ? `${data.weight} كجم` : ""} />
              </div>

              {/* القيمة السوقية (TheSports) */}
              {market?.available && market.value != null && <MarketValueCard market={market} />}

              {/* الفورمة الأخيرة (SportMonks) */}
              {form?.available && form.matches.length > 0 && <RecentFormCard matches={form.matches} />}

              {/* تطوّر الأداء عبر المواسم */}
              {data.history && data.history.length > 1 && <PerformanceChart points={data.history} />}

              {/* أرقام بقية البطولات هذا الموسم */}
              {otherStats.length > 0 && (
                <Card className="p-5">
                  <h2 className="font-bold text-lg mb-4">أرقام الموسم في بقية البطولات</h2>
                  <div className="space-y-5">
                    {otherStats.map((s, i) => (
                      <div key={`${s.competition}-${i}`}>
                        <div className="flex items-center gap-2 mb-3">
                          {s.team.logo && <img src={s.team.logo} alt="" className="w-5 h-5 object-contain" />}
                          <span className="text-sm font-bold text-foreground">{s.team.name}</span>
                          <span className="text-xs text-muted-foreground">• {s.competition}</span>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                          <Stat label="مباريات" value={s.matches} />
                          {isGk ? (
                            <>
                              <Stat label="تصديات" value={s.saves} />
                              <Stat label="استقبل" value={s.conceded} />
                            </>
                          ) : (
                            <>
                              <Stat label="أهداف" value={s.goals} />
                              <Stat label="صناعة" value={s.assists} />
                            </>
                          )}
                          <Stat label="دقائق" value={s.minutes} />
                          <Stat label="🟨" value={s.yellow} />
                          <Stat label="🟥" value={s.red} />
                        </div>
                        {s.rating != null && (
                          <p className="text-xs text-muted-foreground mt-2">
                            التقييم: <span className="font-bold text-foreground tabular-nums">{s.rating.toFixed(2)}</span>
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* أخبار اللاعب */}
              <SportsNewsBlock query={data.name} title="أخبار اللاعب" />

              {/* المسيرة */}
              {data.career.length > 0 && (
                <Card className="p-5">
                  <h2 className="font-bold text-lg mb-4">المسيرة</h2>
                  <div className="divide-y divide-border">
                    {data.career.map((c) => (
                      <div key={`${c.teamId || c.team}-${c.seasons[0] ?? 0}`} className="flex items-center gap-3 py-3">
                        {c.logo && <img src={c.logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />}
                        <span className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">{c.team}</span>
                        <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                          {seasonsRange(c.seasons)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* الانتقالات والإصابات */}
              {data.transfers && data.transfers.length > 0 && <TransfersCard transfers={data.transfers} />}
              {data.injuries && data.injuries.length > 0 && <InjuriesCard injuries={data.injuries} />}

              {/* الألقاب */}
              {data.trophies.length > 0 && (
                <Card className="p-5">
                  <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" /> الألقاب
                  </h2>
                  <div className="space-y-2">
                    {data.trophies.map((t, i) => (
                      <div key={`${t.competition}-${t.season}-${i}`} className="flex items-center gap-3 text-sm">
                        <Trophy className={`w-4 h-4 shrink-0 ${t.winner ? "text-amber-500" : "text-muted-foreground/50"}`} />
                        <span className="font-semibold text-foreground flex-1 min-w-0 truncate">{t.competition}</span>
                        {t.place && (
                          <Badge variant={t.winner ? "default" : "secondary"} className="text-[10px]">{t.place}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground tabular-nums">{t.season}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      </main>
      <Footer />
    </div>
  );
}
