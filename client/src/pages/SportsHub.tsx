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
import { useQuery } from "@tanstack/react-query";
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
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Crown,
  Hand,
  Square,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails, Category } from "@shared/schema";

// ============================================================
// الأنواع (مطابقة لـ /api/sports/*)
// ============================================================
interface SpTeam { id: number; name: string; logo: string; winner: boolean | null; }
interface SpFixture {
  id: number; date: string; timestamp: number;
  status: { code: string; label: string; elapsed: number | null; live: boolean; finished: boolean };
  round: string; venue: { name: string; city: string };
  home: SpTeam; away: SpTeam; goals: { home: number | null; away: number | null };
}
interface SpLiveItem extends SpFixture { competition: string; competitionSlug: string | null; }
interface SpStandingSplit { played: number; win: number; draw: number; lose: number; goalsFor: number; goalsAgainst: number; points: number; }
interface SpStandingRow {
  rank: number; team: SpTeam; played: number; win: number; draw: number; lose: number;
  goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number; form: string | null;
  home?: SpStandingSplit | null; away?: SpStandingSplit | null;
}
interface SpScorer {
  rank: number; id: number; name: string; photo: string; team: SpTeam;
  goals: number; assists: number; penalties: number; matches: number;
}
// الموجة 1: صنّاع الأهداف — نفس بنية الهدّاف لكن بلا ركلات جزاء.
interface SpAssister {
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
type SpCompetitionCategory = "saudi" | "gulf" | "european" | "world";
interface SpCompetition { slug: string; name: string; type: "league" | "cup"; hasStandings: boolean; hasScorers: boolean; hasStats: boolean; category?: SpCompetitionCategory; logo?: string | null; season?: number | null; }
const COMP_CATEGORY_LABELS: Record<SpCompetitionCategory, string> = { saudi: "سعودي", gulf: "خليجي", european: "أوروبي", world: "عالمي" };
const COMP_CATEGORY_ORDER: SpCompetitionCategory[] = ["saudi", "gulf", "european", "world"];
interface SpCardLeader { rank: number; id: number; name: string; photo: string; team: string; teamLogo: string; yellow: number; red: number; matches: number; }
interface SpPrediction { homePct: number; drawPct: number; awayPct: number; winnerId: number | null; winnerName: string | null; advice: string | null; }
interface SpH2HMeeting { id: number; timestamp: number; date: string; competition: string; home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string }; goals: { home: number | null; away: number | null }; }
interface SpH2H { summary: { total: number; homeWins: number; draws: number; awayWins: number } | null; meetings: SpH2HMeeting[]; }
interface SpShort { id: string; title: string; slug: string; coverImage: string; duration: number | null; views: number; }

