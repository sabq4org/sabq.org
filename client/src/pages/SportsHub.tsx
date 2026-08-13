/**
 * البوابة الرياضية — /sports
 *
 * هوية «سبق» الإعلامية النظيفة: خلفية بيضاء، بطاقات خفيفة بحوافّ رفيعة،
 * والأخضر كلمسة فقط (لا هيرو داكن، لا أوربز، لا تدرّجات صاخبة، لا marquee).
 * أقسام: أخبار، شريط نتائج اليوم، مركز مباريات حيّ، جدول ترتيب تفاعلي،
 * هدّافون، معرض صور، وفيديو.
 *
 * البيانات:
 *  - الأخبار/الصور: /api/categories/sports/articles
 *  - المباريات/الترتيب/الهدّافون: /api/sports/* (تُخفى بسلاسة إن لم يتوفّر مزوّد)
 *  - الفيديو: /api/shorts?categoryId=<قسم الرياضة>
 *
 * RTL، متوافق مع الوضع الداكن، ومتجاوب مع كل الأجهزة.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { defaultMatchCenterTab, isAwaitingLineups } from "@/components/sports/matchCenterTabs";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  Newspaper,
  CalendarDays,
  ListOrdered,
  Goal,
  Images,
  PlayCircle,
  Clock,
  Flame,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Crown,
  Hand,
  Square,
  Star,
  Bell,
  BellOff,
  Medal,
  Minus,
  Plus,
  Gauge,
  Cloud,
  Droplets,
  Activity,
  Tv,
  Radio,
  MapPin,
  ShieldAlert,
  ArrowLeftRight,
  MonitorPlay,
} from "lucide-react";
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import { RslPredictionsMatchPromo } from "@/components/rsl/RslPredictionsPromo";
import type { RslHero } from "@/components/rsl/rslTypes";
import type { ArticleWithDetails, Category } from "@shared/schema";

// ============================================================
// الأنواع (مطابقة لـ /api/sports/*)
// ============================================================
export interface SpTeam { id: number; name: string; logo: string; winner: boolean | null; }
export interface SpFixture {
  id: number; date: string; timestamp: number;
  status: { code: string; label: string; elapsed: number | null; extra: number | null; live: boolean; finished: boolean };
  round: string; venue: { name: string; city: string };
  home: SpTeam; away: SpTeam; goals: { home: number | null; away: number | null };
  // نتيجة ركلات الترجيح (خروج المغلوب) — null/غائب ما لم تُحسم بالترجيح.
  penalties?: { home: number | null; away: number | null } | null;
}
export interface SpLiveItem extends SpFixture { competition: string; competitionSlug: string | null; }
interface SpStandingSplit { played: number; win: number; draw: number; lose: number; goalsFor: number; goalsAgainst: number; points: number; }
export interface SpStandingRow {
  rank: number; team: SpTeam; played: number; win: number; draw: number; lose: number;
  goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number; form: string | null;
  home?: SpStandingSplit | null; away?: SpStandingSplit | null;
  trend?: "up" | "down" | "same" | null;
  live?: boolean;
  liveDelta?: number;
}
export interface SpScorer {
  rank: number; id: number; name: string; photo: string; team: SpTeam;
  goals: number; assists: number; penalties: number; matches: number;
}
// الموجة 1: صنّاع الأهداف — نفس بنية الهدّاف لكن بلا ركلات جزاء.
export interface SpAssister {
  rank: number; id: number; name: string; photo: string; team: SpTeam;
  goals: number; assists: number; matches: number;
}
interface SpStatRow { type: string; label: string; home: string | number | null; away: string | number | null; }
interface SpMatchEvent {
  minute: number | null; extra: number | null; teamId: number; team: string;
  player: string; assist: string | null; type: string; label: string;
}
interface SpLineupPlayer { id: number; number: number | null; name: string; pos: string; grid: string | null; }
interface SpLineup {
  team: { id: number; name: string; logo: string };
  formation: string | null; coach: string | null;
  startXI: SpLineupPlayer[]; substitutes: SpLineupPlayer[];
}
// التشكيلة المتوقعة قبل المباراة (SportMonks expectedLineups)
interface SpExpectedPlayer { name: string; jersey: number | null; slot: number | null; grid: string | null; row: number | null; }
interface SpExpectedSide { formation: string | null; starters: SpExpectedPlayer[]; bench: SpExpectedPlayer[]; }
interface SpExpectedLineups { available: boolean; home: SpExpectedSide | null; away: SpExpectedSide | null; }
// حكم المباراة (SportMonks referees)
interface SpRefereeStats { matches: number; yellowAvg: number | null; redCount: number; penaltiesAvg: number | null; foulsAvg: number | null; varMoments: number | null; }
interface SpMatchReferee { available: boolean; name: string; photo: string | null; countryName: string | null; countryFlag: string | null; stats: SpRefereeStats | null; }
interface SpMatchDetail {
  fixture: SpFixture; events: SpMatchEvent[];
  statistics: { home: { id: number; name: string }; away: { id: number; name: string }; rows: SpStatRow[] } | null;
  lineups: SpLineup[];
}
interface SpMatchRatingPlayer {
  id: number; name: string; photo: string; teamId: number; team: string;
  number: number | null; pos: string; rating: number | null;
  minutes: number; goals: number; assists: number; yellow: number; red: number; captain: boolean;
}
interface SpMatchRatings {
  motm: { id: number; name: string; team: string; rating: number } | null;
  players: SpMatchRatingPlayer[];
}
// إثراءات SportMonks (سعودي/آسيا) — /api/sports/match/:id/{xg,pressure,facts}
interface SpOverUnderLine { line: number; over: number; under: number; }
interface SpCorrectScore { score: string; prob: number; }
interface SpForecast {
  available: boolean;
  fulltime: { home: number; draw: number; away: number } | null;
  btts: { yes: number; no: number } | null;
  doubleChance: { homeOrDraw: number; awayOrDraw: number; homeOrAway: number } | null;
  goals: SpOverUnderLine[];
  correctScores: SpCorrectScore[];
}
interface SpXgSide { xg: number; xgot: number; }
interface SpXgPlayer { name: string; location: "home" | "away"; xg: number; }
interface SpXg { available: boolean; home: SpXgSide; away: SpXgSide; topPlayers: SpXgPlayer[]; }
interface SpPressurePoint { minute: number; net: number; }
interface SpPressure { available: boolean; live: boolean; latest: { side: string; value: number } | null; points: SpPressurePoint[]; }
interface SpMomentumPoint { label: string; minute: number; home: number; away: number; net: number; }
interface SpMomentum { available: boolean; live: boolean; possession: { home: number; away: number } | null; points: SpMomentumPoint[]; }
interface SpCommentaryItem { minute: number; extraMinute: number | null; goal: boolean; important: boolean; textAr: string; textEn: string; order: number; }
interface SpCommentary { available: boolean; live: boolean; items: SpCommentaryItem[]; }
interface SpWeather { type: string; temp: number | null; description: string; icon: string; humidity: string | null; }
interface SpFactStat { key: string; label: string; home: string; away: string; }
interface SpEventDetail { minute: number; location: "home" | "away"; klass: string; detail: string; }
interface SpAbsentee { name: string; location: "home" | "away"; reason: string; }
interface SpFacts { available: boolean; statistics: SpFactStat[]; weather: SpWeather | null; absentees?: SpAbsentee[]; eventDetails: SpEventDetail[]; halftime: { home: number; away: number } | null; }
interface SpFollow { id: string; kind: "team" | "competition"; refId: string; refName: string; refLogo: string | null; notify: boolean; }
export type SpCompetitionCategory = "saudi" | "gulf" | "arab" | "european" | "world";
export type SpCompetitionStatus = "ongoing" | "upcoming" | "finished" | "unknown";
export interface SpCompetition { slug: string; name: string; type: "league" | "cup"; hasStandings: boolean; hasScorers: boolean; hasStats: boolean; category?: SpCompetitionCategory; logo?: string | null; season?: number | null; start?: string | null; end?: string | null; status?: SpCompetitionStatus; }
export const COMP_CATEGORY_LABELS: Record<SpCompetitionCategory, string> = { saudi: "سعودي", gulf: "خليجي", arab: "عربي", european: "أوروبي", world: "عالمي" };
export const COMP_CATEGORY_ORDER: SpCompetitionCategory[] = ["saudi", "gulf", "arab", "european", "world"];
export const COMP_STATUS_LABELS: Record<SpCompetitionStatus, string> = { ongoing: "", upcoming: "لم تبدأ بعد", finished: "انتهى الموسم", unknown: "" };
// ترتيب الأولوية داخل الفئة: الجارية أولًا ثم القادمة ثم المنتهية.
export const COMP_STATUS_RANK: Record<SpCompetitionStatus, number> = { ongoing: 0, upcoming: 1, unknown: 2, finished: 3 };

// لون هوية لكل بطولة (نمط compAccent في VARA) — يصبغ بطاقة الموجز (خيط علوي +
// صبغات ضئيلة) بدل «الحيطة الزرقاء» الموحّدة. قرار المالك 2026-07-05 (مزيج أ+ب).
// النغمة الليلية تُشتق آليًا (color-mix مع الأبيض) فلا خريطة ثانية تُصان.
export const COMP_ACCENTS: Record<string, string> = {
  // سعودي
  "pro-league": "#0e8a4d",
  "division-1": "#c99000",
  "division-2": "#7a5cc4",
  "kings-cup": "#b07a10",
  "super-cup": "#8332c9",
  "womens-league": "#d6427d",
  // عالمي
  "world-cup": "#0e7c4a",
  "afc-champions-league": "#1258a8",
  "club-world-cup": "#0f766e",
  // أوروبي
  "premier-league": "#5b2d8f",
  "la-liga": "#c22f2f",
  "serie-a": "#0a63b5",
  bundesliga: "#b3231b",
  "ligue-1": "#12275e",
  "champions-league": "#2b4bc4",
  "europa-league": "#d96a1e",
  "uefa-super-cup": "#c9a227",
  // خليجي
  "gulf-cup": "#0d8577",
  "uae-pro-league": "#b01e3c",
  "qatar-stars-league": "#722545",
  "kuwait-premier-league": "#1274b8",
  "bahrain-premier-league": "#d33131",
  "oman-pro-league": "#1a8f4a",
  "gulf-club-champions": "#6d4fc4",
  // عربي
  "egypt-premier-league": "#c9302c",
  "morocco-botola": "#0e8a4d",
  "tunisia-ligue-1": "#d97b16",
  "algeria-ligue-1": "#0f7490",
  "iraq-stars-league": "#6d4fc4",
  "jordan-league": "#1258a8",
  "lebanon-premier-league": "#d6427d",
  "syria-premier-league": "#64748b",
};
const ACCENT_FALLBACKS = ["#2b4bc4", "#d96a1e", "#0e8f74", "#c22f2f", "#5b2d8f", "#0a63b5", "#b07a10", "#0d8577"];
export function compAccent(slug: string): string {
  if (COMP_ACCENTS[slug]) return COMP_ACCENTS[slug];
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return ACCENT_FALLBACKS[h % ACCENT_FALLBACKS.length];
}
export interface SpCardLeader { rank: number; id: number; name: string; photo: string; team: string; teamLogo: string; yellow: number; red: number; matches: number; }
interface SpPrediction { homePct: number; drawPct: number; awayPct: number; winnerId: number | null; winnerName: string | null; advice: string | null; }
interface SpH2HMeeting { id: number; timestamp: number; date: string; competition: string; home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string }; goals: { home: number | null; away: number | null }; }
interface SpH2H { summary: { total: number; homeWins: number; draws: number; awayWins: number } | null; meetings: SpH2HMeeting[]; }
export interface SpShort { id: string; title: string; slug: string; coverImage: string; duration: number | null; views: number; }
// موجز البطولات (مطابق لـ GET /api/sports/summary) — لقطة بطولة واحدة لبطاقة الرفّ.
export interface SpSummaryTeam { name: string; logo: string; }
export interface SpSummary {
  slug: string; name: string; category: SpCompetitionCategory; type: "league" | "cup";
  logo: string | null; season: number | null; status: SpCompetitionStatus;
  hasStandings: boolean; hasScorers: boolean;
  leader: { id: number; name: string; logo: string; points: number } | null;
  topScorer: { id: number; name: string; goals: number } | null;
  champion: { id: number; name: string; logo: string } | null;
  daysUntilKickoff: number | null;
  liveCount: number; todayCount: number; matchday: string | null;
  nextMatch: { id: number; timestamp: number; round: string | null; home: SpSummaryTeam; away: SpSummaryTeam } | null;
}
// المرحلة 4 (المجتمع): لوحة المتصدّرين
// لوحة متصدّري «المجمّع الموحّد» (sports_pool) — نفس محرك نقاط تطبيق سبق الرياضي
// (قرار المالك 2026-07-05: الويب يعرض نقاط التطبيق نفسها لا المحرك الكلاسيكي).

// ============================================================
// أدوات
// ============================================================
// نستخدم التقويم الميلادي والأرقام اللاتينية في كل تواريخ البوابة الرياضية.
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: true });
// تاريخ كامل (يوم الأسبوع + السنة) لترويسة مركز المباراة — التاريخ إلزامي بقرار المالك.
const fullDayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtDay = (ts: number) => dayFmt.format(new Date(ts * 1000));
const fmtTime = (ts: number) => timeFmt.format(new Date(ts * 1000));
const fmtFullDay = (ts: number) => fullDayFmt.format(new Date(ts * 1000));

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
  return `قبل ${Math.floor(diff / 86400)} يوم`;
}
const imgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);
// زمن الخبر للترتيب — نعتمد النشر ثم الإنشاء حتى لا يتصدّر خبر قديم مثبّت يدويًا (displayOrder).
const articleTime = (a: ArticleWithDetails) => new Date(a.publishedAt || (a as any).createdAt || 0).getTime();
const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) => articleTime(b) - articleTime(a);

// لمسة الهوية (accent) — أزرق اللوقو الرسمي (--primary = hsl 204 88% 53%)،
// لا أخضر emerald ولا primary (اللذان استعرناهما سابقًا من WorldCup).
export const ACCENT = "text-primary";

// ============================================================
// عنوان قسم (نمط الرئيسية: أيقونة بخلفية خفيفة + عنوان + وصف)
// ============================================================
export function SectionHeader({ title, subtitle, icon, action }: {
  title: string; subtitle?: string; icon: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent-blue/30 shrink-0">{icon}</div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-foreground">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export const moreLink = (href: string, label = "عرض الكل") => (
  <Link href={href}>
    <span className={`text-sm font-bold ${ACCENT} hover:underline`}>{label} ←</span>
  </Link>
);

// ============================================================
// بطاقة «موجز البطولة» — بلاطة بهوية سبق تلخّص بطولة في نظرة، وتتكيّف مع حالتها:
//   جارية  → المتصدّر + الهدّاف + المباراة القادمة.
//   قادمة  → عدّاد بدء الموسم + حامل اللقب.
//   منتهية → البطل + هدّاف النسخة.
// ترويسة سماوية بالشعار، جسم بتسلسل بصري واضح (بلاطة رئيسية + صفوف)، وتذييل
// دعوة. تُصبغ تلقائيًا عبر توكنز .sbq-sport. تعتمد على GET /api/sports/summary.
// ============================================================
const summaryFixtureDayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "short" });
const summaryRiyadhKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
const summarySeasonLabel = (season: number | null | undefined): string =>
  season == null ? "" : `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
// موعد الانطلاق: التاريخ الفعلي يتقدّم والعداد كبسولة ثانوية (امتداد «التواريخ ظاهرة دائمًا»).
const summaryKickDayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" });
const summaryKickDayYearFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
const summaryWeekdayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long" });
const summaryDaysPhrase = (d: number): string =>
  d <= 0 ? "ينطلق اليوم" : d === 1 ? "بعد يوم" : d === 2 ? "بعد يومين" : d <= 10 ? `بعد ${d} أيام` : `بعد ${d} يومًا`;
// موعد انطلاق البطولة القادمة: أول مباراة معتمدة، ثم تاريخ بداية الموسم، ثم العدّاد.
export function summaryKickoffDate(summary: SpSummary, startIso?: string | null): { date: Date; hasTime: boolean } | null {
  if (summary.nextMatch) return { date: new Date(summary.nextMatch.timestamp * 1000), hasTime: true };
  if (startIso) {
    const dt = new Date(startIso);
    if (Number.isFinite(dt.getTime())) return { date: dt, hasTime: false };
  }
  if (summary.daysUntilKickoff != null) return { date: new Date(Date.now() + summary.daysUntilKickoff * 86_400_000), hasTime: false };
  return null;
}

// الهاب الفاخر المخصّص لكل بطولة كبرى — يُعتمد في الروابط بدل القالب العام
// /sports/competition/:slug. البطولات غير المذكورة تبقى على القالب العام.
export const DEDICATED_HUB_BY_SLUG: Record<string, string> = {
  "pro-league": "/roshn",
  "world-cup": "/world-cup",
  "gulf-cup": "/gulf-cup",
  "kings-cup": "/kings-cup",
  "asian-cup": "/asian-cup",
};
export const competitionHref = (slug: string): string =>
  DEDICATED_HUB_BY_SLUG[slug] ?? `/sports/competition/${slug}`;

// صف «شعار/أيقونة + وسم + اسم + قيمة» — لعرض المتصدّر أو الهدّاف بوضوح.
function SummaryEntity({
  logo,
  fallback,
  round,
  label,
  name,
  value,
  valueUnit,
  tone = "muted",
}: {
  logo?: string | null;
  fallback: React.ReactNode;
  round?: boolean;
  label: string;
  name: string;
  value?: string;
  valueUnit?: string;
  tone?: "muted" | "gold";
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-background px-3 py-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center">
        {logo ? (
          <img src={logo} alt="" className={`h-8 w-8 object-contain ${round ? "rounded-full" : ""}`} loading="lazy" />
        ) : (
          fallback
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold text-muted-foreground">{label}</div>
        <div className="truncate text-[13.5px] font-bold text-foreground">{name}</div>
      </div>
      {value != null && (
        <div className="shrink-0 text-left">
          <span className="text-lg font-black leading-none tabular-nums text-primary">{value}</span>
          {valueUnit && <span className="mr-0.5 text-[10px] font-bold text-muted-foreground">{valueUnit}</span>}
        </div>
      )}
    </div>
  );
}

function SummaryMatchStrip({ m, live }: { m: NonNullable<SpSummary["nextMatch"]>; live?: boolean }) {
  const todayKey = summaryRiyadhKey.format(new Date());
  const matchKey = summaryRiyadhKey.format(new Date(m.timestamp * 1000));
  const when = live
    ? "مباشر الآن"
    : matchKey === todayKey
      ? `اليوم · ${fmtTime(m.timestamp)}`
      : `${summaryFixtureDayFmt.format(new Date(m.timestamp * 1000))} · ${fmtTime(m.timestamp)}`;
  const side = (t: SpSummaryTeam, dir: "start" | "end") => (
    <span className={`flex min-w-0 flex-1 items-center gap-1.5 ${dir === "end" ? "flex-row-reverse" : ""}`}>
      {t.logo ? <img src={t.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" /> : <span className="h-5 w-5 shrink-0" />}
      <span className="truncate text-[11.5px] font-bold text-foreground">{t.name}</span>
    </span>
  );
  return (
    <div className="rounded-lg border border-border/70 bg-background px-3 py-2">
      <div className="mb-1.5 flex items-center justify-center gap-1.5">
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
        <span className={`text-[10px] font-bold tabular-nums ${live ? "text-red-500" : "text-muted-foreground"}`}>{when}</span>
      </div>
      <div className="flex items-center gap-2">
        {side(m.home, "start")}
        <span className="shrink-0 text-[10px] font-bold text-muted-foreground">×</span>
        {side(m.away, "end")}
      </div>
    </div>
  );
}

// صفّ «رفّ الانطلاق» المدمج (النموذج ب) — نسخة الجوال من موجز البطولات:
// شعار + اسم وسطر سياق + الموعد بالتاريخ أولًا. صفّ واحد لكل بطولة، فالفئة
// كاملة تُمسح بلا تمرير طويل، واللون الساخن محصور في مجموعة «هذا الأسبوع».
export function CompetitionShelfRow({
  summary,
  startIso,
  hot = false,
}: {
  summary: SpSummary;
  startIso?: string | null;
  hot?: boolean;
}) {
  const isFinished = summary.status === "finished";
  const isUpcoming = summary.status === "upcoming";
  const live = summary.liveCount > 0;
  const kickoff = isUpcoming ? summaryKickoffDate(summary, startIso) : null;
  const kickoffSameYear = kickoff ? kickoff.date.getFullYear() === new Date().getFullYear() : true;

  const subline = isUpcoming
    ? summary.champion
      ? `حامل اللقب: ${summary.champion.name}`
      : summarySeasonLabel(summary.season)
        ? `موسم ${summarySeasonLabel(summary.season)}`
        : "موسم جديد"
    : isFinished
      ? summary.champion
        ? `البطل: ${summary.champion.name}`
        : "انتهى الموسم"
      : summary.leader
        ? `المتصدّر: ${summary.leader.name}`
        : summary.matchday || "الموسم جارٍ";

  const nextTs = summary.nextMatch?.timestamp ?? null;
  const nextIsToday = nextTs != null && summaryRiyadhKey.format(new Date(nextTs * 1000)) === summaryRiyadhKey.format(new Date());

  return (
    <Link
      href={competitionHref(summary.slug)}
      className="flex items-center gap-3 border-b border-border/60 px-3.5 py-2.5 transition-colors last:border-b-0 active:bg-muted/40"
      data-testid={`summary-row-${summary.slug}`}
    >
      {summary.logo ? (
        <img src={summary.logo} alt="" className="h-9 w-9 shrink-0 object-contain" loading="lazy" />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Trophy className="h-5 w-5" strokeWidth={1.8} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-black leading-snug text-foreground">{summary.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{subline}</div>
      </div>
      <div className="shrink-0 text-left">
        {live ? (
          <>
            <div className="flex items-center justify-end gap-1.5 text-[12.5px] font-black text-red-500">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> مباشر الآن
            </div>
            <div className="text-[10.5px] tabular-nums text-muted-foreground">{summary.liveCount} مباراة</div>
          </>
        ) : isUpcoming && kickoff ? (
          <>
            <div className={`text-[12.5px] font-black tabular-nums ${hot ? "text-primary" : "text-foreground"}`}>
              {summaryWeekdayFmt.format(kickoff.date)} {(kickoffSameYear ? summaryKickDayFmt : summaryKickDayYearFmt).format(kickoff.date)}
            </div>
            <div className="text-[10.5px] tabular-nums text-muted-foreground">
              {summary.daysUntilKickoff != null
                ? summaryDaysPhrase(summary.daysUntilKickoff)
                : kickoff.hasTime
                  ? fmtTime(kickoff.date.getTime() / 1000)
                  : ""}
            </div>
          </>
        ) : isFinished ? (
          <div className="text-[11px] font-bold text-muted-foreground">انتهى الموسم</div>
        ) : nextTs != null ? (
          <>
            <div className="text-[12.5px] font-black tabular-nums text-foreground">
              {nextIsToday ? "اليوم" : summaryFixtureDayFmt.format(new Date(nextTs * 1000))}
            </div>
            <div className="text-[10.5px] tabular-nums text-muted-foreground">{fmtTime(nextTs)}</div>
          </>
        ) : (
          <div className="text-[11px] font-bold text-primary">جارية</div>
        )}
      </div>
    </Link>
  );
}

export function CompetitionSummaryCard({ summary, startIso }: { summary: SpSummary; startIso?: string | null }) {
  const { status, liveCount } = summary;
  const isFinished = status === "finished";
  const isUpcoming = status === "upcoming";
  const kickoff = isUpcoming ? summaryKickoffDate(summary, startIso) : null;
  const kickoffSameYear = kickoff ? kickoff.date.getFullYear() === new Date().getFullYear() : true;

  // «قريبًا» حُذفت (زائدة مع كتلة الموعد) — البطاقة القادمة تُظهر سهم الدخول بدلها.
  const statusChip = liveCount > 0 ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-background px-2 py-0.5 text-[10px] font-bold tabular-nums text-red-600">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> {liveCount} مباشر
    </span>
  ) : isUpcoming ? (
    <ChevronLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary" strokeWidth={2} />
  ) : isFinished ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-muted-foreground">انتهى</span>
  ) : summary.todayCount > 0 ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-background px-2 py-0.5 text-[10px] font-bold tabular-nums text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {summary.todayCount} اليوم
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.04] px-2 py-0.5 text-[10px] font-bold text-primary">جارية</span>
  );

  const seasonText = summarySeasonLabel(summary.season);

  return (
    <Link
      href={competitionHref(summary.slug)}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card text-right transition-colors hover:border-primary/30"
      data-testid={`summary-card-${summary.slug}`}
    >
      {/* هوية سبق: بطاقة محايدة بلا خيوط ملوّنة — شعار البطولة يكفي للتمييز.
          الأزرق الأساسي للعناصر الوظيفية فقط (العدّاد/الدخول). */}
      {/* الترويسة: شعار البطولة + اسمها + الفئة/الموسم + شارة الحالة */}
      <div className="flex items-start gap-3 border-b border-border/70 bg-background px-4 py-3.5">
        {summary.logo ? (
          <img src={summary.logo} alt="" className="h-10 w-10 shrink-0 object-contain" loading="lazy" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/[0.04]"><Trophy className="h-5 w-5 text-primary" strokeWidth={1.8} /></span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-black leading-tight text-foreground">{summary.name}</div>
          <div className="mt-1 truncate text-[10.5px] font-bold tabular-nums text-muted-foreground">
            {COMP_CATEGORY_LABELS[summary.category]}{seasonText ? ` · ${seasonText}` : ""}
          </div>
        </div>
        <span className="shrink-0 self-start">{statusChip}</span>
      </div>

      {/* الجسم — يتكيّف مع الحالة */}
      <div className="flex flex-1 flex-col gap-2.5 bg-card p-4">
        {isUpcoming ? (
          <>
            {kickoff ? (
              <div className="flex items-center justify-between gap-2.5 rounded-lg border border-primary/10 bg-background px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-[17px] font-black leading-tight tabular-nums text-foreground">
                    {(kickoffSameYear ? summaryKickDayFmt : summaryKickDayYearFmt).format(kickoff.date)}
                  </div>
                  <div className="text-[11px] font-bold tabular-nums text-muted-foreground">
                    {summaryWeekdayFmt.format(kickoff.date)}
                    {kickoff.hasTime ? ` · ${fmtTime(kickoff.date.getTime() / 1000)}` : ""}
                  </div>
                </div>
                {summary.daysUntilKickoff != null && (
                  <span className="shrink-0 rounded-full border border-primary/15 bg-primary/[0.04] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-primary">
                    {summaryDaysPhrase(summary.daysUntilKickoff)}
                  </span>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-primary/10 bg-background px-3 py-2.5 text-[12px] font-bold text-primary">لم تبدأ بعد — ترقّب الجدول</div>
            )}
            {summary.champion && (
              <SummaryEntity
                logo={summary.champion.logo}
                fallback={<Crown className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />}
                label="حامل اللقب"
                name={summary.champion.name}
              />
            )}
          </>
        ) : isFinished ? (
          <>
            {summary.champion ? (
              <SummaryEntity
                logo={summary.champion.logo}
                fallback={<Trophy className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />}
                label="بطل الموسم"
                name={summary.champion.name}
                tone="gold"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-[11.5px] text-muted-foreground">انتهى الموسم — تظهر تفاصيل النسخة القادمة قريبًا</div>
            )}
            {summary.topScorer && (
              <SummaryEntity
                round
                fallback={<Goal className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />}
                label="هدّاف النسخة"
                name={summary.topScorer.name}
                value={String(summary.topScorer.goals)}
                valueUnit="هدف"
              />
            )}
          </>
        ) : (
          <>
            {summary.leader && (
              <SummaryEntity
                logo={summary.leader.logo}
                fallback={<Crown className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />}
                label={summary.matchday ? `المتصدّر · ${summary.matchday}` : "المتصدّر"}
                name={summary.leader.name}
                value={String(summary.leader.points)}
                valueUnit="نقطة"
              />
            )}
            {summary.topScorer && (
              <SummaryEntity
                round
                fallback={<Goal className="h-6 w-6 text-muted-foreground" strokeWidth={1.8} />}
                label="الهدّاف"
                name={summary.topScorer.name}
                value={String(summary.topScorer.goals)}
                valueUnit="هدف"
              />
            )}
            {summary.nextMatch && <SummaryMatchStrip m={summary.nextMatch} live={liveCount > 0} />}
            {!summary.leader && !summary.topScorer && !summary.nextMatch && (
              <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-center text-[11.5px] text-muted-foreground">تظهر التفاصيل مع انطلاق المنافسة</div>
            )}
          </>
        )}
      </div>

      {/* لا تذييل — البطاقة كلها رابط، والسهم في الترويسة (حذف «كل تفاصيل البطولة» المكرّر) */}
    </Link>
  );
}

// ============================================================
// لوحة «مباريات اليوم · كل البطولات» — نظرة سريعة موحّدة أعلى الصفحة:
// كل مباريات الأندية السعودية اليوم عبر جميع بطولاتنا (مقرّرة/جارية/منتهية)،
// مع اسم البطولة لكل مباراة والجارية مُبرَزة — مستقلّة عن البطولة المختارة.
// تُخفى تمامًا إن لا مباريات اليوم.
// ============================================================
// ============================================================
// المرحلة 3 (الشخصنة): متابعة الفِرق + لوحة «متابعاتي»
// ============================================================
// خطّاف موحّد لمتابعات المستخدم — TanStack Query يوحّد النداء بنفس المفتاح عبر
// كل المستهلكين، فلا تكرار. يُفعَّل فقط للمستخدم المسجَّل (يتجنّب 401 مزعجة).
export function useSportsFollows() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useQuery<{ follows: SpFollow[] }>({
    queryKey: ["/api/sports/follows"],
    enabled: !!user,
    staleTime: 60_000,
  });
  const follows = Array.isArray(data?.follows) ? data!.follows : [];
  const has = (kind: SpFollow["kind"], refId: string | number) =>
    follows.some((f) => f.kind === kind && f.refId === String(refId));
  const get = (kind: SpFollow["kind"], refId: string | number) =>
    follows.find((f) => f.kind === kind && f.refId === String(refId));

  const setNotify = async (kind: SpFollow["kind"], refId: string | number, notify: boolean) => {
    try {
      await apiRequest("/api/sports/follows", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, refId: String(refId), notify }),
      });
      qc.invalidateQueries({ queryKey: ["/api/sports/follows"] });
      toast({ description: notify ? "تم تفعيل الإشعارات" : "تم كتم الإشعارات" });
    } catch {
      toast({ variant: "destructive", description: "تعذّر تحديث الإشعار، حاول مجددًا" });
    }
  };

  const toggle = async (kind: SpFollow["kind"], refId: string | number, refName: string, refLogo?: string | null) => {
    const id = String(refId);
    const wasFollowing = has(kind, id);
    try {
      if (wasFollowing) {
        await apiRequest(`/api/sports/follows?kind=${kind}&refId=${encodeURIComponent(id)}`, { method: "DELETE" });
      } else {
        await apiRequest("/api/sports/follows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, refId: id, refName, refLogo: refLogo ?? null }),
        });
      }
      qc.invalidateQueries({ queryKey: ["/api/sports/follows"] });
      toast({ description: wasFollowing ? `أُلغيت متابعة ${refName}` : `تتابع الآن ${refName}` });
    } catch {
      toast({ variant: "destructive", description: "تعذّر تحديث المتابعة، حاول مجددًا" });
    }
  };

  return { isAuthed: !!user, follows, has, get, toggle, setNotify };
}

