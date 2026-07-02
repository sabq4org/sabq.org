/**
 * البوابة الرياضية /sports — إعادة تصميم كاملة وفق دليل الهوية البصرية v1.0 (SABQ Brand Guidelines).
 *
 * لغة التصميم «وضوح تحريري»: الأزرق يقود (#4CBCFD)، الرمادي يخدم، والبياض يتنفّس.
 *  - غلاف كحلي (#0E2233) بأسلوب أغلفة الدليل: توصيف Mono لاتيني، عنوان Alexandria ضخم،
 *    موتيف «الأعمدة الصاعدة» من الشعار، وتنقّل مرقّم (٠١ الأخبار · ٠٢ المباريات ...).
 *  - ترويسات أقسام بنمط الدليل: eyebrow أحادي المسافة (01 — NEWS) + عنوان Alexandria.
 *  - Plex Mono لكل الأرقام والطوابع الزمنية، وزوايا 10/16/24، وظلّان فقط بلون كحلي شفاف.
 *  - المكوّنات الثقيلة (MatchHub، الترتيب، الهدّافون، الحوار...) يُعاد استخدامها من SportsHub
 *    وتُعاد صباغتها تلقائيًا عبر تجاوز توكنز الثيم داخل نطاق .sbq-sport (فاتح + داكن «حبري»).
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  CalendarDays,
  Star,
  Clock,
  Flame,
  Radio,
  ChevronLeft,
  ArrowLeftRight,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { Skeleton } from "@/components/ui/skeleton";
import { getCacheBustedImageUrl, getObjectPosition } from "@/lib/imageUtils";
import type { ArticleWithDetails, Category } from "@shared/schema";
import {
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  COMP_STATUS_LABELS,
  COMP_STATUS_RANK,
  PillTabs,
  MatchHub,
  StandingsTable,
  PodiumCard,
  CardLeaders,
  LeaderboardBoard,
  ImageGallery,
  VideoReel,
  MatchDialog,
  TodayCompactRow,
  timeAgo,
  useSportsFollows,
  type SpFixture,
  type SpLiveItem,
  type SpTeam,
  type SpStandingRow,
  type SpScorer,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpCompetitionCategory,
  type SpShort,
} from "./SportsHub";
// توكنز الهوية والمكوّنات المشتركة (BRAND_CSS، الخطوط، الأعمدة، الترويسات)
// تعيش في SportsBrand.tsx لتشاركها بقية صفحات سبق سبورت.
import { BRAND_CSS, useBrandFonts, RisingBars, SectionHead, brandMoreLink } from "./SportsBrand";

const imgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);
// زمن الخبر للترتيب — نعتمد النشر ثم الإنشاء حتى لا يتصدّر خبر قديم مثبّت يدويًا (displayOrder).
const articleTime = (a: ArticleWithDetails) => new Date(a.publishedAt || (a as any).createdAt || 0).getTime();
const byRecency = (a: ArticleWithDetails, b: ArticleWithDetails) => articleTime(b) - articleTime(a);


// ============================================================
// الغلاف — بأسلوب غلاف دليل الهوية: كحلي حبر، توصيف Mono، عنوان ضخم،
// أعمدة الشعار، سطر بيانات لحظي، وتنقّل مرقّم بين أقسام الصفحة.
// ============================================================
const coverDateFmt = new Intl.DateTimeFormat("ar", {
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});

function Masthead({
  liveCount,
  todayCount,
  compCount,
  nav,
  onJump,
}: {
  liveCount: number;
  todayCount: number;
  compCount: number;
  nav: { id: string; num: string; label: string }[];
  onJump: (id: string) => void;
}) {
  const today = useMemo(() => coverDateFmt.format(new Date()), []);
  return (
    <header className="sbq-ink relative overflow-hidden">
      <RisingBars
        className="absolute -bottom-8 left-4 opacity-[0.13] sm:left-10"
        bars={[60, 100, 148, 200, 120, 168]}
        width={26}
        gap={10}
      />
      <div className="relative mx-auto max-w-[1200px] px-5 pb-0 pt-9 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span dir="ltr" className="sbq-mono text-[12px] tracking-[2px] text-[#4CBCFD]">SABQ SPORT — LIVE COVERAGE</span>
          <div className="flex flex-wrap items-center gap-3">
            {/* زر المباشر — في أعلى الغلاف ليُرى فورًا، وعدّاده يشمل كل المباريات
                العالمية الجارية عبر بطولاتنا (مصدر نبض المباشر نفسه). */}
            {liveCount > 0 && (
              <button
                type="button"
                onClick={() => onJump("live-pulse")}
                className="inline-flex items-center gap-2 rounded-full bg-[#DD5C5C] px-4 py-1.5 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
                data-testid="masthead-live-chip"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {liveCount} مباشر الآن
              </button>
            )}
            <span className="text-[12px] text-[#5A7186]">{today} · الرياض <span dir="ltr" className="sbq-mono">GMT+3</span></span>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-6 sm:mt-10">
          <div className="max-w-xl">
            <div className="mb-3 text-[14px] font-semibold text-[#4CBCFD]">البوابة الرياضية</div>
            <h1 className="sbq-display text-[44px] font-extrabold leading-none text-white sm:text-6xl">الرياضة</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#8CA3B5] sm:text-[17px]">
              السبق في الملعب — تغطية تحريرية ولحظية: أخبار ونتائج مباشرة وترتيب وأرقام، بهوية سبق.
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 pb-1">
            <span dir="ltr" className="sbq-mono text-[13px] text-[#5A7186]">
              {liveCount > 0 && <span className="text-[#DD5C5C]">{liveCount} LIVE · </span>}
              {todayCount} TODAY · {compCount} COMPETITIONS
            </span>
          </div>
        </div>

        <nav className="mt-8 flex flex-wrap gap-x-7 gap-y-2 border-t border-white/10 py-4 text-[13.5px] sm:mt-10">
          {nav.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onJump(n.id)}
              className="group inline-flex items-center gap-1.5 text-[#CFE0EC] transition-colors hover:text-white"
            >
              <span className="sbq-mono text-[12px] text-[#4CBCFD]">{n.num}</span> {n.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

// ============================================================
// نبض المباشر — شريط أفقي يظهر فقط حين توجد مباريات جارية عبر كل بطولاتنا.
// بطاقات بيضاء بحدود 1px ودقيقة لحظية بخط Mono، والأحمر الوظيفي للحيّ فقط.
// ============================================================
function liveMinute(f: SpLiveItem): string {
  if (f.status.code === "HT") return "الراحة";
  const e = f.status.elapsed;
  if (e == null) return f.status.label;
  return f.status.extra ? `${e}+${f.status.extra}'` : `${e}'`;
}

function PulseTeamRow({ team, goal }: { team: SpTeam; goal: number | null }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex min-w-0 items-center gap-2">
        {team.logo ? (
          <img src={team.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <span className="truncate text-[13px] font-bold text-foreground">{team.name}</span>
      </span>
      <span className="sbq-mono shrink-0 text-base font-bold text-foreground">{goal ?? 0}</span>
    </div>
  );
}

function LivePulse({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  if (items.length === 0) return null;
  return (
    <div id="live-pulse" className="scroll-mt-16 border-b border-border bg-destructive/[0.05]">
      <div className="mx-auto max-w-[1200px] px-5 py-3.5 sm:px-8">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-destructive">
            <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" /> نبض المباشر
          </span>
          <span className="sbq-mono text-[11px] font-bold text-muted-foreground">{items.length} مباراة</span>
        </div>
        <div className="scrollbar-hide flex gap-2.5 overflow-x-auto pb-1">
          {items.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onOpen(f.id)}
              className="sbq-card-hover w-[212px] shrink-0 rounded-2xl border border-border bg-card p-3 text-right"
              data-testid={`pulse-match-${f.id}`}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="max-w-[120px] truncate text-[10px] font-bold text-muted-foreground">{f.competition}</span>
                <span className="sbq-mono inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-destructive">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" /> {liveMinute(f)}
                </span>
              </div>
              <PulseTeamRow team={f.home} goal={f.goals.home} />
              <PulseTeamRow team={f.away} goal={f.goals.away} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// خبر الـHero الكبير — حاوية 24px، تظليل كحلي 40٪+ فوق الصورة (قاعدة الدليل)،
// عنوان Alexandria أبيض، ووسم دائري: أحمر «عاجل» أو أزرق «الخبر الأبرز».
// ============================================================
function HeroFeature({ article }: { article: ArticleWithDetails }) {
  const img = imgOf(article);
  return (
    <Link
      href={`/article/${article.englishSlug || article.slug}`}
      className="group relative block h-[320px] overflow-hidden rounded-[24px] border border-border bg-card sm:h-[400px] lg:h-[460px]"
    >
      {img ? (
        <>
          <div className="absolute inset-0">
            <OptimizedImage
              src={img}
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              wrapperClassName="w-full h-full"
              objectPosition={getObjectPosition(article)}
              priority
              fetchPriority="high"
            />
          </div>
          <div className="sbq-hero-overlay absolute inset-0" />
        </>
      ) : (
        <RisingBars
          className="absolute -bottom-6 left-6 opacity-[0.16]"
          bars={[70, 120, 180, 240, 140]}
          width={30}
          gap={10}
          colors={["#DCF1FE", "#4CBCFD", "#0E76B8", "#969696", "#4CBCFD"]}
        />
      )}
      <div className={`absolute inset-x-0 bottom-0 p-6 sm:p-8 ${img ? "" : "top-0 flex flex-col justify-end"}`}>
        <div className="mb-3 flex items-center gap-2.5">
          {article.newsType === "breaking" ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#DD5C5C] px-3 py-1 text-[11px] font-bold text-white">
              <Flame className="h-3 w-3" strokeWidth={1.8} /> عاجل
            </span>
          ) : (
            <span className="sbq-action inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold">
              <Trophy className="h-3 w-3" strokeWidth={1.8} /> الخبر الأبرز
            </span>
          )}
          <span className={`sbq-mono flex items-center gap-1 text-[11px] ${img ? "text-white/75" : "text-muted-foreground"}`}>
            <Clock className="h-3 w-3" strokeWidth={1.8} />{timeAgo(article.publishedAt)}
          </span>
        </div>
        <h2 className={`sbq-display text-2xl font-bold leading-snug line-clamp-3 sm:text-4xl ${img ? "text-white" : "text-foreground transition-colors group-hover:text-accent-foreground"}`}>
          {article.title}
        </h2>
        {article.excerpt && (
          <p className={`mt-3 hidden max-w-2xl text-sm leading-relaxed line-clamp-2 sm:block ${img ? "text-white/85" : "text-muted-foreground"}`}>
            {article.excerpt}
          </p>
        )}
      </div>
    </Link>
  );
}

// ============================================================
// لوحة نتائج اليوم — بطاقة بيضاء 24px بترويسة سماوية خفيفة وأرقام Mono.
// ============================================================
function ScoreboardCard({ items, onOpen }: { items: SpLiveItem[]; onOpen: (id: number) => void }) {
  const liveCount = items.filter((f) => f.status.live).length;
  const orderToday = (rows: SpLiveItem[]) =>
    [...rows].sort((a, b) => {
      if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
      if (a.status.finished !== b.status.finished) return a.status.finished ? 1 : -1;
      if (a.status.finished && b.status.finished) return b.timestamp - a.timestamp;
      return a.timestamp - b.timestamp;
    });
  const worldCup = orderToday(items.filter((f) => f.competitionSlug === "world-cup"));
  const others = orderToday(items.filter((f) => f.competitionSlug !== "world-cup"));
  const worldCupShown = worldCup.slice(0, 4);
  const othersShown = others.slice(0, worldCupShown.length > 0 ? 3 : 5);
  const groups = [
    { key: "world-cup", title: "كأس العالم", items: worldCupShown },
    { key: "others", title: "بطولات أخرى", items: othersShown },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="sbq-shadow-1 flex flex-col overflow-hidden rounded-[24px] border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/50 px-5 py-4">
        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
          {liveCount > 0 ? (
            <Radio className="h-4 w-4 text-destructive" strokeWidth={1.8} />
          ) : (
            <CalendarDays className="h-4 w-4 text-accent-foreground" strokeWidth={1.8} />
          )}
          {liveCount > 0 ? "مباشر الآن" : "مباريات اليوم"}
        </span>
        {liveCount > 0 ? (
          <span className="sbq-mono inline-flex items-center gap-1.5 text-[11px] font-bold text-destructive">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" /> {liveCount}
          </span>
        ) : items.length > 0 ? (
          <span className="sbq-mono text-[12px] text-muted-foreground">{items.length}</span>
        ) : null}
      </div>

      {groups.length > 0 ? (
        <div className="scrollbar-hide max-h-[480px] space-y-3 overflow-y-auto p-3">
          {groups.map((group) => (
            <div key={group.key} className="grid gap-2">
              <div className="flex items-center justify-between px-1 text-[11px] font-bold text-foreground">
                <span>{group.title}</span>
                <span className="sbq-mono text-muted-foreground">{group.items.length}</span>
              </div>
              {group.items.map((f) => <TodayCompactRow key={f.id} f={f} onOpen={onOpen} />)}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid place-items-center gap-1 p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="h-6 w-6 opacity-40" strokeWidth={1.8} />
          لا مباريات اليوم — تابع الجولة القادمة من مركز المباريات.
        </div>
      )}

      <Link
        href="/sports/matches"
        className="flex items-center justify-center gap-1 border-t border-border py-3 text-xs font-bold text-accent-foreground transition-colors hover:bg-muted/60"
      >
        كل مباريات اليوم <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

// ============================================================
// بطاقة خبر بنمط بطاقات الدليل: صورة أعلى، وسم دائري سماوي، عنوان،
// وطابع زمني Mono — حد 1px ساكن وظلّ عائم عند التحويم فقط.
// ============================================================
function BrandNewsCard({ article }: { article: ArticleWithDetails }) {
  const img = imgOf(article);
  const breaking = article.newsType === "breaking";
  return (
    <Link
      href={`/article/${article.englishSlug || article.slug}`}
      className="sbq-card-hover group block overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="aspect-[16/10] overflow-hidden bg-muted">
        {img ? (
          <OptimizedImage
            src={img}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            wrapperClassName="w-full h-full"
            objectPosition={getObjectPosition(article)}
          />
        ) : (
          <div className="flex h-full w-full items-end justify-center pb-3">
            <RisingBars bars={[16, 26, 38, 22]} width={9} gap={4} radius={3}
              colors={["#DCF1FE", "#4CBCFD", "#0E76B8", "#969696"]} className="opacity-60" />
          </div>
        )}
      </div>
      <div className="p-4">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${breaking ? "bg-[#DD5C5C] text-white" : "bg-accent text-accent-foreground"}`}>
          {breaking ? "عاجل" : "رياضة"}
        </span>
        <h3 className="mt-2.5 text-[15px] font-bold leading-relaxed text-foreground line-clamp-2 transition-colors group-hover:text-accent-foreground">
          {article.title}
        </h3>
        <div className="sbq-mono mt-2.5 text-[11px] text-muted-foreground">{timeAgo(article.publishedAt)}</div>
      </div>
    </Link>
  );
}

// شريط متابعاتي — وسوم دائرية بحدود 1px، يظهر للمستخدم المتابِع فقط.
function FollowsStrip({ todayMatches, onOpen }: { todayMatches: SpLiveItem[]; onOpen: (id: number) => void }) {
  const { isAuthed, follows } = useSportsFollows();
  const teamFollows = follows.filter((f) => f.kind === "team");
  if (!isAuthed || teamFollows.length === 0) return null;
  const matchOf = (refId: string) => todayMatches.find((m) => String(m.home.id) === refId || String(m.away.id) === refId);

  return (
    <div className="scrollbar-hide mb-6 flex items-center gap-2 overflow-x-auto">
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Star className="h-3.5 w-3.5 fill-[#E8A13D] text-[#E8A13D]" strokeWidth={1.8} /> فِرقي
      </span>
      {teamFollows.map((f) => {
        const m = matchOf(f.refId);
        const live = m?.status.live ?? false;
        const inner = (
          <>
            {f.refLogo ? <img src={f.refLogo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" /> : <span className="h-5 w-5 shrink-0 rounded-full bg-muted" />}
            <span className="whitespace-nowrap text-sm font-bold text-foreground">{f.refName}</span>
            {live && (
              <span className="sbq-mono inline-flex items-center gap-1 text-[10px] font-bold text-destructive">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
                {m!.status.elapsed != null ? `${m!.status.elapsed}'` : "مباشر"}
              </span>
            )}
            {!live && m?.status.finished && (
              <span className="sbq-mono text-[10px] font-bold text-muted-foreground" dir="ltr">{m.goals.home ?? 0}-{m.goals.away ?? 0}</span>
            )}
          </>
        );
        return m ? (
          <button key={f.id} type="button" onClick={() => onOpen(m.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 transition-colors ${live ? "border-destructive/40 bg-destructive/5" : "border-border bg-card hover:border-ring"}`}>
            {inner}
          </button>
        ) : (
          <Link key={f.id} href={`/sports/team/${f.refId}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 transition-colors hover:border-ring">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

// ============================================================
// نظرة الموسم — جاهزية ما قبل الموسم / العطلة (ألوان وظيفية من الدليل).
// ============================================================
type SpSeasonOutlook = {
  phase: "in-season" | "pre-season" | "off-season" | "unknown";
  season: number;
  status: string;
  start: string | null;
  end: string | null;
  champion: { id: number; name: string; logo: string } | null;
  nextSeason: number | null;
  nextSeasonStart: string | null;
  firstKickoff: number | null;
  daysUntilKickoff: number | null;
  openers: SpFixture[];
};

const seasonLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, "0")}`;
const outlookDateFmt = new Intl.DateTimeFormat("ar", {
  calendar: "gregory",
  numberingSystem: "latn",
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Asia/Riyadh",
});

function SeasonOutlookBanner({ outlook, onOpen }: { outlook: SpSeasonOutlook; onOpen: (id: number) => void }) {
  if (outlook.phase === "in-season" || outlook.phase === "unknown") return null;
  const kickoff = outlook.firstKickoff ? outlookDateFmt.format(new Date(outlook.firstKickoff)) : null;

  if (outlook.phase === "off-season") {
    return (
      <div className="sbq-shadow-1 mb-6 rounded-[24px] border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="shrink-0 rounded-2xl bg-[#E8A13D]/15 p-3"><Trophy className="h-7 w-7 text-[#E8A13D]" strokeWidth={1.8} /></div>
          <div className="min-w-0 flex-1">
            <div className="sbq-mono text-[11px] text-muted-foreground">انتهى موسم {seasonLabel(outlook.season)}</div>
            {outlook.champion ? (
              <div className="mt-1 flex items-center gap-2">
                {outlook.champion.logo && <img src={outlook.champion.logo} alt="" className="h-8 w-8 shrink-0 object-contain" />}
                <span className="sbq-display truncate text-lg font-bold text-foreground sm:text-xl">{outlook.champion.name} <span className="text-[#E8A13D]">بطلاً 🏆</span></span>
              </div>
            ) : (
              <div className="sbq-display mt-1 text-lg font-bold text-foreground">في انتظار الموسم الجديد</div>
            )}
            <p className="mt-1.5 text-sm text-muted-foreground">الموسم الجديد قريبًا — يظهر الجدول والعدّ التنازلي والترتيب هنا فور إعلان المواعيد.</p>
          </div>
        </div>
      </div>
    );
  }

  // ما قبل الموسم — عدّ تنازلي + افتتاحيات الجولة الأولى
  return (
    <div className="sbq-shadow-1 mb-6 rounded-[24px] border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="shrink-0 rounded-2xl bg-accent px-5 py-2.5 text-center">
          <div className="sbq-mono text-3xl font-bold leading-none text-accent-foreground sm:text-4xl">{outlook.daysUntilKickoff ?? "—"}</div>
          <div className="mt-1 text-[10px] font-bold text-accent-foreground/80">يومًا</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent-foreground">
            <Flame className="h-3.5 w-3.5" strokeWidth={1.8} /> ينطلق موسم {outlook.nextSeason ? seasonLabel(outlook.nextSeason) : ""}
          </div>
          <h3 className="sbq-display mt-1 text-lg font-bold text-foreground sm:text-xl">العدّ التنازلي بدأ</h3>
          {kickoff && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" strokeWidth={1.8} /> أولى المباريات {kickoff}</p>
          )}
        </div>
      </div>
      {outlook.openers.length > 0 && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {outlook.openers.slice(0, 6).map((f) => (
            <button
              key={f.id}
              onClick={() => onOpen(f.id)}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-colors hover:border-ring"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                {f.home.logo && <img src={f.home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />}
                <span className="truncate text-xs font-bold">{f.home.name}</span>
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">×</span>
              <span className="flex min-w-0 items-center justify-end gap-1.5">
                <span className="truncate text-xs font-bold">{f.away.name}</span>
                {f.away.logo && <img src={f.away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// بانر مركز الانتقالات — لوحة كحلية بموتيف الأعمدة (بأسلوب أغلفة الدليل).
// ============================================================
function TransfersBanner() {
  return (
    <Link
      href="/sports/transfers"
      className="sbq-ink group relative block overflow-hidden rounded-[24px] p-6 sm:p-8"
      data-testid="transfers-banner"
    >
      <RisingBars className="absolute -bottom-5 left-4 opacity-[0.14]" bars={[40, 68, 96, 128, 76]} width={18} gap={7} />
      <div className="relative flex items-center gap-5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#4CBCFD]/15">
          <ArrowLeftRight className="h-7 w-7 text-[#4CBCFD]" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1"><span dir="ltr" className="sbq-mono text-[11px] tracking-[2px] text-[#4CBCFD]">TRANSFER CENTER</span></div>
          <div className="sbq-display text-xl font-bold text-white sm:text-2xl">مركز الانتقالات</div>
          <div className="mt-1 text-sm text-[#8CA3B5]">مَن وصل ومَن غادر في دوري روشن — موجز الصفقات بالنوع والمبلغ عند توفّره</div>
        </div>
        <ChevronLeft className="h-6 w-6 shrink-0 text-[#4CBCFD] transition-transform group-hover:-translate-x-1" strokeWidth={1.8} />
      </div>
    </Link>
  );
}

// ============================================================
// الصفحة
// ============================================================
export default function SportsDashboard() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [openMatch, setOpenMatch] = useState<number | null>(null);
  const [scorersTab, setScorersTab] = useState<"scorers" | "assists" | "cards">("scorers");

  useEffect(() => { document.title = "الرياضة | سبق"; }, []);
  useCanonical("https://sabq.org/sports");
  useBrandFonts();

  const { data: newsRaw, isLoading: newsLoading } = useQuery<ArticleWithDetails[]>({ queryKey: ["/api/categories", "sports", "articles"] });
  const news = Array.isArray(newsRaw) ? newsRaw : [];

  const { data: category } = useQuery<Category>({ queryKey: ["/api/categories/slug", "sports"] });
  const sportsCatId = (category as any)?.id;

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({ queryKey: ["/api/sports/competitions"], staleTime: 60 * 60_000 });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = competitions.find((c) => c.slug === compSlug);
  const hasStandings = comp?.hasStandings ?? compSlug === "pro-league";
  const hasScorers = comp?.hasScorers ?? compSlug === "pro-league";

  const catOf = (c: SpCompetition): SpCompetitionCategory => c.category ?? "saudi";
  const activeCat: SpCompetitionCategory = comp ? catOf(comp) : "saudi";
  const presentCats = COMP_CATEGORY_ORDER.filter((cat) => competitions.some((c) => catOf(c) === cat));
  // داخل الفئة: الجارية أولًا، ثم القادمة، ثم المنتهية (مع الحفاظ على الترتيب الأصلي عند التعادل).
  const compsInActiveCat = competitions
    .filter((c) => catOf(c) === activeCat)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ra = COMP_STATUS_RANK[a.c.status ?? "unknown"];
      const rb = COMP_STATUS_RANK[b.c.status ?? "unknown"];
      return ra !== rb ? ra - rb : a.i - b.i;
    })
    .map(({ c }) => c);

  const { data: matchesData } = useQuery<{ configured: boolean; live: SpFixture[]; today: SpFixture[]; upcoming: SpFixture[]; results: SpFixture[] }>({
    queryKey: [`/api/sports/${compSlug}/matches`],
    // مباراة جارية في البطولة → 8ث (نتيجة لحظية)؛ غير ذلك → 30ث
    refetchInterval: (query) =>
      (query.state.data?.live ?? []).some((f) => f.status.live) ? 8_000 : 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const matchesConfigured = matchesData?.configured ?? true;

  // نظرة الموسم: تكشف العطلة/ما قبل الموسم لإظهار البطل والعدّ التنازلي تلقائيًا.
  const { data: outlookData } = useQuery<{ outlook: SpSeasonOutlook | null }>({
    queryKey: [`/api/sports/${compSlug}/outlook`],
    staleTime: 10 * 60_000,
  });
  const outlook = outlookData?.outlook ?? null;
  const matches = {
    live: Array.isArray(matchesData?.live) ? matchesData!.live : [],
    today: Array.isArray(matchesData?.today) ? matchesData!.today : [],
    upcoming: Array.isArray(matchesData?.upcoming) ? matchesData!.upcoming : [],
    results: Array.isArray(matchesData?.results) ? matchesData!.results : [],
  };

  const { data: todayData } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today"],
    // يوجد مباشر اليوم → 10ث؛ غير ذلك → 30ث
    refetchInterval: (query) =>
      (query.state.data?.today ?? []).some((f) => f.status.live) ? 10_000 : 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];
  const liveCount = todayMatches.filter((f) => f.status.live).length;

  // نبض المباشر: نداء مخصّص أسرع (7ث) لكل المباريات الجارية عبر بطولاتنا —
  // هنا تظهر النتيجة/الدقيقة اللحظية من TheSports فور توفّرها في الإنتاج.
  const { data: liveData } = useQuery<{ live: SpLiveItem[] }>({
    queryKey: ["/api/sports/live"], refetchInterval: 7_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const liveMatches = (Array.isArray(liveData?.live) ? liveData!.live : []).filter((f) => f.status.live);

  const { data: standingsData } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${compSlug}/standings`],
    staleTime: 5 * 60_000,
    enabled: hasStandings,
    // ترتيب مبدئي لحظي مفعّل (صفّ live) → 8ث ليتحرّك الجدول مع المباراة
    refetchInterval: (query) =>
      (query.state.data?.standings ?? []).some((r) => r.live) ? 8_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];

  const { data: scorersData } = useQuery<{ scorers: SpScorer[] }>({ queryKey: [`/api/sports/${compSlug}/scorers`], staleTime: 10 * 60_000, enabled: hasScorers });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  const { data: assistsData } = useQuery<{ assists: SpAssister[] }>({ queryKey: [`/api/sports/${compSlug}/assists`], staleTime: 10 * 60_000, enabled: hasScorers });
  const assisters = Array.isArray(assistsData?.assists) ? assistsData.assists : [];

  const { data: cardsData } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({ queryKey: [`/api/sports/${compSlug}/cards`], staleTime: 10 * 60_000, enabled: hasScorers && scorersTab === "cards" });
  const yellowLeaders = Array.isArray(cardsData?.yellow) ? cardsData.yellow : [];
  const redLeaders = Array.isArray(cardsData?.red) ? cardsData.red : [];

  const { data: shortsByCat } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts", { categoryId: sportsCatId, limit: 12 }], enabled: !!sportsCatId, staleTime: 10 * 60_000 });
  const { data: shortsFeatured } = useQuery<{ shorts: SpShort[] }>({ queryKey: ["/api/shorts/featured", { limit: 12 }], staleTime: 10 * 60_000 });
  const catShorts = Array.isArray(shortsByCat?.shorts) ? shortsByCat.shorts : [];
  const featShorts = Array.isArray(shortsFeatured?.shorts) ? shortsFeatured.shorts : [];
  const videos = (catShorts.length > 0 ? catShorts : featShorts).slice(0, 8);

  // نرتّب بالأحدث: «الخبر الأبرز» يجب أن يكون أحدث خبر فعلاً لا أقدم خبر مثبّت.
  const sortedNews = [...news].sort(byRecency);
  const featured = sortedNews[0];
  const latest = sortedNews.slice(1, 9);

  // عدّاد المباشر الشامل: نبض /api/sports/live يغطي كل بطولاتنا (بما فيها
  // العالمية)، ومباريات اليوم احتياط ريثما يصل أول ردّ من نداء النبض.
  const liveNow = liveMatches.length || liveCount;

  const scrollTo = (id: string) =>
    (document.getElementById(id) ?? document.getElementById("matches"))?.scrollIntoView({ behavior: "smooth", block: "start" });

  // التنقّل المرقّم على الغلاف — بأسلوب فهرس دليل الهوية، حسب الأقسام المتاحة فعلًا.
  const mastNav = [
    { id: "news", num: "٠١", label: "الأخبار", show: true },
    { id: "matches", num: "٠٢", label: "المباريات", show: true },
    { id: "standings", num: "٠٣", label: "الترتيب", show: hasStandings },
    { id: "scorers", num: "٠٤", label: "الهدّافون", show: hasScorers },
    { id: "leaderboard", num: "٠٥", label: "التوقّعات", show: true },
    { id: "media", num: "٠٦", label: "الوسائط", show: news.length > 0 || videos.length > 0 },
  ]
    .filter((n) => n.show)
    .map((n) => ({ id: n.id, num: n.num, label: n.label }));

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />

      <div className="sbq-sport flex flex-1 flex-col bg-background text-foreground">
        <style>{BRAND_CSS}</style>

        <main className="flex-1">
          {/* ===== الغلاف الكحلي — بأسلوب غلاف دليل الهوية ===== */}
          <Masthead
            liveCount={liveNow}
            todayCount={todayMatches.length}
            compCount={competitions.length}
            nav={mastNav}
            onJump={scrollTo}
          />

          {/* ===== نبض المباشر — يظهر فقط حين توجد مباريات جارية ===== */}
          <LivePulse items={liveMatches} onOpen={setOpenMatch} />

          {/* ===== ٠١ الأخبار: خبر بارز + لوحة نتائج، ثم شبكة الأحدث ===== */}
          <section id="news" className="mx-auto max-w-[1200px] scroll-mt-16 px-5 pt-8 sm:px-8 sm:pt-10">
            <FollowsStrip todayMatches={todayMatches} onOpen={setOpenMatch} />

            {newsLoading ? (
              <div className="grid gap-5 lg:grid-cols-3">
                <Skeleton className="min-h-[300px] rounded-[24px] lg:col-span-2 lg:min-h-[460px]" />
                <Skeleton className="min-h-[300px] rounded-[24px] lg:min-h-[460px]" />
              </div>
            ) : news.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
                بانتظار أول الأخبار الرياضية — تظهر هنا فور نشرها.
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
                <div className="lg:col-span-2">{featured && <HeroFeature article={featured} />}</div>
                <ScoreboardCard items={todayMatches} onOpen={setOpenMatch} />
              </div>
            )}

            {/* شبكة أحدث الأخبار */}
            {latest.length > 0 && (
              <div className="mt-12">
                <SectionHead
                  en="01 — NEWS"
                  title="أحدث الأخبار"
                  subtitle="آخر مستجدّات الرياضة لحظة بلحظة"
                  action={brandMoreLink("/category/sports", "كل الأخبار")}
                />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
                  {latest.map((a) => <BrandNewsCard key={a.id} article={a} />)}
                </div>
              </div>
            )}
          </section>

          {/* ===== ٠٢ + ٠٣: مركز المباريات والترتيب — باندة باردة #F4F8FB ===== */}
          <section className="mt-14 border-y border-border bg-muted/70 sm:mt-16">
            <div className="mx-auto max-w-[1200px] space-y-14 px-5 py-12 sm:px-8 sm:py-16">
              <div id="matches" className="scroll-mt-16">
                <SectionHead
                  en="02 — MATCH CENTER"
                  title="مركز المباريات"
                  subtitle="مباشر · اليوم · قادمة · النتائج"
                  action={brandMoreLink("/sports/matches", "مباريات اليوم")}
                />
                {competitions.length > 0 && (
                  <div className="mb-5 space-y-2.5">
                    {presentCats.length > 1 && (
                      <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
                        {presentCats.map((cat) => (
                          <button key={cat}
                            onClick={() => { const first = competitions.find((c) => catOf(c) === cat); if (first) setCompSlug(first.slug); }}
                            className={`shrink-0 whitespace-nowrap rounded-[10px] px-3.5 py-1.5 text-xs font-bold transition-colors ${activeCat === cat ? "bg-foreground text-background" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}>
                            {COMP_CATEGORY_LABELS[cat]}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
                      {compsInActiveCat.map((c) => (
                        <button key={c.slug} onClick={() => setCompSlug(c.slug)}
                          title={c.status ? COMP_STATUS_LABELS[c.status] : undefined}
                          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:px-4 sm:py-2 sm:text-sm ${compSlug === c.slug ? "sbq-action sbq-shadow-1" : "border border-border bg-card text-muted-foreground hover:border-ring"} ${c.status === "finished" && compSlug !== c.slug ? "opacity-60" : ""}`}>
                          {c.status === "ongoing" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2FA36B]" />}
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {comp && (comp.logo || comp.season || (comp.status && comp.status !== "unknown")) && (
                  <div className="mb-5 flex items-center gap-3 px-1">
                    {comp.logo && <img src={comp.logo} alt="" className="h-10 w-10 shrink-0 object-contain" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="sbq-display truncate font-bold text-foreground">{comp.name}</span>
                        {comp.status && comp.status !== "unknown" && comp.status !== "ongoing" && (
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            comp.status === "upcoming" ? "bg-[#E8A13D]/15 text-[#B87A17]" : "bg-muted text-muted-foreground"
                          }`}>
                            {COMP_STATUS_LABELS[comp.status]}
                          </span>
                        )}
                      </div>
                      {comp.season && <div className="sbq-mono text-xs text-muted-foreground">موسم {comp.season}</div>}
                    </div>
                  </div>
                )}
                {outlook && <SeasonOutlookBanner outlook={outlook} onOpen={setOpenMatch} />}
                <MatchHub key={compSlug} data={matches} configured={matchesConfigured} compSlug={compSlug} onOpen={setOpenMatch} />
              </div>

              {hasStandings && (
                <div id="standings" className="scroll-mt-16">
                  <SectionHead en="03 — STANDINGS" title="جدول الترتيب" subtitle="فرز وتصفية مباشرة" />
                  {standings.length ? <StandingsTable rows={standings} /> : (
                    <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">
                      بانتظار انطلاق البطولة — يظهر جدول الترتيب هنا مع بداية الجولة الأولى.
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <div className="mx-auto max-w-[1200px] space-y-14 px-5 py-12 sm:px-8 sm:py-16">
            {/* ٠٤ الهدّافون / صنّاع الأهداف / البطاقات */}
            {hasScorers && (
              <section id="scorers" className="scroll-mt-16">
                <SectionHead
                  en="04 — TOP SCORERS"
                  title={scorersTab === "scorers" ? "منصّة الهدّافين" : scorersTab === "assists" ? "منصّة صنّاع الأهداف" : "متصدّرو البطاقات"}
                  subtitle={scorersTab === "scorers" ? "الأكثر تهديفًا في البطولة" : scorersTab === "assists" ? "الأكثر صناعةً للأهداف" : "الأكثر حصولًا على الإنذارات"}
                  action={
                    <PillTabs layoutId="dash-scorers-tab" active={scorersTab} onChange={(k) => setScorersTab(k as "scorers" | "assists" | "cards")}
                      tabs={[{ key: "scorers", label: "هدّافون" }, { key: "assists", label: "صنّاع الأهداف" }, { key: "cards", label: "البطاقات" }]} />
                  }
                />
                {scorersTab === "scorers" ? (
                  scorers.length ? <PodiumCard entries={scorers.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))} primaryLabel="عدد الأهداف" secondaryLabel="الصناعة" /> : (
                    <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">بانتظار تسجيل أول الأهداف — يظهر ترتيب الهدّافين هنا مع انطلاق المنافسة.</div>
                  )
                ) : scorersTab === "assists" ? (
                  assisters.length ? <PodiumCard entries={assisters.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))} primaryLabel="عدد الصناعات" secondaryLabel="الأهداف" /> : (
                    <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">بانتظار أولى الصناعات — يظهر ترتيب صنّاع الأهداف هنا مع انطلاق المنافسة.</div>
                  )
                ) : (
                  yellowLeaders.length ? <CardLeaders leaders={yellowLeaders} red={redLeaders} /> : (
                    <div className="rounded-2xl border border-dashed border-border bg-card py-14 text-center text-muted-foreground">لا تتوفّر بيانات البطاقات لهذه البطولة بعد.</div>
                  )
                )}
              </section>
            )}

            {/* مركز الانتقالات — بانر كحلي بموتيف الأعمدة */}
            <section id="transfers" className="scroll-mt-16">
              <TransfersBanner />
            </section>

            {/* ٠٥ لوحة المتصدّرين (المجتمع) */}
            <section id="leaderboard" className="scroll-mt-16">
              <SectionHead en="05 — FAN ZONE" title="لوحة المتصدّرين" subtitle="توقّع النتائج ونافِس الجمهور" />
              <LeaderboardBoard />
            </section>

            {/* ٠٦ الوسائط: صور + فيديو */}
            {(news.length > 0 || videos.length > 0) && (
              <section id="media" className="scroll-mt-16 space-y-14">
                {news.length > 0 && (
                  <div>
                    <SectionHead en="06 — MEDIA" title="معرض الرياضة" subtitle="أبرز اللقطات بالصورة" />
                    <ImageGallery articles={news} />
                  </div>
                )}
                {videos.length > 0 && (
                  <div>
                    <SectionHead
                      en={news.length > 0 ? "06.2 — VIDEO" : "06 — VIDEO"}
                      title="فيديو وملخّصات"
                      subtitle="شاهد أحدث المقاطع"
                      action={brandMoreLink("/shorts", "كل الفيديوهات")}
                    />
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {videos.map((v, i) => <VideoReel key={v.id} short={v} index={i} />)}
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ===== خاتمة الهوية — القاعدة الذهبية ===== */}
          <div className="sbq-ink">
            <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
              <div className="sbq-display text-base font-semibold text-white sm:text-lg">الأزرق يقود، الرمادي يخدم، والبياض يتنفّس.</div>
              <span dir="ltr" className="sbq-mono text-[11px] tracking-[2px] text-[#5A7186]">SABQ SPORT · SABQ.ORG</span>
            </div>
          </div>
        </main>
      </div>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
