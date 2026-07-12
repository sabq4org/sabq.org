import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "wouter";
import { Activity, ArrowRight, CalendarDays, Flame, Gauge, MapPin, Sparkles, Trophy, Tv, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { formatKickoffDay, formatKickoffTime, type AcFixture, type AcTeam } from "./acTypes";

type AcEvent = { minute: number; extraMinute: number | null; teamId: number; type: string; label: string; player: string; playerEn: string; assist: string | null };
type AcStatistic = { key: string; label: string; home: string; away: string };
type AcRating = { id: number; name: string; nameEn: string; photo: string; teamId: number; position: string; rating: number; goals: number; assists: number };
type AcLineupPlayer = { id: number; name: string; nameEn: string; number: number | null; position: string | null };
type AcLineup = { teamId: number; teamName: string; formation: string | null; coach: string; startXI: AcLineupPlayer[]; substitutes: AcLineupPlayer[] };
type AcTvChannel = { name: string; country: string | null; logo: string | null };
type AcMomentumPoint = { label: string; minute: number; home: number; away: number; net: number };
type AcMomentum = { available: boolean; live: boolean; possession: { home: number; away: number } | null; points: AcMomentumPoint[] };
type AcPressure = { available: boolean; live: boolean; latest: { side: "home" | "away" | "even"; value: number } | null; points: AcMomentumPoint[] };
type AcMatchDetail = { fixture: AcFixture; events: AcEvent[]; statistics: AcStatistic[]; ratings: AcRating[]; lineups: AcLineup[]; headToHead: AcFixture[]; manOfTheMatch: AcRating | null; prediction: { home: number; draw: number; away: number } | null; tv?: AcTvChannel[]; trend?: unknown };

type AcSquadPlayer = { id: number; name: string; nameEn: string; number: number | null; position: string; positionEn: string; age: number | null; photo: string };
type AcTeamProfile = { team: AcTeam; coach: string | null; stats: { groupName: string | null; rank: number | null; played: number; win: number; draw: number; lose: number; goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number; form: string[] }; nextMatch: AcFixture | null; fixtures: AcFixture[]; squad: AcSquadPlayer[]; fifaRank?: { rank: number; points: number | null; change: number | null } | null; seasonStats?: { available: boolean; matches: number; items: { label: string; value: number; percent?: boolean }[] } | null };
type AcPlayerCard = { id: number; name: string; fullName: string | null; photo: string; nationality: string | null; position: string; number: number | null; age: number | null; birthDate: string | null; birthPlace: string | null; height: number | null; weight: number | null; currentTeam: AcTeam | null; career: { teamId: number; team: string; logo: string; seasons: number[] }[]; trophies: { competition: string; country: string; season: string; place: string }[]; transfers: { date: string | null; type: string; from: AcTeam | null; to: AcTeam | null }[]; stats: null | { matches: number; lineups: number; minutes: number; rating: number | null; goals: number; assists: number; yellow: number; red: number; saves: number }; injury: { reason: string } | null; market?: { available: boolean; value: number | null; currency: string } | null };
type AcScorer = { rank: number; id: number; name: string; nameEn: string; photo: string; team: AcTeam; goals: number; assists: number; penalties: number; minutes: number; matches: number };
type AcBracket = { source: string; rounds: { round: string; roundEn: string; matches: AcFixture[] }[] };

function Shell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <div className="min-h-screen bg-background flex flex-col" dir="rtl"><Header user={user || undefined} /><NavigationBar /><main className="flex-1">{children}</main><Footer /></div>;
}

function Hero({ title, subtitle, image }: { title: string; subtitle?: string | null; image?: string | null }) {
  return <section className="relative overflow-hidden bg-gradient-to-bl from-emerald-950 via-[#063828] to-[#071f19] text-white"><div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" /><div className="relative mx-auto max-w-6xl px-4 py-8"><Link href="/asian-cup" className="mb-5 inline-flex items-center gap-1 text-xs text-emerald-100/70 hover:text-white"><ArrowRight className="h-4 w-4" />العودة إلى كأس آسيا</Link><div className="flex items-center gap-5">{image ? <span className="h-24 w-24 shrink-0 rounded-full bg-white p-2 shadow-xl"><img src={image} alt="" className="h-full w-full object-contain" /></span> : null}<div><h1 className="text-2xl font-black sm:text-4xl">{title}</h1>{subtitle ? <p className="mt-2 text-sm text-emerald-100/75">{subtitle}</p> : null}</div></div></div></section>;
}