// أزرار المتابعة: نجمة المتابعة + جرس كتم الإشعارات (يظهر عند المتابعة فقط).
// تدعم الفريق والبطولة (kind)، وتظهر للمستخدم المسجَّل فقط.
export function FollowControls({ kind = "team", refId, refName, refLogo, size = "sm" }: {
  kind?: SpFollow["kind"]; refId: string | number; refName: string; refLogo?: string | null;
  size?: "sm" | "md";
}) {
  const { isAuthed, has, get, toggle, setNotify } = useSportsFollows();
  if (!isAuthed) return null;
  const active = has(kind, refId);
  const follow = get(kind, refId);
  const muted = follow ? !follow.notify : false;
  const followLabel = kind === "competition" ? "متابعة البطولة" : "متابعة الفريق";
  const btnPad = size === "md" ? "px-3.5 py-1.5 text-sm" : "px-2.5 py-1 text-xs";
  const iconSize = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); void toggle(kind, refId, refName, refLogo); }}
        title={active ? "إلغاء المتابعة" : followLabel}
        aria-pressed={active}
        className={`inline-flex items-center gap-1 rounded-full border border-border ${btnPad} font-bold transition-colors hover:bg-muted`}
      >
        <Star className={`${iconSize} ${active ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
        {active ? "متابَع" : "متابعة"}
      </button>
      {active && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); void setNotify(kind, refId, muted); }}
          title={muted ? "تفعيل الإشعارات" : "كتم الإشعارات"}
          aria-pressed={!muted}
          className="inline-flex items-center justify-center rounded-full border border-border p-1.5 transition-colors hover:bg-muted"
        >
          {muted ? <BellOff className={`${iconSize} text-muted-foreground`} /> : <Bell className={`${iconSize} text-primary`} />}
        </button>
      )}
    </div>
  );
}

// صفّ نتائج مدمج لمباراة اليوم (بنفس نمط بطاقة النتائج المدمجة) — للجوال.
export function TodayCompactRow({ f, onOpen }: { f: SpLiveItem; onOpen: (id: number) => void }) {
  const decided = f.status.live || f.status.finished;
  const homeWon = decided && f.goals.home != null && f.goals.away != null && f.goals.home > f.goals.away;
  const awayWon = decided && f.goals.home != null && f.goals.away != null && f.goals.away > f.goals.home;
  return (
    <button
      onClick={() => onOpen(f.id)}
      className="group relative w-full overflow-hidden rounded-lg bg-background border border-border text-right px-3 py-2 hover-elevate transition-all"
    >
      {f.status.live && <span className="absolute inset-y-0 right-0 w-0.5 bg-red-500" />}
      <div className="flex items-center gap-2">
        <span className={`flex-1 min-w-0 truncate text-right text-sm font-bold ${homeWon ? "text-foreground" : decided ? "text-muted-foreground" : "text-foreground"}`}>{f.home.name}</span>
        {f.home.logo && <img src={f.home.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <div className="shrink-0 min-w-[3.5rem] text-center px-1.5 py-0.5 rounded-md bg-muted/60">
          {decided ? (
            // RTL: المضيف يمينًا، فنعرض (ضيف - مضيف) لأن الأرقام لا تنعكس مع dir.
            <span className="text-sm font-black tabular-nums tracking-wide" dir="ltr">
              <span className={awayWon ? ACCENT : "text-foreground"}>{f.goals.away ?? 0}</span>
              <span className="mx-0.5 text-muted-foreground">-</span>
              <span className={homeWon ? ACCENT : "text-foreground"}>{f.goals.home ?? 0}</span>
            </span>
          ) : (
            <span className={`text-xs font-black ${ACCENT} tabular-nums`}>{fmtTime(f.timestamp)}</span>
          )}
        </div>
        {f.away.logo && <img src={f.away.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <span className={`flex-1 min-w-0 truncate text-left text-sm font-bold ${awayWon ? "text-foreground" : decided ? "text-muted-foreground" : "text-foreground"}`}>{f.away.name}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="truncate text-muted-foreground max-w-[55%]">{f.competition}</span>
        <span className={`shrink-0 inline-flex items-center gap-1 font-bold tabular-nums ${f.status.live ? "text-red-500" : "text-muted-foreground"}`}>
          {f.status.live && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
          {f.status.live
            ? (f.status.elapsed != null ? `${f.status.elapsed}${f.status.extra ? `+${f.status.extra}` : ""}'` : "مباشر")
            : f.status.finished
            ? "انتهت"
            : fmtTime(f.timestamp)}
        </span>
      </div>
    </button>
  );
}

