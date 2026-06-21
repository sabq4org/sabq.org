/**
 * صفحة اللاعب — /sports/player/:id
 *
 * تستهلك /api/sports/player/:id (ملف شخصي + أرقام الموسم في كل بطولة + المسيرة + الألقاب).
 * تتدهور بسلاسة: 404 → حالة «غير متاح». كل البيانات معرَّبة من الخدمة.
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, Cake, MapPin, Ruler, Stethoscope, TrendingUp, Trophy, User, Weight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { SportsNewsBlock } from "@/components/sports/SportsNewsBlock";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface SpTeam { id: number; name: string; logo: string; winner: boolean | null; }
interface SpPlayerSeasonStats {
  competition: string; team: SpTeam; matches: number; lineups: number; minutes: number;
  rating: number | null; goals: number; assists: number; yellow: number; red: number; saves: number; conceded: number;
}
interface SpPlayerCareerStop { teamId: number; team: string; logo: string; seasons: number[]; }
interface SpPlayerTrophy { competition: string; country: string; season: string; place: string; winner: boolean; }
// الموجة 2: إثراء اختياري عبر ?with=extras.
interface SpPlayerSeasonPoint { season: number; competition: string; matches: number; goals: number; assists: number; }
interface SpPlayerTransfer {
  date: string; type: string;
  fromId: number; from: string; fromLogo: string;
  toId: number; to: string; toLogo: string;
}
interface SpPlayerInjury { date: string; type: string; reason: string; team: string; competition: string; }
interface SpPlayerCard {
  id: number; name: string; fullName: string | null; photo: string;
  position: string; number: number | null; age: number | null;
  birthDate: string | null; birthPlace: string | null; nationality: string | null;
  height: number | null; weight: number | null;
  seasonStats: SpPlayerSeasonStats[]; career: SpPlayerCareerStop[]; trophies: SpPlayerTrophy[];
  history?: SpPlayerSeasonPoint[]; transfers?: SpPlayerTransfer[]; injuries?: SpPlayerInjury[];
}

const birthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
function fmtBirth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : birthFmt.format(d);
}

function seasonsRange(seasons: number[]): string {
  if (seasons.length === 0) return "";
  const first = seasons[0];
  const last = seasons[seasons.length - 1];
  return first === last ? String(first) : `${first}–${last}`;
}

const shortDateFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" });
function fmtShortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : shortDateFmt.format(d);
}

function BioItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/40">
      <span className="text-primary shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold text-foreground truncate">{value}</div>
      </div>
    </div>
  );
}

// الموجة 2 — البند 5: رسم تطوّر الأداء (أعمدة SVG خفيفة، بلا اعتمادية خارجية).
function PerformanceChart({ points }: { points: SpPlayerSeasonPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.goals + p.assists));
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">تطوّر الأداء</h2>
        <span className="text-[11px] text-muted-foreground">آخر {points.length} مواسم</span>
      </div>
      <div className="flex items-end justify-around gap-3 h-44" dir="ltr">
        {points.map((p) => {
          const gH = Math.round((p.goals / max) * 100);
          const aH = Math.round((p.assists / max) * 100);
          return (
            <div key={p.season} className="flex-1 flex flex-col items-center gap-2 min-w-0">
              <div className="flex items-end gap-1 h-32 w-full justify-center">
                <div className="w-1/3 max-w-[28px] bg-primary rounded-t-md transition-all flex items-start justify-center" style={{ height: `${Math.max(gH, p.goals > 0 ? 6 : 0)}%` }} title={`${p.goals} هدف`}>
                  {p.goals > 0 && <span className="text-[10px] font-black text-primary-foreground mt-0.5">{p.goals}</span>}
                </div>
                <div className="w-1/3 max-w-[28px] bg-amber-400 rounded-t-md transition-all flex items-start justify-center" style={{ height: `${Math.max(aH, p.assists > 0 ? 6 : 0)}%` }} title={`${p.assists} صناعة`}>
                  {p.assists > 0 && <span className="text-[10px] font-black text-amber-950 mt-0.5">{p.assists}</span>}
                </div>
              </div>
              <div className="text-center" dir="rtl">
                <div className="text-xs font-bold text-foreground tabular-nums">{p.season}</div>
                <div className="text-[10px] text-muted-foreground truncate max-w-[90px]">{p.competition}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums">{p.matches} مباراة</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary" /> أهداف</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400" /> صناعة</span>
      </div>
    </Card>
  );
}

// الموجة 2 — البند 6: مسيرة انتقالات اللاعب.
function TransfersCard({ transfers }: { transfers: SpPlayerTransfer[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">مسيرة الانتقالات</h2>
      </div>
      <div className="space-y-2">
        {transfers.map((t, i) => (
          <div key={`${t.date}-${i}`} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
            <span className="text-[11px] text-muted-foreground w-20 shrink-0 tabular-nums">{fmtShortDate(t.date)}</span>
            <div className="flex items-center gap-2 flex-1 min-w-0" dir="ltr">
              <TeamChip id={t.fromId} name={t.from} logo={t.fromLogo} />
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 rotate-180" />
              <TeamChip id={t.toId} name={t.to} logo={t.toLogo} />
            </div>
            {t.type && <Badge variant="secondary" className="text-[10px] shrink-0">{t.type}</Badge>}
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamChip({ id, name, logo }: { id: number; name: string; logo: string }) {
  const inner = (
    <span className="flex items-center gap-1.5 min-w-0">
      {logo && <img src={logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
      <span className="text-xs font-semibold text-foreground truncate">{name}</span>
    </span>
  );
  return id ? (
    <Link href={`/sports/team/${id}`} className="hover:text-primary transition-colors min-w-0">{inner}</Link>
  ) : inner;
}

// الموجة 2 — البند 7: سجلّ الإصابات/الغيابات.
function InjuriesCard({ injuries }: { injuries: SpPlayerInjury[] }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Stethoscope className="w-5 h-5 text-red-500" />
        <h2 className="font-bold text-lg">الإصابات والغيابات</h2>
      </div>
      <div className="space-y-2">
        {injuries.map((inj, i) => (
          <div key={`${inj.date}-${i}`} className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
            <span className="w-1.5 h-8 rounded-full bg-red-500/70 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground truncate">{inj.reason || inj.type || "غياب"}</div>
              <div className="text-[11px] text-muted-foreground">
                {inj.team}{inj.competition ? ` · ${inj.competition}` : ""}
              </div>
            </div>
            <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{fmtShortDate(inj.date)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function SportsPlayer() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data, isLoading, isError } = useQuery<SpPlayerCard>({
    queryKey: [`/api/sports/player/${id}`, { with: "extras" }],
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 10 * 60_000,
  });

  useEffect(() => {
    document.title = data?.name ? `${data.name} | الرياضة - سبق` : "اللاعب | الرياضة - سبق";
  }, [data?.name]);
  useCanonical(`https://sabq.org/sports/player/${id}`);

  const notFound = isError || (!isLoading && !data);
  const isGk = data?.position?.includes("حراسة");

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        <Link href="/sports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowRight className="w-4 h-4" /> البوابة الرياضية
        </Link>

        {isLoading ? (
          <div className="space-y-5">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
        ) : notFound ? (
          <Card className="p-10 text-center">
            <User className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold text-foreground">ملف اللاعب غير متاح حاليًا</p>
            <p className="text-sm text-muted-foreground mt-1">تعذّر جلب بيانات هذا اللاعب من المزوّد.</p>
            <Link href="/sports" className="inline-block mt-4 text-sm text-primary font-semibold">العودة للبوابة الرياضية</Link>
          </Card>
        ) : data ? (
          <div className="space-y-6">
            {/* الترويسة */}
            <Card className="p-6">
              <div className="flex items-center gap-5 flex-wrap">
                {data.photo ? (
                  <img src={data.photo} alt={data.name} className="w-24 h-24 rounded-full object-cover bg-muted ring-2 ring-primary/30" />
                ) : (
                  <span className="w-24 h-24 rounded-full bg-muted" />
                )}
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-black text-foreground">{data.name}</h1>
                  {data.fullName && <p className="text-sm text-muted-foreground mt-0.5">{data.fullName}</p>}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {data.position && <Badge variant="secondary">{data.position}</Badge>}
                    {data.number != null && <Badge variant="outline" className="tabular-nums">#{data.number}</Badge>}
                    {data.nationality && <Badge variant="outline">{data.nationality}</Badge>}
                  </div>
                </div>
              </div>
            </Card>

            {/* المعلومات الشخصية */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <BioItem icon={<User className="w-4 h-4" />} label="العمر" value={data.age != null ? `${data.age} سنة` : ""} />
              <BioItem icon={<Cake className="w-4 h-4" />} label="تاريخ الميلاد" value={fmtBirth(data.birthDate)} />
              <BioItem icon={<MapPin className="w-4 h-4" />} label="مكان الميلاد" value={data.birthPlace ?? ""} />
              <BioItem icon={<Ruler className="w-4 h-4" />} label="الطول" value={data.height != null ? `${data.height} سم` : ""} />
              <BioItem icon={<Weight className="w-4 h-4" />} label="الوزن" value={data.weight != null ? `${data.weight} كجم` : ""} />
            </div>

            {/* تطوّر الأداء (الموجة 2) */}
            {data.history && data.history.length > 1 && <PerformanceChart points={data.history} />}

            {/* أرقام الموسم */}
            {data.seasonStats.length > 0 && (
              <Card className="p-5">
                <h2 className="font-bold text-lg mb-4">أرقام الموسم</h2>
                <div className="space-y-5">
                  {data.seasonStats.map((s, i) => (
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
                            <Stat label="أهداف" value={s.goals} accent />
                            <Stat label="صناعة" value={s.assists} />
                          </>
                        )}
                        <Stat label="دقائق" value={s.minutes} />
                        <Stat label="🟨" value={s.yellow} />
                        <Stat label="🟥" value={s.red} />
                      </div>
                      {s.rating != null && (
                        <p className="text-xs text-muted-foreground mt-2">التقييم: <span className="font-bold text-foreground tabular-nums">{s.rating.toFixed(2)}</span></p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* أخبار اللاعب — مبنية على الكلمة المفتاحية (اسم اللاعب) */}
            <SportsNewsBlock query={data.name} title="أخبار اللاعب" />

            {/* المسيرة */}
            {data.career.length > 0 && (
              <Card className="p-5">
                <h2 className="font-bold text-lg mb-4">المسيرة</h2>
                <div className="divide-y divide-border">
                  {data.career.map((c) => {
                    const inner = (
                      <>
                        {c.logo && <img src={c.logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />}
                        <span className="text-sm font-semibold text-foreground flex-1 min-w-0 truncate">{c.team}</span>
                        <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{seasonsRange(c.seasons)}</span>
                      </>
                    );
                    return c.teamId ? (
                      <Link key={`${c.teamId}-${c.seasons[0] ?? 0}`} href={`/sports/team/${c.teamId}`} className="flex items-center gap-3 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors">
                        {inner}
                      </Link>
                    ) : (
                      <div key={`${c.team}-${c.seasons[0] ?? 0}`} className="flex items-center gap-3 py-3">{inner}</div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* الانتقالات (الموجة 2) */}
            {data.transfers && data.transfers.length > 0 && <TransfersCard transfers={data.transfers} />}

            {/* الإصابات (الموجة 2) */}
            {data.injuries && data.injuries.length > 0 && <InjuriesCard injuries={data.injuries} />}

            {/* الألقاب */}
            {data.trophies.length > 0 && (
              <Card className="p-5">
                <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> الألقاب</h2>
                <div className="space-y-2">
                  {data.trophies.map((t, i) => (
                    <div key={`${t.competition}-${t.season}-${i}`} className="flex items-center gap-3 text-sm">
                      <Trophy className={`w-4 h-4 shrink-0 ${t.winner ? "text-amber-500" : "text-muted-foreground/50"}`} />
                      <span className="font-semibold text-foreground flex-1 min-w-0 truncate">{t.competition}</span>
                      {t.place && <Badge variant={t.winner ? "default" : "secondary"} className="text-[10px]">{t.place}</Badge>}
                      <span className="text-xs text-muted-foreground tabular-nums">{t.season}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ) : null}
      </main>
      <Footer />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="text-center p-2 rounded-lg bg-muted/40">
      <div className={`text-lg font-black tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