function Loading() { return <div className="mx-auto max-w-5xl space-y-3 px-4 py-10"><Skeleton className="h-28 w-full" /><Skeleton className="h-52 w-full" /></div>; }
function Empty({ text }: { text: string }) { return <Card className="mx-auto my-10 max-w-3xl p-10 text-center text-muted-foreground">{text}</Card>; }

function MatchRow({ fixture }: { fixture: AcFixture }) {
  return <Link href={`/asian-cup/match/${fixture.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover-elevate"><img src={fixture.home.logo} alt="" className="h-8 w-8 object-contain" /><span className="min-w-0 flex-1 truncate text-sm font-bold">{fixture.home.name}</span><span className="font-black tabular-nums">{fixture.goals.home ?? "–"} : {fixture.goals.away ?? "–"}</span><span className="min-w-0 flex-1 truncate text-left text-sm font-bold">{fixture.away.name}</span><img src={fixture.away.logo} alt="" className="h-8 w-8 object-contain" /></Link>;
}

function StatGrid({ items }: { items: Array<[string, string | number]> }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map(([label, value]) => <div key={label} className="rounded-xl bg-muted/45 p-3 text-center"><div className="text-xl font-black tabular-nums">{value}</div><div className="text-xs text-muted-foreground">{label}</div></div>)}</div>;
}

/** مخطط الزخم: أعمدة لكل دقيقة — أخضر فوق الصفر للمضيف، كهرماني تحته للضيف. */
function MomentumChart({ points, homeName, awayName }: { points: AcMomentumPoint[]; homeName: string; awayName: string }) {
  if (!points.length) return null;
  const max = Math.max(30, ...points.map((pt) => Math.abs(pt.net)));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold">
        <span className="text-emerald-600">{homeName}</span>
        <span className="text-amber-600">{awayName}</span>
      </div>
      <div dir="ltr" className="flex h-40 items-center gap-px overflow-hidden rounded-xl bg-muted/40 px-1">
        {points.map((pt) => {
          const h = (Math.abs(pt.net) / max) * 50;
          return (
            <div key={pt.minute} className="relative h-full flex-1" title={`${pt.label} · ${pt.net > 0 ? homeName : awayName}`}>
              <div
                className={`absolute left-0 right-0 ${pt.net >= 0 ? "bottom-1/2 bg-emerald-500" : "top-1/2 bg-amber-500"} rounded-sm`}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div dir="ltr" className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{points[0]?.label}</span><span>{points[points.length - 1]?.label}</span></div>
    </div>
  );
}

function MomentumTab({ fixtureId, live, homeName, awayName }: { fixtureId: number; live: boolean; homeName: string; awayName: string }) {
  const { data } = useQuery<AcMomentum>({ queryKey: [`/api/asian-cup/momentum/${fixtureId}`], refetchInterval: live ? 15_000 : false });
  if (!data?.available || !data.points.length) return <Empty text="يظهر مخطط الزخم مع انطلاق المباراة." />;
  return (
    <Card className="space-y-4 p-5">
      {data.possession && (
        <div>
          <div className="mb-1 flex justify-between text-xs font-bold"><span>{homeName} {data.possession.home}%</span><span>الاستحواذ</span><span>{data.possession.away}% {awayName}</span></div>
          <div dir="ltr" className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${data.possession.home}%` }} />
            <div className="bg-amber-500" style={{ width: `${data.possession.away}%` }} />
          </div>
        </div>
      )}
      <MomentumChart points={data.points} homeName={homeName} awayName={awayName} />
    </Card>
  );
}