// ============================================================
// بطاقة الخبر البارز — مع صورة: تدرّج خفيف على الصورة + نص أبيض.
// بلا صورة: بطاقة نصّية فاتحة أنيقة (تتجنّب مظهر «الصورة المكسورة»).
// ============================================================
export function FeaturedCard({ article, large }: { article: ArticleWithDetails; large?: boolean }) {
  const img = imgOf(article);
  const onImage = !!img;
  const aspect = large ? "aspect-[16/10] sm:aspect-[16/9]" : "aspect-[16/10] lg:aspect-[16/9]";
  const titleSize = large ? "text-2xl sm:text-4xl line-clamp-3" : "text-sm sm:text-base line-clamp-2";

  const meta = (
    <div className="flex items-center gap-2 mb-2">
      {article.newsType === "breaking" ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-destructive-foreground bg-destructive rounded-full px-2.5 py-1">
          <Flame className="w-3 h-3" /> عاجل
        </span>
      ) : large ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-foreground bg-primary rounded-full px-2.5 py-1">
          <Trophy className="w-3 h-3" /> الخبر الأبرز
        </span>
      ) : null}
      <span className={`text-[11px] flex items-center gap-1 ${onImage ? "text-white/80" : "text-muted-foreground"}`}>
        <Clock className="w-3 h-3" />{timeAgo(article.publishedAt)}
      </span>
    </div>
  );

  return (
    <Link href={`/article/${article.englishSlug || article.slug}`} className="h-full">
      <article className={`group relative overflow-hidden rounded-2xl border border-border h-full ${aspect} ${onImage ? "" : "bg-gradient-to-br from-primary/10 to-card flex flex-col justify-end p-5 sm:p-7"}`}>
        {onImage ? (
          <>
            <OptimizedImage
              src={img!}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              wrapperClassName="w-full h-full"
              objectPosition={getObjectPosition(article)}
              priority={large}
              fetchPriority={large ? "high" : undefined}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className={`absolute inset-x-0 bottom-0 ${large ? "p-5 sm:p-7" : "p-4"}`}>
              {meta}
              <h3 className={`font-black text-white leading-tight ${titleSize}`}>{article.title}</h3>
              {large && article.excerpt && (
                <p className="text-white/80 text-sm mt-2 line-clamp-2 hidden sm:block max-w-2xl">{article.excerpt}</p>
              )}
            </div>
          </>
        ) : (
          <>
            <Trophy className="absolute -top-5 -left-5 w-28 h-28 text-primary/10 pointer-events-none" />
            <div className="relative">
              {meta}
              <h3 className={`font-black text-foreground leading-tight group-hover:text-primary transition-colors ${titleSize}`}>
                {article.title}
              </h3>
              {large && article.excerpt && (
                <p className="text-muted-foreground text-sm mt-2 line-clamp-2 hidden sm:block max-w-2xl">{article.excerpt}</p>
              )}
            </div>
          </>
        )}
      </article>
    </Link>
  );
}

// ============================================================
// بطاقة خبر قياسية (صورة بالأعلى + نص على خلفية بيضاء — نمط الرئيسية)
// ============================================================
export function NewsCard({ article, index }: { article: ArticleWithDetails; index: number }) {
  const img = imgOf(article);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.24) }}
      className="h-full"
    >
      <Link href={`/article/${article.englishSlug || article.slug}`} className="h-full">
        <article className="group h-full flex flex-col overflow-hidden rounded-2xl bg-card border border-border hover-elevate transition-all duration-300">
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            {img ? (
              <OptimizedImage
                src={img}
                alt={article.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                wrapperClassName="w-full h-full"
                objectPosition={getObjectPosition(article)}
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Newspaper className="w-8 h-8 text-muted-foreground/40" />
              </div>
            )}
            {article.newsType === "breaking" && (
              <Badge variant="destructive" className="absolute top-2 right-2 gap-1 rounded-full px-2 py-0.5 text-[10px]">
                <Flame className="w-3 h-3" /> عاجل
              </Badge>
            )}
          </div>
          <div className="p-3 flex flex-col flex-1">
            <h3 className="font-bold text-sm leading-relaxed line-clamp-2 text-foreground group-hover:text-primary transition-colors">
              {article.title}
            </h3>
            <div className="mt-auto pt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />{timeAgo(article.publishedAt)}
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}

// ============================================================
// تبويبات بمؤشّر متحرّك (أخضر صلب — بلا تدرّج)
// ============================================================
export function PillTabs({ tabs, active, onChange, layoutId }: {
  tabs: { key: string; label: string; badge?: React.ReactNode }[];
  active: string; onChange: (k: string) => void; layoutId: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted overflow-x-auto max-w-full">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-colors z-10 ${
            active === t.key ? "text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {active === t.key && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-lg bg-primary -z-10"
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            />
          )}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// بطاقة مباراة — متجاوبة:
