/**
 * صفحة النادي — /sports/team/:id
 *
 * تستهلك /api/sports/team/:id (هوية النادي + صفّه في الترتيب + مبارياته + تشكيلته).
 * تتدهور بسلاسة: 404 → حالة «غير متاح» مع رجوع للبوابة. كل البيانات معرَّبة من الخدمة.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ListOrdered,
  MapPin,
  Shield,
  Users,
  Activity,
  Crown,
  ClipboardList,
  Goal,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { SportsNewsBlock } from "@/components/sports/SportsNewsBlock";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowControls, MatchDialog } from "./SportsHub";

interface SpTeam { id: number; name: string; logo: string; winner: boolean | null; }
interface SpFixture {
  id: number; date: string; timestamp: number;
  status: { code: string; label: string; elapsed: number | null; live: boolean; finished: boolean };
  round: string; venue: { name: string; city: string };
  home: SpTeam; away: SpTeam; goals: { home: number | null; away: number | null };
}
interface SpStandingRow {
  rank: number; team: SpTeam; played: number; win: number; draw: number; lose: number;
  goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number; form: string | null;
}
interface SpSquadPlayer {
  id: number;
  name: string;
  number: number | null;
  position: string;
  positionEn: string;
  age: number | null;
  photo: string;
  captain?: boolean;
  nationality?: { name: string; flag?: string | null; code?: string | null } | null;
  height?: number | null;
  weight?: number | null;
  contract?: { start?: string | null; end?: string | null } | null;
  detailedPosition?: string | null;
}
interface SpTeamInfo {
  id: number; name: string; logo: string; country: string | null; founded: number | null;
  venue: { name: string; city: string; capacity: number | null; image: string } | null;
}
interface SpTeamProfile {
  team: SpTeamInfo;
  standing: SpStandingRow | null;
  competitionSlug: string | null;
  competitionName: string | null;
  fixtures: SpFixture[];
  squad: SpSquadPlayer[];
  // الموجة 1: إثراء اختياري يُضمَّن عبر ?with=stats.
  stats: SpTeamStats | null;
  coach: SpCoach | null;
  topScorers: SpTeamScorer[];
}
// الموجة 1: إحصاءات النادي الشاملة + المدرب + هدّافو النادي.
interface SpStatTriple { total: number; home: number; away: number; }
export interface SpTeamStats {
  leagueId: number; season: number;
  fixtures: {
    played: SpStatTriple; wins: SpStatTriple; draws: SpStatTriple; loses: SpStatTriple;
  };
  goals: {
    for: { total: number; average: string; home: string; away: string };
    against: { total: number; average: string; home: string; away: string };
  };
  biggest: {
    winsHome: string | null; winsAway: string | null;
    losesHome: string | null; losesAway: string | null;
    streakWin: number | null; streakLose: number | null; streakDraw: number | null;
  };
  summary: {
    cleanSheets: SpStatTriple; failedToScore: SpStatTriple;
    cards: { yellowTotal: number; redTotal: number };
    mostUsedFormation: string | null;
  };
  timing: { bucket: string; for: number; against: number }[];
}
export interface SpCoach {
  id: number; name: string; photo: string; nationality: string;
  age: number | null; startDate: string | null;
  career: { team: string; start: string | null; end: string | null }[];
}
export interface SpTeamScorer {
  rank: number; id: number; name: string; photo: string;
  goals: number; assists: number; penalties: number; matches: number;
}
// الموجة 2: انتقالات النادي (وصل/غادر).
export interface SpTeamTransfer {
  date: string; type: string; playerId: number; player: string;
  teamId: number; team: string; teamLogo: string;
}
export interface SpTeamTransfers { arrivals: SpTeamTransfer[]; departures: SpTeamTransfer[]; }

const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "short" });
const fmtDay = (ts: number) => dayFmt.format(new Date(ts * 1000));

const monthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "short" });
function fmtMonth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : monthFmt.format(d);
}

// الموجة 1: بطاقة «نبض الأرقام» — إحصاءات النادي الشاملة.
function StatMini({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="text-center p-2.5 rounded-lg bg-muted/40">
      <div className={`text-base sm:text-lg font-black tabular-nums ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// توزيع الأهداف حسب فترات الدقائق — شريطان (له/عليه) لكل فترة، مُقاسان لأكبر قيمة.
function GoalTimingChart({ timing }: { timing: { bucket: string; for: number; against: number }[] }) {
  const max = Math.max(1, ...timing.map((t) => Math.max(t.for, t.against)));
  return (
    <div className="pt-3 border-t border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold text-muted-foreground">توزيع الأهداف حسب الدقائق</div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> سجّل</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> استقبل</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-1.5 h-24" dir="ltr">
        {timing.map((t) => (
          <div key={t.bucket} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex items-end justify-center gap-0.5 h-20">
              <div className="w-1/2 rounded-t bg-emerald-500/80" style={{ height: `${(t.for / max) * 100}%` }} title={`سجّل ${t.for}`} />
              <div className="w-1/2 rounded-t bg-red-500/70" style={{ height: `${(t.against / max) * 100}%` }} title={`استقبل ${t.against}`} />
            </div>
            <div className="text-[9px] text-muted-foreground tabular-nums">{t.bucket}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TeamStatsCard({ stats }: { stats: SpTeamStats }) {
  const { fixtures, goals, biggest, summary } = stats;
  const timing = Array.isArray(stats.timing) ? stats.timing : [];
  const wdlTotal = `${fixtures.wins.total}-${fixtures.draws.total}-${fixtures.loses.total}`;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">نبض الأرقام</h2>
        <Badge variant="secondary" className="text-[10px]">موسم {stats.season}</Badge>
      </div>

      {/* لعب/فوز/تعادل/خسارة + الأهداف */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 mb-5">
        <StatMini label="مباريات" value={fixtures.played.total} accent />
        <StatMini label="ف-ت-خ" value={<span dir="ltr">{wdlTotal}</span>} />
        <StatMini label="نظافة شباك" value={summary.cleanSheets.total} />
        <StatMini label="أهداف له" value={goals.for.total} accent />
        <StatMini label="أهداف عليه" value={goals.against.total} />
        <StatMini label="معدّل له/م" value={goals.for.average} />
      </div>

      {/* داخل وخارج الأرض */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="text-[11px] font-bold text-muted-foreground mb-2">داخل الأرض</div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div><div className="font-black text-emerald-600 tabular-nums">{fixtures.wins.home}</div><div className="text-[10px] text-muted-foreground">فوز</div></div>
            <div><div className="font-black text-amber-600 tabular-nums">{fixtures.draws.home}</div><div className="text-[10px] text-muted-foreground">تعادل</div></div>
            <div><div className="font-black text-red-600 tabular-nums">{fixtures.loses.home}</div><div className="text-[10px] text-muted-foreground">خسارة</div></div>
          </div>
        </div>
        <div className="rounded-lg bg-muted/30 p-3">
          <div className="text-[11px] font-bold text-muted-foreground mb-2">خارج الأرض</div>
          <div className="grid grid-cols-3 gap-1.5 text-center">
            <div><div className="font-black text-emerald-600 tabular-nums">{fixtures.wins.away}</div><div className="text-[10px] text-muted-foreground">فوز</div></div>
            <div><div className="font-black text-amber-600 tabular-nums">{fixtures.draws.away}</div><div className="text-[10px] text-muted-foreground">تعادل</div></div>
            <div><div className="font-black text-red-600 tabular-nums">{fixtures.loses.away}</div><div className="text-[10px] text-muted-foreground">خسارة</div></div>
          </div>
        </div>
      </div>

      {/* أكبر النتائج والسلاسل */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        {biggest.winsHome && <StatMini label="أكبر فوز بالأرض" value={<span dir="ltr">{biggest.winsHome}</span>} />}
        {biggest.winsAway && <StatMini label="أكبر فوز خارجًا" value={<span dir="ltr">{biggest.winsAway}</span>} />}
        {biggest.losesHome && <StatMini label="أكبر خسارة بالأرض" value={<span dir="ltr">{biggest.losesHome}</span>} />}
        {biggest.losesAway && <StatMini label="أكبر خسارة خارجًا" value={<span dir="ltr">{biggest.losesAway}</span>} />}
      </div>

      {/* السلاسل + البطاقات + التشكيلة */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
        {biggest.streakWin != null && (
          <Badge variant="secondary" className="gap-1"><Crown className="w-3 h-3 text-emerald-500" /> أطول سلسلة فوز: {biggest.streakWin}</Badge>
        )}
        {biggest.streakLose != null && (
          <Badge variant="secondary" className="gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> أطول سلسلة خسارة: {biggest.streakLose}</Badge>
        )}
        <Badge variant="secondary" className="gap-1"><span className="w-2.5 h-3 rounded-sm bg-amber-400" /> {summary.cards.yellowTotal} صفراء</Badge>
        <Badge variant="secondary" className="gap-1"><span className="w-2.5 h-3 rounded-sm bg-red-500" /> {summary.cards.redTotal} حمراء</Badge>
        {summary.mostUsedFormation && (
          <Badge variant="secondary" className="gap-1"><ClipboardList className="w-3 h-3" /> التشكيلة: <span dir="ltr">{summary.mostUsedFormation}</span></Badge>
        )}
      </div>

      {timing.length > 0 && <div className="mt-5"><GoalTimingChart timing={timing} /></div>}
    </Card>
  );
}

// الموجة 1: بطاقة المدرب.
export function CoachCard({ coach }: { coach: SpCoach }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">الجهاز الفني</h2>
      </div>
      <div className="flex items-center gap-4">
        {coach.photo ? (
          <img src={coach.photo} alt={coach.name} className="w-16 h-16 rounded-full object-cover bg-muted ring-2 ring-primary/20" loading="lazy" />
        ) : (
          <span className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Users className="w-7 h-7 text-muted-foreground/50" />
          </span>
        )}
        <div className="min-w-0">
          <div className="font-bold text-foreground">{coach.name}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
            <span>مدرب</span>
            {coach.nationality && <Badge variant="outline" className="text-[10px]">{coach.nationality}</Badge>}
            {coach.startDate && <span className="tabular-nums">منذ {fmtMonth(coach.startDate)}</span>}
          </div>
        </div>
      </div>

      {/* المسيرة التدريبية — متاحة في المزوّد وكانت مهملة؛ نعرض آخر المحطّات. */}
      {Array.isArray(coach.career) && coach.career.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-[11px] font-bold text-muted-foreground mb-2.5">المسيرة التدريبية</div>
          <div className="space-y-1.5">
            {coach.career.slice(0, 6).map((c, i) => (
              <div key={`${c.team}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                <span className="font-semibold text-foreground flex-1 min-w-0 truncate">{c.team}</span>
                <span className="text-muted-foreground tabular-nums shrink-0" dir="ltr">
                  {fmtMonth(c.start) || "—"} {c.end ? `– ${fmtMonth(c.end)}` : "– الآن"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// الموجة 1: هدّافو النادي.
export function TeamScorersCard({ scorers }: { scorers: SpTeamScorer[] }) {
  if (scorers.length === 0) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <Goal className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">هدّافو النادي</h2>
        <Badge variant="secondary" className="text-[10px]">هذا الموسم</Badge>
      </div>
      <div className="divide-y divide-border">
        {scorers.map((s) => (
          <Link key={s.id} href={`/sports/player/${s.id}`} className="flex items-center gap-3 py-2.5 hover:bg-muted/40 -mx-2 px-2 rounded-lg transition-colors">
            <span className="w-5 text-center font-bold text-muted-foreground text-sm tabular-nums">{s.rank}</span>
            {s.photo ? <img src={s.photo} alt="" className="w-9 h-9 rounded-full object-cover bg-muted" loading="lazy" /> : <span className="w-9 h-9 rounded-full bg-muted" />}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">{s.name}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums">{s.matches} مباراة</div>
            </div>
            <div className="text-center">
              <span className="font-black text-primary tabular-nums">{s.goals}</span>
              <div className="text-[10px] text-muted-foreground">هدف</div>
            </div>
            <div className="text-center pr-2 border-r border-border">
              <span className="font-bold text-amber-600 tabular-nums">{s.assists}</span>
              <div className="text-[10px] text-muted-foreground">صناعة</div>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// الموجة 2: عمود انتقالات (وصل أو غادر) داخل بطاقة النادي.
// limit يقصّ العدد المعروض (للطيّ على الجوال)؛ Infinity يعرض الكل.
function TransferColumn({ title, dir, items, limit }: { title: string; dir: "in" | "out"; items: SpTeamTransfer[]; limit: number }) {
  const arrow = dir === "in" ? "←" : "→";
  const tone = dir === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  const shown = items.slice(0, limit);
  return (
    <div>
      <div className={`text-sm font-bold mb-3 flex items-center gap-1.5 ${tone}`}>
        <span className="text-base">{arrow}</span> {title}
        <span className="text-[11px] font-normal text-muted-foreground">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">لا توجد حركات حديثة</p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((t, i) => (
            <div key={`${t.playerId}-${i}`} className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2">
              <div className="min-w-0 flex-1">
                {t.playerId ? (
                  <Link href={`/sports/player/${t.playerId}`} className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block">{t.player}</Link>
                ) : (
                  <span className="text-sm font-semibold text-foreground truncate block">{t.player}</span>
                )}
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {dir === "in" ? "من" : "إلى"}
                  {t.teamLogo && <img src={t.teamLogo} alt="" className="w-4 h-4 object-contain" loading="lazy" />}
                  {t.teamId ? (
                    <Link href={`/sports/team/${t.teamId}`} className="hover:text-primary transition-colors truncate">{t.team}</Link>
                  ) : <span className="truncate">{t.team}</span>}
                </span>
              </div>
              {t.type && <Badge variant="secondary" className="text-[9px] shrink-0">{t.type}</Badge>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TRANSFERS_COLLAPSED = 5;

export function TeamTransfersCard({ transfers }: { transfers: SpTeamTransfers }) {
  const [expanded, setExpanded] = useState(false);
  if (transfers.arrivals.length === 0 && transfers.departures.length === 0) return null;
  // الطيّ مفيد فقط لو تجاوز أحد العمودين الحدّ — وإلا نخفي الزر.
  const canExpand = transfers.arrivals.length > TRANSFERS_COLLAPSED || transfers.departures.length > TRANSFERS_COLLAPSED;
  const limit = expanded ? Infinity : TRANSFERS_COLLAPSED;
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <ArrowLeftRight className="w-5 h-5 text-primary" />
        <h2 className="font-bold text-lg">حركة الانتقالات</h2>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <TransferColumn title="وصل" dir="in" items={transfers.arrivals} limit={limit} />
        <TransferColumn title="غادر" dir="out" items={transfers.departures} limit={limit} />
      </div>
      {/* على الجوال خصوصًا تطول القوائم — نعرض 5 ثم زر «المزيد» لكامل البلوك. */}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-4 w-full flex items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-sm font-semibold text-primary hover:bg-muted/50 transition-colors"
        >
          {expanded ? "عرض أقل" : "عرض كل الانتقالات"}
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      )}
    </Card>
  );
}

export const POSITION_SECTIONS: { en: string; label: string }[] = [
  { en: "Goalkeeper", label: "حراسة المرمى" },
  { en: "Defender", label: "الدفاع" },
  { en: "Midfielder", label: "الوسط" },
  { en: "Attacker", label: "الهجوم" },
];

function FixtureRow({ fx, teamId, onOpen }: { fx: SpFixture; teamId: number; onOpen: (id: number) => void }) {
  const isHome = fx.home.id === teamId;
  const me = isHome ? fx.home : fx.away;
  const opp = isHome ? fx.away : fx.home;
  const myGoals = isHome ? fx.goals.home : fx.goals.away;
  const oppGoals = isHome ? fx.goals.away : fx.goals.home;
  const result =
    fx.status.finished && myGoals != null && oppGoals != null
      ? myGoals > oppGoals ? "win" : myGoals < oppGoals ? "lose" : "draw"
      : null;
  const dot =
    result === "win" ? "bg-emerald-500" : result === "lose" ? "bg-red-500" : result === "draw" ? "bg-amber-500" : "bg-muted-foreground/40";

  return (
    <button
      type="button"
      onClick={() => onOpen(fx.id)}
      className="flex w-full items-center gap-3 py-2.5 px-3 text-right hover-elevate transition-colors rounded-lg"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="text-[11px] text-muted-foreground w-16 shrink-0">{fmtDay(fx.timestamp)}</span>
      <span className="text-xs text-muted-foreground shrink-0">{isHome ? "ضد" : "على"}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {opp.logo && <img src={opp.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <span className="text-sm font-semibold truncate">{opp.name}</span>
      </div>
      {fx.status.finished && myGoals != null && oppGoals != null ? (
        <span className="text-sm font-black tabular-nums" dir="ltr">{myGoals} - {oppGoals}</span>
      ) : fx.status.live ? (
        <Badge className="bg-red-500 text-white text-[10px]">مباشر</Badge>
      ) : (
        <span className="text-[11px] text-muted-foreground tabular-nums">قادمة</span>
      )}
    </button>
  );
}

export default function SportsTeam() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  // الطلب الأساسي (سريع): هوية + ترتيب + مباريات + تشكيلة — يُعرض فور وصوله.
  const { data, isLoading, isError } = useQuery<SpTeamProfile>({
    queryKey: [`/api/sports/team/${id}`],
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 5 * 60_000,
  });

  // الإثراء (منفصل، غير حاجب): الإحصاءات + المدرب + الهدّافون — يملأ تدريجيًا
  // بمجرد جاهزيته دون أن يؤخّر ظهور المحتوى الأساسي.
  const { data: extras } = useQuery<SpTeamProfile>({
    queryKey: [`/api/sports/team/${id}`, { with: "stats" }],
    enabled: Number.isFinite(id) && id > 0 && !!data,
    staleTime: 5 * 60_000,
  });
  const stats = extras?.stats ?? null;
  const coach = extras?.coach ?? null;
  const topScorers = Array.isArray(extras?.topScorers) ? extras!.topScorers : [];

  const { data: transfers } = useQuery<SpTeamTransfers>({
    queryKey: [`/api/sports/team/${id}/transfers`],
    enabled: Number.isFinite(id) && id > 0,
    staleTime: 10 * 60_000,
  });

  // الإصابات/الغيابات (TheSports) — تُجلب بعد معرفة سلَك بطولة النادي، أفضل جهد.
  const { data: injuriesData } = useQuery<{ injuries: { player: string; reason: string | null; until: string | null }[] }>({
    queryKey: [`/api/sports/team/${id}/injuries`, { comp: data?.competitionSlug }],
    enabled: Number.isFinite(id) && id > 0 && !!data?.competitionSlug,
    staleTime: 30 * 60_000,
  });
  const injuries = Array.isArray(injuriesData?.injuries) ? injuriesData!.injuries : [];

  useEffect(() => {
    document.title = data?.team?.name ? `${data.team.name} | الرياضة - سبق` : "النادي | الرياضة - سبق";
  }, [data?.team?.name]);
  useCanonical(`https://sabq.org/sports/team/${id}`);

  const notFound = isError || (!isLoading && !data);

  const [openMatch, setOpenMatch] = useState<number | null>(null);

  const finished = (data?.fixtures ?? []).filter((f) => f.status.finished);
  const results = finished.slice(-6).reverse();
  const upcoming = (data?.fixtures ?? []).filter((f) => !f.status.finished).slice(0, 6);

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        <Link href="/sports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5">
          <ArrowRight className="w-4 h-4" /> البوابة الرياضية
        </Link>

        {isLoading ? (
          <div className="space-y-5">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : notFound ? (
          <Card className="p-10 text-center">
            <Shield className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-bold text-foreground">صفحة النادي غير متاحة حاليًا</p>
            <p className="text-sm text-muted-foreground mt-1">قد لا يكون النادي ضمن البطولات المتاحة، أو تعذّر جلب بياناته.</p>
            <Link href="/sports" className="inline-block mt-4 text-sm text-primary font-semibold">العودة للبوابة الرياضية</Link>
          </Card>
        ) : data ? (
          <div className="space-y-6">
            {/* هوية النادي */}
            <Card className="p-6">
              <div className="flex items-center gap-5 flex-wrap">
                {data.team.logo && <img src={data.team.logo} alt={data.team.name} className="w-20 h-20 object-contain" />}
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-black text-foreground">{data.team.name}</h1>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                    {data.competitionName && (
                      data.competitionSlug ? (
                        <Link
                          href={`/sports/competition/${data.competitionSlug}`}
                          className="text-primary font-semibold hover:underline"
                        >
                          {data.competitionName}
                        </Link>
                      ) : (
                        <span>{data.competitionName}</span>
                      )
                    )}
                    {data.team.founded && <span>تأسّس {data.team.founded}</span>}
                    {data.team.venue?.name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" /> {data.team.venue.name}
                        {data.team.venue.city ? ` — ${data.team.venue.city}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ms-auto shrink-0 self-start">
                  <FollowControls
                    kind="team"
                    refId={data.team.id}
                    refName={data.team.name}
                    refLogo={data.team.logo}
                    size="md"
                  />
                </div>
              </div>

              {/* صورة الملعب — متاحة من المزوّد وكانت مهملة؛ تمنح الصفحة طابعًا بصريًا. */}
              {data.team.venue?.image && (
                <div className="mt-5 overflow-hidden rounded-xl border border-border">
                  <img
                    src={data.team.venue.image}
                    alt={data.team.venue.name || data.team.name}
                    className="h-40 w-full object-cover sm:h-52"
                    loading="lazy"
                  />
                </div>
              )}

              {data.standing && (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5 pt-5 border-t border-border">
                  <div className="text-center">
                    <div className="text-2xl font-black text-primary tabular-nums">{data.standing.rank}</div>
                    <div className="text-[11px] text-muted-foreground">المركز</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-black tabular-nums">{data.standing.points}</div>
                    <div className="text-[11px] text-muted-foreground">نقطة</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold tabular-nums" dir="ltr">{data.standing.win}-{data.standing.draw}-{data.standing.lose}</div>
                    <div className="text-[11px] text-muted-foreground">فوز-تعادل-خسارة</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold tabular-nums">{data.standing.goalsFor}:{data.standing.goalsAgainst}</div>
                    <div className="text-[11px] text-muted-foreground">له : عليه</div>
                  </div>
                  <div className="text-center">
                    <div className="text-base font-bold tabular-nums" dir="ltr">
                      {data.standing.goalsDiff > 0 ? `+${data.standing.goalsDiff}` : data.standing.goalsDiff}
                    </div>
                    <div className="text-[11px] text-muted-foreground">الفارق</div>
                  </div>
                </div>
              )}

              {data.standing && data.competitionSlug && (
                <div className="mt-4 text-center">
                  <Link
                    href={`/sports/competition/${data.competitionSlug}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    <ListOrdered className="w-3.5 h-3.5" /> عرض الترتيب الكامل للدوري
                  </Link>
                </div>
              )}
            </Card>

            {/* نبض الأرقام (يسار) + الجهاز الفني والهدّافون فوق بعض (يمين) — استغلالًا
                للمساحة الرأسية تحت بطاقة المدرب القصيرة. تُجلب منفصلة (الموجة 1). */}
            {(stats || coach || topScorers.length > 0) && (
              <div className="grid lg:grid-cols-2 gap-5 items-start">
                {stats && <TeamStatsCard stats={stats} />}
                {(coach || topScorers.length > 0) && (
                  <div className="space-y-5">
                    {coach && <CoachCard coach={coach} />}
                    {topScorers.length > 0 && <TeamScorersCard scorers={topScorers} />}
                  </div>
                )}
              </div>
            )}

            {/* الإصابات والغيابات (TheSports) — تظهر فقط عند توفّرها */}
            {injuries.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-red-500" />
                  <h2 className="font-bold text-lg">الإصابات والغيابات</h2>
                  <Badge variant="secondary" className="tabular-nums">{injuries.length}</Badge>
                </div>
                <div className="space-y-2.5">
                  {injuries.map((inj, i) => (
                    <div key={`${inj.player}-${i}`} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      <span className="font-semibold text-sm text-foreground flex-1 min-w-0 truncate">{inj.player}</span>
                      {inj.reason && <span className="text-xs text-muted-foreground shrink-0">{inj.reason}</span>}
                      {inj.until && <span className="text-[11px] text-muted-foreground/80 tabular-nums shrink-0" dir="ltr">{inj.until}</span>}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* المباريات */}
            {(results.length > 0 || upcoming.length > 0) && (
              <div className="grid lg:grid-cols-2 gap-5">
                {results.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <h2 className="font-bold text-sm">أحدث النتائج</h2>
                    </div>
                    <div className="divide-y divide-border">
                      {results.map((fx) => <FixtureRow key={fx.id} fx={fx} teamId={data.team.id} onOpen={setOpenMatch} />)}
                    </div>
                  </Card>
                )}
                {upcoming.length > 0 && (
                  <Card className="overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                      <CalendarDays className="w-4 h-4 text-primary" />
                      <h2 className="font-bold text-sm">المباريات القادمة</h2>
                    </div>
                    <div className="divide-y divide-border">
                      {upcoming.map((fx) => <FixtureRow key={fx.id} fx={fx} teamId={data.team.id} onOpen={setOpenMatch} />)}
                    </div>
                  </Card>
                )}
              </div>
            )}

            {/* أخبار النادي — مبنية على الكلمة المفتاحية (اسم النادي) */}
            <SportsNewsBlock query={data.team.name} title="أخبار النادي" />

            {/* التشكيلة */}
            {data.squad.length > 0 && (
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-5">
                  <Users className="w-5 h-5 text-primary" />
                  <h2 className="font-bold text-lg">التشكيلة</h2>
                  <Badge variant="secondary" className="tabular-nums">{data.squad.length}</Badge>
                </div>
                <div className="space-y-6">
                  {POSITION_SECTIONS.map((sec) => {
                    const players = data.squad.filter((p) => p.positionEn === sec.en);
                    if (players.length === 0) return null;
                    return (
                      <div key={sec.en}>
                        <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2">
                          <ListOrdered className="w-3.5 h-3.5" /> {sec.label}
                          <span className="text-[11px] font-normal">({players.length})</span>
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {players.map((pl) => (
                            <Link
                              key={pl.id}
                              href={`/sports/player/${pl.id}`}
                              className="flex items-center gap-3 p-2.5 rounded-xl border border-border hover:bg-muted/50 transition-colors relative"
                            >
                              <div className="relative shrink-0">
                                {pl.photo ? (
                                  <img src={pl.photo} alt="" className="w-11 h-11 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                                ) : (
                                  <span className="w-11 h-11 rounded-full bg-muted shrink-0 block" />
                                )}
                                {pl.captain && (
                                  <span
                                    className="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-black text-[9px] w-4 h-4 rounded-full flex items-center justify-center shadow-xs ring-1 ring-background"
                                    title="قائد الفريق"
                                  >
                                    C
                                  </span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 truncate">
                                  {pl.nationality?.flag && (
                                    <img
                                      src={pl.nationality.flag}
                                      alt={pl.nationality.name || ""}
                                      className="w-4 h-2.5 rounded-xs object-cover shrink-0"
                                      loading="lazy"
                                    />
                                  )}
                                  <span className="text-sm font-semibold text-foreground truncate">{pl.name}</span>
                                </div>
                                <div className="text-[11px] text-muted-foreground truncate">
                                  {pl.number != null ? `#${pl.number}` : ""}
                                  {pl.detailedPosition && pl.detailedPosition !== pl.position
                                    ? ` • ${pl.detailedPosition}`
                                    : ""}
                                  {pl.age != null ? ` • ${pl.age} سنة` : ""}
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* حركة الانتقالات (الموجة 2) — أسفل التشكيلة */}
            {transfers && <TeamTransfersCard transfers={transfers} />}
          </div>
        ) : null}
      </main>
      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