function PressureTab({ fixtureId, live, homeName, awayName }: { fixtureId: number; live: boolean; homeName: string; awayName: string }) {
  const { data } = useQuery<AcPressure>({ queryKey: [`/api/asian-cup/pressure/${fixtureId}`], refetchInterval: live ? 15_000 : false });
  if (!data?.available || !data.points.length) return <Empty text="يظهر مؤشّر الضغط مع انطلاق المباراة." />;
  const latest = data.latest;
  return (
    <Card className="space-y-4 p-5">
      {latest && latest.side !== "even" && (
        <div className="flex items-center justify-between rounded-xl bg-muted/45 p-4">
          <div><p className="text-xs text-muted-foreground">الضغط الآن</p><p className="text-lg font-black">{latest.side === "home" ? homeName : awayName}</p></div>
          <div className="text-3xl font-black tabular-nums text-emerald-600">{latest.value}<span className="text-sm text-muted-foreground">/100</span></div>
        </div>
      )}
      <MomentumChart points={data.points} homeName={homeName} awayName={awayName} />
    </Card>
  );
}

export function AsianCupMatchPage() {
  const { id } = useParams<{ id: string }>(); const matchId = Number(id);
  const { data, isLoading } = useQuery<AcMatchDetail>({ queryKey: [`/api/asian-cup/match/${matchId}`], enabled: Number.isFinite(matchId), refetchInterval: (q) => q.state.data?.fixture.status.live ? 8_000 : false });
  useEffect(() => { document.title = data ? `${data.fixture.home.name} ضد ${data.fixture.away.name} — كأس آسيا | سبق` : "مركز المباراة — كأس آسيا | سبق"; }, [data]);
  useCanonical(`https://sabq.org/asian-cup/match/${matchId}`);
  if (isLoading) return <Shell><Loading /></Shell>; if (!data) return <Shell><Empty text="تعذّر العثور على المباراة." /></Shell>;
  const f = data.fixture;
  return <Shell><Hero title={`${f.home.name} × ${f.away.name}`} subtitle={`${f.round} · ${formatKickoffDay(f.date)} · ${formatKickoffTime(f.date)}`} /><div className="mx-auto max-w-5xl space-y-6 px-4 py-8"><Card className="p-5"><div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center"><div><img src={f.home.logo} alt="" className="mx-auto h-20 w-20 object-contain" /><Link href={`/asian-cup/team/${f.home.id}`} className="mt-2 block font-black">{f.home.name}</Link></div><div><div className="text-4xl font-black tabular-nums">{f.goals.home ?? "–"} : {f.goals.away ?? "–"}</div><Badge className={f.status.live ? "mt-2 bg-red-600" : "mt-2"}>{f.status.live && f.status.elapsed ? `${f.status.elapsed}′` : f.status.label}</Badge></div><div><img src={f.away.logo} alt="" className="mx-auto h-20 w-20 object-contain" /><Link href={`/asian-cup/team/${f.away.id}`} className="mt-2 block font-black">{f.away.name}</Link></div></div>{f.venue.name ? <p className="mt-4 flex items-center justify-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />{f.venue.name} — {f.venue.city}</p> : null}</Card>
  <Tabs defaultValue={f.status.live || f.status.finished ? "events" : "prediction"} dir="rtl">
    <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1">
      <TabsTrigger value="events">الأحداث</TabsTrigger>
      {(f.status.live || f.status.finished) && <TabsTrigger value="momentum" className="gap-1"><Flame className="h-3.5 w-3.5" />الزخم</TabsTrigger>}
      {(f.status.live || f.status.finished) && <TabsTrigger value="pressure" className="gap-1"><Gauge className="h-3.5 w-3.5" />الضغط</TabsTrigger>}
      <TabsTrigger value="lineups">التشكيلات</TabsTrigger>
      <TabsTrigger value="stats">الإحصائيات</TabsTrigger>
      {(data.ratings.length > 0) && <TabsTrigger value="ratings">التقييمات</TabsTrigger>}
      <TabsTrigger value="prediction" className="gap-1"><Sparkles className="h-3.5 w-3.5" />التوقعات</TabsTrigger>
      {(data.tv ?? []).length > 0 && <TabsTrigger value="tv" className="gap-1"><Tv className="h-3.5 w-3.5" />البث</TabsTrigger>}
      {data.headToHead.length > 0 && <TabsTrigger value="h2h">المواجهات</TabsTrigger>}
    </TabsList>

    <TabsContent value="events" className="mt-0">
      {data.events.length === 0 ? <Empty text="تظهر أحداث المباراة أولًا بأول مع انطلاقها." /> : <Card className="p-5"><h2 className="mb-4 flex items-center gap-2 font-black"><Activity className="h-5 w-5 text-emerald-600" />أحداث المباراة</h2><div className="space-y-2">{data.events.map((e, i) => <div key={`${e.minute}-${i}`} className="flex items-center gap-3 rounded-lg bg-muted/40 p-3"><span className="w-12 font-black tabular-nums">{e.minute}′</span><Badge variant="secondary">{e.label}</Badge><span className="font-bold">{e.player}</span>{e.assist && <span className="text-xs text-muted-foreground">· {e.assist}</span>}</div>)}</div></Card>}
    </TabsContent>

    <TabsContent value="momentum" className="mt-0"><MomentumTab fixtureId={f.id} live={f.status.live} homeName={f.home.name} awayName={f.away.name} /></TabsContent>
    <TabsContent value="pressure" className="mt-0"><PressureTab fixtureId={f.id} live={f.status.live} homeName={f.home.name} awayName={f.away.name} /></TabsContent>

    <TabsContent value="lineups" className="mt-0">
      {data.lineups.length === 0 ? <Empty text="تُعلن التشكيلات قبل انطلاق المباراة بنحو ساعة." /> : <div className="grid gap-5 lg:grid-cols-2">{data.lineups.map((l) => <Card key={l.teamId} className="p-5"><h2 className="font-black">{l.teamName} {l.formation && <Badge variant="secondary">{l.formation}</Badge>}</h2><p className="mb-3 text-xs text-muted-foreground">المدرب: {l.coach}</p><div className="space-y-2">{l.startXI.map((p) => <Link key={p.id} href={`/asian-cup/player/${p.id}`} className="flex justify-between rounded-lg bg-muted/35 p-2 text-sm"><span>{p.number ?? "–"} · {p.name}</span><span className="text-muted-foreground">{p.position}</span></Link>)}</div></Card>)}</div>}
    </TabsContent>

    <TabsContent value="stats" className="mt-0">
      {data.statistics.length === 0 ? <Empty text="تظهر إحصاءات المباراة مع انطلاقها." /> : <Card className="p-5"><h2 className="mb-4 font-black">إحصاءات المباراة</h2><div className="space-y-2">{data.statistics.map((s) => <div key={s.key} className="grid grid-cols-[1fr_2fr_1fr] rounded-lg bg-muted/35 p-2 text-center"><b>{s.home}</b><span className="text-sm text-muted-foreground">{s.label}</span><b>{s.away}</b></div>)}</div></Card>}
    </TabsContent>

    <TabsContent value="ratings" className="mt-0">
      <Card className="p-5"><h2 className="mb-4 font-black">تقييمات اللاعبين</h2><div className="grid gap-2 sm:grid-cols-2">{data.ratings.slice(0, 12).map((p) => <Link key={`${p.teamId}-${p.id}`} href={`/asian-cup/player/${p.id}`} className="flex items-center gap-3 rounded-lg bg-muted/35 p-2"><img src={p.photo} alt="" className="h-9 w-9 rounded-full object-cover" /><span className="flex-1 font-bold">{p.name}</span><Badge>{p.rating.toFixed(1)}</Badge></Link>)}</div></Card>
    </TabsContent>

    <TabsContent value="prediction" className="mt-0">
      {data.prediction ? <Card className="p-5"><h2 className="mb-4 font-black">احتمالات المباراة</h2><StatGrid items={[[f.home.name, `${data.prediction.home}%`], ["التعادل", `${data.prediction.draw}%`], [f.away.name, `${data.prediction.away}%`]]} /><p className="mt-3 text-[11px] text-muted-foreground">تقدير من نموذج التطبيق — للاسترشاد فقط.</p></Card> : <Empty text="يظهر توقع النموذج قبل انطلاق المباراة." />}
    </TabsContent>

    <TabsContent value="tv" className="mt-0">
      <Card className="p-5"><h2 className="mb-4 flex items-center gap-2 font-black"><Tv className="h-5 w-5 text-emerald-600" />أين تشاهد المباراة</h2><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{(data.tv ?? []).slice(0, 18).map((c, i) => <div key={`${c.name}-${i}`} className="rounded-lg bg-muted/45 px-3 py-2"><p className="truncate text-sm font-bold">{c.name}</p>{c.country && <p className="truncate text-[11px] text-muted-foreground">{c.country}</p>}</div>)}</div></Card>
    </TabsContent>

    <TabsContent value="h2h" className="mt-0">
      <Card className="space-y-2 p-5"><h2 className="mb-4 font-black">المواجهات السابقة</h2>{data.headToHead.map((x) => <MatchRow key={x.id} fixture={x} />)}</Card>
    </TabsContent>
  </Tabs></div></Shell>;
}