//  • الجوال (< sm): صفّ نتائج مدمج منخفض الارتفاع (مضيف — النتيجة — ضيف) — مريح وغير مزعج.
//  • الديسكتوب (sm+): بطاقة كبيرة بشعارين كبيرين + نتيجة في المنتصف + شريط حالة وقدم.
//  • compact=true: تُفرض الصفوف المدمجة على كل المقاسات (تبويب «النتائج» يفضّلها).
// ============================================================
function MatchCard({ fixture, onOpen, compact = false }: { fixture: SpFixture; onOpen: (id: number) => void; compact?: boolean }) {
  const { home, away, goals, status, round } = fixture;
  const decided = status.live || status.finished;
  const homeWon = decided && (goals.home ?? 0) > (goals.away ?? 0);
  const awayWon = decided && (goals.away ?? 0) > (goals.home ?? 0);

  // حالة المباراة (مباشر / انتهت / يوم) — مشتركة بين النسختين.
  const statusNode = status.live ? (
    <span className="inline-flex items-center gap-1 font-bold text-red-500 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      {status.elapsed ? `${status.elapsed}${status.extra ? `+${status.extra}` : ""}'` : "مباشر"}
    </span>
  ) : status.finished ? (
    <span className="font-bold text-muted-foreground shrink-0">انتهت</span>
  ) : (
    <span className="font-bold text-muted-foreground shrink-0 tabular-nums">{fmtDay(fixture.timestamp)}</span>
  );

  const teamCol = (team: SpTeam, won: boolean) => (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className={`grid place-items-center w-14 h-14 rounded-full bg-white p-1.5 ring-1 transition-all ${won ? "ring-primary/50 shadow-sm" : "ring-border"}`}>
        {team.logo ? (
          <img src={team.logo} alt="" className="w-full h-full object-contain" loading="lazy" />
        ) : (
          <span className="text-base font-black text-muted-foreground">{team.name.slice(0, 2)}</span>
        )}
      </div>
      <span className={`w-full text-center text-xs leading-tight line-clamp-2 ${won ? "font-extrabold text-foreground" : decided ? "font-semibold text-muted-foreground" : "font-bold text-foreground"}`}>
        {team.name}
      </span>
    </div>
  );

  return (
    <button
      onClick={() => onOpen(fixture.id)}
      className={`group relative w-full overflow-hidden bg-card border border-border text-right hover-elevate transition-all ${compact ? "rounded-lg" : "rounded-lg sm:rounded-2xl"}`}
    >
      {/* شريط حالة علوي ملوّن — ديسكتوب فقط (يُخفى في الوضع المدمج) */}
      <span className={`${compact ? "hidden" : "hidden sm:block"} absolute inset-x-0 top-0 h-1 ${status.live ? "bg-red-500" : status.finished ? "bg-muted-foreground/25" : "bg-primary/70"}`} />

      {/* ===== الصفّ المدمج (جوال دائمًا، وكل المقاسات عند compact) ===== */}
      <div className={`${compact ? "block" : "sm:hidden"} px-3 py-2`}>
        {status.live && <span className="absolute inset-y-0 right-0 w-0.5 bg-red-500" />}
        <div className="flex items-center gap-2">
          <span className={`flex-1 min-w-0 truncate text-right text-sm font-bold ${homeWon ? "text-foreground" : decided ? "text-muted-foreground" : "text-foreground"}`}>{home.name}</span>
          {home.logo && <img src={home.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
          <div className="shrink-0 min-w-[3.5rem] text-center px-1.5 py-0.5 rounded-md bg-muted/60">
            {decided ? (
              <span className="text-sm font-black tabular-nums tracking-wide" dir="ltr">
                <span className={awayWon ? ACCENT : "text-foreground"}>{goals.away ?? 0}</span>
                <span className="mx-0.5 text-muted-foreground">-</span>
                <span className={homeWon ? ACCENT : "text-foreground"}>{goals.home ?? 0}</span>
              </span>
            ) : (
              <span className={`text-xs font-black ${ACCENT} tabular-nums`}>{fmtTime(fixture.timestamp)}</span>
            )}
          </div>
          {away.logo && <img src={away.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
          <span className={`flex-1 min-w-0 truncate text-left text-sm font-bold ${awayWon ? "text-foreground" : decided ? "text-muted-foreground" : "text-foreground"}`}>{away.name}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="truncate text-muted-foreground max-w-[55%]">{round}</span>
          {statusNode}
        </div>
      </div>

      {/* ===== الديسكتوب: بطاقة كبيرة (تُخفى في الوضع المدمج) ===== */}
      <div className={compact ? "hidden" : "hidden sm:block"}>
        <div className="flex items-center justify-between gap-2 px-4 pt-3.5 text-[11px]">
          <span className="font-semibold text-muted-foreground truncate max-w-[55%]">{round}</span>
          {statusNode}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 py-4">
          {teamCol(home, homeWon)}
          <div className="flex flex-col items-center justify-center min-w-[3.75rem] pt-2.5">
            {decided ? (
              <span className="text-2xl font-black tabular-nums tracking-tight text-foreground" dir="ltr">
                <span className={awayWon ? ACCENT : ""}>{goals.away ?? 0}</span>
                <span className="mx-1 text-muted-foreground/50">-</span>
                <span className={homeWon ? ACCENT : ""}>{goals.home ?? 0}</span>
              </span>
            ) : (
              <>
                <span className={`text-lg font-black tabular-nums ${ACCENT}`}>{fmtTime(fixture.timestamp)}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">موعد المباراة</span>
              </>
            )}
          </div>
          {teamCol(away, awayWon)}
        </div>
        <div className="flex items-center justify-center gap-1 border-t border-border/60 py-2 text-[11px] font-bold text-muted-foreground group-hover:text-primary transition-colors">
          مركز المباراة
          <ChevronLeft className="w-3.5 h-3.5" />
        </div>
      </div>
    </button>
  );
}

// متصفّح الجولات — يجلب قائمة الجولات + الجولة الحالية، ويعرض مباريات الجولة
// المختارة. يبدأ من الجولة الحالية تلقائيًا، ويسقط لآخر جولة عند انتهاء الموسم.
function RoundsView({ compSlug, onOpen }: { compSlug: string; onOpen: (id: number) => void }) {
  const { data: roundsData } = useQuery<{ rounds: { key: string; label: string }[]; current: string | null }>({
    queryKey: [`/api/sports/${compSlug}/rounds`],
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const rounds = Array.isArray(roundsData?.rounds) ? roundsData!.rounds : [];
  // null = اتبع current من الخادم بعد انتهاء الجولة؛ النقرة تثبّت الاختيار يدويًا.
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? roundsData?.current ?? rounds[rounds.length - 1]?.key ?? null;

  const { data: fxData, isLoading } = useQuery<{ fixtures: SpFixture[] }>({
    queryKey: [`/api/sports/${compSlug}/round`, { name: active }],
    enabled: !!active,
    staleTime: 15_000,
    refetchInterval: (q) =>
      (q.state.data?.fixtures ?? []).some((f) => f.status.live) ? 15_000 : 60_000,
  });
  const fixtures = Array.isArray(fxData?.fixtures) ? fxData!.fixtures : [];

  const emptyBox = (title: string, hint?: string) => (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      {hint && <p className="mt-1.5 text-[12.5px] text-foreground/55">{hint}</p>}
    </div>
  );

  if (rounds.length === 0) return emptyBox("لا تتوفّر جولات لهذه البطولة بعد", "تظهر الجولات هنا عند إعلان جدول المباريات.");

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 scrollbar-hide">
        {rounds.map((r) => (
          <button
            key={r.key}
            onClick={() => setSelected(r.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              active === r.key ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      {isLoading
        ? <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-card border border-border animate-pulse" />)}</div>
        : fixtures.length === 0
          ? emptyBox("لا توجد مباريات في هذه الجولة", "جرّب جولة أخرى من الشريط أعلاه.")
          : <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">{fixtures.map((f) => <MatchCard key={f.id} fixture={f} onOpen={onOpen} compact />)}</div>}
    </div>
  );
}

export function MatchHub({ data, configured, compSlug, onOpen }: {
  data: { live: SpFixture[]; today: SpFixture[]; upcoming: SpFixture[]; results: SpFixture[] };
  configured: boolean; compSlug: string; onOpen: (id: number) => void;
}) {
  const tabs = [
    { key: "live", label: "مباشر", list: data.live },
    { key: "today", label: "اليوم", list: data.today },
    { key: "upcoming", label: "قادمة", list: data.upcoming },
    { key: "results", label: "النتائج", list: data.results },
  ];
  const firstWithData = tabs.find((t) => t.list.length > 0)?.key ?? "today";
  const [active, setActive] = useState(firstWithData);

  const emptyBox = (title: string, hint?: string) => (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      {hint && <p className="mt-1.5 text-[12.5px] text-foreground/55">{hint}</p>}
    </div>
  );

  if (!configured) {
    return emptyBox("بانتظار انطلاق الموسم", "تغطية المباريات الحيّة تظهر هنا فور بدء الجولة الأولى.");
  }

  const isRounds = active === "rounds";
  const current = tabs.find((t) => t.key === active) ?? tabs[1];

  return (
    <div>
      <div className="mb-5">
        <PillTabs
          layoutId="match-hub-tab"
          active={active}
          onChange={setActive}
          tabs={[
            ...tabs.map((t) => ({
              key: t.key, label: t.label,
              badge: t.key === "live"
                ? (t.list.length > 0 ? <span className="mr-1.5 inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse align-middle" /> : null)
                : <span className="mr-1.5 opacity-60 tabular-nums">{t.list.length}</span>,
            })),
            { key: "rounds", label: "الجولات", badge: null },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {isRounds
            ? <RoundsView compSlug={compSlug} onOpen={onOpen} />
            : current.list.length === 0
              ? emptyBox(
                  active === "live" ? "لا مباريات مباشرة الآن" : "لا توجد مباريات في هذه الفترة",
                  active === "live" ? "عُد عند صافرة البداية لمتابعة اللحظات الحيّة." : "جرّب تبويبًا آخر من الشريط أعلاه.",
                )
              : (
                <div className="grid gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {/* كل التبويبات (مباشر/اليوم/قادمة/النتائج) صفوف مدمجة موحّدة على كل المقاسات */}
                  {current.list.map((f) => <MatchCard key={f.id} fixture={f} onOpen={onOpen} compact />)}
                </div>
              )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// سباق اللقب (بطاقة بيضاء + أشرطة خضراء) + جدول الترتيب
// ============================================================
export function TitleRace({ rows }: { rows: SpStandingRow[] }) {
  const top = rows.slice(0, 4);
  if (top.length === 0) return null;
  const maxPts = Math.max(...top.map((r) => r.points), 1);
  return (
    <Card className="p-5 mb-5">
      <div className="flex items-center gap-2 text-sm font-bold mb-4 text-foreground">
        <Crown className="w-4 h-4 text-amber-500" /> سباق اللقب
      </div>
      <div className="space-y-3">
        {top.map((r, i) => (
          <div key={r.team.id} className="flex items-center gap-3">
            <span className="w-5 text-center font-black tabular-nums text-muted-foreground">{r.rank}</span>
            {r.team.logo && <img src={r.team.logo} alt="" className="w-7 h-7 object-contain shrink-0" />}
            <span className="w-24 sm:w-32 truncate font-bold text-sm shrink-0 text-foreground">{r.team.name}</span>
            {/* بلا dir="ltr": في RTL يمتد الشريط من اليمين (بجوار اسم الفريق) لا من اليسار */}
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }} whileInView={{ width: `${(r.points / maxPts) * 100}%` }}
                viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.1 }}
                className={`h-full rounded-full ${i === 0 ? "bg-primary" : "bg-primary/35"}`}
              />
            </div>
            <span className={`w-9 text-left font-black tabular-nums ${ACCENT}`}>{r.points}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FormChips({ form }: { form: string | null }) {
  if (!form) return null;
  const map: Record<string, string> = {
    W: "bg-primary/85",
    D: "bg-amber-300",
    L: "bg-rose-400",
  };
  return (
    <div className="flex gap-1.5 justify-center" dir="ltr">
      {form.slice(-5).split("").map((r, i) => (
        <span key={i} className={`w-3.5 h-3.5 rounded-full ${map[r] ?? "bg-muted"}`} title={r} />
      ))}
    </div>
  );
}

type SortKey = "rank" | "points" | "goalsDiff" | "goalsFor" | "win";
type StandScope = "all" | "home" | "away";

export function StandingsTable({ rows }: { rows: SpStandingRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [scope, setScope] = useState<StandScope>("all");
  const [query, setQuery] = useState("");
  const hasSplits = useMemo(() => rows.some((r) => r.home || r.away), [rows]);

  // نطبّع الصفوف حسب النطاق (الكل/أرضه/خارجه) فتعمل بقية المنطق على أرقام موحّدة.
  const normalized = useMemo(() => rows.map((r) => {
    if (scope === "all") return r;
    const s = scope === "home" ? r.home : r.away;
    if (!s) return { ...r, played: 0, win: 0, draw: 0, lose: 0, goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0 };
    return { ...r, played: s.played, win: s.win, draw: s.draw, lose: s.lose, goalsFor: s.goalsFor, goalsAgainst: s.goalsAgainst, goalsDiff: s.goalsFor - s.goalsAgainst, points: s.points };
  }), [rows, scope]);

  const sorted = useMemo(() => {
    const filtered = query.trim() ? normalized.filter((r) => r.team.name.includes(query.trim())) : normalized;
    const arr = [...filtered];
    // خارج نطاق "الكل" لا يوجد ترتيب أصلي للسبليت، فنرتّب بالنقاط ثم الفارق.
    if (scope !== "all") {
      arr.sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor);
    } else {
      arr.sort((a, b) => (sortKey === "rank" ? a.rank - b.rank : (b[sortKey] as number) - (a[sortKey] as number)));
    }
    return arr;
  }, [normalized, sortKey, query, scope]);

  const sortBtn = (key: SortKey, label: string) => (
    <button
      onClick={() => setSortKey(key)}
      disabled={scope !== "all"}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        sortKey === key ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      <ArrowUpDown className="w-3 h-3" />{label}
    </button>
  );

  const scopeBtn = (key: StandScope, label: string) => (
    <button
      onClick={() => setScope(key)}
      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
        scope === key ? "bg-primary text-white" : "bg-card border border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      {hasSplits && (
        <div className="flex items-center gap-2 mb-3">
          {scopeBtn("all", "عام")}
          {scopeBtn("home", "على أرضه")}
          {scopeBtn("away", "خارج أرضه")}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {sortBtn("rank", "الترتيب")}
        {sortBtn("points", "النقاط")}
        {sortBtn("goalsDiff", "الفارق")}
        {sortBtn("goalsFor", "التهديف")}
        {sortBtn("win", "الانتصارات")}
        <div className="relative mr-auto">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن نادٍ"
            className="pr-8 pl-3 py-1.5 rounded-full bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/40 w-40"
          />
        </div>
      </div>
      <Card className="rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[13px] sm:text-sm">
            <thead>
              <tr className="bg-muted/80 text-[11px] font-black text-muted-foreground sm:text-xs">
                <th className="py-2 px-1.5 sm:px-2 text-center w-10">#</th>
                <th className="py-2 px-3 text-right">النادي</th>
                <th className="py-2 px-2 text-center">لعب</th>
                <th className="py-2 px-2 text-center">فاز</th>
                <th className="py-2 px-2 text-center">تعادل</th>
                <th className="py-2 px-2 text-center">خسر</th>
                <th className="py-2 px-2 text-center">له</th>
                <th className="py-2 px-2 text-center">عليه</th>
                <th className="py-2 px-2 text-center">+/−</th>
                <th className="py-2 px-2 text-center text-primary">نقاط</th>
                <th className="py-2 px-3 text-center hidden md:table-cell">آخر 5</th>
              </tr>
            </thead>
            <tbody className="bg-card">
              {sorted.map((r, idx) => {
                const pos = scope === "all" ? r.rank : idx + 1;
                const positionTone = scope === "all"
                  ? r.rank <= 3
                    ? "bg-primary/10 text-primary ring-1 ring-primary/15"
                    : r.rank >= rows.length - 2
                      ? "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/15 dark:text-rose-400"
                      : "bg-muted/70 text-muted-foreground"
                  : "bg-muted/70 text-muted-foreground";
                // zebra أوضح من الخلفية: الصف الزوجي بدرجة رمادية محسوسة (muted/40)
                // بدل background/35 الذي يكاد لا يُرى فوق بطاقة bg-card الفاتحة.
                const rowTone = idx % 2 === 0 ? "bg-muted/40" : "bg-card";
                return (
                  <tr key={r.team.id} className={`${rowTone} transition-colors hover:bg-primary/[0.045]`}>
                    <td className="border-b border-border/35 py-1.5 px-1.5 text-center sm:py-2 sm:px-2">
                      <span className="inline-flex items-center justify-center gap-1">
                        <span className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-black tabular-nums ${positionTone}`}>
                          {pos}
                        </span>
                        {/* أثناء المباريات الجارية: سهم الحراك اللحظي (liveDelta) يقدَّم على اتجاه الجولة */}
                        {scope === "all" && r.live && (r.liveDelta ?? 0) > 0 && <ArrowUp className="h-3 w-3 text-emerald-500" aria-label={`صعد ${r.liveDelta} مركزًا`} />}
                        {scope === "all" && r.live && (r.liveDelta ?? 0) < 0 && <ArrowDown className="h-3 w-3 text-rose-500" aria-label={`هبط ${Math.abs(r.liveDelta ?? 0)} مركزًا`} />}
                        {scope === "all" && r.live && (r.liveDelta ?? 0) === 0 && <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="ثابت لحظيًا" />}
                        {scope === "all" && !r.live && r.trend === "up" && <ArrowUp className="h-3 w-3 text-emerald-500" aria-label="صاعد" />}
                        {scope === "all" && !r.live && r.trend === "down" && <ArrowDown className="h-3 w-3 text-rose-500" aria-label="هابط" />}
                        {scope === "all" && !r.live && r.trend === "same" && <Minus className="h-3 w-3 text-muted-foreground/50" aria-label="ثابت" />}
                      </span>
                    </td>
                    <td className="border-b border-border/35 py-1.5 px-3 sm:py-2">
                      <Link href={`/sports/team/${r.team.id}`} className="flex items-center gap-2.5 hover:text-primary transition-colors">
                        {r.team.logo && <img src={r.team.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
                        <span className="font-semibold text-foreground hover:text-primary truncate">{r.team.name}</span>
                        {r.live && (
                          <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-black text-red-600 dark:text-red-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                            مباشر
                          </span>
                        )}
                      </Link>
                    </td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center text-muted-foreground tabular-nums sm:py-2">{r.played}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center text-muted-foreground tabular-nums sm:py-2">{r.win}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center text-muted-foreground tabular-nums sm:py-2">{r.draw}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center text-muted-foreground tabular-nums sm:py-2">{r.lose}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center text-muted-foreground tabular-nums sm:py-2">{r.goalsFor}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center text-muted-foreground tabular-nums sm:py-2">{r.goalsAgainst}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center tabular-nums sm:py-2">{r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}</td>
                    <td className="border-b border-border/35 py-1.5 px-2 text-center sm:py-2">
                      <span className="inline-flex min-w-8 justify-center rounded-full bg-primary/10 px-2 py-0.5 font-black tabular-nums text-primary">
                        {r.points}
                      </span>
                    </td>
                    <td className="border-b border-border/35 py-1.5 px-3 hidden text-center sm:py-2 md:table-cell"><FormChips form={r.form} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-primary/70" /> مراكز البطولة الآسيوية</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-400/80" /> مراكز الهبوط</span>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// منصّة الهدّافين / صنّاع الأهداف (مكوّن مشترك)
// ============================================================
interface PodiumEntry {
  rank: number; id: number; name: string; photo: string;
  team: { name: string; logo: string };
  primary: number;  // الرقم البارز (أهداف أو صناعة)
  secondary: number; // الرقم الثانوي (الضد)
}

export function PodiumCard({ entries, primaryLabel, secondaryLabel }: {
  entries: PodiumEntry[]; primaryLabel: string; secondaryLabel: string;
}) {
  if (entries.length === 0) return null;
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3, 10);
  // ترتيب العرض: 2 - 1 - 3
  const order = [podium[1], podium[0], podium[2]].filter(Boolean);
  const heights = ["h-24", "h-32", "h-20"];
  const medals = ["from-slate-300 to-slate-400", "from-amber-300 to-amber-500", "from-orange-400 to-orange-600"];
  const heightByRank = (rank: number) => (rank === 1 ? heights[1] : rank === 2 ? heights[0] : heights[2]);
  const medalByRank = (rank: number) => (rank === 1 ? medals[1] : rank === 2 ? medals[0] : medals[2]);

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* المنصّة */}
      <Card className="p-5">
        <div className="flex items-end justify-center gap-3 sm:gap-5 pt-4">
          {order.map((s) => (
            <Link key={s.id} href={`/sports/player/${s.id}`} className="flex flex-col items-center flex-1 max-w-[120px] group">
              <div className="relative mb-2">
                {s.photo ? (
                  <img src={s.photo} alt="" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover ring-2 ring-primary/40 group-hover:ring-primary transition-all" loading="lazy" />
                ) : (
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted" />
                )}
                <span className={`absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-gradient-to-br ${medalByRank(s.rank)} text-white text-xs font-black flex items-center justify-center ring-2 ring-card`}>
                  {s.rank}
                </span>
              </div>
              <span className="text-xs font-bold text-foreground text-center line-clamp-1 group-hover:text-primary transition-colors">{s.name}</span>
              <div className={`mt-2 w-full ${heightByRank(s.rank)} rounded-t-xl bg-gradient-to-t ${medalByRank(s.rank)} flex items-start justify-center pt-2`}>
                <span className="text-white font-black text-lg tabular-nums">{s.primary}</span>
              </div>
            </Link>
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-3">{primaryLabel}</p>
      </Card>
      {/* البقية */}
      <Card className="divide-y divide-border overflow-hidden">
        {rest.map((s) => (
          <Link key={`${s.id}-${s.rank}`} href={`/sports/player/${s.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
            <span className="w-6 text-center font-bold text-muted-foreground tabular-nums">{s.rank}</span>
            {s.photo ? <img src={s.photo} alt="" className="w-9 h-9 rounded-full object-cover bg-muted" loading="lazy" /> : <span className="w-9 h-9 rounded-full bg-muted" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-foreground truncate">{s.name}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                {s.team.logo && <img src={s.team.logo} alt="" className="w-3.5 h-3.5 object-contain" />}{s.team.name}
              </div>
            </div>
            <div className="text-center px-1"><span className={`font-black tabular-nums ${ACCENT}`}>{s.primary}</span></div>
            <div className="text-center px-1 border-r border-border"><span className="text-amber-600 font-bold text-sm tabular-nums">{s.secondary}</span></div>
          </Link>
        ))}
      </Card>
    </div>
  );
}

// ============================================================
// تفاصيل المباراة
// ============================================================
// أشرطة إحصائية متناظرة تنمو من المركز للخارج (نمط WorldCup MatchCenterDialog).
// أوضح بصرياً وأكثر حداثة من الشريطين المتلاصقين التقليديين.
function StatBar({ row }: { row: SpStatRow }) {
  const toNum = (v: string | number | null) => { if (v == null) return 0; const n = parseFloat(String(v).replace("%", "")); return Number.isFinite(n) ? n : 0; };
  const h = toNum(row.home), a = toNum(row.away), max = Math.max(h, a) || 1;
  const hPct = (h / max) * 50; // نصف العرض كحد أقصى لكل جهة
  const aPct = (a / max) * 50;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-bold text-foreground tabular-nums">{row.home ?? "—"}</span>
        <span className="text-muted-foreground font-medium">{row.label}</span>
        <span className="font-bold text-foreground tabular-nums">{row.away ?? "—"}</span>
      </div>
      {/* بلا dir="ltr": صفّ القيم أعلاه RTL (المضيف يمينًا) — فرضُ LTR كان يعكس
          جهتي الشريط فيظهر عمود المضيف تحت رقم الضيف والعكس */}
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div className="absolute end-1/2 h-full rounded-s-full bg-primary transition-all duration-500" style={{ width: `${hPct}%` }} />
        <div className="absolute start-1/2 h-full rounded-e-full bg-amber-400 transition-all duration-500" style={{ width: `${aPct}%` }} />
      </div>
    </div>
  );
}

// شريط استحواذ بارز أعلى تبويب «نبض الأرقام» — لمسة بصرية فورية للقارئ.
function PossessionBar({ row }: { row: SpStatRow }) {
  const toNum = (v: string | number | null) => { if (v == null) return 50; const n = parseFloat(String(v).replace("%", "")); return Number.isFinite(n) ? n : 50; };
  const h = Math.min(Math.max(toNum(row.home), 0), 100);
  const a = 100 - h;
  return (
    <div className="mb-4 pb-4 border-b border-border">
      <div className="flex items-end justify-between mb-2">
        <div className="text-center">
          <div className="text-2xl font-black text-primary tabular-nums">{h}%</div>
          <div className="text-[10px] text-muted-foreground font-medium">المضيف</div>
        </div>
        <span className="text-xs text-muted-foreground font-bold mb-1">الاستحواذ</span>
        <div className="text-center">
          <div className="text-2xl font-black text-amber-500 tabular-nums">{a}%</div>
          <div className="text-[10px] text-muted-foreground font-medium">الضيف</div>
        </div>
      </div>
      {/* بلا dir="ltr": المضيف معنون يمينًا أعلاه — فرضُ LTR كان يضع شريطه يسارًا
          عكس تسميته (نفس تعليق PossessionBar في مركز المونديال) */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
        <div className="bg-primary transition-all duration-700" style={{ width: `${h}%` }} />
        <div className="bg-amber-400 transition-all duration-700" style={{ width: `${a}%` }} />
      </div>
    </div>
  );
}
// اسم لاعب في التشكيلة، يربط لصفحته إن توفّر معرّفه.
function LineupName({ p, className }: { p: SpLineupPlayer; className?: string }) {
  if (p.id) return <Link href={`/sports/player/${p.id}`} className={`hover:text-primary transition-colors ${className ?? ""}`}>{p.name}</Link>;
  return <span className={className}>{p.name}</span>;
}

// البند 10: عرض التشكيلة على أرض ملعب حسب إحداثيات grid ("صف:عمود").
function PitchView({ lineup }: { lineup: SpLineup }) {
  // تجميع لاعبي الأساسيّ حسب الصفّ (الصفّ 1 = الحارس، قرب المرمى).
  const rows = new Map<number, SpLineupPlayer[]>();
  for (const p of lineup.startXI) {
    const [r] = (p.grid ?? "").split(":");
    const row = Number(r) || 1;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(p);
  }
  const sortedRows = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const players = rows.get(r)!.slice().sort((a, b) => {
      const ca = Number((a.grid ?? "").split(":")[1]) || 0;
      const cb = Number((b.grid ?? "").split(":")[1]) || 0;
      return ca - cb;
    });
    return players;
  });

  return (
    <div className="relative rounded-2xl overflow-hidden border border-emerald-900/30 bg-gradient-to-b from-emerald-700 to-emerald-800 p-3 py-5">
      {/* خطوط الملعب */}
      <div className="absolute inset-3 rounded-xl border-2 border-white/15 pointer-events-none" />
      <div className="absolute left-1/2 right-3 top-1/2 h-px bg-white/15 -translate-y-1/2 pointer-events-none" style={{ left: "0.75rem" }} />
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full border-2 border-white/15 pointer-events-none" />
      <div className="relative flex flex-col-reverse gap-3">
        {sortedRows.map((players, ri) => (
          <div key={ri} className="flex items-start justify-around gap-1">
            {players.map((p) => (
              <div key={p.id || p.number || p.name} className="flex flex-col items-center gap-1 min-w-0 flex-1">
                <span className="w-9 h-9 rounded-full bg-white text-emerald-900 flex items-center justify-center text-sm font-black tabular-nums shadow ring-1 ring-black/10">{p.number ?? ""}</span>
                <LineupName p={p} className="text-[10px] font-semibold text-white text-center leading-tight line-clamp-2 max-w-[72px]" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineupTeam({ lineup }: { lineup: SpLineup }) {
  // إن توفّرت إحداثيات grid لكل اللاعبين → عرض أرض الملعب؛ وإلا القائمة النصية.
  const hasGrid = lineup.startXI.length > 0 && lineup.startXI.every((p) => !!p.grid);
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        {lineup.team.logo && <img src={lineup.team.logo} alt="" className="w-6 h-6 object-contain" />}
        <span className="font-bold text-foreground">{lineup.team.name}</span>
        {lineup.formation && <span className={`text-xs bg-accent-blue/40 ${ACCENT} rounded px-1.5 py-0.5 font-bold tabular-nums`} dir="ltr">{lineup.formation}</span>}
      </div>
      {lineup.coach && <div className="text-xs text-muted-foreground mb-2">المدرب: {lineup.coach}</div>}
      {hasGrid ? (
        <PitchView lineup={lineup} />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {lineup.startXI.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className={`w-6 text-center text-xs font-bold ${ACCENT} tabular-nums shrink-0`}>{p.number ?? ""}</span>
              <LineupName p={p} className="text-foreground truncate" />
            </div>
          ))}
        </div>
      )}
      {lineup.substitutes.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="text-xs font-bold text-muted-foreground mb-1">البدلاء</div>
          <div className="text-xs text-muted-foreground leading-6">
            {lineup.substitutes.map((p, i) => (
              <span key={p.id || i}>{i > 0 ? "، " : ""}<LineupName p={p} /></span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// الموجة 2: قائمة متصدّري البطاقات (إنذارات + طرد). عند تمرير قائمة الطرد
// (red) تظهر مفاتيح تبديل بين «الإنذارات» و«الطرد».
export function CardLeaders({ leaders, red }: { leaders: SpCardLeader[]; red?: SpCardLeader[] }) {
  const hasRed = Array.isArray(red) && red.length > 0;
  const [view, setView] = useState<"yellow" | "red">("yellow");
  const list = view === "red" && hasRed ? red! : leaders;
  return (
    <div className="space-y-2">
      {hasRed && (
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-bold">
          <button
            type="button"
            onClick={() => setView("yellow")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === "yellow" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <span className="w-2.5 h-3.5 rounded-sm bg-amber-400" /> الإنذارات
          </button>
          <button
            type="button"
            onClick={() => setView("red")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${view === "red" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            <span className="w-2.5 h-3.5 rounded-sm bg-red-500" /> الطرد
          </button>
        </div>
      )}
      <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
      {list.map((p) => (
        <div key={p.id || p.rank} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-5 text-center font-bold text-muted-foreground text-sm tabular-nums shrink-0">{p.rank}</span>
          {p.photo ? <img src={p.photo} alt="" className="w-9 h-9 rounded-full object-cover bg-muted shrink-0" loading="lazy" /> : <span className="w-9 h-9 rounded-full bg-muted shrink-0" />}
          <div className="flex-1 min-w-0">
            {p.id ? (
              <Link href={`/sports/player/${p.id}`} className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block">{p.name}</Link>
            ) : <div className="text-sm font-semibold text-foreground truncate">{p.name}</div>}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {p.teamLogo && <img src={p.teamLogo} alt="" className="w-3.5 h-3.5 object-contain" loading="lazy" />}
              <span className="truncate">{p.team}</span>
              <span className="tabular-nums">· {p.matches} مباراة</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 text-sm font-black tabular-nums">
              <span className="w-3 h-4 rounded-sm bg-amber-400" /> {p.yellow}
            </span>
            {p.red > 0 && (
              <span className="flex items-center gap-1 text-sm font-black tabular-nums">
                <span className="w-3 h-4 rounded-sm bg-red-500" /> {p.red}
              </span>
            )}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// البند 12: شريط توقّعات ثلاثي (فوز المضيف / تعادل / فوز الضيف).
function PredictionBar({ prediction, homeName, awayName }: { prediction: SpPrediction; homeName: string; awayName: string }) {
  const { homePct, drawPct, awayPct, advice } = prediction;
  return (
    <div className="shrink-0 px-4 py-3 border-b border-border bg-muted/30">
      <div className="flex items-center justify-between text-[11px] font-bold mb-1.5">
        <span className="text-primary truncate max-w-[35%]">{homeName} {homePct}%</span>
        <span className="text-muted-foreground">تعادل {drawPct}%</span>
        <span className="text-amber-600 dark:text-amber-400 truncate max-w-[35%]">{awayPct}% {awayName}</span>
      </div>
      {/* بلا dir="ltr": نسبة المضيف معنونة يمينًا أعلاه — فرضُ LTR كان يعكس أعمدة الشريط */}
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
        <div className="bg-primary" style={{ width: `${homePct}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${drawPct}%` }} />
        <div className="bg-amber-400" style={{ width: `${awayPct}%` }} />
      </div>
      {advice && <div className="text-[11px] text-muted-foreground mt-2 text-center">التوصية: <span className="font-semibold text-foreground">{advice}</span></div>}
    </div>
  );
}

// شريط مزدوج (نِسبتان) للتوقّعات — يُظهر النسبة داخل الشريط إن اتّسعت.
function ForecastSplit({ title, left, right }: {
  title: string;
  left: { label: string; value: number; color: string };
  right: { label: string; value: number; color: string };
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-muted-foreground">{title}</p>
      <div className="flex h-6 w-full overflow-hidden rounded-lg text-[11px] font-bold text-white" dir="rtl">
        <div className="flex items-center justify-center" style={{ width: `${left.value}%`, backgroundColor: left.color }}>
          {left.value >= 16 ? `${left.value}%` : ""}
        </div>
        <div className="flex items-center justify-center" style={{ width: `${right.value}%`, backgroundColor: right.color }}>
          {right.value >= 16 ? `${right.value}%` : ""}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{left.label} <span className="font-bold tabular-nums text-foreground">{left.value}%</span></span>
        <span>{right.label} <span className="font-bold tabular-nums text-foreground">{right.value}%</span></span>
      </div>
    </div>
  );
}

function OverUnderRow({ ou }: { ou: SpOverUnderLine }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-bold tabular-nums shrink-0 w-9" dir="ltr">{ou.line}</span>
      <div className="flex h-5 flex-1 overflow-hidden rounded-md text-[10px] font-bold text-white" dir="rtl">
        <div className="flex items-center justify-center bg-emerald-500" style={{ width: `${ou.over}%` }}>
          {ou.over >= 20 ? `${ou.over}%` : ""}
        </div>
        <div className="flex items-center justify-center bg-zinc-400" style={{ width: `${ou.under}%` }}>
          {ou.under >= 20 ? `${ou.under}%` : ""}
        </div>
      </div>
    </div>
  );
}

// تبويب التوقّعات الاحتمالية (SportMonks): نتيجة المباراة + فرصة مزدوجة + الفريقان
// يسجلان + مجموع الأهداف + أرجح النتائج. خوارزمية المزود، للاستئناس لا ترجيحًا.
function ForecastView({ data, homeName, awayName }: { data: SpForecast; homeName: string; awayName: string }) {
  const ft = data.fulltime;
  const ftRows = ft
    ? [
        { label: `فوز ${homeName}`, value: ft.home, color: "bg-primary" },
        { label: "التعادل", value: ft.draw, color: "bg-muted-foreground/40" },
        { label: `فوز ${awayName}`, value: ft.away, color: "bg-amber-400" },
      ]
    : [];
  return (
    <div className="space-y-5 lg:max-w-2xl lg:mx-auto">
      {ftRows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-muted-foreground">نتيجة المباراة</p>
          {ftRows.map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">{row.label}</span>
                <span className="font-black tabular-nums text-foreground">{row.value}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {data.doubleChance && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground">الفرصة المزدوجة</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: `${homeName} أو تعادل`, value: data.doubleChance.homeOrDraw },
              { label: "بلا تعادل", value: data.doubleChance.homeOrAway },
              { label: `${awayName} أو تعادل`, value: data.doubleChance.awayOrDraw },
            ].map((c) => (
              <div key={c.label} className="rounded-lg bg-muted/50 px-1.5 py-2">
                <p className="text-base font-black tabular-nums text-foreground">{c.value}%</p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.btts && (
        <ForecastSplit
          title="الفريقان يسجلان"
          left={{ label: "نعم", value: data.btts.yes, color: "rgb(16 185 129)" }}
          right={{ label: "لا", value: data.btts.no, color: "rgb(161 161 170)" }}
        />
      )}

      {data.goals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground">
            مجموع الأهداف — <span className="text-emerald-600">أكثر</span> / <span className="text-zinc-500">أقل</span> من
          </p>
          <div className="space-y-1.5">
            {data.goals.map((ou) => <OverUnderRow key={ou.line} ou={ou} />)}
          </div>
        </div>
      )}

      {data.correctScores.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground">أرجح النتائج <span className="font-normal">(الرقم الأول للمضيف)</span></p>
          <div className="flex flex-wrap gap-2">
            {data.correctScores.map((cs) => (
              <div key={cs.score} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-center min-w-[3.5rem]">
                <p className="text-sm font-black tabular-nums text-foreground" dir="ltr">{cs.score}</p>
                <p className="text-[10px] text-muted-foreground tabular-nums">{cs.prob}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground text-center pt-1">
        توقّعات خوارزمية من مزوّد البيانات — للاستئناس وليست ترجيحًا تحريريًا
      </p>
    </div>
  );
}

// المواجهات المباشرة — ملخّص (فوز/تعادل/خسارة من منظور صاحب الأرض) + آخر اللقاءات.
function H2HView({ h2h, homeId, homeName, awayName }: { h2h: SpH2H; homeId: number; homeName: string; awayName: string }) {
  const s = h2h.summary;
  const fmt = (d: string) => {
    const t = Date.parse(d);
    return Number.isFinite(t) ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "short", day: "numeric" }).format(t) : "";
  };
  return (
    <div>
      {s && s.total > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-primary/10 py-2.5">
            <div className="text-xl font-black tabular-nums text-primary">{s.homeWins}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate px-1">فوز {homeName}</div>
          </div>
          <div className="rounded-xl bg-muted py-2.5">
            <div className="text-xl font-black tabular-nums text-foreground">{s.draws}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">تعادل</div>
          </div>
          <div className="rounded-xl bg-amber-500/10 py-2.5">
            <div className="text-xl font-black tabular-nums text-amber-600">{s.awayWins}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate px-1">فوز {awayName}</div>
          </div>
        </div>
      )}
      <ul className="space-y-2">
        {h2h.meetings.map((m) => {
          const decided = m.goals.home != null && m.goals.away != null;
          const homeWon = decided && (m.goals.home! > m.goals.away!);
          const awayWon = decided && (m.goals.away! > m.goals.home!);
          return (
            <li key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
              <span className="w-20 shrink-0 text-[11px] text-muted-foreground">{fmt(m.date)}</span>
              <span className={`flex-1 truncate text-left ${homeWon ? "font-bold text-foreground" : "text-muted-foreground"}`}>{m.home.name}</span>
              <span className="shrink-0 font-black tabular-nums text-foreground px-2" dir="ltr">
                {decided ? (
                  <>
                    <span>{m.goals.away}</span>
                    <span className="mx-0.5 text-muted-foreground">-</span>
                    <span>{m.goals.home}</span>
                  </>
                ) : "—"}
              </span>
              <span className={`flex-1 truncate ${awayWon ? "font-bold text-foreground" : "text-muted-foreground"}`}>{m.away.name}</span>
            </li>
          );
        })}
      </ul>
      {h2h.meetings.length > 0 && (
        <div className="mt-2 text-[11px] text-muted-foreground text-center">آخر {h2h.meetings.length} مواجهة بين الفريقين</div>
      )}
    </div>
  );
}

// ============================================================
// خط زمن المباراة — تمثيل بصري أفقي للأحداث الفاصلة (أهداف/بطاقات/ركلة ضائعة)
// على محور 0→النهاية. المضيف فوق المحور، الضيف تحته. RTL: البداية على اليمين.
// يُبنى بالكامل من بيانات الأحداث المجلوبة أصلًا (بلا أي نداء إضافي للمزوّد).
// ============================================================
// أيقونة الحدث بنمط مركز مباريات المونديال (بدل الإيموجي) — توحيد الهوية البصرية.
function SpEventIcon({ type }: { type: string }) {
  if (type === "goal") return <Goal className="h-4 w-4 text-emerald-500" />;
  if (type === "missed-penalty") return <ShieldAlert className="h-4 w-4 text-red-500" />;
  if (type === "yellow-card") return <Square className="h-4 w-4 fill-yellow-400 text-yellow-400" />;
  if (type === "red-card") return <Square className="h-4 w-4 fill-red-500 text-red-500" />;
  if (type === "substitution") return <ArrowLeftRight className="h-4 w-4 text-sky-500" />;
  if (/var/i.test(type)) return <MonitorPlay className="h-4 w-4 text-purple-500" />;
  return <Radio className="h-4 w-4 text-muted-foreground" />;
}

// بطاقة حدث على جانب فريقه في الخط الزمني (الأيقونة تلاصق العمود المركزي) — نمط المونديال.
function SpTimelineChip({ ev, extra, side }: { ev: SpMatchEvent; extra: string | null; side: "home" | "away" }) {
  const isGoal = ev.type === "goal";
  return (
    <div
      className={`inline-flex items-start gap-2 max-w-full rounded-lg px-2.5 py-1.5 ${
        isGoal ? "bg-emerald-500/10 ring-1 ring-emerald-500/25" : "bg-muted/40"
      } ${side === "home" ? "flex-row" : "flex-row-reverse"}`}
    >
      <span className="mt-0.5 shrink-0">
        <SpEventIcon type={ev.type} />
      </span>
      <div className="min-w-0" dir="rtl">
        <p className="text-xs font-bold truncate">{ev.player || ev.label}</p>
        {extra && <p className="text-[10px] text-emerald-700 dark:text-emerald-300 truncate">{extra}</p>}
        {ev.assist && isGoal && <p className="text-[10px] text-muted-foreground truncate">صناعة: {ev.assist}</p>}
        {ev.assist && ev.type === "substitution" && (
          <p className="text-[10px] text-muted-foreground truncate">بديلًا عن: {ev.assist}</p>
        )}
        {!isGoal && ev.type !== "substitution" && <p className="text-[10px] text-muted-foreground truncate">{ev.label}</p>}
      </div>
    </div>
  );
}

// ---------- إثراءات SportMonks في نافذة المباراة (xG/طقس/ضغط) ----------

function SpXgCard({ xg, homeLogo, awayLogo }: { xg: SpXg; homeLogo?: string; awayLogo?: string }) {
  const h = xg.home.xg, a = xg.away.xg, max = h + a || 1;
  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-black tabular-nums text-foreground w-12">{h.toFixed(2)}</span>
        <span className="text-muted-foreground">الأهداف المتوقّعة (xG)</span>
        <span className="font-black tabular-nums text-foreground w-12 text-left">{a.toFixed(2)}</span>
      </div>
      <div className="relative h-2 rounded-full bg-muted overflow-hidden flex">
        <div className="bg-primary" style={{ width: `${(h / max) * 100}%` }} />
        <div className="bg-amber-500" style={{ width: `${(a / max) * 100}%` }} />
      </div>
      {(xg.home.xgot > 0 || xg.away.xgot > 0) && (
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums w-12">{xg.home.xgot.toFixed(2)}</span>
          <span>على المرمى (xGoT)</span>
          <span className="tabular-nums w-12 text-left">{xg.away.xgot.toFixed(2)}</span>
        </div>
      )}
      {xg.topPlayers.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-border/60 space-y-1">
          <div className="text-[10px] text-muted-foreground">الأعلى خطورة</div>
          {xg.topPlayers.slice(0, 3).map((p, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 min-w-0">
                {(p.location === "home" ? homeLogo : awayLogo) && (
                  <img src={p.location === "home" ? homeLogo : awayLogo} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                )}
                <span className="truncate text-foreground">{p.name}</span>
              </span>
              <span className="font-bold tabular-nums text-foreground" dir="ltr">{p.xg.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpWeatherChip({ w }: { w: SpWeather }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
      {w.icon ? <img src={w.icon} alt="" className="w-8 h-8 object-contain" /> : <Cloud className="w-6 h-6 text-sky-500" />}
      <div className="min-w-0">
        <div className="text-sm font-bold text-foreground">
          {w.description}
          {w.type === "forecast" && <span className="text-[10px] text-muted-foreground font-normal"> · توقّع</span>}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
          {w.temp != null && <span className="tabular-nums">{w.temp}°م</span>}
          {w.humidity && <span className="flex items-center gap-0.5"><Droplets className="w-3 h-3" />{w.humidity}</span>}
        </div>
      </div>
    </div>
  );
}

// غيابات المباراة (إصابة/إيقاف) من SportMonks — تظهر للمباراة القادمة في تبويب «معاينة».
function AbsenteesCard({ absentees, homeName, awayName, homeLogo, awayLogo }: {
  absentees: SpAbsentee[]; homeName: string; awayName: string; homeLogo?: string; awayLogo?: string;
}) {
  const home = absentees.filter((a) => a.location === "home");
  const away = absentees.filter((a) => a.location === "away");
  const side = (name: string, logo: string | undefined, list: SpAbsentee[]) => (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-center gap-2">
        {logo && <img src={logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />}
        <span className="truncate text-sm font-bold text-foreground">{name}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا غيابات معروفة</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((a, i) => (
            <li key={`${a.name}-${i}`} className="flex items-center gap-1.5 text-xs">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <span className="font-semibold text-foreground truncate">{a.name}</span>
              {a.reason && <span className="text-muted-foreground shrink-0">· {a.reason}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4 rotate-45 text-rose-500" />
        <span className="text-sm font-black text-foreground">غيابات المباراة</span>
      </div>
      <div className="flex gap-4">
        {side(homeName, homeLogo, home)}
        <div className="w-px shrink-0 bg-border" />
        {side(awayName, awayLogo, away)}
      </div>
    </div>
  );
}

/** تلميح شريط الضغط — الطرف المسيطر بالدقيقة وقيمته (نمط تلميح المونديال). */
function SpPressureTooltip({ active, payload, homeName, awayName }: {
  active?: boolean;
  payload?: { payload: SpPressurePoint }[];
  homeName: string;
  awayName: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const homeSide = p.net >= 0;
  return (
    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md" dir="rtl">
      <p className="font-bold mb-0.5 tabular-nums" dir="ltr">{p.minute}'</p>
      <p className={homeSide ? "text-emerald-600" : "text-amber-600"}>
        {homeSide ? homeName : awayName}: <span className="font-bold tabular-nums">{Math.round(Math.abs(p.net))}</span>
      </p>
    </div>
  );
}

function SpPressureView({ data, homeName, awayName, live, loading }: { data?: SpPressure; homeName: string; awayName: string; live: boolean; loading?: boolean }) {
  const points = Array.isArray(data?.points) ? data!.points : [];
  if (loading && points.length === 0) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton className="h-5 w-40 mx-auto" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }
  if (points.length === 0) {
    return <div className="py-8 text-center text-muted-foreground text-sm">مؤشّر الضغط يظهر هنا أثناء المباراة</div>;
  }
  const latest = data?.latest ?? null;
  return (
    <div className="space-y-3">
      {live && latest && latest.side !== "even" && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Gauge className="w-4 h-4 text-primary" />
          <span className="text-muted-foreground">الأكثر سيطرة الآن:</span>
          <span className="font-bold text-foreground">{latest.side === "home" ? homeName : awayName}</span>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground text-center">مؤشّر الضغط لحظة بلحظة — أعلى: {homeName} · أسفل: {awayName}</p>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={0}>
            <XAxis dataKey="minute" tick={{ fontSize: 10 }} tickFormatter={(m) => `${m}'`} interval="preserveStartEnd" minTickGap={24} />
            <YAxis hide />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Tooltip content={<SpPressureTooltip homeName={homeName} awayName={awayName} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
            <Bar dataKey="net" radius={[1, 1, 0, 0]}>
              {points.map((p) => (<Cell key={p.minute} fill={p.net >= 0 ? "#059669" : "#f59e0b"} />))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** تلميح رسم الزخم — هجمات الفريقين بالدقيقة (نمط تلميح المونديال). */
function SpMomentumTooltip({ active, payload, homeName, awayName }: {
  active?: boolean;
  payload?: { payload: SpMomentumPoint }[];
  homeName: string;
  awayName: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-md" dir="rtl">
      <p className="font-bold mb-0.5 tabular-nums" dir="ltr">~{p.minute}'</p>
      <p className="text-emerald-600">
        {homeName}: <span className="font-bold tabular-nums">{Math.abs(p.home)}</span>
      </p>
      <p className="text-rose-600">
        {awayName}: <span className="font-bold tabular-nums">{Math.abs(p.away)}</span>
      </p>
    </div>
  );
}

// رسم الزخم الهجومي (الهجمات الخطيرة عبر الزمن) + شريط استحواذ — إثراء SportMonks.
function SpMomentumView({ data, homeName, awayName, loading }: { data?: SpMomentum; homeName: string; awayName: string; loading?: boolean }) {
  const points = Array.isArray(data?.points) ? data!.points : [];
  const possession = data?.possession ?? null;
  if (loading && points.length === 0 && !possession) {
    return (
      <div className="space-y-3 py-3">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }
  if (points.length === 0 && !possession) {
    return <div className="py-8 text-center text-muted-foreground text-sm">رسم الزخم يظهر هنا أثناء المباراة</div>;
  }
  const hPoss = possession ? Math.min(Math.max(possession.home, 0), 100) : 50;
  return (
    <div className="space-y-4">
      {possession && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-bold text-primary tabular-nums">{hPoss}%</span>
            <span className="text-muted-foreground font-medium">الاستحواذ</span>
            <span className="font-bold text-amber-500 tabular-nums">{100 - hPoss}%</span>
          </div>
          {/* بلا dir="ltr": نسبة المضيف معنونة يمينًا أعلاه — فرضُ LTR كان يعكس جهتي الشريط */}
          <div className="flex h-2 rounded-full overflow-hidden bg-muted">
            <div className="bg-primary transition-all duration-700" style={{ width: `${hPoss}%` }} />
            <div className="bg-amber-400 transition-all duration-700" style={{ width: `${100 - hPoss}%` }} />
          </div>
        </div>
      )}
      {points.length > 0 ? (
        <div>
          <p className="text-[11px] text-muted-foreground text-center mb-2">الزخم الهجومي — أعلى: {homeName} · أسفل: {awayName}</p>
          <div dir="ltr">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={1}>
                <XAxis dataKey="minute" tick={{ fontSize: 10 }} tickFormatter={(m) => `${m}'`} interval="preserveStartEnd" minTickGap={24} />
                <YAxis hide />
                <ReferenceLine y={0} stroke="hsl(var(--border))" />
                <Tooltip content={<SpMomentumTooltip homeName={homeName} awayName={awayName} />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="net" radius={[2, 2, 0, 0]}>
                  {points.map((p) => (<Cell key={p.minute} fill={p.net >= 0 ? "#059669" : "#e11d48"} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground py-2">رسم الزخم الهجومي يظهر فور توفّره أثناء المباراة</p>
      )}
    </div>
  );
}

// التعليق الحيّ — أبرز اللحظات معرَّبة، مع إبراز الأهداف واللحظات المهمّة.
function SpCommentaryView({ data, live }: { data?: SpCommentary; live: boolean }) {
  const items = Array.isArray(data?.items) ? data!.items : [];
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        {live ? "التعليق اللحظي يبدأ مع صافرة البداية" : "لا يتوفّر تعليق لهذه المباراة"}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const highlight = item.goal || item.important;
        return (
          <div key={index}
            className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${highlight ? "bg-emerald-500/10 ring-1 ring-emerald-500/20" : "bg-muted/40"}`}>
            <span className="shrink-0 min-w-[2.75rem] text-center text-xs font-bold text-muted-foreground tabular-nums" dir="ltr">
              {item.minute > 0 ? `${item.minute}'` : "—"}{item.minute > 0 && item.extraMinute ? `+${item.extraMinute}` : ""}
            </span>
            {item.goal ? <Goal className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <Activity className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
            <p className="text-sm leading-relaxed flex-1 min-w-0 text-foreground">{item.textAr}</p>
          </div>
        );
      })}
    </div>
  );
}

/** سِمة مركز المباراة — "roshn" تلبس رأس النافذة أرضية الملعب الليلي بهوية الدوري. */
export type MatchCenterTheme = "default" | "roshn";

export function MatchCenter({ id, scrollable = false, theme = "default" }: {
  id: number | null;
  scrollable?: boolean;
  theme?: MatchCenterTheme;
}) {
  const roshn = theme === "roshn";
  const { data, isLoading } = useQuery<SpMatchDetail>({
    queryKey: [`/api/sports/match/${id}`], enabled: id != null,
    // الفتح يجلب دائمًا (staleTime العام 5 دقائق كان يعيد لقطة «قادمة» قديمة).
    refetchOnMount: "always",
    // حية → 8ث (وتيرة المونديال). حول الانطلاق (≤30د قبله وحتى ساعتين بعده إن
    // ظلّت «لم تبدأ») → 25ث لالتقاط قادمة→مباشر.
    refetchInterval: (q) => {
      const f = q.state.data?.fixture;
      if (!f) return false;
      if (f.status?.live) return 8_000;
      if (f.status?.finished) return false;
      const msToKickoff = (f.timestamp ?? 0) * 1000 - Date.now();
      return msToKickoff <= 30 * 60_000 && msToKickoff > -2 * 3_600_000 ? 25_000 : false;
    },
  });
  const [tab, setTab] = useState("events");
  // البند 12: توقّعات تُجلب بكسل للمباريات غير المبدوءة فقط.
  const fixtureStatus = data?.fixture?.status;
  const isUpcoming = !!fixtureStatus && !fixtureStatus.finished && !fixtureStatus.live;
  const msToKickoff = data?.fixture?.timestamp != null
    ? data.fixture.timestamp * 1000 - Date.now()
    : Number.POSITIVE_INFINITY;
  // للمباراة القادمة التبويب الافتراضي هو «الغيابات»، وقرب الصافرة «التشكيلات»
  // حتى لا يُفتح المركز على الغيابات بينما التشكيلة هي ما يهم المشاهد.
  useEffect(() => {
    setTab(defaultMatchCenterTab(isUpcoming, msToKickoff));
  }, [id, isUpcoming, msToKickoff <= 15 * 60_000]);
  const { data: prediction } = useQuery<SpPrediction>({
    queryKey: [`/api/sports/match/${id}/prediction`],
    enabled: id != null && isUpcoming,
    staleTime: 5 * 60_000,
  });
  // ترويج مسابقة Prediction Core في مركز مباراة روشن — قبل الانطلاق فقط.
  const { data: rslHero } = useQuery<RslHero>({
    queryKey: ["/api/rsl/hero"],
    enabled: roshn && isUpcoming,
    staleTime: 60_000,
  });
  const showRslPredictionsPromo =
    roshn && isUpcoming && id != null && rslHero?.predictionsEnabled === true;
  const homeId = data?.fixture?.home?.id;
  const awayId = data?.fixture?.away?.id;
  const { data: h2hData } = useQuery<SpH2H>({
    queryKey: [`/api/sports/h2h`, { home: homeId, away: awayId }],
    enabled: id != null && !!homeId && !!awayId,
    staleTime: 30 * 60_000,
  });
  const h2hMeetings = Array.isArray(h2hData?.meetings) ? h2hData!.meetings : [];

  // إثراءات SportMonks (سعودي/آسيا...) — تُجلب بكسل حسب التبويب، أفضل جهد.
  const live = !!data?.fixture?.status?.live;
  const matchStarted = !!data?.fixture && (data.fixture.status.finished || live);
  const { data: facts } = useQuery<SpFacts>({
    queryKey: [`/api/sports/match/${id}/facts`],
    // للمباريات الجارية/المنتهية: أحداث/إحصاءات. وللقادمة: المغيبون في تبويب «الغيابات».
    enabled: id != null && ((matchStarted && (tab === "events" || tab === "stats")) || (isUpcoming && tab === "absences")),
    refetchInterval: live ? 12_000 : false,
    staleTime: 20_000,
  });
  const { data: xg } = useQuery<SpXg>({
    queryKey: [`/api/sports/match/${id}/xg`],
    enabled: id != null && matchStarted && tab === "stats",
    refetchInterval: live ? 20_000 : false,
    staleTime: 30_000,
  });
  // الضغط والزخم بوتيرة المونديال (12ث) — كانا 20/30ث فيتأخر النبض المرئي.
  const { data: pressure, isLoading: pressureLoading } = useQuery<SpPressure>({
    queryKey: [`/api/sports/match/${id}/pressure`],
    enabled: id != null && matchStarted && tab === "pressure",
    refetchInterval: live ? 12_000 : false,
    staleTime: 10_000,
  });
  const { data: momentum, isLoading: momentumLoading } = useQuery<SpMomentum>({
    queryKey: [`/api/sports/match/${id}/momentum`],
    enabled: id != null && matchStarted && tab === "momentum",
    refetchInterval: live ? 12_000 : false,
    staleTime: 10_000,
  });
  const { data: commentary } = useQuery<SpCommentary>({
    queryKey: [`/api/sports/match/${id}/commentary`],
    enabled: id != null && matchStarted && tab === "commentary",
    refetchInterval: live ? 20_000 : false,
    staleTime: 15_000,
  });
  // قنوات البثّ («أين تُشاهد») — للمباريات غير المنتهية فقط (قادمة/جارية).
  const fixtureFinished = !!data?.fixture?.status?.finished;
  // إحصاء TheSports المفصّل — احتياط يملأ الفجوة حين تغيب إحصاءات API-Football
  // (المباريات المنتهية فقط؛ الجارية تأخذ إحصاء TheSports اللحظي عبر التراكب).
  const hasApiStatsEarly = !!data?.statistics && data.statistics.rows.length > 0;
  const { data: tsStats } = useQuery<{ available: boolean; rows: SpStatRow[] }>({
    queryKey: [`/api/sports/match/${id}/stats`],
    enabled: id != null && fixtureFinished && !hasApiStatsEarly,
    staleTime: 10 * 60_000,
  });
  const { data: tvData } = useQuery<{ available: boolean; channels: { name: string; url: string | null }[] }>({
    queryKey: [`/api/sports/match/${id}/tv`],
    enabled: id != null && !!data?.fixture && !fixtureFinished,
    staleTime: 30 * 60_000,
  });
  // حكم المباراة + صرامته بالأرقام (SportMonks) — يظهر فور إعلان الحكم.
  const { data: refereeData } = useQuery<SpMatchReferee>({
    queryKey: [`/api/sports/match/${id}/referee`],
    enabled: id != null && !!data?.fixture,
    staleTime: 5 * 60_000,
  });
  // التوقّعات الاحتمالية المتقدّمة (SportMonks) — قبل المباراة (قادمة/جارية).
  // أثناء اللعب تتحدّث الاحتمالات مع المجريات (الخادم يقصّر الكاش بالتوازي).
  const { data: forecast } = useQuery<SpForecast>({
    queryKey: [`/api/sports/match/${id}/forecast`],
    enabled: id != null && !!data?.fixture && !fixtureFinished,
    staleTime: 15 * 60_000,
    refetchInterval: data?.fixture?.status.live ? 30_000 : false,
  });
  // التشكيلة المتوقعة (SportMonks) — تُجلب فقط قبل صدور الرسمية ولغير المنتهية.
  // «الرسمية» تُعد صادرة فقط إذا فيها أساسيون — المزوّد قد يرسل قوائم بدلاء
  // جزئية قبل المباراة فلا تحجب المتوقعة الكاملة.
  const officialXiReady = (data?.lineups ?? []).some((l) => l.startXI.length > 0);
  const { data: expectedData } = useQuery<SpExpectedLineups>({
    queryKey: [`/api/sports/match/${id}/expected-lineup`],
    enabled: id != null && !!data?.fixture && !fixtureFinished && !officialXiReady,
    staleTime: 15_000,
    refetchInterval: () => {
      if (officialXiReady) return false;
      const ms = (data?.fixture?.timestamp ?? 0) * 1000 - Date.now();
      return ms <= 75 * 60_000 && ms > -2 * 3_600_000 ? 25_000 : false;
    },
  });

  if (id == null) return null;
  const fx = data?.fixture, stats = data?.statistics;
  const events = Array.isArray(data?.events) ? data!.events : [];
  const lineups = Array.isArray(data?.lineups) ? data!.lineups : [];
  const started = !!fx && (fx.status.finished || fx.status.live);
  // تحويل التشكيلة المتوقعة لشكل SpLineup لتُعرض بنفس مكوّنات الملعب.
  // معرّف اللاعب 0 = بلا رابط لصفحة اللاعب (لا معرّف API-Football في المتوقعة).
  const expSide = (side: SpExpectedSide, team: SpLineup["team"]): SpLineup => ({
    team,
    formation: side.formation,
    coach: null,
    startXI: side.starters.map((p) => ({ id: 0, number: p.jersey, name: p.name, pos: "", grid: p.grid ?? "2:1" })),
    substitutes: side.bench.map((p) => ({ id: 0, number: p.jersey, name: p.name, pos: "", grid: null })),
  });
  const expectedLineups: SpLineup[] =
    !officialXiReady && !fixtureFinished && expectedData?.available && fx
      ? ([
          expectedData.home && expSide(expectedData.home, { id: fx.home.id, name: fx.home.name, logo: fx.home.logo }),
          expectedData.away && expSide(expectedData.away, { id: fx.away.id, name: fx.away.name, logo: fx.away.logo }),
        ].filter(Boolean) as SpLineup[])
      : [];
  const awaitingLineups = isAwaitingLineups({
    finished: !!fx?.status.finished,
    officialXiReady,
    hasExpected: expectedLineups.length > 0,
    msToKickoff: fx?.timestamp != null ? fx.timestamp * 1000 - Date.now() : Number.POSITIVE_INFINITY,
  });
  // إحصاءات بديلة من SportMonks (facts.statistics) حين تغيب إحصاءات API-Football،
  // فيظهر تبويب «نبض الأرقام» لمباريات أكثر بدل أن يُهدَر مصدر جاهز.
  const factStatRows: SpStatRow[] = (facts?.statistics ?? []).map((s) => ({ type: s.key, label: s.label, home: s.home, away: s.away }));
  const tsStatRows: SpStatRow[] = tsStats?.available && Array.isArray(tsStats.rows) ? tsStats.rows : [];
  const hasApiStats = !!stats && stats.rows.length > 0;
  const hasStatsTab = hasApiStats || factStatRows.length > 0 || tsStatRows.length > 0;
  // التبويبات الجوهرية (الأحداث/الإحصائيات/التشكيلات) ثابتة بعد انطلاق المباراة
  // بحالات فارغة — نمط المونديال. إخفاؤها عند تأخّر البيانات كان يوحي أن المركز
  // «أفقر» من مركز المونديال بينما الفجوة مجرد بوابات عرض.
  const tabs = [
    isUpcoming ? { key: "absences", label: "الغيابات" } : null,
    forecast?.available ? { key: "forecast", label: "توقّعات" } : null,
    started || events.length > 0 ? { key: "events", label: "الأحداث" } : null,
    started ? { key: "commentary", label: "التعليق" } : null,
    started || hasStatsTab ? { key: "stats", label: "الإحصائيات" } : null,
    started ? { key: "pressure", label: "الضغط" } : null,
    started ? { key: "momentum", label: "الزخم" } : null,
    started || lineups.length > 0 || expectedLineups.length > 0 || awaitingLineups ? { key: "lineups", label: "التشكيلات" } : null,
    started ? { key: "ratings", label: "التقييمات" } : null,
    h2hMeetings.length > 0 ? { key: "h2h", label: "المواجهات" } : null,
  ].filter(Boolean) as { key: string; label: string }[];
  const activeKey = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  return (
    <div className={`flex flex-col ${scrollable ? "h-full overflow-hidden" : ""}`} dir="rtl">
        {/* رأس النافذة — بسِمة روشن: أرضية الملعب الليلي (نفس هيرو /roshn) بخط سماوي مميز.
            في وضع النافذة (scrollable) نوسّع الحشوة العلوية حتى لا تتداخل أزرار
            «صفحة المباراة / إغلاق» مع شعارات الأندية على الجوال. */}
        <div className={`shrink-0 relative border-b p-4 ${
          scrollable ? "pt-14" : "pt-5"
        } ${
          roshn
            ? "bg-gradient-to-bl from-emerald-950 via-[#04261b] to-[#063828] border-white/10"
            : "bg-accent-blue/20 border-border"
        }`}>
          {roshn && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-sky-400 via-sky-300 to-emerald-400" />}
          {isLoading || !fx ? <Skeleton className={`h-16 rounded-lg ${roshn ? "bg-white/10" : ""}`} /> : (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-12 w-12 rounded-full bg-white p-1 ${roshn ? "ring-2 ring-white/20 shadow-lg" : "ring-1 ring-border"}`}>
                    {fx.home.logo && <img src={fx.home.logo} alt="" className="h-full w-full object-contain" />}
                  </div>
                  <span className={`text-sm font-extrabold text-center ${roshn ? "text-white" : "text-foreground"}`}>{fx.home.name}</span>
                </div>
                <div className="flex flex-col items-center gap-1 pt-1">
                  {fx.status.finished || fx.status.live ? (
                    <span className={`text-3xl font-black tabular-nums ${roshn ? "text-white" : "text-foreground"}`} dir="ltr">
                      {fx.goals.away ?? 0} - {fx.goals.home ?? 0}
                    </span>
                  ) : (
                    <span className={`text-xl font-black ${roshn ? "text-sky-200" : "text-foreground"}`}>{fmtTime(fx.timestamp)}</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border-0 px-2.5 py-0.5 text-xs font-semibold ${
                      fx.status.live
                        ? "bg-red-500 text-white"
                        : roshn
                          ? "bg-white/10 text-emerald-100"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {fx.status.live && <Radio className="h-3 w-3 animate-pulse" />}
                    {fx.status.live
                      ? `${fx.status.elapsed ?? ""}${fx.status.extra ? `+${fx.status.extra}` : ""}'`
                      : fx.status.label}
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`h-12 w-12 rounded-full bg-white p-1 ${roshn ? "ring-2 ring-white/20 shadow-lg" : "ring-1 ring-border"}`}>
                    {fx.away.logo && <img src={fx.away.logo} alt="" className="h-full w-full object-contain" />}
                  </div>
                  <span className={`text-sm font-extrabold text-center ${roshn ? "text-white" : "text-foreground"}`}>{fx.away.name}</span>
                </div>
              </div>
              {/* تاريخ ووقت المباراة — يظهران دائمًا (قادمة/جارية/منتهية) */}
              <p className={`mt-2 flex items-center justify-center gap-1 text-[11px] font-bold ${roshn ? "text-emerald-100/70" : "text-muted-foreground"}`}>
                <CalendarDays className="h-3 w-3" />
                {fmtFullDay(fx.timestamp)} · {fmtTime(fx.timestamp)}
              </p>
              {(fx.round || fx.venue.name) && (
                <p className={`mt-1 flex items-center justify-center gap-1 text-[11px] ${roshn ? "text-emerald-100/60" : "text-muted-foreground"}`}>
                  <MapPin className="h-3 w-3" />
                  {[fx.round, fx.venue.name].filter(Boolean).join(" · ")}
                </p>
              )}
            </>
          )}
        </div>
        {tvData?.available && tvData.channels.length > 0 && (
          <div className="shrink-0 border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground mb-2">
              <Tv className="w-3.5 h-3.5" />
              <span>أين تُشاهد المباراة</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tvData.channels.map((c, i) => (
                <span key={`${c.name}-${i}`} className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-semibold text-foreground">
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {refereeData?.available && (
          <div className="shrink-0 border-b border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              {refereeData.photo && (
                <img src={refereeData.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-muted" loading="lazy" />
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-bold text-muted-foreground">حكم المباراة</div>
                <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {refereeData.name}
                  {refereeData.countryFlag && (
                    <img src={refereeData.countryFlag} alt={refereeData.countryName ?? ""} className="h-3 w-4 object-cover rounded-[2px]" loading="lazy" />
                  )}
                </div>
              </div>
              {refereeData.stats && (
                <span className="ms-auto text-[10px] text-muted-foreground shrink-0">
                  {refereeData.stats.matches} {refereeData.stats.matches === 1 ? "مباراة" : "مباريات"} بالبطولة
                </span>
              )}
            </div>
            {refereeData.stats && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {refereeData.stats.yellowAvg != null && (
                  <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums">🟨 {refereeData.stats.yellowAvg.toFixed(1)}/مباراة</span>
                )}
                <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums">🟥 {refereeData.stats.redCount}</span>
                {refereeData.stats.penaltiesAvg != null && (
                  <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums">⚽ جزاء {refereeData.stats.penaltiesAvg.toFixed(2)}/مباراة</span>
                )}
                {refereeData.stats.varMoments != null && (
                  <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums">فار ×{refereeData.stats.varMoments}</span>
                )}
              </div>
            )}
          </div>
        )}
        {showRslPredictionsPromo && fx && (
          <RslPredictionsMatchPromo
            fixtureId={fx.id}
            homeName={fx.home.name}
            awayName={fx.away.name}
          />
        )}
        {prediction && fx && <PredictionBar prediction={prediction} homeName={fx.home.name} awayName={fx.away.name} />}
        {tabs.length > 0 && (
          <div className="shrink-0 flex flex-wrap justify-center gap-1 border-b border-border bg-card px-2 py-2">
            {tabs.map((t) => {
              const active = activeKey === t.key;
              const Icon =
                t.key === "momentum" ? Activity :
                t.key === "pressure" ? Gauge :
                t.key === "ratings" ? Star :
                t.key === "commentary" && live ? Radio :
                null;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  {Icon && <Icon className={`h-3.5 w-3.5 ${t.key === "ratings" ? "text-amber-500" : ""} ${t.key === "commentary" ? "animate-pulse" : ""}`} />}
                  {t.label}
                </button>
              );
            })}
          </div>
        )}
        <div className={`${scrollable ? "flex-1 min-h-0 overflow-y-auto overscroll-contain " : ""}p-4 lg:p-6`}>
          {isLoading && <div className="py-10 text-center text-muted-foreground text-sm">جارٍ تحميل التفاصيل…</div>}
          {!isLoading && activeKey === "events" && (() => {
            // ترتيب تنازلي (الأحدث أعلى)، ومطابقة تفصيل SportMonks (طريقة الهدف/سبب البطاقة/VAR).
            const sorted = [...events].sort(
              (a, b) => (b.minute ?? 0) - (a.minute ?? 0) || (b.extra ?? 0) - (a.extra ?? 0),
            );
            const detailFor = (e: SpMatchEvent): string | null => {
              const klass = e.type === "goal" ? "goal" : /card/i.test(e.type) ? "card" : /var/i.test(e.type) ? "var" : null;
              if (!klass || !facts?.eventDetails || e.minute == null) return null;
              const loc = e.teamId === fx?.home.id ? "home" : "away";
              return (
                facts.eventDetails.find(
                  (d) => d.klass === klass && d.location === loc && Math.abs(d.minute - (e.minute as number)) <= 1,
                )?.detail ?? null
              );
            };
            return (
              <div className="lg:max-w-2xl lg:mx-auto">
                {facts?.halftime && (
                  <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground pb-2">
                    <span>نتيجة الشوط الأول</span>
                    <span className="font-black tabular-nums text-foreground" dir="ltr">
                      {facts.halftime.away} - {facts.halftime.home}
                    </span>
                  </div>
                )}
                {events.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {fx && (fx.status.finished || fx.status.live)
                      ? "لا توجد أحداث مسجلة لهذه المباراة"
                      : "الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة"}
                  </p>
                ) : (
                  <>
                    {/* رأس الجانبين: المضيف يمينًا، الضيف يسارًا */}
                    <div dir="ltr" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2 px-1">
                      <div className="flex items-center gap-1.5 justify-end min-w-0">
                        <span className="text-xs font-bold truncate">{fx?.away.name}</span>
                        {fx?.away.logo && <img src={fx.away.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />}
                      </div>
                      <span className="min-w-[2.75rem]" />
                      <div className="flex items-center gap-1.5 justify-start min-w-0">
                        {fx?.home.logo && <img src={fx.home.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />}
                        <span className="text-xs font-bold truncate">{fx?.home.name}</span>
                      </div>
                    </div>
                    {/* الخط الزمني: عمود مركزي لأقراص الدقائق (نمط المونديال) */}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-emerald-500/20" />
                      <div className="space-y-1.5">
                        {sorted.map((e, i) => {
                          const isHome = e.teamId === fx?.home.id;
                          const extra = detailFor(e);
                          return (
                            <div key={i} dir="ltr" className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                              <div className="flex justify-end min-w-0">
                                {!isHome && <SpTimelineChip ev={e} extra={extra} side="away" />}
                              </div>
                              <span className="z-[1] grid place-items-center min-w-[2.75rem] rounded-full bg-emerald-600 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white">
                                {e.minute ?? 0}&apos;{e.extra ? `+${e.extra}` : ""}
                              </span>
                              <div className="flex justify-start min-w-0">
                                {isHome && <SpTimelineChip ev={e} extra={extra} side="home" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })()}
          {!isLoading && activeKey === "absences" && (
            <div className="space-y-4">
              {facts?.absentees && facts.absentees.length > 0 ? (
                <AbsenteesCard
                  absentees={facts.absentees}
                  homeName={fx?.home.name ?? ""}
                  awayName={fx?.away.name ?? ""}
                  homeLogo={fx?.home.logo}
                  awayLogo={fx?.away.logo}
                />
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">لا غيابات معلنة للفريقين حتى الآن.</div>
              )}
            </div>
          )}
          {!isLoading && activeKey === "forecast" && forecast?.available && (
            <ForecastView data={forecast} homeName={fx?.home.name ?? ""} awayName={fx?.away.name ?? ""} />
          )}
          {!isLoading && activeKey === "stats" && !hasStatsTab && (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {live ? "أرقام المباراة تتجمّع الآن — تظهر تباعًا خلال الشوط الأول" : "لا تتوفّر إحصاءات لهذه المباراة بعد"}
            </div>
          )}
          {!isLoading && activeKey === "stats" && hasStatsTab && (() => {
            // مصدر الأرقام: API-Football إن توفّر، ثم SportMonks، ثم TheSports المفصّل (يملأ الفجوة).
            const statRows = hasApiStats ? stats!.rows : factStatRows.length > 0 ? factStatRows : tsStatRows;
            const homeName = stats?.home.name ?? fx?.home.name ?? "";
            const awayName = stats?.away.name ?? fx?.away.name ?? "";
            // استخراج الاستحواذ لعرضه كشريط بارز بالأعلى، وبقية الإحصاءات تحته.
            const possession = statRows.find((r) => r.type === "Ball Possession");
            const otherRows = statRows.filter((r) => r.type !== "Ball Possession");
            // جائزة «رجل المباراة»: صاحب أعلى xG (إن توفّر) — لمسة إبداعية تبرز الأداء.
            const xgRow = statRows.find((r) => /expected.*goals|xg/i.test(r.type));
            const xgHome = xgRow ? parseFloat(String(xgRow.home).replace(/[^0-9.]/g, "")) : NaN;
            const xgAway = xgRow ? parseFloat(String(xgRow.away).replace(/[^0-9.]/g, "")) : NaN;
            const motm = Number.isFinite(xgHome) && Number.isFinite(xgAway)
              ? (xgHome > xgAway ? "home" : xgAway > xgHome ? "away" : null)
              : null;
            return (
              <>
                {xg?.available && <SpXgCard xg={xg} homeLogo={fx?.home.logo} awayLogo={fx?.away.logo} />}
                {facts?.weather && <SpWeatherChip w={facts.weather} />}
                {possession && <PossessionBar row={possession} />}
                {motm && !xg?.available && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl bg-gradient-to-l from-amber-500/15 to-transparent ring-1 ring-amber-500/30 px-3 py-2">
                    <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-foreground">
                      رجل المباراة (حسب الأهداف المتوقّعة): {motm === "home" ? homeName : awayName}
                    </span>
                  </div>
                )}
                {otherRows.map((r) => <StatBar key={r.type} row={r} />)}
              </>
            );
          })()}
          {!isLoading && activeKey === "pressure" && (
            <SpPressureView data={pressure} homeName={fx?.home.name ?? ""} awayName={fx?.away.name ?? ""} live={live} loading={pressureLoading} />
          )}
          {!isLoading && activeKey === "momentum" && (
            <SpMomentumView data={momentum} homeName={fx?.home.name ?? ""} awayName={fx?.away.name ?? ""} loading={momentumLoading} />
          )}
          {!isLoading && activeKey === "commentary" && (
            <SpCommentaryView data={commentary} live={live} />
          )}
          {!isLoading && activeKey === "lineups" && (
            <div className="space-y-3">
              {expectedLineups.length > 0 && (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2">
                  <span className="shrink-0 rounded-full bg-amber-500 text-white text-[10px] font-black px-2 py-0.5">تشكيلة متوقعة</span>
                  <p className="text-[11px] text-muted-foreground">ترشيح المزوّد قبل الإعلان الرسمي — قد تتغيّر</p>
                </div>
              )}
              {expectedLineups.length === 0 && lineups.length === 0 && (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  لم تُعلَن التشكيلة بعد
                </div>
              )}
              <div className="space-y-5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start">
                {(expectedLineups.length > 0 ? expectedLineups : lineups).map((l) => (
                  <LineupTeam key={l.team.id} lineup={l} />
                ))}
              </div>
            </div>
          )}
          {!isLoading && activeKey === "ratings" && id != null && <RatingsList id={id} homeId={fx?.home.id ?? null} live={live} />}
          {!isLoading && activeKey === "h2h" && fx && h2hData && (
            <H2HView h2h={h2hData} homeId={fx.home.id} homeName={fx.home.name} awayName={fx.away.name} />
          )}
          {!isLoading && tabs.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">لا توجد تفاصيل متاحة لهذه المباراة بعد</div>}
        </div>
    </div>
  );
}

// نافذة المباراة (modal) — غلاف رفيع حول MatchCenter: تعتيم + قفل تمرير الخلفية +
// زر إغلاق. نفس المحتوى الغني يُعاد استخدامه في صفحة /sports/match/:id المستقلّة.
export function MatchDialog({ id, onClose, theme = "default" }: {
  id: number | null;
  onClose: () => void;
  theme?: MatchCenterTheme;
}) {
  // قفل تمرير صفحة الخلفية أثناء فتح النافذة (يمنع تحرّك الصفحة الخلفية على الجوال
  // بدل محتوى النافذة). نثبّت الجسم ونعيد موضع التمرير عند الإغلاق.
  useEffect(() => {
    if (id == null) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [id]);

  if (id == null) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        dir="rtl" onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card sm:max-h-[88vh] sm:max-w-lg sm:rounded-2xl lg:max-h-[85vh] lg:max-w-3xl"
      >
        <button onClick={onClose} aria-label="إغلاق" className="absolute left-2 top-2 z-20 inline-flex items-center justify-center w-9 h-9 rounded-full bg-card/80 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"><X className="w-5 h-5" /></button>
        <Link href={`/sports/match/${id}`} onClick={onClose} aria-label="فتح صفحة المباراة" className="absolute right-2 top-2 z-20 inline-flex h-9 items-center gap-1 rounded-full bg-card/80 px-3 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"><Maximize2 className="w-4 h-4" /> صفحة المباراة</Link>
        <MatchCenter id={id} scrollable theme={theme} />
      </motion.div>
    </div>
  );
}

// لون شارة التقييم حسب القيمة (نمط المزوّدين العالميين).
function ratingTone(r: number): string {
  if (r >= 7.5) return "bg-emerald-500 text-white";
  if (r >= 7) return "bg-green-500/90 text-white";
  if (r >= 6) return "bg-amber-500 text-white";
  return "bg-red-500/90 text-white";
}

// احتياط تقييمات TheSports (أسماء بلا صور/معرّفات) — نفس احتياط المونديال معمّمًا.
interface SpTsPlayerLine {
  name: string; rating: number | null; starter: boolean;
  minutes: number; goals: number; assists: number; yellow: number; red: number;
}
interface SpTsPlayerStats {
  available: boolean;
  home: { team: { id: number; name: string; logo: string }; players: SpTsPlayerLine[] } | null;
  away: { team: { id: number; name: string; logo: string }; players: SpTsPlayerLine[] } | null;
}

function SpTsRatingRow({ player, teamLogo }: { player: SpTsPlayerLine; teamLogo: string }) {
  const meta = [
    player.minutes ? `${player.minutes} د` : null,
    player.goals ? `${player.goals} ⚽` : null,
    player.assists ? `${player.assists} صناعة` : null,
    player.yellow ? `${player.yellow} 🟨` : null,
    player.red ? `${player.red} 🟥` : null,
    player.starter ? null : "بديل",
  ].filter(Boolean);
  return (
    <div className="w-full flex items-center gap-2.5 rounded-lg bg-muted/40 px-3 py-2 text-right">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold truncate">{player.name}</p>
        {meta.length > 0 && <p className="text-[10px] text-muted-foreground">{meta.join(" · ")}</p>}
      </div>
      <img src={teamLogo} alt="" className="h-4 w-4 object-contain shrink-0" loading="lazy" />
      {player.rating != null ? (
        <span className={`rounded-md px-1.5 py-0.5 text-xs font-black tabular-nums shrink-0 ${ratingTone(player.rating)}`} dir="ltr">
          {player.rating.toFixed(1)}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground shrink-0">—</span>
      )}
    </div>
  );
}

function SpTsRatingsFallback({ id, live }: { id: number; live: boolean }) {
  const { data, isLoading } = useQuery<SpTsPlayerStats>({
    queryKey: [`/api/sports/match/${id}/player-stats`],
    refetchInterval: live ? 60_000 : false,
    staleTime: 60_000,
  });
  if (isLoading) {
    return <Skeleton className="h-[360px] rounded-xl" />;
  }
  if (!data?.available || (!data.home && !data.away)) {
    return <div className="py-8 text-center text-muted-foreground text-sm">لا تتوفّر تقييمات لهذه المباراة</div>;
  }
  const sides = [data.home, data.away].filter(
    (s): s is NonNullable<SpTsPlayerStats["home"]> => !!s && s.players.length > 0,
  );
  return (
    <div className="space-y-4 py-1">
      {sides.map((side) => (
        <div key={side.team.id}>
          <div className="flex items-center gap-2 mb-2">
            <img src={side.team.logo} alt={side.team.name} className="h-5 w-5 object-contain" loading="lazy" />
            <h4 className="text-sm font-bold">{side.team.name}</h4>
          </div>
          <div className="space-y-1.5">
            {side.players.map((p, i) => (
              <SpTsRatingRow key={`${side.team.id}-${p.name}-${i}`} player={p} teamLogo={side.team.logo} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// تبويب «التقييمات» — يُحمّل بكسل (lazy) عند فتحه فقط (المكوّن لا يُركّب إلا حينها).
function RatingsList({ id, homeId, live }: { id: number; homeId: number | null; live: boolean }) {
  const { data, isLoading, isError } = useQuery<SpMatchRatings>({
    queryKey: [`/api/sports/match/${id}/players`],
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }
  if (isError || !data || data.players.length === 0) {
    // تقييمات API-Football غائبة (شائع بالدوريات المحلية) → احتياط TheSports.
    return <SpTsRatingsFallback id={id} live={live} />;
  }

  const { motm, players } = data;

  return (
    <div className="space-y-4">
      {motm && (
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-amber-500/15 to-transparent ring-1 ring-amber-500/30 px-3 py-2.5">
          <Crown className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">رجل المباراة</div>
            <Link href={`/sports/player/${motm.id}`}>
              <span className="text-sm font-black text-foreground hover:text-primary transition-colors">{motm.name}</span>
            </Link>
            <span className="text-xs text-muted-foreground"> · {motm.team}</span>
          </div>
          <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-black tabular-nums ${ratingTone(motm.rating)}`} dir="ltr">
            {motm.rating.toFixed(1)}
          </span>
        </div>
      )}

      <ul className="space-y-1.5 lg:grid lg:grid-cols-2 lg:gap-x-3 lg:gap-y-1.5 lg:space-y-0">
        {players.map((p) => {
          const sideClass = homeId != null ? (p.teamId === homeId ? "border-r-primary" : "border-r-amber-500") : "border-r-transparent";
          return (
            <li key={`${p.id}-${p.teamId}`} className={`flex items-center gap-3 rounded-xl border border-border border-r-[3px] ${sideClass} px-3 py-2`}>
              {p.photo
                ? <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                : <span className="w-8 h-8 rounded-full bg-muted shrink-0" />}
              <div className="min-w-0 flex-1">
                <Link href={`/sports/player/${p.id}`}>
                  <span className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate">{p.name}</span>
                </Link>
                {p.captain && <span className="ms-1.5 text-[9px] font-bold text-amber-600 dark:text-amber-400 align-middle">(ق)</span>}
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{p.team}</span>
                  {p.pos && <span>· {p.pos}</span>}
                  {p.minutes > 0 && <span className="tabular-nums">· {p.minutes}′</span>}
                  {p.goals > 0 && <span>· ⚽ {p.goals}</span>}
                  {p.assists > 0 && <span>· 🅰 {p.assists}</span>}
                  {p.yellow > 0 && <span>· 🟨</span>}
                  {p.red > 0 && <span>· 🟥</span>}
                </div>
              </div>
              {p.rating != null
                ? <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-black tabular-nums ${ratingTone(p.rating)}`} dir="ltr">{p.rating.toFixed(1)}</span>
                : <span className="shrink-0 text-xs text-muted-foreground">—</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ============================================================
// معرض الصور (lightbox)
// ============================================================
export function ImageGallery({ articles }: { articles: ArticleWithDetails[] }) {
  const [active, setActive] = useState<number | null>(null);
  const items = articles.filter((a) => a.imageUrl || a.thumbnailUrl).slice(0, 9);
  if (items.length === 0) return null;
  const open = active != null ? items[active] : null;
  const go = (dir: number) => setActive((cur) => (cur == null ? cur : (cur + dir + items.length) % items.length));
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 auto-rows-[140px] sm:auto-rows-[160px] grid-flow-dense">
        {items.map((a, i) => {
          const img = imgOf(a)!;
          const span = i === 0 ? "col-span-2 row-span-2" : i % 5 === 3 ? "col-span-2" : "col-span-1";
          return (
            <button key={a.id} onClick={() => setActive(i)} className={`group relative overflow-hidden rounded-2xl border border-border ${span}`}>
              <OptimizedImage src={img} alt={a.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" wrapperClassName="w-full h-full" objectPosition={getObjectPosition(a)} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-x-0 bottom-0 p-3 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
                <p className="text-white text-xs font-bold line-clamp-2 text-right">{a.title}</p>
              </div>
              <span className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/40 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Images className="w-3.5 h-3.5 text-white" /></span>
            </button>
          );
        })}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4" onClick={() => setActive(null)}>
            <button className="absolute top-4 left-4 text-white/80 hover:text-white" onClick={() => setActive(null)}><X className="w-7 h-7" /></button>
            <button className="absolute right-3 sm:right-6 text-white/70 hover:text-white p-2" onClick={(e) => { e.stopPropagation(); go(1); }}><ChevronRight className="w-8 h-8" /></button>
            <button className="absolute left-3 sm:left-6 text-white/70 hover:text-white p-2" onClick={(e) => { e.stopPropagation(); go(-1); }}><ChevronLeft className="w-8 h-8" /></button>
            <motion.figure key={open.id} initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
              <img src={imgOf(open)!} alt={open.title} className="w-full max-h-[78vh] object-contain rounded-lg" />
              <figcaption className="mt-3 text-center">
                <Link href={`/article/${open.englishSlug || open.slug}`}><span className="text-white font-bold hover:text-primary transition-colors">{open.title}</span></Link>
              </figcaption>
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================
// بطاقة فيديو (reel)
// ============================================================
export function VideoReel({ short, index }: { short: SpShort; index: number }) {
  const dur = fmtDuration(short.duration);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: Math.min(index * 0.05, 0.24) }}>
      <Link href="/shorts">
        <article className="group relative overflow-hidden rounded-2xl border border-border aspect-[9/13] bg-muted">
          {short.coverImage && <img src={short.coverImage} alt={short.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/80 transition-all">
              <PlayCircle className="w-8 h-8 text-white" />
            </span>
          </div>
          {dur && <span className="absolute top-2 left-2 text-[11px] font-bold text-white bg-black/60 rounded px-1.5 py-0.5 tabular-nums">{dur}</span>}
          <div className="absolute inset-x-0 bottom-0 p-3"><p className="text-white text-xs font-bold line-clamp-2 text-right">{short.title}</p></div>
        </article>
      </Link>
    </motion.div>
  );
}