// ============================================================
// أدوات
// ============================================================
const dayFmt = new Intl.DateTimeFormat("ar-SA", { weekday: "short", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", hour12: true });
const fmtDay = (ts: number) => dayFmt.format(new Date(ts * 1000));
const fmtTime = (ts: number) => timeFmt.format(new Date(ts * 1000));

const EVENT_EMOJI: Record<string, string> = {
  goal: "⚽", "missed-penalty": "❌", "yellow-card": "🟨", "red-card": "🟥", substitution: "🔁", var: "📺",
};

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  return `${m}:${String(sec % 60).padStart(2, "0")}`;
}
function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "الآن";
  if (diff < 3600) return `قبل ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `قبل ${Math.floor(diff / 3600)} س`;
  return `قبل ${Math.floor(diff / 86400)} يوم`;
}
const imgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);

// لمسة الهوية (accent) — أزرق اللوقو الرسمي (--primary = hsl 204 88% 53%)،
// لا أخضر emerald ولا primary (اللذان استعرناهما سابقًا من WorldCup).
const ACCENT = "text-primary";

// ============================================================
// عنوان قسم (نمط الرئيسية: أيقونة بخلفية خفيفة + عنوان + وصف)
// ============================================================
function SectionHeader({ title, subtitle, icon, action }: {
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

const moreLink = (href: string, label = "عرض الكل") => (
  <Link href={href}>
    <span className={`text-sm font-bold ${ACCENT} hover:underline`}>{label} ←</span>
  </Link>
);

// ============================================================
// لوحة «مباريات اليوم · كل البطولات» — نظرة سريعة موحّدة أعلى الصفحة:
// كل مباريات الأندية السعودية اليوم عبر جميع بطولاتنا (مقرّرة/جارية/منتهية)،
// مع اسم البطولة لكل مباراة والجارية مُبرَزة — مستقلّة عن البطولة المختارة.
// تُخفى تمامًا إن لا مباريات اليوم.
// ============================================================
function TodayMatchesBoard({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  if (items.length === 0) return null;
  const liveCount = items.filter((f) => f.status.live).length;
  return (
    <div className="border-b border-border bg-card">
      <div className="max-w-6xl mx-auto px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <CalendarDays className={`w-3.5 h-3.5 ${ACCENT}`} />
            مباريات اليوم · كل البطولات
            <span className="text-muted-foreground font-medium">({items.length})</span>
          </span>
          {liveCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> {liveCount} مباشر الآن
            </span>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
          {items.map((f) => {
            const decided = f.status.live || f.status.finished;
            return (
              <button
                key={f.id}
                onClick={() => onOpen(f.id)}
                className={`shrink-0 rounded-xl bg-background border px-3 py-2.5 transition-colors text-right w-64 max-w-[82vw] ${
                  f.status.live ? "border-red-500/40 hover:border-red-500/70" : "border-border hover:border-primary/50"
                }`}
              >
                {/* البطولة (يمين) + حالة المباراة (يسار) في سطر واحد */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="flex items-center gap-1 min-w-0">
                    {f.status.live && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />}
                    <span className="text-[10px] text-muted-foreground font-medium truncate">{f.competition}</span>
                  </span>
                  <span className={`shrink-0 text-[10px] font-bold tabular-nums ${f.status.live ? "text-red-500" : "text-muted-foreground"}`}>
                    {f.status.live
                      ? (f.status.elapsed != null ? `${f.status.elapsed}'` : f.status.label)
                      : f.status.finished
                      ? "انتهت"
                      : fmtTime(f.timestamp)}
                  </span>
                </div>
                {/* كل فريق في سطر كامل + نتيجته — يمنح الاسم العرض الكامل فلا يُقصّ */}
                <div className="space-y-1.5">
                  {[f.home, f.away].map((team, idx) => {
                    const my = idx === 0 ? f.goals.home : f.goals.away;
                    const opp = idx === 0 ? f.goals.away : f.goals.home;
                    const won = decided && my != null && opp != null && my > opp;
                    return (
                      <div key={team.id} className="flex items-center gap-2">
                        {team.logo ? (
                          <img src={team.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />
                        ) : (
                          <span className="w-5 h-5 shrink-0" />
                        )}
                        <span className={`flex-1 min-w-0 truncate text-sm text-foreground ${won ? "font-extrabold" : "font-semibold"}`}>{team.name}</span>
                        {decided && (
                          <span className={`shrink-0 text-sm tabular-nums ${won ? "font-black text-foreground" : "font-bold text-muted-foreground"}`}>{my ?? 0}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// بطاقة الخبر البارز — مع صورة: تدرّج خفيف على الصورة + نص أبيض.
// بلا صورة: بطاقة نصّية فاتحة أنيقة (تتجنّب مظهر «الصورة المكسورة»).
// ============================================================
function FeaturedCard({ article, large }: { article: ArticleWithDetails; large?: boolean }) {
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
function NewsCard({ article, index }: { article: ArticleWithDetails; index: number }) {
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
function PillTabs({ tabs, active, onChange, layoutId }: {
  tabs: { key: string; label: string; badge?: React.ReactNode }[];
  active: string; onChange: (k: string) => void; layoutId: string;
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted overflow-x-auto max-w-full">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`relative shrink-0 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors z-10 ${
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
// بطاقة مباراة
// ============================================================
function MatchCard({ fixture, onOpen }: { fixture: SpFixture; onOpen: (id: number) => void }) {
  const { home, away, goals, status } = fixture;
  const decided = status.live || status.finished;
  const homeWon = decided && (goals.home ?? 0) > (goals.away ?? 0);
  const awayWon = decided && (goals.away ?? 0) > (goals.home ?? 0);
  return (
    <button
      onClick={() => onOpen(fixture.id)}
      className="group w-full text-right relative overflow-hidden bg-card border border-border rounded-lg px-3 py-2 hover-elevate transition-all"
    >
      {status.live && <span className="absolute inset-y-0 right-0 w-0.5 bg-red-500" />}
      {/* سطر واحد: مضيف — نتيجة/وقت — ضيف */}
      <div className="flex items-center gap-2">
        <span className={`truncate text-sm font-bold flex-1 min-w-0 text-right ${homeWon ? "text-foreground" : decided ? "text-muted-foreground" : "text-foreground"}`}>
          {home.name}
        </span>
        {home.logo && <img src={home.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <div className="shrink-0 min-w-[3.5rem] text-center px-1.5 py-0.5 rounded-md bg-muted/60">
          {decided ? (
            <span className="text-sm font-black text-foreground tabular-nums tracking-wide" dir="ltr">
              {goals.home ?? 0}<span className="text-muted-foreground mx-0.5">-</span>{goals.away ?? 0}
            </span>
          ) : (
            <span className={`text-xs font-black ${ACCENT} tabular-nums`}>{fmtTime(fixture.timestamp)}</span>
          )}
        </div>
        {away.logo && <img src={away.logo} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />}
        <span className={`truncate text-sm font-bold flex-1 min-w-0 text-left ${awayWon ? "text-foreground" : decided ? "text-muted-foreground" : "text-foreground"}`}>
          {away.name}
        </span>
      </div>
      {/* سطر الحالة السفلي — رفيع جداً */}
      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="truncate text-muted-foreground max-w-[50%]">{fixture.round}</span>
        {status.live ? (
          <span className="inline-flex items-center gap-1 text-red-500 font-bold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {status.elapsed ? `${status.elapsed}'` : "مباشر"}
          </span>
        ) : status.finished ? (
          <span className="text-muted-foreground shrink-0">انتهت</span>
        ) : (
          <span className="text-muted-foreground shrink-0 tabular-nums">{fmtDay(fixture.timestamp)}</span>
        )}
      </div>
    </button>
  );
}

// متصفّح الجولات — يجلب قائمة الجولات + الجولة الحالية، ويعرض مباريات الجولة
// المختارة. يبدأ من الجولة الحالية تلقائيًا، ويسقط لآخر جولة عند انتهاء الموسم.
function RoundsView({ compSlug, onOpen }: { compSlug: string; onOpen: (id: number) => void }) {
  const { data: roundsData } = useQuery<{ rounds: { key: string; label: string }[]; current: string | null }>({
    queryKey: [`/api/sports/${compSlug}/rounds`], staleTime: 30 * 60_000,
  });
  const rounds = Array.isArray(roundsData?.rounds) ? roundsData!.rounds : [];
  const [selected, setSelected] = useState<string | null>(null);
  const active = selected ?? roundsData?.current ?? rounds[rounds.length - 1]?.key ?? null;

  const { data: fxData, isLoading } = useQuery<{ fixtures: SpFixture[] }>({
    queryKey: [`/api/sports/${compSlug}/round`, { name: active }],
    enabled: !!active, staleTime: 60_000,
  });
  const fixtures = Array.isArray(fxData?.fixtures) ? fxData!.fixtures : [];

  const emptyBox = (text: string) => (
    <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">{text}</div>
  );

  if (rounds.length === 0) return emptyBox("لا تتوفّر جولات لهذه البطولة بعد.");

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
        ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />)}</div>
        : fixtures.length === 0
          ? emptyBox("لا توجد مباريات في هذه الجولة.")
          : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{fixtures.map((f) => <MatchCard key={f.id} fixture={f} onOpen={onOpen} />)}</div>}
    </div>
  );
}

function MatchHub({ data, configured, compSlug, onOpen }: {
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

  const emptyBox = (text: string) => (
    <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">{text}</div>
  );

  if (!configured) return emptyBox("بانتظار انطلاق الموسم — تغطية المباريات الحيّة تظهر هنا فور بدء الجولة الأولى.");

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
              ? emptyBox(active === "live" ? "لا مباريات مباشرة الآن — عُد عند صافرة البداية" : "لا توجد مباريات في هذه الفترة — جرّب تبويبًا آخر")
              : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {current.list.map((f) => <MatchCard key={f.id} fixture={f} onOpen={onOpen} />)}
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
function TitleRace({ rows }: { rows: SpStandingRow[] }) {
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
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden" dir="ltr">
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
  const map: Record<string, string> = { W: "bg-primary", D: "bg-amber-400", L: "bg-red-400" };
  return (
    <div className="flex gap-1 justify-center" dir="ltr">
      {form.slice(-5).split("").map((r, i) => (
        <span key={i} className={`w-4 h-4 rounded-sm ${map[r] ?? "bg-muted"}`} title={r} />
      ))}
    </div>
  );
}

type SortKey = "rank" | "points" | "goalsDiff" | "goalsFor" | "win";
type StandScope = "all" | "home" | "away";

function StandingsTable({ rows }: { rows: SpStandingRow[] }) {
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
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-accent-blue/20 text-primary text-xs border-b border-border">
                <th className="py-3 px-2 text-center w-10">#</th>
                <th className="py-3 px-3 text-right">النادي</th>
                <th className="py-3 px-2 text-center">لعب</th>
                <th className="py-3 px-2 text-center">فاز</th>
                <th className="py-3 px-2 text-center">تعادل</th>
                <th className="py-3 px-2 text-center">خسر</th>
                <th className="py-3 px-2 text-center">له</th>
                <th className="py-3 px-2 text-center">عليه</th>
                <th className="py-3 px-2 text-center">+/−</th>
                <th className="py-3 px-2 text-center font-extrabold">نقاط</th>
                <th className="py-3 px-3 text-center hidden md:table-cell">آخر 5</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, idx) => {
                const pos = scope === "all" ? r.rank : idx + 1;
                const band = scope === "all"
                  ? (r.rank <= 3 ? "border-r-2 border-primary" : r.rank >= rows.length - 2 ? "border-r-2 border-red-400" : "border-r-2 border-transparent")
                  : "border-r-2 border-transparent";
                return (
                  <tr key={r.team.id} className={`border-b border-border last:border-b-0 hover:bg-muted/40 ${band}`}>
                    <td className="py-2.5 px-2 text-center font-bold text-muted-foreground tabular-nums">{pos}</td>
                    <td className="py-2.5 px-3">
                      <Link href={`/sports2/team/${r.team.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                        {r.team.logo && <img src={r.team.logo} alt="" className="w-6 h-6 object-contain" loading="lazy" />}
                        <span className="font-semibold text-foreground hover:text-primary">{r.team.name}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.played}</td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.win}</td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.draw}</td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.lose}</td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.goalsFor}</td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.goalsAgainst}</td>
                    <td className="py-2.5 px-2 text-center text-muted-foreground tabular-nums">{r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}</td>
                    <td className={`py-2.5 px-2 text-center font-black tabular-nums ${ACCENT}`}>{r.points}</td>
                    <td className="py-2.5 px-3 hidden md:table-cell"><FormChips form={r.form} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-muted-foreground border-t border-border">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary" /> مراكز البطولة الآسيوية</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-400" /> مراكز الهبوط</span>
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

function PodiumCard({ entries, primaryLabel, secondaryLabel }: {
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
            <Link key={s.id} href={`/sports2/player/${s.id}`} className="flex flex-col items-center flex-1 max-w-[120px] group">
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
          <Link key={`${s.id}-${s.rank}`} href={`/sports2/player/${s.id}`} className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors">
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
      <div className="relative h-2 rounded-full bg-muted overflow-hidden" dir="ltr">
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
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted" dir="ltr">
        <div className="bg-primary transition-all duration-700" style={{ width: `${h}%` }} />
        <div className="bg-amber-400 transition-all duration-700" style={{ width: `${a}%` }} />
      </div>
    </div>
  );
}
// اسم لاعب في التشكيلة، يربط لصفحته إن توفّر معرّفه.
function LineupName({ p, className }: { p: SpLineupPlayer; className?: string }) {
  if (p.id) return <Link href={`/sports2/player/${p.id}`} className={`hover:text-primary transition-colors ${className ?? ""}`}>{p.name}</Link>;
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
// الموجة 2: قائمة متصدّري البطاقات (إنذارات + طرد).
function CardLeaders({ leaders }: { leaders: SpCardLeader[] }) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden divide-y divide-border">
      {leaders.map((p) => (
        <div key={p.id || p.rank} className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-5 text-center font-bold text-muted-foreground text-sm tabular-nums shrink-0">{p.rank}</span>
          {p.photo ? <img src={p.photo} alt="" className="w-9 h-9 rounded-full object-cover bg-muted shrink-0" loading="lazy" /> : <span className="w-9 h-9 rounded-full bg-muted shrink-0" />}
          <div className="flex-1 min-w-0">
            {p.id ? (
              <Link href={`/sports2/player/${p.id}`} className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate block">{p.name}</Link>
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
      <div className="flex h-2.5 rounded-full overflow-hidden bg-muted" dir="ltr">
        <div className="bg-primary" style={{ width: `${homePct}%` }} />
        <div className="bg-muted-foreground/40" style={{ width: `${drawPct}%` }} />
        <div className="bg-amber-400" style={{ width: `${awayPct}%` }} />
      </div>
      {advice && <div className="text-[11px] text-muted-foreground mt-2 text-center">التوصية: <span className="font-semibold text-foreground">{advice}</span></div>}
    </div>
  );
}

// المواجهات المباشرة — ملخّص (فوز/تعادل/خسارة من منظور صاحب الأرض) + آخر اللقاءات.
function H2HView({ h2h, homeId, homeName, awayName }: { h2h: SpH2H; homeId: number; homeName: string; awayName: string }) {
  const s = h2h.summary;
  const fmt = (d: string) => {
    const t = Date.parse(d);
    return Number.isFinite(t) ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "short", day: "numeric" }).format(t) : "";
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
              <span className="shrink-0 font-black tabular-nums text-foreground px-2">{decided ? `${m.goals.home} - ${m.goals.away}` : "—"}</span>
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

function MatchDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<SpMatchDetail>({
    queryKey: [`/api/sports/match/${id}`], enabled: id != null,
    refetchInterval: (q) => (q.state.data?.fixture?.status?.live ? 15_000 : false),
  });
  const [tab, setTab] = useState("events");
  // البند 12: توقّعات تُجلب بكسل للمباريات غير المبدوءة فقط.
  const fixtureStatus = data?.fixture?.status;
  const isUpcoming = !!fixtureStatus && !fixtureStatus.finished && !fixtureStatus.live;
  const { data: prediction } = useQuery<SpPrediction>({
    queryKey: [`/api/sports/match/${id}/prediction`],
    enabled: id != null && isUpcoming,
    staleTime: 5 * 60_000,
  });
  const homeId = data?.fixture?.home?.id;
  const awayId = data?.fixture?.away?.id;
  const { data: h2hData } = useQuery<SpH2H>({
    queryKey: [`/api/sports/h2h`, { home: homeId, away: awayId }],
    enabled: id != null && !!homeId && !!awayId,
    staleTime: 30 * 60_000,
  });
  const h2hMeetings = Array.isArray(h2hData?.meetings) ? h2hData!.meetings : [];
  if (id == null) return null;
  const fx = data?.fixture, stats = data?.statistics;
  const events = Array.isArray(data?.events) ? data!.events : [];
  const lineups = Array.isArray(data?.lineups) ? data!.lineups : [];
  const started = !!fx && (fx.status.finished || fx.status.live);
  const tabs = [
    events.length > 0 ? { key: "events", label: "مجريات المباراة" } : null,
    stats && stats.rows.length > 0 ? { key: "stats", label: "نبض الأرقام" } : null,
    lineups.length > 0 ? { key: "lineups", label: "التشكيلات" } : null,
    started ? { key: "ratings", label: "التقييمات" } : null,
    h2hMeetings.length > 0 ? { key: "h2h", label: "المواجهات" } : null,
  ].filter(Boolean) as { key: string; label: string }[];
  const activeKey = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        dir="rtl" onClick={(e) => e.stopPropagation()}
        className="bg-card w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[88vh] flex flex-col overflow-hidden border border-border"
      >
        <div className="shrink-0 relative bg-accent-blue/20 border-b border-border p-4">
          <button onClick={onClose} className="absolute left-3 top-3 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
          {isLoading || !fx ? <Skeleton className="h-16 rounded-lg" /> : (
            <>
              <div className="text-center text-xs text-muted-foreground mb-2">{fx.round} {fx.venue.name ? `· ${fx.venue.name}` : ""}</div>
              <div className="flex items-center justify-center gap-4">
                <div className="flex-1 flex flex-col items-center gap-1">
                  {fx.home.logo && <img src={fx.home.logo} alt="" className="w-12 h-12 object-contain" />}
                  <span className="font-semibold text-sm text-center text-foreground">{fx.home.name}</span>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-black tabular-nums tracking-wider text-foreground">
                    {fx.status.finished || fx.status.live ? `${fx.goals.home ?? 0} : ${fx.goals.away ?? 0}` : fmtTime(fx.timestamp)}
                  </div>
                  <div className={`text-xs mt-1 ${fx.status.live ? "text-red-500 font-bold" : "text-muted-foreground"}`}>{fx.status.live ? `${fx.status.elapsed ?? ""}'` : fx.status.label}</div>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  {fx.away.logo && <img src={fx.away.logo} alt="" className="w-12 h-12 object-contain" />}
                  <span className="font-semibold text-sm text-center text-foreground">{fx.away.name}</span>
                </div>
              </div>
            </>
          )}
        </div>
        {prediction && fx && <PredictionBar prediction={prediction} homeName={fx.home.name} awayName={fx.away.name} />}
        {tabs.length > 0 && (
          <div className="shrink-0 flex border-b border-border bg-card">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${activeKey === t.key ? `${ACCENT} border-b-2 border-primary` : "text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="overflow-y-auto p-4">
          {isLoading && <div className="py-10 text-center text-muted-foreground text-sm">جارٍ تحميل التفاصيل…</div>}
          {!isLoading && activeKey === "events" && (
            <ul className="relative space-y-3 pr-4 border-r-2 border-border">
              {events.map((e, i) => {
                const homeSide = e.teamId === fx?.home.id;
                return (
                  <li key={i} className="relative flex items-start gap-2.5 text-sm">
                    <span className={`absolute -right-[21px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-card ${homeSide ? "bg-primary" : "bg-amber-500"}`} />
                    <span className="w-8 shrink-0 text-xs font-bold text-muted-foreground tabular-nums">{e.minute != null ? `${e.minute}'` : ""}</span>
                    <span className="shrink-0 leading-5">{EVENT_EMOJI[e.type] ?? "•"}</span>
                    <div className="min-w-0">
                      <span className="font-semibold text-foreground">{e.player}</span>
                      {e.assist && <span className="text-xs text-muted-foreground"> (صناعة {e.assist})</span>}
                      <div className="text-xs text-muted-foreground">{e.type !== "goal" ? `${e.label} · ` : ""}{e.team}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {!isLoading && activeKey === "stats" && stats && (() => {
            // استخراج الاستحواذ لعرضه كشريط بارز بالأعلى، وبقية الإحصاءات تحته.
            const possession = stats.rows.find((r) => r.type === "Ball Possession");
            const otherRows = stats.rows.filter((r) => r.type !== "Ball Possession");
            // جائزة «رجل المباراة»: صاحب أعلى xG (إن توفّر) — لمسة إبداعية تبرز الأداء.
            const xgRow = stats.rows.find((r) => /expected.*goals|xg/i.test(r.type));
            const xgHome = xgRow ? parseFloat(String(xgRow.home).replace(/[^0-9.]/g, "")) : NaN;
            const xgAway = xgRow ? parseFloat(String(xgRow.away).replace(/[^0-9.]/g, "")) : NaN;
            const motm = Number.isFinite(xgHome) && Number.isFinite(xgAway)
              ? (xgHome > xgAway ? "home" : xgAway > xgHome ? "away" : null)
              : null;
            return (
              <>
                {possession && <PossessionBar row={possession} />}
                {motm && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl bg-gradient-to-l from-amber-500/15 to-transparent ring-1 ring-amber-500/30 px-3 py-2">
                    <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-bold text-foreground">
                      رجل المباراة (حسب الأهداف المتوقّعة): {motm === "home" ? stats.home.name : stats.away.name}
                    </span>
                  </div>
                )}
                {otherRows.map((r) => <StatBar key={r.type} row={r} />)}
              </>
            );
          })()}
          {!isLoading && activeKey === "lineups" && lineups.map((l) => <LineupTeam key={l.team.id} lineup={l} />)}
          {!isLoading && activeKey === "ratings" && id != null && <RatingsList id={id} homeId={fx?.home.id ?? null} />}
          {!isLoading && activeKey === "h2h" && fx && h2hData && (
            <H2HView h2h={h2hData} homeId={fx.home.id} homeName={fx.home.name} awayName={fx.away.name} />
          )}
          {!isLoading && tabs.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">لا توجد تفاصيل متاحة لهذه المباراة بعد</div>}
        </div>
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

// تبويب «التقييمات» — يُحمّل بكسل (lazy) عند فتحه فقط (المكوّن لا يُركّب إلا حينها).
function RatingsList({ id, homeId }: { id: number; homeId: number | null }) {
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
    return <div className="py-8 text-center text-muted-foreground text-sm">لا تتوفّر تقييمات لهذه المباراة</div>;
  }

  const { motm, players } = data;

  return (
    <div className="space-y-4">
      {motm && (
        <div className="flex items-center gap-3 rounded-xl bg-gradient-to-l from-amber-500/15 to-transparent ring-1 ring-amber-500/30 px-3 py-2.5">
          <Crown className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-amber-600 dark:text-amber-400 font-bold">رجل المباراة</div>
            <Link href={`/sports2/player/${motm.id}`}>
              <span className="text-sm font-black text-foreground hover:text-primary transition-colors">{motm.name}</span>
            </Link>
            <span className="text-xs text-muted-foreground"> · {motm.team}</span>
          </div>
          <span className={`shrink-0 rounded-lg px-2 py-1 text-sm font-black tabular-nums ${ratingTone(motm.rating)}`} dir="ltr">
            {motm.rating.toFixed(1)}
          </span>
        </div>
      )}

      <ul className="space-y-1.5">
        {players.map((p) => {
          const sideClass = homeId != null ? (p.teamId === homeId ? "border-r-primary" : "border-r-amber-500") : "border-r-transparent";
          return (
            <li key={`${p.id}-${p.teamId}`} className={`flex items-center gap-3 rounded-xl border border-border border-r-[3px] ${sideClass} px-3 py-2`}>
              {p.photo
                ? <img src={p.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
                : <span className="w-8 h-8 rounded-full bg-muted shrink-0" />}
              <div className="min-w-0 flex-1">
                <Link href={`/sports2/player/${p.id}`}>
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
function ImageGallery({ articles }: { articles: ArticleWithDetails[] }) {
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
function VideoReel({ short, index }: { short: SpShort; index: number }) {
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

// ============================================================
// الصفحة
// ============================================================
const SECTIONS = [
  { id: "news", label: "الأخبار", icon: Newspaper },
  { id: "matches", label: "المباريات", icon: CalendarDays },
  { id: "standings", label: "الترتيب", icon: ListOrdered },
  { id: "scorers", label: "الهدّافون", icon: Goal },
  { id: "gallery", label: "صور", icon: Images },
  { id: "videos", label: "فيديو", icon: PlayCircle },
];

export default function SportsHub() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  // الموجة 1+2: تبديل بين الهدّافين وصنّاع الأهداف ومتصدّري البطاقات ضمن قسم واحد.
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => { document.title = "الرياضة | سبق"; }, []);
  useCanonical("https://sabq.org/sports2");

  const { data: newsRaw, isLoading: newsLoading } = useQuery<ArticleWithDetails[]>({ queryKey: ["/api/categories", "sports", "articles"] });
  const news = Array.isArray(newsRaw) ? newsRaw : [];

  const { data: category } = useQuery<Category>({ queryKey: ["/api/categories/slug", "sports"] });
  const sportsCatId = (category as any)?.id;

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({ queryKey: ["/api/sports/competitions"], staleTime: 60 * 60_000 });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = competitions.find((c) => c.slug === compSlug);
  const hasStandings = comp?.hasStandings ?? compSlug === "pro-league";
  const hasScorers = comp?.hasScorers ?? compSlug === "pro-league";

  // مبدّل بمستويين: الفئة (سعودي/أوروبي/عالمي) ← ثم بطولات الفئة المختارة.
  const catOf = (c: SpCompetition): SpCompetitionCategory => c.category ?? "saudi";
  const activeCat: SpCompetitionCategory = comp ? catOf(comp) : "saudi";
  const presentCats = COMP_CATEGORY_ORDER.filter((cat) => competitions.some((c) => catOf(c) === cat));
  const compsInActiveCat = competitions.filter((c) => catOf(c) === activeCat);

  const { data: matchesData } = useQuery<{ configured: boolean; live: SpFixture[]; today: SpFixture[]; upcoming: SpFixture[]; results: SpFixture[] }>({
    queryKey: [`/api/sports/${compSlug}/matches`], refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const matchesConfigured = matchesData?.configured ?? true;
  const matches = {
    live: Array.isArray(matchesData?.live) ? matchesData!.live : [],
    today: Array.isArray(matchesData?.today) ? matchesData!.today : [],
    upcoming: Array.isArray(matchesData?.upcoming) ? matchesData!.upcoming : [],
    results: Array.isArray(matchesData?.results) ? matchesData!.results : [],
  };
  // مباريات اليوم عبر كل البطولات (مستقلّة عن البطولة المختارة) — نظرة سريعة أعلى الصفحة.
  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"], refetchInterval: 30_000, refetchIntervalInBackground: false,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];
  const liveCount = todayMatches.filter((f) => f.status.live).length;

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({ queryKey: [`/api/sports/${compSlug}/standings`], staleTime: 5 * 60_000, enabled: hasStandings });
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({ queryKey: [`/api/sports/${compSlug}/scorers`], staleTime: 10 * 60_000, enabled: hasScorers });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  // الموجة 1: صنّاع الأهداف — تُجلب لنفس البطولات التي تدعم الهدّافين.
  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({ queryKey: [`/api/sports/${compSlug}/assists`], staleTime: 10 * 60_000, enabled: hasScorers });
  const assisters = Array.isArray(assistsData?.assists) ? assistsData.assists : [];

  // الموجة 2: متصدّرو البطاقات (إنذارات) — تُجلب عند فتح تبويب البطاقات فقط.
  const { data: cardsData } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({ queryKey: [`/api/sports/${compSlug}/cards`], staleTime: 10 * 60_000, enabled: hasScorers && scorersTab === "cards" });
  const yellowLeaders = Array.isArray(cardsData?.yellow) ? cardsData.yellow : [];

  const { data: shortsByCat } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts", { categoryId: sportsCatId, limit: 12 }], enabled: !!sportsCatId, staleTime: 10 * 60_000 });
  const { data: shortsFeatured } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts/featured", { limit: 12 }], staleTime: 10 * 60_000 });
  const catShorts = Array.isArray(shortsByCat?.shorts) ? shortsByCat.shorts : [];
  const featShorts = Array.isArray(shortsFeatured?.shorts) ? shortsFeatured.shorts : [];
  const videos = (catShorts.length > 0 ? catShorts : featShorts).slice(0, 8);

  const featured = news[0];
  const secondary = news.slice(1, 3);
  const grid = news.slice(3, 11);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ===== ترويسة القسم (نظيفة، فاتحة) ===== */}
        <div className="bg-card">
          <div className="max-w-6xl mx-auto px-4 pt-8 pb-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-accent-blue/30 shrink-0">
                  <Trophy className={`w-6 h-6 ${ACCENT}`} />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground tracking-wide uppercase">قسم · سبق سبورت</span>
                  <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight leading-tight">الرياضة</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">أخبار، مباريات، ترتيب وهدّافون — في مكان واحد</p>
                </div>
              </div>
              {liveCount > 0 && (
                <button
                  onClick={() => scrollTo("matches")}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold border border-red-500/20 hover:bg-red-500/15 transition-colors"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {liveCount} مباشر الآن
                </button>
              )}
            </div>
          </div>
        </div>

        {/* تنقّل الأقسام — sticky أثناء التمرير */}
        <nav className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex gap-1 overflow-x-auto">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-3 text-sm font-bold text-muted-foreground hover:text-foreground border-b-2 border-transparent hover:border-primary transition-colors"
                  >
                    <Icon className="w-4 h-4" />{s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </nav>

        {/* ===== مباريات اليوم · كل البطولات (نظرة سريعة فوق الأخبار) ===== */}
        <TodayMatchesBoard items={todayMatches} onOpen={setOpenMatch} />

        <div className="max-w-6xl mx-auto px-4 py-12 space-y-16 sm:space-y-20">
          {/* ===== الأخبار ===== */}
          <section id="news" className="scroll-mt-24">
            <SectionHeader
              title="أبرز الأخبار"
              subtitle="آخر مستجدّات الرياضة"
              icon={<Newspaper className={`w-5 h-5 ${ACCENT}`} />}
              action={moreLink("/category/sports", "كل الأخبار")}
            />
            {newsLoading ? (
              <div className="grid lg:grid-cols-3 gap-4">
                <Skeleton className="lg:col-span-2 aspect-[16/9] rounded-2xl" />
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                  {[0, 1].map((i) => <Skeleton key={i} className="aspect-[16/10] rounded-2xl" />)}
                </div>
              </div>
            ) : news.length === 0 ? (
              <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار أول الأخبار الرياضية — تظهر هنا فور نشرها.</div>
            ) : (
              <>
                {featured && (
                  <div className="grid lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2">
                      <FeaturedCard article={featured} large />
                    </div>
                    {secondary.length > 0 && (
                      <div className="grid grid-cols-2 lg:grid-cols-1 gap-4">
                        {secondary.map((a) => <FeaturedCard key={a.id} article={a} />)}
                      </div>
                    )}
                  </div>
                )}
                {grid.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
                    {grid.map((a, i) => <NewsCard key={a.id} article={a} index={i} />)}
                  </div>
                )}
              </>
            )}
          </section>

          {/* ===== مركز المباريات ===== */}
          <section id="matches" className="scroll-mt-24">
            <SectionHeader title="مركز المباريات" subtitle="مباشر · اليوم · قادمة · النتائج" icon={<CalendarDays className={`w-5 h-5 ${ACCENT}`} />} />
            {competitions.length > 0 && (
              <div className="space-y-2 mb-5">
                {/* المستوى 1: الفئة */}
                {presentCats.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {presentCats.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          const first = competitions.find((c) => catOf(c) === cat);
                          if (first) setCompSlug(first.slug);
                        }}
                        className={`shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${activeCat === cat ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                      >
                        {COMP_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                )}
                {/* المستوى 2: بطولات الفئة */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {compsInActiveCat.map((c) => (
                    <button key={c.slug} onClick={() => setCompSlug(c.slug)}
                      className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${compSlug === c.slug ? "bg-primary text-white shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* البند 9: ترويسة البطولة الديناميكية (شعار + موسم). */}
            {comp && (comp.logo || comp.season) && (
              <div className="flex items-center gap-3 mb-5 px-1">
                {comp.logo && <img src={comp.logo} alt="" className="w-11 h-11 object-contain shrink-0" />}
                <div className="min-w-0">
                  <div className="font-black text-foreground truncate">{comp.name}</div>
                  {comp.season && <div className="text-xs text-muted-foreground tabular-nums">موسم {comp.season}</div>}
                </div>
              </div>
            )}
            <MatchHub key={compSlug} data={matches} configured={matchesConfigured} compSlug={compSlug} onOpen={setOpenMatch} />
          </section>

          {/* ===== الترتيب ===== */}
          {hasStandings && (
            <section id="standings" className="scroll-mt-24">
              <SectionHeader title="جدول الترتيب" subtitle="فرز وتصفية مباشرة" icon={<ListOrdered className={`w-5 h-5 ${ACCENT}`} />} />
              {standings.length ? (<><TitleRace rows={standings} /><StandingsTable rows={standings} /></>) : (
                <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار انطلاق البطولة — يظهر جدول الترتيب هنا مع بداية الجولة الأولى.</div>
              )}
            </section>
          )}

          {/* ===== الهدّافون وصنّاع الأهداف (تبديل) ===== */}
          {hasScorers && (
            <section id="scorers" className="scroll-mt-24">
              <SectionHeader
                title={scorersTab === "scorers" ? "منصّة الهدّافين" : scorersTab === "assists" ? "منصّة صنّاع الأهداف" : "متصدّرو البطاقات"}
                subtitle={scorersTab === "scorers" ? "الأكثر تهديفًا في البطولة" : scorersTab === "assists" ? "الأكثر صناعةً للأهداف" : "الأكثر حصولًا على الإنذارات"}
                icon={scorersTab === "scorers" ? <Goal className={`w-5 h-5 ${ACCENT}`} /> : scorersTab === "assists" ? <Hand className={`w-5 h-5 ${ACCENT}`} /> : <Square className="w-5 h-5 text-amber-500" />}
                action={
                  <PillTabs
                    layoutId="scorers-tab"
                    active={scorersTab}
                    onChange={(k) => setScorersTab(k as "scorers" | "assists" | "cards")}
                    tabs={[
                      { key: "scorers", label: "هدّافون" },
                      { key: "assists", label: "صنّاع الأهداف" },
                      { key: "cards", label: "البطاقات" },
                    ]}
                  />
                }
              />
              {scorersTab === "scorers" ? (
                scorers.length ? <PodiumCard
                  entries={scorers.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))}
                  primaryLabel="عدد الأهداف"
                  secondaryLabel="الصناعة"
                /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار تسجيل أول الأهداف — يظهر ترتيب الهدّافين هنا مع انطلاق المنافسة.</div>
                )
              ) : scorersTab === "assists" ? (
                assisters.length ? <PodiumCard
                  entries={assisters.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))}
                  primaryLabel="عدد الصناعات"
                  secondaryLabel="الأهداف"
                /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">بانتظار أولى الصناعات — يظهر ترتيب صنّاع الأهداف هنا مع انطلاق المنافسة.</div>
                )
              ) : (
                yellowLeaders.length ? <CardLeaders leaders={yellowLeaders} /> : (
                  <div className="text-center text-muted-foreground py-14 bg-card rounded-2xl border border-dashed border-border">لا تتوفّر بيانات البطاقات لهذه البطولة بعد.</div>
                )
              )}
            </section>
          )}

          {/* ===== معرض الصور ===== */}
          {news.length > 0 && (
            <section id="gallery" className="scroll-mt-24">
              <SectionHeader title="معرض الرياضة" subtitle="أبرز اللقطات بالصورة" icon={<Images className={`w-5 h-5 ${ACCENT}`} />} />
              <ImageGallery articles={news} />
            </section>
          )}

          {/* ===== الفيديو ===== */}
          {videos.length > 0 && (
            <section id="videos" className="scroll-mt-24">
              <SectionHeader title="فيديو وملخّصات" subtitle="شاهد أحدث المقاطع" icon={<PlayCircle className={`w-5 h-5 ${ACCENT}`} />}
                action={moreLink("/shorts", "كل الفيديوهات")} />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {videos.map((v, i) => <VideoReel key={v.id} short={v} index={i} />)}
              </div>
            </section>
          )}
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