export function AsianCupTeamPage() {
  const { id } = useParams<{ id: string }>(); const teamId = Number(id);
  const { data, isLoading } = useQuery<AcTeamProfile>({ queryKey: [`/api/asian-cup/team/${teamId}`], enabled: Number.isFinite(teamId) });
  useEffect(() => { document.title = data ? `${data.team.name} — كأس آسيا 2027 | سبق` : "المنتخب — كأس آسيا | سبق"; }, [data]);
  useCanonical(`https://sabq.org/asian-cup/team/${teamId}`);
  if (isLoading) return <Shell><Loading /></Shell>; if (!data) return <Shell><Empty text="ملف المنتخب غير متاح." /></Shell>;
  const positions = ["Goalkeeper", "Defender", "Midfielder", "Attacker"];
  return <Shell><Hero title={data.team.name} subtitle={[data.fifaRank && `تصنيف فيفا #${data.fifaRank.rank}`, data.stats.groupName, data.coach && `المدرب: ${data.coach}`].filter(Boolean).join(" · ")} image={data.team.logo} /><div className="mx-auto max-w-6xl space-y-6 px-4 py-8"><Card className="p-5"><StatGrid items={[["المركز", data.stats.rank ?? "–"], ["النقاط", data.stats.points], ["فوز", data.stats.win], ["تعادل", data.stats.draw], ["خسارة", data.stats.lose], ["له", data.stats.goalsFor], ["عليه", data.stats.goalsAgainst], ["الفارق", data.stats.goalsDiff]]} /></Card>
  {data.seasonStats?.available && <Card className="p-5"><h2 className="mb-4 font-black">أرقام في البطولة{data.seasonStats.matches > 0 ? ` · ${data.seasonStats.matches} مباراة` : ""}</h2><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{data.seasonStats.items.map((it) => <div key={it.label} className="rounded-xl bg-muted/45 p-3 text-center"><div className="text-xl font-black tabular-nums">{Number.isInteger(it.value) ? it.value : it.value.toFixed(1)}{it.percent ? "%" : ""}</div><div className="text-xs text-muted-foreground">{it.label}</div></div>)}</div></Card>}
  {data.nextMatch && <Card className="space-y-3 p-5"><h2 className="flex items-center gap-2 font-black"><CalendarDays className="h-5 w-5 text-amber-500" />المباراة القادمة</h2><MatchRow fixture={data.nextMatch} /></Card>}
  <section><h2 className="mb-4 flex items-center gap-2 text-xl font-black"><Users className="h-5 w-5 text-emerald-600" />قائمة المنتخب</h2><div className="space-y-5">{positions.map((position) => { const players = data.squad.filter((p) => p.positionEn === position); if (!players.length) return null; return <div key={position}><h3 className="mb-2 text-sm font-bold text-muted-foreground">{players[0].position}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{players.map((p) => <Link key={p.id} href={`/asian-cup/player/${p.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-3 hover-elevate"><img src={p.photo} alt="" className="h-11 w-11 rounded-full object-cover" /><div className="min-w-0"><p className="truncate font-bold">{p.name}</p><p className="text-xs text-muted-foreground">#{p.number ?? "–"}{p.age ? ` · ${p.age} سنة` : ""}</p></div></Link>)}</div></div>; })}</div></section>
  <Card className="space-y-2 p-5"><h2 className="mb-4 font-black">مباريات المنتخب</h2>{data.fixtures.map((f) => <MatchRow key={f.id} fixture={f} />)}</Card></div></Shell>;
}

export function AsianCupPlayerPage() {
  const { id } = useParams<{ id: string }>(); const playerId = Number(id);
  const { data, isLoading } = useQuery<AcPlayerCard>({ queryKey: [`/api/asian-cup/player/${playerId}`], enabled: Number.isFinite(playerId) });
  useEffect(() => { document.title = data ? `${data.name} — كأس آسيا | سبق` : "اللاعب — كأس آسيا | سبق"; }, [data]);
  useCanonical(`https://sabq.org/asian-cup/player/${playerId}`);
  if (isLoading) return <Shell><Loading /></Shell>; if (!data) return <Shell><Empty text="ملف اللاعب غير متاح." /></Shell>;
  const s = data.stats;
  return <Shell><Hero title={data.name} subtitle={[data.position, data.currentTeam?.name, data.nationality].filter(Boolean).join(" · ")} image={data.photo} /><div className="mx-auto max-w-5xl space-y-6 px-4 py-8"><Card className="p-5"><StatGrid items={[["العمر", data.age ?? "–"], ["الطول", data.height ? `${data.height} سم` : "–"], ["الوزن", data.weight ? `${data.weight} كجم` : "–"], data.market?.available && data.market.value ? ["القيمة السوقية", `${data.market.value >= 1_000_000 ? `${(data.market.value / 1_000_000).toFixed(1)}M` : `${Math.round(data.market.value / 1_000)}K`} ${data.market.currency}`] : ["الرقم", data.number ?? "–"]]} /></Card>{s && <Card className="p-5"><h2 className="mb-4 font-black">أرقامه في كأس آسيا</h2><StatGrid items={[["مباريات", s.matches], ["أساسي", s.lineups], ["دقائق", s.minutes], ["أهداف", s.goals], ["صناعة", s.assists], ["التقييم", s.rating?.toFixed(2) ?? "–"], ["صفراء", s.yellow], ["حمراء", s.red]]} /></Card>}
  {data.injury && <Card className="border-red-200 p-5"><h2 className="font-black text-red-700">حالة الإصابة</h2><p className="mt-2 text-sm">{data.injury.reason}</p></Card>}
  {data.career.length > 0 && <Card className="p-5"><h2 className="mb-4 font-black">المسيرة</h2><div className="grid gap-2 sm:grid-cols-2">{data.career.map((c) => <div key={`${c.teamId}-${c.seasons.join("-")}`} className="flex items-center gap-3 rounded-lg bg-muted/35 p-3"><img src={c.logo} alt="" className="h-9 w-9 object-contain" /><b className="flex-1">{c.team}</b><span className="text-xs text-muted-foreground">{c.seasons.join("، ")}</span></div>)}</div></Card>}
  {data.trophies.length > 0 && <Card className="p-5"><h2 className="mb-4 flex items-center gap-2 font-black"><Trophy className="h-5 w-5 text-amber-500" />الألقاب</h2>{data.trophies.map((t, i) => <div key={`${t.competition}-${i}`} className="flex justify-between border-b py-2 text-sm last:border-0"><b>{t.competition}</b><span>{t.place} · {t.season}</span></div>)}</Card>}
  {data.transfers.length > 0 && <Card className="p-5"><h2 className="mb-4 font-black">الانتقالات</h2>{data.transfers.map((t, i) => <div key={i} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{t.from?.name ?? "–"} ← {t.to?.name ?? "–"}</span><span className="text-muted-foreground">{t.type} · {t.date ?? ""}</span></div>)}</Card>}</div></Shell>;
}

export function AsianCupScorersPage() {
  const { data, isLoading } = useQuery<{ scorers: AcScorer[] }>({ queryKey: ["/api/asian-cup/scorers"] });
  useEffect(() => { document.title = "هدافو كأس آسيا 2027 | سبق"; }, []); useCanonical("https://sabq.org/asian-cup/scorers");
  const scorers = Array.isArray(data?.scorers) ? data.scorers : [];
  return <Shell><Hero title="هدافو كأس آسيا 2027" subtitle="ترتيب الهدافين وصانعي الأهداف" /><div className="mx-auto max-w-4xl px-4 py-8">{isLoading ? <Loading /> : scorers.length === 0 ? <Empty text="ستظهر قائمة الهدافين عند توفرها." /> : <Card className="divide-y overflow-hidden">{scorers.map((p) => <Link key={`${p.rank}-${p.id}`} href={`/asian-cup/player/${p.id}`} className="grid grid-cols-[2rem_3rem_1fr_auto] items-center gap-3 p-4 hover:bg-muted/40"><b className="text-center">{p.rank}</b><img src={p.photo} alt="" className="h-11 w-11 rounded-full object-cover" /><div className="min-w-0"><p className="truncate font-black">{p.name}</p><p className="text-xs text-muted-foreground">{p.team.name} · {p.matches} مباراة</p></div><div className="text-left"><b className="text-2xl text-emerald-700">{p.goals}</b><p className="text-[10px] text-muted-foreground">هدف · {p.assists} صناعة</p></div></Link>)}</Card>}</div></Shell>;
}

export function AsianCupBracketPage() {
  const { data, isLoading } = useQuery<AcBracket>({ queryKey: ["/api/asian-cup/bracket"] });
  useEffect(() => { document.title = "شجرة كأس آسيا 2027 | سبق"; }, []); useCanonical("https://sabq.org/asian-cup/bracket");
  return <Shell><Hero title="شجرة الأدوار الإقصائية" subtitle="من دور الـ16 حتى النهائي" /><div className="mx-auto max-w-7xl px-4 py-8">{isLoading ? <Loading /> : !data?.rounds.length ? <Empty text="ستظهر الشجرة فور اعتماد مباريات الأدوار الإقصائية." /> : <div className="grid min-w-[900px] gap-5 overflow-x-auto" style={{ gridTemplateColumns: `repeat(${data.rounds.length}, minmax(210px, 1fr))` }}>{data.rounds.map((round) => <section key={round.roundEn}><h2 className="mb-3 text-center font-black">{round.round}</h2><div className="space-y-4">{round.matches.map((f) => <Card key={f.id} className="p-3"><MatchRow fixture={f} /></Card>)}</div></section>)}</div>}</div></Shell>;
}

export function AsianCupVenuesPage() {
  const { data, isLoading } = useQuery<{ venues: { name: string; city: string }[] }>({ queryKey: ["/api/asian-cup/overview"], select: (d: any) => ({ venues: Array.isArray(d?.venues) ? d.venues : [] }) });
  useEffect(() => { document.title = "ملاعب كأس آسيا 2027 | سبق"; }, []); useCanonical("https://sabq.org/asian-cup/venues");
  return <Shell><Hero title="ملاعب كأس آسيا 2027" subtitle="ملاعب ومدن الاستضافة في المملكة العربية السعودية" /><div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-3">{isLoading ? <Loading /> : data?.venues.map((v) => <Card key={`${v.city}-${v.name}`} className="p-5"><span className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700"><MapPin /></span><h2 className="font-black">{v.name}</h2><p className="mt-1 text-sm text-muted-foreground">{v.city}</p></Card>)}</div></Shell>;
}
