/**
 * بوابة سبق الرياضية المتخصصة — /sports10  (إعادة تصميم جذرية)
 *
 * الفلسفة: "حالة واحدة تحكم الشاشة". الصفحة كائن حيّ يتنفّس مع اللعب:
 *   - 🔴 مباراة مباشرة الآن  → المسرح يتحوّل إلى لوحة نتيجة كبيرة تتصدّر كل شيء.
 *   - ⏳ مباراة قادمة مهمّة → عدّاد تشويقي + معاينة الفريقين بجانب الخبر الأبرز.
 *   - 😴 لا شيء حيّ          → المحتوى التحريري يتصدّر.
 *
 * شخصنة حقيقية: عند متابعة نادٍ، تنحاز الصفحة له (تتصدّر مباراته، يُظلَّل في الترتيب).
 * لا تبويبات قسرية — تمرير واحد متّصل مع أزرار قفز (jump-pills) لاصقة + scrollspy.
 *
 * يستهلك نقاط الرياضة القائمة فقط:
 *   /api/sports/* · /api/asian-cup/* · /api/categories/sports/articles
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpLeft,
  Bell,
  BellRing,
  CalendarDays,
  ChevronLeft,
  CircleDot,
  Clock3,
  Flag,
  Gauge,
  ListOrdered,
  Medal,
  Newspaper,
  Radio,
  Sparkles,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import { MatchDialog, timeAgo, type SpCompetition, type SpLiveItem, type SpStandingRow } from "./SportsHub";
import type { AcFixture, AcGroup, AcOverview, AcTeam } from "@/components/asiancup/acTypes";

// ============================================================
// أدوات
// ============================================================
const articleTime = (a: ArticleWithDetails) => new Date(a.publishedAt || (a as any).createdAt || 0).getTime();
const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) => articleTime(b) - articleTime(a);
const imgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);

const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit", hour12: true });
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "short", day: "numeric", month: "short" });
const fixtureTime = (ts: number) => timeFmt.format(new Date(ts * 1000));
const fixtureDay = (ts: number) => dayFmt.format(new Date(ts * 1000));

function matchMinute(f: SpLiveItem): string {
  if (f.status.code === "HT") return "الراحة";
  if (f.status.elapsed == null) return f.status.label || "مباشر";
  return f.status.extra ? `${f.status.elapsed}+${f.status.extra}'` : `${f.status.elapsed}'`;
}

const isFav = (m: SpLiveItem, favId: number | null) => favId != null && (m.home.id === favId || m.away.id === favId);

/** أهم مباراة حيّة لتصدُّر المسرح: مباراة فريقي أولاً، ثم محلية، ثم أي مباراة. */
function pickHeroLive(localLive: SpLiveItem[], worldLive: SpLiveItem[], favId: number | null): SpLiveItem | undefined {
  const all = [...localLive, ...worldLive];
  if (!all.length) return undefined;
  return all.find((m) => isFav(m, favId)) ?? localLive[0] ?? all[0];
}

/** المباراة القادمة الأقرب اليوم: مباراة فريقي أولاً إن وُجدت. */
function pickNextMatch(today: SpLiveItem[], favId: number | null): SpLiveItem | undefined {
  const upcoming = today
    .filter((m) => !m.status.finished && !m.status.live)
    .sort((a, b) => a.timestamp - b.timestamp);
  return upcoming.find((m) => isFav(m, favId)) ?? upcoming[0];
}

// ============================================================
// رقم النتيجة الحيّة — ومضة + تكبير لحظة الهدف
// ============================================================
function GoalScore({ value }: { value: number }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (value > prev.current) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1800);
      prev.current = value;
      return () => clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return (
    <span className="relative inline-block">
      {flash && <span className="absolute inset-0 -z-0 animate-ping rounded-lg bg-amber-400/40" />}
      <motion.span
        animate={flash ? { scale: [1, 1.45, 1] } : { scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className={`relative z-10 inline-block tabular-nums ${flash ? "text-amber-300" : ""}`}
      >
        {value}
      </motion.span>
    </span>
  );
}

function CountUnit({ value, label, dark = false }: { value: string; label: string; dark?: boolean }) {
  return (
    <div className="text-center">
      <div className={`grid h-12 w-12 place-items-center rounded-xl sm:h-14 sm:w-14 ${dark ? "bg-white/15 text-white ring-1 ring-white/15" : "bg-foreground text-background"}`}>
        <span className="text-xl font-black tabular-nums sm:text-2xl">{value}</span>
      </div>
      <span className={`mt-1 block text-[10px] font-semibold ${dark ? "text-white/55" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function useCountdown(targetMs: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, targetMs - now);
  return {
    diff,
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
    pad: (n: number) => String(n).padStart(2, "0"),
  };
}

// ============================================================
// تذكير محلي بالمباريات (localStorage) — ميزة ويب خفيفة
// ============================================================
const REMIND_KEY = "sabq:sports-reminders";
function useReminders() {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(REMIND_KEY);
      if (raw) setIds(JSON.parse(raw));
    } catch { /* تجاهل */ }
  }, []);
  const toggle = useCallback((id: number) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(REMIND_KEY, JSON.stringify(next)); } catch { /* تجاهل */ }
      return next;
    });
  }, []);
  return { ids, toggle } as const;
}

// ============================================================
// عناوين الأقسام + روابط
// ============================================================
function SectionTitle({
  eyebrow, title, subtitle, icon, action, light = false,
}: {
  eyebrow?: string; title: string; subtitle?: string; icon: React.ReactNode; action?: React.ReactNode; light?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${light ? "bg-white/10 text-white ring-1 ring-white/15" : "bg-primary/10 text-primary ring-1 ring-primary/10"}`}>
          {icon}
        </div>
        <div>
          {eyebrow && <p className={`text-[11px] font-bold uppercase tracking-[0.18em] ${light ? "text-white/60" : "text-primary/80"}`}>{eyebrow}</p>}
          <h2 className={`text-2xl font-black tracking-tight sm:text-3xl ${light ? "text-white" : "text-foreground"}`}>{title}</h2>
          {subtitle && <p className={`mt-1 max-w-2xl text-sm leading-6 ${light ? "text-white/65" : "text-muted-foreground"}`}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function ArrowLink({ href, children, light = false }: { href: string; children: React.ReactNode; light?: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition ${
        light ? "bg-white text-primary hover:bg-white/90" : "bg-primary text-primary-foreground hover:bg-primary/90"
      }`}
    >
      {children}
      <ChevronLeft className="h-4 w-4" />
    </Link>
  );
}

// ============================================================
// المسرح الحيّ — لوحة نتيجة كبيرة عند وجود مباراة مباشرة
// ============================================================
function StageTeam({ team, align = "center" }: { team: SpLiveItem["home"]; align?: "center" | "right" | "left" }) {
  return (
    <div className={`flex min-w-0 flex-col items-center gap-2.5 text-center ${align === "right" ? "sm:items-start sm:text-right" : align === "left" ? "sm:items-end sm:text-left" : ""}`}>
      {team.logo ? (
        <img src={team.logo} alt="" className="h-14 w-14 shrink-0 object-contain sm:h-24 sm:w-24" loading="lazy" />
      ) : (
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 sm:h-24 sm:w-24"><Trophy className="h-7 w-7 text-white/40" /></div>
      )}
      <span className="line-clamp-2 text-sm font-bold leading-tight text-white sm:text-2xl">{team.name}</span>
    </div>
  );
}

function LiveScoreboard({ match, otherLiveCount, fav, onOpen }: { match: SpLiveItem; otherLiveCount: number; fav: boolean; onOpen: (id: number) => void }) {
  const started = match.status.live || match.status.finished;
  return (
    <button
      type="button"
      onClick={() => onOpen(match.id)}
      className="group relative block w-full overflow-hidden rounded-[2rem] border border-red-500/25 bg-slate-950 p-6 text-right text-white shadow-2xl shadow-red-900/20 transition hover:-translate-y-0.5 sm:p-9"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(239,68,68,.30),transparent_42%),radial-gradient(circle_at_88%_85%,rgba(37,99,235,.22),transparent_44%),linear-gradient(140deg,#0b0712,#030712_70%)]" />
      <div className="relative">
        {/* الترويسة: البطولة + شارة مباشر */}
        <div className="mb-7 flex items-center justify-between gap-3 sm:mb-9">
          <span className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-xs font-bold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            {matchMinute(match)}
          </span>
          <span className="min-w-0 truncate text-xs font-medium text-white/60 sm:text-sm">{match.competition}{match.round ? ` · ${match.round}` : ""}</span>
        </div>

        {fav && (
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-[11px] font-bold text-amber-200 ring-1 ring-amber-300/20">
            <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> مباراة فريقك الآن
          </span>
        )}

        {/* الفريقان + النتيجة */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
          <StageTeam team={match.home} align="right" />
          <div className="flex flex-col items-center gap-1" dir="ltr">
            <div className="flex items-center gap-2 text-5xl font-black tabular-nums leading-none sm:gap-3 sm:text-7xl">
              {started ? (
                <>
                  <GoalScore value={match.goals.home ?? 0} />
                  <span className="text-white/30">-</span>
                  <GoalScore value={match.goals.away ?? 0} />
                </>
              ) : (
                <span className="text-3xl text-white/50 sm:text-5xl">VS</span>
              )}
            </div>
          </div>
          <StageTeam team={match.away} align="left" />
        </div>

        {/* التذييل: المكان + CTA + عدّاد المباريات الأخرى */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 sm:mt-10">
          <span className="text-xs font-medium text-white/55">{match.venue?.name || fixtureDay(match.timestamp)}</span>
          <div className="flex items-center gap-3">
            {otherLiveCount > 0 && (
              <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold text-white/70 ring-1 ring-white/10 tabular-nums">+{otherLiveCount} مباشر</span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 transition group-hover:-translate-x-1">
              مركز المباراة <ChevronLeft className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
// ============================================================
// الخبر الأبرز — بطاقة سينمائية (وضع الهدوء)
// ============================================================
function HeroNewsCard({ article }: { article: ArticleWithDetails }) {
  const image = imgOf(article);
  return (
    <Link href={`/article/${article.englishSlug || article.slug}`} className="group relative block h-full min-h-[340px] overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl shadow-primary/10 sm:min-h-[420px]">
      {image ? (
        <OptimizedImage
          src={image}
          alt={article.title}
          className="h-full min-h-[340px] w-full object-cover transition duration-700 group-hover:scale-105 sm:min-h-[420px]"
          wrapperClassName="absolute inset-0"
          objectPosition={getObjectPosition(article)}
          priority
          fetchPriority="high"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_18%,rgba(59,130,246,.35),transparent_30%),linear-gradient(135deg,#071827,#020617_68%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/5" />
      <div className="relative flex min-h-[340px] flex-col justify-between p-5 sm:min-h-[420px] sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge className="border-white/15 bg-white/15 text-white hover:bg-white/20">
            <Zap className="ml-1 h-3.5 w-3.5 text-amber-300" /> الخبر الرياضي الأبرز
          </Badge>
          <span className="rounded-full bg-black/25 px-3 py-1 text-xs font-bold text-white/75 ring-1 ring-white/10">{timeAgo(article.publishedAt)}</span>
        </div>
        <div>
          <h2 className="max-w-3xl text-2xl font-black leading-tight tracking-tight sm:text-4xl">{article.title}</h2>
          {article.excerpt && <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 line-clamp-2">{article.excerpt}</p>}
          <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 transition group-hover:-translate-x-1">
            قراءة القصة <ChevronLeft className="h-4 w-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

// ============================================================
// بطاقة المباراة القادمة — عدّاد تشويقي + معاينة الفريقين + تذكير
// ============================================================
function NextMatchCard({ match, fav, reminded, onToggleReminder }: { match: SpLiveItem; fav: boolean; reminded: boolean; onToggleReminder: () => void }) {
  const { h, m, s, pad, diff } = useCountdown(match.timestamp * 1000);
  const imminent = diff > 0 && diff < 3_600_000;
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-[2rem] border bg-card ${imminent ? "border-primary/40" : "border-border"}`}>
      <div className="flex items-center justify-between gap-2 bg-primary/[0.06] px-5 py-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">{fav ? "مباراة فريقك القادمة" : "المباراة القادمة"}</span>
        </div>
        <span className="truncate text-[11px] font-medium text-muted-foreground">{match.competition}</span>
      </div>
      <div className="flex flex-1 flex-col justify-between p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center gap-2 text-center">
            {match.home.logo ? <img src={match.home.logo} alt="" className="h-12 w-12 object-contain sm:h-16 sm:w-16" loading="lazy" /> : <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted sm:h-16 sm:w-16"><Trophy className="h-5 w-5 text-muted-foreground" /></div>}
            <span className="line-clamp-2 text-xs font-bold leading-tight text-foreground sm:text-sm">{match.home.name}</span>
          </div>
          <span className="text-sm font-black text-muted-foreground">VS</span>
          <div className="flex flex-col items-center gap-2 text-center">
            {match.away.logo ? <img src={match.away.logo} alt="" className="h-12 w-12 object-contain sm:h-16 sm:w-16" loading="lazy" /> : <div className="grid h-12 w-12 place-items-center rounded-xl bg-muted sm:h-16 sm:w-16"><Trophy className="h-5 w-5 text-muted-foreground" /></div>}
            <span className="line-clamp-2 text-xs font-bold leading-tight text-foreground sm:text-sm">{match.away.name}</span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5" dir="ltr">
          <CountUnit value={pad(h)} label="ساعة" />
          <span className="text-xl font-black text-muted-foreground">:</span>
          <CountUnit value={pad(m)} label="دقيقة" />
          <span className="text-xl font-black text-muted-foreground">:</span>
          <CountUnit value={pad(s)} label="ثانية" />
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-primary tabular-nums">{fixtureDay(match.timestamp)} · {fixtureTime(match.timestamp)}</span>
          <button
            type="button"
            onClick={onToggleReminder}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              reminded ? "bg-primary text-primary-foreground" : "bg-muted text-foreground ring-1 ring-border hover:bg-muted/70"
            }`}
          >
            {reminded ? <><BellRing className="h-3.5 w-3.5" /> سيُذكّرك</> : <><Bell className="h-3.5 w-3.5" /> ذكّرني</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuietNextCard() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-[2rem] border border-dashed border-border bg-card p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-6 w-6" /></div>
      <p className="text-sm font-bold text-foreground">لا مباريات مجدولة الآن</p>
      <p className="text-xs text-muted-foreground">سنلتقط أول مباراة قادمة فور إعلان موعدها.</p>
    </div>
  );
}

// ============================================================
// المسرح — يتحوّل حسب حالة اللحظة
// ============================================================
function Stage({
  heroLive, nextMatch, featured, otherLiveCount, favId, loading, onOpen, reminded, onToggleReminder,
}: {
  heroLive?: SpLiveItem;
  nextMatch?: SpLiveItem;
  featured?: ArticleWithDetails;
  otherLiveCount: number;
  favId: number | null;
  loading: boolean;
  onOpen: (id: number) => void;
  reminded: boolean;
  onToggleReminder: () => void;
}) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-card to-background">
      <div className="mx-auto max-w-7xl px-4 pb-6 pt-7 sm:pt-9">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Badge className="bg-primary text-primary-foreground hover:bg-primary">سبق سبورت</Badge>
          <Badge variant="outline" className="border-primary/20 bg-background/70 text-primary">غرفة عمليات المشجّع</Badge>
          {heroLive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-[11px] font-bold text-red-500 ring-1 ring-red-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> اللعب جارٍ الآن
            </span>
          )}
        </div>

        {loading ? (
          <Skeleton className="min-h-[340px] rounded-[2rem] sm:min-h-[420px]" />
        ) : heroLive ? (
          <LiveScoreboard match={heroLive} otherLiveCount={otherLiveCount} fav={isFav(heroLive, favId)} onOpen={onOpen} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {featured ? (
                <HeroNewsCard article={featured} />
              ) : (
                <div className="grid h-full min-h-[340px] place-items-center rounded-[2rem] border border-dashed border-border bg-card text-center text-muted-foreground sm:min-h-[420px]">
                  بانتظار أحدث الأخبار الرياضية.
                </div>
              )}
            </div>
            <div className="lg:col-span-5">
              {nextMatch ? (
                <NextMatchCard match={nextMatch} fav={isFav(nextMatch, favId)} reminded={reminded} onToggleReminder={onToggleReminder} />
              ) : (
                <QuietNextCard />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// شريط النبض — رفيع، معلومة طرفية لا تنافس البطل
// ============================================================
function PulseStrip({ liveCount, todayCount, nextMatch }: { liveCount: number; todayCount: number; nextMatch?: SpLiveItem }) {
  const { h, m, pad, diff } = useCountdown(nextMatch ? nextMatch.timestamp * 1000 : 0);
  return (
    <div className="border-b border-border bg-background/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
          <Radio className={`h-4 w-4 ${liveCount ? "text-red-500" : "text-muted-foreground"}`} />
          <span className="tabular-nums">{liveCount}</span> <span className="text-muted-foreground">مباشر الآن</span>
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="tabular-nums">{todayCount}</span> <span className="text-muted-foreground">مباراة اليوم</span>
        </span>
        {nextMatch && diff > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <span className="inline-flex items-center gap-1.5 font-bold text-foreground">
              <Clock3 className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground">القادمة بعد</span>
              <span className="tabular-nums" dir="ltr">{pad(h)}:{pad(m)}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
// ============================================================
// طبقة "تابع فريقك" — تخزين محلي (localStorage)
// ============================================================
const FOLLOW_KEY = "sabq:followed-team";
function useFollowedTeam(rows: SpStandingRow[]) {
  const [teamId, setTeamId] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOLLOW_KEY);
      if (raw) setTeamId(Number(raw));
    } catch { /* تجاهل */ }
    setHydrated(true);
  }, []);
  const choose = useCallback((id: number | null) => {
    setTeamId(id);
    try {
      if (id == null) localStorage.removeItem(FOLLOW_KEY);
      else localStorage.setItem(FOLLOW_KEY, String(id));
    } catch { /* تجاهل */ }
  }, []);
  useEffect(() => {
    if (hydrated && teamId != null && rows.length && !rows.some((r) => r.team.id === teamId)) {
      choose(null);
    }
  }, [hydrated, teamId, rows, choose]);
  const team = teamId != null ? rows.find((r) => r.team.id === teamId) ?? null : null;
  return { teamId, team, choose, hydrated } as const;
}

function MyTeamTile({ team, hydrated, nextForTeam, onPick }: { team: SpStandingRow | null; hydrated: boolean; nextForTeam?: SpLiveItem; onPick: () => void }) {
  if (!hydrated) return <Skeleton className="h-full min-h-[150px] rounded-[1.5rem]" />;
  if (!team) {
    return (
      <button
        type="button"
        onClick={onPick}
        className="flex h-full w-full items-center gap-3 rounded-[1.5rem] border border-dashed border-primary/40 bg-primary/[0.04] p-5 text-right transition hover:border-primary hover:bg-primary/[0.08]"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Star className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">تابع فريقك</p>
          <p className="text-xs text-muted-foreground">اختر ناديك في روشن لتنحاز لك الصفحة: مباراته القادمة ومركزه أولاً.</p>
        </div>
        <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
      </button>
    );
  }
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-primary/20 bg-card">
      <div className="flex items-center gap-3 bg-primary/[0.06] p-3">
        {team.team.logo ? (
          <img src={team.team.logo} alt="" className="h-10 w-10 shrink-0 object-contain" loading="lazy" />
        ) : (
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Star className="h-5 w-5" /></div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{team.team.name}</p>
          <p className="text-[11px] text-muted-foreground">فريقي في روشن</p>
        </div>
        <button type="button" onClick={onPick} className="shrink-0 rounded-lg bg-background px-2 py-1 text-[11px] font-bold text-primary ring-1 ring-border hover:bg-muted">تغيير</button>
      </div>
      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border text-center">
        <div className="p-2.5"><div className="text-lg font-black tabular-nums text-foreground">{team.rank}</div><div className="text-[10px] text-muted-foreground">المركز</div></div>
        <div className="p-2.5"><div className="text-lg font-black tabular-nums text-foreground">{team.points}</div><div className="text-[10px] text-muted-foreground">نقطة</div></div>
        <div className="p-2.5"><div className="text-lg font-black tabular-nums text-foreground">{team.played}</div><div className="text-[10px] text-muted-foreground">مباراة</div></div>
      </div>
      {nextForTeam ? (
        <Link href="/sports/matches" className="mt-auto flex items-center justify-between gap-2 border-t border-border bg-background px-3 py-2 text-xs font-bold transition hover:bg-muted">
          <span className="truncate text-foreground">القادمة: {nextForTeam.home.name} × {nextForTeam.away.name}</span>
          <span className="shrink-0 text-primary tabular-nums">{fixtureTime(nextForTeam.timestamp)}</span>
        </Link>
      ) : (
        <div className="mt-auto border-t border-border bg-background px-3 py-2 text-center text-[11px] text-muted-foreground">لا مباراة قادمة مجدولة لفريقك بعد.</div>
      )}
    </div>
  );
}

// ترتيب روشن المختصر: أول 5 + تثبيت صف فريقي وتظليله مهما كان مركزه
function RoshnMiniStandings({ rows, loading, favId }: { rows: SpStandingRow[]; loading: boolean; favId: number | null }) {
  const top = rows.slice(0, 5);
  const favRow = favId != null ? rows.find((r) => r.team.id === favId) : undefined;
  const showFavPinned = favRow && !top.some((r) => r.team.id === favId);
  const leader = rows[0];
  const renderRow = (r: SpStandingRow, pinned = false) => {
    const isFavRow = favId != null && r.team.id === favId;
    const gap = leader && r.rank > 1 ? leader.points - r.points : 0;
    return (
      <li key={`${pinned ? "pin-" : ""}${r.team.id}`} className={`flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition ${isFavRow ? "bg-primary/10 ring-1 ring-primary/25" : "hover:bg-muted/60"}`}>
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold tabular-nums ${r.rank <= 3 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{r.rank}</span>
        {r.team.logo ? <img src={r.team.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" /> : <div className="h-5 w-5 shrink-0 rounded bg-muted" />}
        <span className={`min-w-0 flex-1 truncate text-xs ${isFavRow ? "font-black text-primary" : "font-bold text-foreground"}`}>{r.team.name}{isFavRow && <Star className="mr-1 inline h-3 w-3 fill-primary text-primary" />}</span>
        {gap > 0 && <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">-{gap}</span>}
        <span className="shrink-0 text-sm font-black tabular-nums text-foreground">{r.points}</span>
      </li>
    );
  };
  return (
    <div className="flex h-full flex-col rounded-[1.5rem] border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><ListOrdered className="h-4 w-4 text-primary" /><h3 className="text-sm font-bold text-foreground">ترتيب روشن</h3></div>
        <Link href="/roshn" className="text-[11px] font-bold text-primary hover:underline">الكل</Link>
      </div>
      {loading ? (
        <div className="grid flex-1 gap-1.5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
      ) : top.length ? (
        <ol className="grid flex-1 content-start gap-1">
          {top.map((r) => renderRow(r))}
          {showFavPinned && favRow && (
            <>
              <li className="px-1.5 text-center text-[10px] font-bold text-muted-foreground">⋯</li>
              {renderRow(favRow, true)}
            </>
          )}
        </ol>
      ) : (
        <div className="grid flex-1 place-items-center rounded-xl border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">يظهر الترتيب عند توفر بيانات الموسم.</div>
      )}
    </div>
  );
}

// نطاق المستخدم: فريقي + الترتيب المختصر — بعد المسرح مباشرة
function MyZone({ team, hydrated, nextForTeam, standings, standingsLoading, favId, onPick }: {
  team: SpStandingRow | null; hydrated: boolean; nextForTeam?: SpLiveItem;
  standings: SpStandingRow[]; standingsLoading: boolean; favId: number | null; onPick: () => void;
}) {
  return (
    <section className="border-b border-border bg-background">
      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 lg:grid-cols-2">
        <MyTeamTile team={team} hydrated={hydrated} nextForTeam={nextForTeam} onPick={onPick} />
        <RoshnMiniStandings rows={standings} loading={standingsLoading} favId={favId} />
      </div>
    </section>
  );
}

// نافذة اختيار الفريق
function TeamPickerSheet({ open, onOpenChange, rows, selectedId, onSelect }: {
  open: boolean; onOpenChange: (v: boolean) => void; rows: SpStandingRow[]; selectedId: number | null; onSelect: (id: number | null) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        <SheetHeader className="text-center">
          <SheetTitle className="text-lg font-black">اختر فريقك في روشن</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">سيظهر فريقك في الواجهة مع مركزه ومباراته القادمة. يُحفظ على هذا الجهاز فقط.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {rows.length ? rows.map((r) => {
            const active = r.team.id === selectedId;
            return (
              <button
                key={r.team.id}
                type="button"
                onClick={() => { onSelect(r.team.id); onOpenChange(false); }}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-right transition ${active ? "border-primary bg-primary/[0.06]" : "border-border bg-card hover:border-primary/30"}`}
              >
                {r.team.logo ? <img src={r.team.logo} alt="" className="h-9 w-9 shrink-0 object-contain" loading="lazy" /> : <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted"><Star className="h-4 w-4 text-muted-foreground" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{r.team.name}</p>
                  <p className="text-[11px] text-muted-foreground">المركز {r.rank} · {r.points} نقطة</p>
                </div>
                {active && <span className="shrink-0 text-primary"><CircleDot className="h-4 w-4" /></span>}
              </button>
            );
          }) : (
            <div className="col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">ستظهر فرق روشن هنا عند توفر بيانات الموسم.</div>
          )}
        </div>
        {selectedId != null && (
          <button type="button" onClick={() => { onSelect(null); onOpenChange(false); }} className="mt-4 w-full rounded-xl border border-border bg-background py-2.5 text-sm font-bold text-muted-foreground transition hover:border-red-500/30 hover:text-red-500">
            إلغاء المتابعة
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// شريط المباشر اللاصق — كبسولات رفيعة ترافق التمرير
// ============================================================
function LiveRail({ matches, onOpen }: { matches: SpLiveItem[]; onOpen: (id: number) => void }) {
  if (!matches.length) return null;
  return (
    <div className="sticky top-16 z-30 border-y border-red-500/15 bg-red-950/[0.96] text-white shadow-sm backdrop-blur supports-[backdrop-filter]:bg-red-950/85">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2">
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500 px-2.5 py-1 text-[11px] font-bold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          مباشر
        </div>
        <div className="flex flex-1 gap-2 overflow-x-auto pb-0.5 scrollbar-hide" dir="ltr">
          {matches.map((m) => {
            const started = m.status.live || m.status.finished;
            return (
              <button key={m.id} type="button" onClick={() => onOpen(m.id)} className="group flex shrink-0 items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs ring-1 ring-white/15 transition hover:bg-white/20">
                <span className="hidden truncate font-medium text-white/80 sm:inline">{m.home.name}</span>
                {m.home.logo && <img src={m.home.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" />}
                <span className="text-sm font-black tabular-nums" dir="ltr">{started ? `${m.goals.home ?? 0}-${m.goals.away ?? 0}` : "VS"}</span>
                {m.away.logo && <img src={m.away.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" />}
                <span className="hidden truncate font-medium text-white/80 sm:inline">{m.away.name}</span>
                {m.status.live && <span className="shrink-0 font-bold text-amber-300 tabular-nums">{matchMinute(m)}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// أزرار القفز اللاصقة + scrollspy (بديل التبويبات القسرية)
// ============================================================
const JUMP_SECTIONS = [
  { id: "today", label: "مباريات اليوم" },
  { id: "roshn", label: "روشن" },
  { id: "asian", label: "كأس آسيا" },
  { id: "f1", label: "فورمولا 1" },
] as const;

function useScrollSpy(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.2, 0.5, 1] },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids.join("|")]);
  return active;
}

function JumpNav({ liveActive, liveCount }: { liveActive: boolean; liveCount: number }) {
  const active = useScrollSpy(JUMP_SECTIONS.map((s) => s.id));
  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 150;
    window.scrollTo({ top: y, behavior: "smooth" });
  };
  return (
    <div className={`sticky z-20 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 ${liveActive ? "top-[7rem]" : "top-16"}`}>
      <nav className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-4 py-2.5 scrollbar-hide" aria-label="تنقّل بوابة الرياضة">
        <div className="flex shrink-0 gap-1 rounded-full bg-muted/60 p-1 ring-1 ring-border">
          {JUMP_SECTIONS.map((s) => {
            const isActive = active === s.id;
            const badge = s.id === "today" && liveCount ? liveCount : undefined;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => go(s.id)}
                className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-bold transition ${isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {badge != null && (
                  <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] tabular-nums ${isActive ? "bg-primary-foreground/25 text-primary-foreground" : "bg-red-500 text-white"}`}>{badge}</span>
                )}
                {s.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
// ============================================================
// مباريات اليوم — لوحة المحلي/العالمي
// ============================================================
function TeamMini({ team, align = "right" }: { team: SpLiveItem["home"]; align?: "right" | "left" }) {
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "left" ? "justify-end" : ""}`}>
      {align === "right" && team.logo && <img src={team.logo} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />}
      <span className="truncate text-sm font-bold text-foreground">{team.name}</span>
      {align === "left" && team.logo && <img src={team.logo} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />}
    </div>
  );
}

function LiveMatchCard({ match, fav, onOpen }: { match: SpLiveItem; fav: boolean; onOpen: (id: number) => void }) {
  const live = match.status.live;
  const started = live || match.status.finished;
  return (
    <button
      type="button"
      onClick={() => onOpen(match.id)}
      className={`group relative overflow-hidden rounded-2xl border p-4 text-right transition hover:-translate-y-0.5 hover:shadow-md ${
        live ? "border-red-500/25 bg-red-500/[0.04] dark:bg-red-500/[0.07]" : fav ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card hover:border-primary/30"
      }`}
    >
      {live && <span className="absolute inset-y-3 right-0 w-1 rounded-l-full bg-red-500" />}
      {fav && !live && <span className="absolute left-3 top-3 text-primary"><Star className="h-3.5 w-3.5 fill-primary" /></span>}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">{match.competition}</span>
        {live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />{matchMinute(match)}
          </span>
        ) : (
          <span className="shrink-0 text-[11px] font-bold text-primary tabular-nums">{fixtureTime(match.timestamp)}</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamMini team={match.home} />
        <div className="min-w-[4.25rem] rounded-xl bg-background/80 px-2 py-1 text-center ring-1 ring-border/60" dir="ltr">
          {started ? (
            <span className="text-xl font-black tabular-nums text-foreground"><GoalScore value={match.goals.home ?? 0} /><span className="mx-1 text-muted-foreground">-</span><GoalScore value={match.goals.away ?? 0} /></span>
          ) : (
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          )}
        </div>
        <TeamMini team={match.away} align="left" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{match.round || fixtureDay(match.timestamp)}</span>
        <span className="font-bold transition group-hover:text-primary">مركز المباراة</span>
      </div>
    </button>
  );
}

function TodayBoard({ local, world, favId, onOpen }: { local: SpLiveItem[]; world: SpLiveItem[]; favId: number | null; onOpen: (id: number) => void }) {
  const [tab, setTab] = useState<"local" | "world">("local");
  const rows = tab === "local" ? local : world;
  return (
    <section id="today" className="scroll-mt-36 border-y border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-16">
        <SectionTitle
          eyebrow="لحظة بلحظة"
          title="مباريات اليوم"
          subtitle="المحلي والعالمي في لوحة واحدة، وفتح مركز المباراة بنقرة."
          icon={<Radio className="h-5 w-5" />}
          action={<ArrowLink href="/sports/matches">كل المباريات</ArrowLink>}
        />
        <div className="mb-6 flex flex-wrap gap-2">
          <button type="button" onClick={() => setTab("local")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "local" ? "bg-primary text-white" : "bg-card text-muted-foreground ring-1 ring-border hover:text-primary"}`}>
            محلية وسعودية <span className="mr-1 tabular-nums">{local.length}</span>
          </button>
          <button type="button" onClick={() => setTab("world")} className={`rounded-full px-4 py-2 text-sm font-bold transition ${tab === "world" ? "bg-primary text-white" : "bg-card text-muted-foreground ring-1 ring-border hover:text-primary"}`}>
            عالمية <span className="mr-1 tabular-nums">{world.length}</span>
          </button>
        </div>
        {rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.slice(0, 9).map((m) => <LiveMatchCard key={`${tab}-${m.id}`} match={m} fav={isFav(m, favId)} onOpen={onOpen} />)}
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card p-12 text-center">
            <CircleDot className="mx-auto mb-3 h-9 w-9 text-primary/50" />
            <p className="font-bold text-foreground">لا توجد مباريات في هذا المسار حالياً</p>
            <p className="mt-1 text-sm text-muted-foreground">عند انطلاق أي مباراة ستظهر النتيجة والدقيقة هنا تلقائياً.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// روشن والبطولات السعودية
// ============================================================
function RoshnSpotlight({ competitions }: { competitions: SpCompetition[] }) {
  const saudi = competitions.filter((c) => (c.category ?? "saudi") === "saudi");
  const roshn = competitions.find((c) => c.slug === "pro-league") ?? saudi[0];
  return (
    <section id="roshn" className="scroll-mt-36 mx-auto max-w-7xl px-4 py-14 sm:py-16">
      <SectionTitle
        eyebrow="المحلي أولاً"
        title="البطولات السعودية"
        subtitle="مدخل سريع لدوري روشن وبقية البطولات المحلية مع روابط مباشرة لمراكز البطولات."
        icon={<Trophy className="h-5 w-5" />}
        action={<ArrowLink href="/roshn">هب روشن</ArrowLink>}
      />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Link href={`/sports/competition/${roshn?.slug ?? "pro-league"}`} className="group relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl shadow-primary/10 sm:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(45,156,219,.34),transparent_30%),linear-gradient(135deg,#07111f,#0b2c4a_55%,#05131f)]" />
          <div className="relative flex h-full min-h-[300px] flex-col justify-between gap-10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Badge className="mb-4 border-amber-300/20 bg-amber-300/15 text-amber-100 hover:bg-amber-300/20"><Star className="ml-1 h-3.5 w-3.5 fill-amber-200 text-amber-200" /> البطولة الأبرز</Badge>
                <h3 className="text-4xl font-black tracking-tight sm:text-6xl">دوري روشن</h3>
                <p className="mt-4 max-w-xl text-sm leading-7 text-white/70 sm:text-base">مركز مخصّص للنتائج، الجولات، الترتيب، الهدّافين، والانتقالات — بتقديم بصري قريب من جمهور سبق الرياضي.</p>
              </div>
              {roshn?.logo && <img src={roshn.logo} alt="" className="h-20 w-20 shrink-0 rounded-2xl bg-white object-contain p-2" loading="lazy" />}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold ring-1 ring-white/15">{roshn?.season ? `موسم ${roshn.season}` : "تغطية الموسم"}</span>
              <span className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold ring-1 ring-white/15">ترتيب وهدّافون</span>
              <span className="mr-auto inline-flex items-center gap-1 text-sm font-bold text-amber-200 transition group-hover:-translate-x-1">دخول البطولة <ChevronLeft className="h-4 w-4" /></span>
            </div>
          </div>
        </Link>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {saudi.slice(0, 6).map((c) => (
            <Link key={c.slug} href={`/sports/competition/${c.slug}`} className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/30 hover:shadow-sm">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-background ring-1 ring-border">
                {c.logo ? <img src={c.logo} alt="" className="h-8 w-8 object-contain" loading="lazy" /> : <Trophy className="h-5 w-5 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-foreground transition group-hover:text-primary">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.type === "league" ? "دوري" : "كأس"}{c.season ? ` · ${c.season}` : ""}</p>
              </div>
              <ChevronLeft className="h-5 w-5 shrink-0 text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-primary" />
            </Link>
          ))}
          {!saudi.length && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">تظهر البطولات السعودية هنا عند توفر بيانات المزوّد.</div>}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// كأس آسيا
// ============================================================
function AsianFixtureMini({ fixture }: { fixture: AcFixture }) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5">
      <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate font-medium">{fixture.round}</span>
        <span className={fixture.status.live ? "font-bold text-red-500" : "font-medium"}>
          {fixture.status.live ? `${fixture.status.elapsed ?? ""}' مباشر` : fixture.status.finished ? "انتهت" : timeFmt.format(new Date(fixture.date))}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <span className="truncate text-sm font-bold text-foreground">{fixture.home.name}</span>
        <span className="rounded-lg bg-muted px-2 py-1 text-center text-sm font-black tabular-nums" dir="ltr">{started ? `${fixture.goals.home ?? 0} - ${fixture.goals.away ?? 0}` : "VS"}</span>
        <span className="truncate text-left text-sm font-bold text-foreground">{fixture.away.name}</span>
      </div>
    </div>
  );
}

function AsianCupBlock({ overview, fixtures, teams, groups }: { overview?: AcOverview; fixtures: AcFixture[]; teams: AcTeam[]; groups: AcGroup[] }) {
  const saudiFixtures = fixtures.filter((f) => f.home.id === 23 || f.away.id === 23).slice(0, 3);
  const next = overview?.nextMatch ?? fixtures.find((f) => !f.status.finished) ?? null;
  return (
    <section id="asian" className="scroll-mt-36 border-y border-border bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-16">
        <SectionTitle
          eyebrow="تغطية قارية"
          title="كأس آسيا"
          subtitle="ملف شامل للبطولة: جدول المباريات، المنتخبات، المجموعات، وتركيز على الأخضر."
          icon={<Medal className="h-5 w-5" />}
          action={<ArrowLink href="/asian-cup">الصفحة الكاملة</ArrowLink>}
        />
        <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <div className="overflow-hidden rounded-[2rem] border border-emerald-400/25 bg-gradient-to-br from-emerald-950 via-emerald-800 to-slate-950 text-white shadow-xl">
            <div className="relative p-6 sm:p-8">
              <div className="absolute -left-16 -top-16 h-52 w-52 rounded-full bg-emerald-300/20 blur-3xl" />
              <div className="relative">
                <Badge className="mb-5 bg-amber-300 text-emerald-950 hover:bg-amber-300">السعودية 2027</Badge>
                <h3 className="text-4xl font-black tracking-tight">الحلم الآسيوي على أرض المملكة</h3>
                <p className="mt-4 text-sm leading-7 text-emerald-50/75">{overview?.host ? `المضيف: ${overview.host}` : "تجربة مخصّصة لتفاصيل المباريات والمنتخبات المستضافة."}</p>
                <div className="mt-6 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10"><div className="text-2xl font-black tabular-nums">{overview?.teamsCount || teams.length || 24}</div><div className="text-[11px] text-emerald-50/65">منتخب</div></div>
                  <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10"><div className="text-2xl font-black tabular-nums">{overview?.groupsCount || groups.length || 6}</div><div className="text-[11px] text-emerald-50/65">مجموعات</div></div>
                  <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10"><div className="text-2xl font-black tabular-nums">{fixtures.length}</div><div className="text-[11px] text-emerald-50/65">مباراة</div></div>
                </div>
                {next && (
                  <div className="mt-6 rounded-2xl bg-white p-4 text-slate-950">
                    <p className="mb-2 text-xs font-bold text-emerald-700">المباراة القادمة</p>
                    <AsianFixtureMini fixture={next} />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-[1.75rem] border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2"><Flag className="h-5 w-5 text-emerald-500" /><h3 className="font-bold text-foreground">مباريات الأخضر</h3></div>
              <div className="grid gap-3">{saudiFixtures.length ? saudiFixtures.map((f) => <AsianFixtureMini key={f.id} fixture={f} />) : <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">تظهر مباريات المنتخب السعودي فور اعتماد الجدول.</p>}</div>
            </div>
            <div className="rounded-[1.75rem] border border-border bg-card p-5">
              <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-primary" /><h3 className="font-bold text-foreground">المنتخبات والمجموعات</h3></div>
              <div className="grid grid-cols-2 gap-2">
                {teams.slice(0, 8).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 rounded-xl bg-background p-2 ring-1 ring-border/60">{t.logo && <img src={t.logo} alt="" className="h-6 w-6 object-contain" loading="lazy" />}<span className="truncate text-xs font-bold text-foreground">{t.name}</span></div>
                ))}
                {!teams.length && groups.slice(0, 6).map((g) => <div key={g.name} className="rounded-xl bg-background p-3 text-center text-xs font-bold text-foreground ring-1 ring-border/60">{g.name}</div>)}
                {!teams.length && !groups.length && <p className="col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">ستظهر المنتخبات والمجموعات هنا عند اكتمال البيانات.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// فورمولا 1 — تقويم رسمي نظيف (بلا نتائج مفبركة ولا بانر اعتذار)
// ============================================================
type F1Race = { round: number; name: string; country: string; date: string; status: "finished" | "next" | "upcoming" };

const F1_RACES: F1Race[] = [
  { round: 1, country: "أستراليا", name: "جائزة أستراليا الكبرى", date: "6–8 مارس", status: "finished" },
  { round: 2, country: "الصين", name: "جائزة الصين الكبرى", date: "13–15 مارس", status: "finished" },
  { round: 3, country: "اليابان", name: "جائزة اليابان الكبرى", date: "27–29 مارس", status: "finished" },
  { round: 4, country: "ميامي", name: "جائزة ميامي الكبرى", date: "1–3 مايو", status: "finished" },
  { round: 5, country: "كندا", name: "جائزة كندا الكبرى", date: "22–24 مايو", status: "finished" },
  { round: 6, country: "موناكو", name: "جائزة موناكو الكبرى", date: "5–7 يونيو", status: "finished" },
  { round: 7, country: "برشلونة-كتالونيا", name: "جائزة برشلونة-كتالونيا الكبرى", date: "12–14 يونيو", status: "finished" },
  { round: 8, country: "النمسا", name: "جائزة النمسا الكبرى", date: "26–28 يونيو", status: "next" },
  { round: 9, country: "بريطانيا", name: "جائزة بريطانيا الكبرى", date: "3–5 يوليو", status: "upcoming" },
  { round: 10, country: "بلجيكا", name: "جائزة بلجيكا الكبرى", date: "17–19 يوليو", status: "upcoming" },
  { round: 11, country: "المجر", name: "جائزة المجر الكبرى", date: "24–26 يوليو", status: "upcoming" },
  { round: 12, country: "هولندا", name: "جائزة هولندا الكبرى", date: "21–23 أغسطس", status: "upcoming" },
  { round: 13, country: "إيطاليا", name: "جائزة إيطاليا الكبرى", date: "4–6 سبتمبر", status: "upcoming" },
  { round: 14, country: "إسبانيا", name: "جائزة إسبانيا الكبرى", date: "11–13 سبتمبر", status: "upcoming" },
  { round: 15, country: "أذربيجان", name: "جائزة أذربيجان الكبرى", date: "24–26 سبتمبر", status: "upcoming" },
  { round: 16, country: "سنغافورة", name: "جائزة سنغافورة الكبرى", date: "9–11 أكتوبر", status: "upcoming" },
  { round: 17, country: "الولايات المتحدة", name: "جائزة الولايات المتحدة الكبرى", date: "23–25 أكتوبر", status: "upcoming" },
  { round: 18, country: "المكسيك", name: "جائزة مدينة المكسيك الكبرى", date: "30 أكتوبر–1 نوفمبر", status: "upcoming" },
  { round: 19, country: "البرازيل", name: "جائزة ساو باولو الكبرى", date: "6–8 نوفمبر", status: "upcoming" },
  { round: 20, country: "لاس فيغاس", name: "جائزة لاس فيغاس الكبرى", date: "19–21 نوفمبر", status: "upcoming" },
  { round: 21, country: "قطر", name: "جائزة قطر الكبرى", date: "27–29 نوفمبر", status: "upcoming" },
  { round: 22, country: "أبوظبي", name: "جائزة أبوظبي الكبرى", date: "4–6 ديسمبر", status: "upcoming" },
];

function FormulaOneBlock() {
  const next = F1_RACES.find((r) => r.status === "next") ?? F1_RACES.find((r) => r.status === "upcoming");
  const finishedCount = F1_RACES.filter((r) => r.status === "finished").length;
  return (
    <section id="f1" className="scroll-mt-36 border-t border-border bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:py-16">
        <SectionTitle
          eyebrow="رياضات المحركات"
          title="فورمولا 1"
          subtitle="تقويم الموسم الرسمي: السباق القادم وجدول الجولات المتبقية."
          icon={<Gauge className="h-5 w-5" />}
          light
          action={<Link href="/category/sports" className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/15 hover:bg-white/15">أخبار المحركات</Link>}
        />
        <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-red-600 via-slate-900 to-black p-6 shadow-2xl sm:p-8">
            <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-red-400/25 blur-3xl" />
            <div className="relative">
              <Badge className="mb-5 bg-white text-slate-950 hover:bg-white">السباق القادم</Badge>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-red-100/70">الجولة {next?.round} من {F1_RACES.length}</p>
                  <h3 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{next?.country}</h3>
                  <p className="mt-3 text-lg font-medium text-white/80">{next?.name}</p>
                </div>
                <Flag className="h-16 w-16 text-white/25" />
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><CalendarDays className="mb-2 h-5 w-5 text-red-200" /><p className="text-2xl font-black tabular-nums">{next?.date}</p><p className="text-xs text-white/55">موعد عطلة السباق</p></div>
                <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/10"><CircleDot className="mb-2 h-5 w-5 text-red-200" /><p className="text-2xl font-black tabular-nums">{finishedCount}/{F1_RACES.length}</p><p className="text-xs text-white/55">جولة أُقيمت</p></div>
              </div>
            </div>
          </div>
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.06] p-5">
            <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-red-300" /><h3 className="font-bold">تقويم الجولات القادمة</h3></div>
            <div className="space-y-2">
              {F1_RACES.filter((r) => r.status !== "finished").slice(0, 8).map((r) => (
                <div key={r.round} className={`flex items-center gap-3 rounded-2xl p-3 ring-1 ${r.status === "next" ? "bg-red-500/20 ring-red-300/25" : "bg-black/20 ring-white/10"}`}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-sm font-black tabular-nums text-slate-950">{r.round}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{r.country}</p><p className="truncate text-xs text-white/55">{r.name}</p></div>
                  {r.status === "next" && <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-red-600">التالي</span>}
                  <span className="shrink-0 text-xs font-medium text-white/65">{r.date}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
// ============================================================
// الصفحة
// ============================================================
export default function Sports10() {
  const { user } = useAuth();
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const { ids: remindedIds, toggle: toggleReminder } = useReminders();

  useEffect(() => { document.title = "سبق سبورت | بوابة رياضية متخصصة"; }, []);
  useCanonical("https://sabq.org/sports10");

  const { data: newsRaw, isLoading: newsLoading } = useQuery<ArticleWithDetails[]>({ queryKey: ["/api/categories", "sports", "articles"] });
  const news = useMemo(() => (Array.isArray(newsRaw) ? [...newsRaw].sort(byRecency) : []), [newsRaw]);

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({ queryKey: ["/api/sports/competitions"], staleTime: 60 * 60_000 });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"],
    refetchInterval: (query) => ((query.state.data?.today ?? []).some((f) => f.status.live) ? 10_000 : 30_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData.today : [];

  const { data: liveData } = useQuery<{ live: SpLiveItem[] }>({
    queryKey: ["/api/sports/live"],
    refetchInterval: 7_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const liveMatches = (Array.isArray(liveData?.live) ? liveData.live : []).filter((f) => f.status.live);

  const { data: worldLiveData } = useQuery<{ matches: SpLiveItem[] }>({
    queryKey: ["/api/sports/world-live"],
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const worldLiveMatches = (Array.isArray(worldLiveData?.matches) ? worldLiveData.matches : []).filter((f) => f.status.live);

  const { data: roshnStandingsData, isLoading: roshnStandingsLoading } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: ["/api/sports/pro-league/standings"],
    staleTime: 5 * 60_000,
  });
  const roshnStandings = Array.isArray(roshnStandingsData?.standings) ? roshnStandingsData.standings : [];
  const { team: followedTeam, teamId: followedTeamId, choose: chooseTeam, hydrated: followedHydrated } = useFollowedTeam(roshnStandings);

  const { data: acOverview } = useQuery<AcOverview>({ queryKey: ["/api/asian-cup/overview"], staleTime: 5 * 60_000 });
  const { data: acFixturesData } = useQuery<{ fixtures: AcFixture[] }>({ queryKey: ["/api/asian-cup/fixtures"], staleTime: 5 * 60_000 });
  const { data: acTeamsData } = useQuery<{ teams: AcTeam[] }>({ queryKey: ["/api/asian-cup/teams"], staleTime: 30 * 60_000 });
  const { data: acGroupsData } = useQuery<{ groups: AcGroup[] }>({ queryKey: ["/api/asian-cup/standings"], staleTime: 5 * 60_000 });
  const acFixtures = Array.isArray(acFixturesData?.fixtures) ? acFixturesData.fixtures : [];
  const acTeams = Array.isArray(acTeamsData?.teams) ? acTeamsData.teams : [];
  const acGroups = Array.isArray(acGroupsData?.groups) ? acGroupsData.groups : [];

  // اختيار أبطال المسرح — مع انحياز لفريق المتابِع
  const heroLive = pickHeroLive(liveMatches, worldLiveMatches, followedTeamId);
  const nextMatch = pickNextMatch(todayMatches, followedTeamId);
  const allLiveCount = liveMatches.length + worldLiveMatches.length;
  const otherLiveCount = heroLive ? Math.max(0, allLiveCount - 1) : allLiveCount;
  const nextForTeam = followedTeamId != null
    ? todayMatches.find((m) => !m.status.finished && isFav(m, followedTeamId))
    : undefined;

  const featured = news[0];

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground" dir="rtl">
      <Header user={user || undefined} />
      <main>
        <Stage
          heroLive={heroLive}
          nextMatch={nextMatch}
          featured={featured}
          otherLiveCount={otherLiveCount}
          favId={followedTeamId}
          loading={newsLoading && !heroLive}
          onOpen={setOpenMatch}
          reminded={nextMatch ? remindedIds.includes(nextMatch.id) : false}
          onToggleReminder={() => nextMatch && toggleReminder(nextMatch.id)}
        />
        <LiveRail matches={liveMatches} onOpen={setOpenMatch} />
        <PulseStrip liveCount={allLiveCount} todayCount={todayMatches.length} nextMatch={nextMatch} />
        <MyZone
          team={followedTeam}
          hydrated={followedHydrated}
          nextForTeam={nextForTeam}
          standings={roshnStandings}
          standingsLoading={roshnStandingsLoading}
          favId={followedTeamId}
          onPick={() => setTeamPickerOpen(true)}
        />
        <JumpNav liveActive={liveMatches.length > 0} liveCount={liveMatches.length} />

        <TodayBoard
          local={liveMatches.length ? liveMatches : todayMatches}
          world={worldLiveMatches}
          favId={followedTeamId}
          onOpen={setOpenMatch}
        />
        <RoshnSpotlight competitions={competitions} />
        <AsianCupBlock overview={acOverview} fixtures={acFixtures} teams={acTeams} groups={acGroups} />
        <FormulaOneBlock />

        <section className="mx-auto max-w-7xl px-4 py-14">
          <div className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 text-primary"><Sparkles className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-[0.18em]">بوابة قابلة للتوسّع</span></div>
                <h2 className="text-2xl font-black text-foreground">كل الرياضة في مسار واحد</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">صُمّمت البوابة لتتنفّس مع اللعب: مباريات، بطولات، ملفات خاصة، ورياضات إضافية ضمن قالب سريع ومتجاوب على الجوال والديسكتوب.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ArrowLink href="/sports">بوابة /sports</ArrowLink>
                <Link href="/category/sports" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-bold text-foreground transition hover:border-primary/30 hover:text-primary">أرشيف الرياضة <ArrowUpLeft className="h-4 w-4" /></Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <TeamPickerSheet open={teamPickerOpen} onOpenChange={setTeamPickerOpen} rows={roshnStandings} selectedId={followedTeamId} onSelect={chooseTeam} />
      <Footer />
    </div>
  );
}




