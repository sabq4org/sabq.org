/**
 * لوحة "مباريات اليوم" — /sports/matches بهوية موقع سبق الفاتحة (مطابقة لـ /sports).
 *
 * ترويسة فاتحة، طبقة تحكّم بالتاريخ والبحث، شريط فلاتر لاصق، ومجموعات بطولات.
 * صفوف المباريات بتصميم نظيف (فريق · نتيجة/شارة · فريق) مجمّعة حسب البطولة.
 *
 *   GET /api/sports/today?date=YYYY-MM-DD
 *   GET /api/sports/competitions
 *   GET /api/sports/match/:id
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Goal,
  Loader2,
  Radio,
  Search,
  SlidersHorizontal,
  Trophy,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import {
  ACCENT,
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  MatchDialog,
  competitionHref,
  type SpCompetition,
  type SpCompetitionCategory,
  type SpLiveItem,
} from "./SportsHub";

/** شريحة هيرو موحّدة — كلها button بنفس الصندوق (Safari يكبّر <a> ويختلف عن span). */
function HeroChip({
  href,
  tone = "muted",
  children,
}: {
  href?: string;
  tone?: "live" | "muted";
  children: React.ReactNode;
}) {
  const [, setLocation] = useLocation();
  const face =
    tone === "live"
      ? "inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 text-[12px] font-bold tabular-nums text-white"
      : "inline-flex items-center gap-1.5 rounded-full bg-muted px-3 text-[12px] font-bold text-muted-foreground";
  return (
    <button
      type="button"
      className={`${face} appearance-none border-0 align-middle ${href ? "cursor-pointer transition-colors hover:bg-primary/10 hover:text-primary" : "cursor-default"}`}
      style={{
        height: 32,
        minHeight: 32,
        maxHeight: 32,
        boxSizing: "border-box",
        lineHeight: 1,
        paddingTop: 0,
        paddingBottom: 0,
        WebkitAppearance: "none",
      }}
      onClick={href ? () => setLocation(href) : undefined}
      tabIndex={href ? 0 : -1}
    >
      {children}
    </button>
  );
}

// ---------- أدوات التاريخ (بتوقيت الرياض) ----------

const RIYADH_TZ = "Asia/Riyadh";

// إيقاع الاستطلاع اللحظي — مطابق لبقية صفحات سبق سبورت (لوحة البطولة/المونديال،
// رفع التأخير في #465): نتيجة لحظية كل 8ث أثناء وجود مباراة جارية، وتهدئة إلى
// 30ث عند غياب المباشر (توفير الحصة)، مع اعتبار اللحظي قديمًا بعد 5ث ليُعاد جلبه
// فورًا عند العودة للتبويب/الشبكة بدل انتظار دورة الاستطلاع التالية.
const LIVE_ACTIVE_MS = 12_000;
const LIVE_IDLE_MS = 30_000;
const TODAY_ACTIVE_MS = 10_000;
const LIVE_STALE_MS = 5_000;

// بطولات تُثبّت أعلى لوحة المباريات بالترتيب (كأس العالم 2026 أولًا).
const PINNED_COMP_SLUGS = ["world-cup"];
const IMPORTANT_COMP_SLUGS = [
  ...PINNED_COMP_SLUGS,
  "pro-league",
  "champions-league",
  "premier-league",
  "la-liga",
  "serie-a",
  "bundesliga",
  "ligue-1",
];
const IMPORTANT_COMP_SET = new Set(IMPORTANT_COMP_SLUGS);

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: RIYADH_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function riyadhToday(): string {
  return ymdFmt.format(new Date());
}

function shiftDate(ymd: string, days: number): string {
  const dt = new Date(`${ymd}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function humanDate(ymd: string): string {
  const dt = new Date(`${ymd}T12:00:00Z`);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dt);
}

function kickoffTime(f: SpLiveItem): string {
  return timeFmt.format(new Date(f.timestamp * 1000));
}

/** تطبيع اسم نادٍ لمطابقة AF ↔ TheSports (الأهلي / الأهلي السعودي). */
function compactTeamLabel(name: string): string {
  return (name || "")
    .toLowerCase()
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/السعودي(ه)?/g, "")
    .replace(/saudi/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "");
}

function teamLabelsMatch(a: string, b: string): boolean {
  const ca = compactTeamLabel(a);
  const cb = compactTeamLabel(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  return ca.length >= 3 && cb.length >= 3 && (ca.includes(cb) || cb.includes(ca));
}

/** نفس المباراة بمعرّفين (موجب AF + سالب TheSports) — موعد + أسماء. */
function sameBoardMatch(a: SpLiveItem, b: SpLiveItem): boolean {
  if (a.id === b.id) return true;
  if (Math.abs(a.timestamp - b.timestamp) > 20 * 60) return false;
  const sameWay =
    teamLabelsMatch(a.home.name, b.home.name) && teamLabelsMatch(a.away.name, b.away.name);
  const swapped =
    teamLabelsMatch(a.home.name, b.away.name) && teamLabelsMatch(a.away.name, b.home.name);
  return sameWay || swapped;
}

/** ركّب نتيجة/حالة المباشر على صفّ اليوم مع الإبقاء على معرّف AF للروابط. */
function foldLiveOntoToday(todayItem: SpLiveItem, liveItem: SpLiveItem): SpLiveItem {
  return {
    ...todayItem,
    goals: liveItem.goals,
    penalties: liveItem.penalties ?? todayItem.penalties,
    status: liveItem.status,
    competition: todayItem.competition || liveItem.competition,
    competitionSlug: todayItem.competitionSlug || liveItem.competitionSlug,
  };
}

function mergeLiveMatches(today: SpLiveItem[], live: SpLiveItem[], includeLive: boolean): SpLiveItem[] {
  if (!includeLive || live.length === 0) return today;

  const liveById = new Map(live.map((m) => [m.id, m]));
  const consumedLiveIds = new Set<number>();
  const merged = today.map((m) => {
    const byId = liveById.get(m.id);
    if (byId) {
      consumedLiveIds.add(byId.id);
      return byId;
    }
    const byIdentity = live.find((l) => !consumedLiveIds.has(l.id) && sameBoardMatch(m, l));
    if (byIdentity) {
      consumedLiveIds.add(byIdentity.id);
      return foldLiveOntoToday(m, byIdentity);
    }
    return m;
  });

  for (const m of live) {
    if (consumedLiveIds.has(m.id)) continue;
    if (merged.some((t) => sameBoardMatch(t, m))) continue;
    merged.push(m);
  }

  return merged.sort((a, b) => {
    if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
    return a.timestamp - b.timestamp;
  });
}

// ---------- الحالة ----------

type MatchState = "upcoming" | "live" | "finished";

function stateOf(f: SpLiveItem): MatchState {
  if (f.status.live) return "live";
  if (f.status.finished) return "finished";
  return "upcoming";
}

// ترتيب العرض: المباشر أولًا، ثم القادمة (الأبكر موعدًا)، ثم المنتهية في الأسفل
// (الأحدث انتهاءً أولًا ضمن المنتهية). يمنع بقاء المباريات المنتهية أعلى القائمة.
function orderRank(f: SpLiveItem): number {
  if (f.status.live) return 0;
  if (f.status.finished) return 2;
  return 1;
}

function compareMatches(a: SpLiveItem, b: SpLiveItem): number {
  const ra = orderRank(a);
  const rb = orderRank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 2) return b.timestamp - a.timestamp; // المنتهية: الأحدث أولًا
  return a.timestamp - b.timestamp; // المباشر/القادمة: الأبكر موعدًا أولًا
}

function liveClockLabel(f: SpLiveItem): string {
  if (f.status.elapsed == null) return "مباشر";
  const extra = f.status.extra ? `+${f.status.extra}` : "";
  return `${f.status.elapsed}${extra}'`;
}

const STATE_FILTERS: { key: "all" | MatchState; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "live", label: "جارية الآن" },
  { key: "upcoming", label: "لم تبدأ" },
  { key: "finished", label: "انتهت" },
];

const LENSES: { key: "all" | "live" | "favorites" | SpCompetitionCategory; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "live", label: "مباشر" },
  { key: "favorites", label: "الأهم" },
  { key: "saudi", label: "السعودية" },
  { key: "european", label: "أوروبا" },
  { key: "world", label: "العالمية" },
  { key: "gulf", label: "الخليج" },
  { key: "arab", label: "العربية" },
];

// ---------- أنواع تفاصيل المباراة (لمسجّلي الأهداف) ----------

interface BoardMatchEvent {
  minute: number | null;
  extra: number | null;
  teamId: number;
  team: string;
  player: string;
  assist: string | null;
  type: string;
  label: string;
}
interface BoardMatchDetail {
  fixture: SpLiveItem;
  events: BoardMatchEvent[];
}

function eventMinute(e: BoardMatchEvent): string {
  if (e.minute == null) return "";
  return e.extra ? `${e.minute}+${e.extra}'` : `${e.minute}'`;
}

// ---------- أحداث المباراة: أهداف + كروت (تُحمّل عند التوسيع) ----------

// الأحداث المعروضة: أهداف (بما فيها ركلة جزاء/عكسي) + بطاقات + ركلة جزاء ضائعة.
const SHOWN_EVENT_TYPES = new Set(["goal", "missed-penalty", "yellow-card", "red-card"]);

// علامة الحدث: كرة للهدف، مستطيل أصفر/أحمر للبطاقة.
function EventMark({ type }: { type: string }) {
  if (type === "yellow-card") {
    return <span className="inline-block w-[11px] h-[15px] rounded-[2px] bg-yellow-400 shadow-sm" />;
  }
  if (type === "red-card") {
    return <span className="inline-block w-[11px] h-[15px] rounded-[2px] bg-red-500 shadow-sm" />;
  }
  if (type === "missed-penalty") {
    return <span className="text-sm leading-none">❌</span>;
  }
  return <Goal className="w-4 h-4 text-emerald-500" />;
}

function MatchScorers({ fixture }: { fixture: SpLiveItem }) {
  const { data, isLoading } = useQuery<BoardMatchDetail>({
    queryKey: [`/api/sports/match/${fixture.id}`],
    staleTime: LIVE_STALE_MS,
    refetchInterval: fixture.status.live ? LIVE_ACTIVE_MS : false,
    refetchOnWindowFocus: true,
  });

  // أهداف + كروت مرتّبة بالدقيقة في قائمة واحدة محاذاة لليمين.
  const events = useMemo(() => {
    const rows = Array.isArray(data?.events) ? data!.events.filter((e) => SHOWN_EVENT_TYPES.has(e.type)) : [];
    return [...rows].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.extra ?? 0) - (b.extra ?? 0));
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground bg-muted/30">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل تفاصيل المباراة…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground bg-muted/30">
        {fixture.status.finished ? "لا توجد أهداف أو بطاقات في هذه المباراة." : "لم تُسجَّل أهداف أو بطاقات بعد."}
      </div>
    );
  }

  const teamOf = (teamId: number) =>
    teamId === fixture.home.id ? fixture.home : teamId === fixture.away.id ? fixture.away : null;

  return (
    <ul className="bg-muted/30 px-3 py-1.5 sm:px-4" dir="rtl">
      {events.map((e, i) => {
        const team = teamOf(e.teamId);
        return (
          <li key={i} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-b-0">
            {/* علامة الحدث (هدف/بطاقة) */}
            <span className="shrink-0 w-5 grid place-items-center">
              <EventMark type={e.type} />
            </span>
            {/* اسم اللاعب (+ توصيف خاص: ركلة جزاء/عكسي + صناعة) */}
            <span className="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">
              {e.player}
              {e.type === "goal" && e.label && e.label !== "هدف" && (
                <span className="mr-1 text-[10px] font-normal text-muted-foreground">({e.label})</span>
              )}
              {e.assist && (
                <span className="mr-1 text-[10px] font-normal text-muted-foreground">صناعة {e.assist}</span>
              )}
            </span>
            {/* الوقت */}
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">{eventMinute(e)}</span>
            {/* علم/شعار المنتخب أو اسم الفريق */}
            <span className="shrink-0 w-16 flex items-center justify-end gap-1">
              {team?.logo ? (
                <img src={team.logo} alt={team.name} title={team.name} className="w-5 h-5 object-contain" loading="lazy" />
              ) : (
                <span className="truncate text-[10px] text-muted-foreground">{team?.name || e.team}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- صف المباراة — الشعارات بجانب الوقت، الأسماء على الأطراف ----------

function TeamLogo({ src, name }: { src: string | null | undefined; name: string }) {
  if (src) {
    return (
      <img src={src} alt="" title={name} className="h-7 w-7 shrink-0 object-contain sm:h-8 sm:w-8" loading="lazy" />
    );
  }
  return <span className="h-7 w-7 shrink-0 rounded-full bg-muted sm:h-8 sm:w-8" />;
}

export function MatchRow({
  f,
  expanded,
  onToggle,
  onOpen,
  flat: _flat = false,
}: {
  f: SpLiveItem;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: number) => void;
  /** محفوظ للتوافق مع /sports/live — التصميم موحّد الآن */
  flat?: boolean;
}) {
  const st = stateOf(f);
  const decided = st === "live" || st === "finished";
  const hg = f.goals.home;
  const ag = f.goals.away;
  const pen = f.penalties;
  const penHome = pen?.home;
  const penAway = pen?.away;
  const hasPens = decided && penHome != null && penAway != null && penHome !== penAway;
  const homeWon = (decided && hg != null && ag != null && hg > ag) || (hasPens && penHome! > penAway!);
  const awayWon = (decided && hg != null && ag != null && ag > hg) || (hasPens && penAway! > penHome!);
  const isLive = st === "live";

  const prevScore = useRef<string>(`${hg}-${ag}`);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const sig = `${hg}-${ag}`;
    if (prevScore.current !== sig) {
      const wasDecided = prevScore.current !== "null-null";
      prevScore.current = sig;
      if (wasDecided && isLive) {
        setFlash(true);
        const t = setTimeout(() => setFlash(false), 2200);
        return () => clearTimeout(t);
      }
    }
  }, [hg, ag, isLive]);

  // شبكة ثابتة LTR: اسم | شعار | وقت | شعار | اسم
  // الشعارات ملاصقة للكبسولة في الوسط، والأسماء على الحافتين.
  return (
    <div className="relative">
      <div
        className={`grid grid-cols-[minmax(0,1fr)_auto_auto_auto_minmax(0,1fr)] items-center gap-x-2 px-4 py-3.5 transition-colors sm:gap-x-3 sm:px-5 ${
          flash ? "bg-emerald-500/15" : "hover:bg-muted/30"
        }`}
        dir="ltr"
      >
        <Link
          href={`/sports/team/${f.away.id}`}
          className={`min-w-0 truncate text-start text-sm sm:text-[15px] text-foreground ${
            awayWon ? "font-bold" : "font-normal"
          }`}
          dir="auto"
        >
          {f.away.name}
        </Link>

        <Link href={`/sports/team/${f.away.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
          <TeamLogo src={f.away.logo} name={f.away.name} />
        </Link>

        <button
          type="button"
          onClick={() => onOpen(f.id)}
          className="flex shrink-0 flex-col items-center gap-0.5"
          title="تفاصيل المباراة"
        >
          {decided && hg != null && ag != null ? (
            <>
              <span
                className={`inline-flex min-w-[3.5rem] items-center justify-center rounded-full px-3 py-1.5 text-sm font-bold tabular-nums leading-none ${
                  isLive ? "bg-red-600 text-white" : "bg-muted text-foreground"
                }`}
              >
                {ag} – {hg}
              </span>
              {hasPens ? (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400" dir="rtl">
                  ترجيح <span dir="ltr">{Math.max(penHome!, penAway!)}-{Math.min(penHome!, penAway!)}</span>
                </span>
              ) : isLive ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  {liveClockLabel(f)}
                </span>
              ) : (
                <span className="text-[10px] font-medium text-muted-foreground" dir="rtl">
                  {f.status.label || "انتهت"}
                </span>
              )}
            </>
          ) : (
            <span className="inline-flex min-w-[3.5rem] items-center justify-center rounded-full bg-muted px-3 py-1.5 text-sm font-bold tabular-nums leading-none text-foreground">
              {kickoffTime(f)}
            </span>
          )}
        </button>

        <Link href={`/sports/team/${f.home.id}`} className="shrink-0" tabIndex={-1} aria-hidden>
          <TeamLogo src={f.home.logo} name={f.home.name} />
        </Link>

        <Link
          href={`/sports/team/${f.home.id}`}
          className={`min-w-0 truncate text-end text-sm sm:text-[15px] text-foreground ${
            homeWon ? "font-bold" : "font-normal"
          }`}
          dir="auto"
        >
          {f.home.name}
        </Link>
      </div>

      {decided ? (
        <button
          type="button"
          onClick={onToggle}
          className={`absolute start-1 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full transition-colors sm:start-2 ${
            expanded ? "bg-primary/10 text-primary" : "text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          }`}
          title="مسجّلو الأهداف"
          aria-label="مسجّلو الأهداف"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      ) : null}

      {expanded && decided && <MatchScorers fixture={f} />}
    </div>
  );
}

// ---------- مجموعة بطولة ----------

function CompetitionGroup({
  name,
  logo,
  slug,
  category,
  matches,
  expandedIds,
  collapsed,
  toggle,
  onToggleGroup,
  onOpen,
}: {
  name: string;
  logo: string | null;
  slug: string | null;
  category: SpCompetitionCategory | null;
  matches: SpLiveItem[];
  expandedIds: Set<number>;
  collapsed: boolean;
  toggle: (id: number) => void;
  onToggleGroup: () => void;
  onOpen: (id: number) => void;
}) {
  const liveCount = matches.filter((m) => m.status.live).length;
  const subtitle = [
    category ? COMP_CATEGORY_LABELS[category] : null,
    `${matches.length} مباراة`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onToggleGroup}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={collapsed ? "إظهار مباريات البطولة" : "إخفاء مباريات البطولة"}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} strokeWidth={2} />
        </button>
        {logo ? (
          <img src={logo} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Trophy className={`h-3.5 w-3.5 ${ACCENT}`} strokeWidth={1.8} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {slug ? (
            <Link
              href={competitionHref(slug)}
              className="block truncate text-sm font-bold text-foreground transition-colors hover:text-primary"
              title={`صفحة بطولة ${name}`}
            >
              {name}
            </Link>
          ) : (
            <h2 className="truncate text-sm font-bold text-foreground">{name}</h2>
          )}
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-red-600">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
            {liveCount} مباشر
          </span>
        ) : null}
      </div>
      {!collapsed && (
        <ul className="divide-y divide-border">
          {matches.map((m) => (
            <li key={m.id}>
              <MatchRow
                f={m}
                expanded={expandedIds.has(m.id)}
                onToggle={() => toggle(m.id)}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------- الصفحة ----------

export default function SportsMatchesBoard() {
  const { user } = useAuth();
  const [date, setDate] = useState<string>(() => riyadhToday());
  const [stateFilter, setStateFilter] = useState<"all" | MatchState>("all");
  const [catFilter, setCatFilter] = useState<"all" | SpCompetitionCategory>("all");
  const [lens, setLens] = useState<(typeof LENSES)[number]["key"]>("all");
  const [compFilter, setCompFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [groupByComp, setGroupByComp] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  const today = riyadhToday();
  const isToday = date === today;

  useEffect(() => {
    document.title = "مباريات اليوم | سبق";
  }, []);
  useCanonical("https://sabq.org/sports/matches");

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({
    queryKey: ["/api/sports/competitions"],
    staleTime: 60 * 60_000,
  });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const compMeta = useMemo(() => {
    const map = new Map<string, SpCompetition>();
    for (const c of competitions) map.set(c.slug, c);
    return map;
  }, [competitions]);

  const { data: todayData, isLoading, refetch: refetchToday } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today", { date }],
    staleTime: isToday ? LIVE_STALE_MS : LIVE_IDLE_MS,
    // يوم اليوم: يوجد مباشر → 10ث، غير ذلك → 30ث؛ يوم آخر (ماضٍ/قادم): بلا استطلاع
    refetchInterval: isToday
      ? (query) => ((query.state.data?.today ?? []).some((f) => f.status.live) ? TODAY_ACTIVE_MS : LIVE_IDLE_MS)
      : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const todayMatches = Array.isArray(todayData?.today) ? todayData!.today : [];

  const { data: liveData, isFetching: isLiveFetching, refetch: refetchLive } = useQuery<{ live: SpLiveItem[] }>({
    queryKey: ["/api/sports/live"],
    enabled: isToday,
    staleTime: LIVE_STALE_MS,
    // مباراة جارية → 8ث (نتيجة لحظية)؛ لا مباشر → 30ث (تهدئة)
    refetchInterval: (query) =>
      (query.state.data?.live ?? []).some((f) => f.status.live) ? LIVE_ACTIVE_MS : LIVE_IDLE_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const liveMatches = Array.isArray(liveData?.live) ? liveData!.live : [];
  const allMatches = useMemo(
    () => mergeLiveMatches(todayMatches, liveMatches, isToday),
    [todayMatches, liveMatches, isToday]
  );

  // تحديث فوري عند عودة المستخدم للتبويب/الشبكة — مهمّ على الجوال حيث يُجمَّد التبويب.
  useEffect(() => {
    if (!isToday) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      refetchToday();
      refetchLive();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [isToday, refetchToday, refetchLive]);

  // الفئات الموجودة فعلاً ضمن مباريات اليوم.
  const presentCats = useMemo(() => {
    const present = new Set<SpCompetitionCategory>();
    for (const m of allMatches) {
      const cat = m.competitionSlug ? compMeta.get(m.competitionSlug)?.category : undefined;
      if (cat) present.add(cat);
    }
    return COMP_CATEGORY_ORDER.filter((c) => present.has(c));
  }, [allMatches, compMeta]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return allMatches.filter((m) => {
      if (lens === "live" && !m.status.live) return false;
      if (lens === "favorites" && !(m.competitionSlug && IMPORTANT_COMP_SET.has(m.competitionSlug))) return false;
      if (lens !== "all" && lens !== "live" && lens !== "favorites") {
        const cat = m.competitionSlug ? compMeta.get(m.competitionSlug)?.category : undefined;
        if (cat !== lens) return false;
      }
      if (compFilter !== "all" && m.competitionSlug !== compFilter) return false;
      if (stateFilter !== "all" && stateOf(m) !== stateFilter) return false;
      if (catFilter !== "all") {
        const cat = m.competitionSlug ? compMeta.get(m.competitionSlug)?.category : undefined;
        if (cat !== catFilter) return false;
      }
      if (q) {
        const hay = `${m.home.name} ${m.away.name} ${m.competition}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allMatches, lens, compFilter, stateFilter, catFilter, search, compMeta]);

  // التجميع حسب البطولة (مع ترتيب المباريات بالوقت داخل كل مجموعة).
  const groups = useMemo(() => {
    const byComp = new Map<string, SpLiveItem[]>();
    for (const m of filtered) {
      const key = m.competition || "أخرى";
      if (!byComp.has(key)) byComp.set(key, []);
      byComp.get(key)!.push(m);
    }
    return Array.from(byComp.entries()).map(([name, matches]) => {
      const sorted = [...matches].sort(compareMatches);
      const slug = sorted[0]?.competitionSlug ?? null;
      const meta = slug ? compMeta.get(slug) : undefined;
      const liveCount = matches.filter((m) => m.status.live).length;
      return {
        name,
        matches: sorted,
        logo: meta?.logo ?? null,
        slug,
        category: meta?.category ?? null,
        liveCount,
      };
    });
  }, [filtered, compMeta]);

  // ترتيب المجموعات: البطولات المثبّتة (كأس العالم) أولًا دائمًا، ثم الأكثر
  // مباريات مباشرة، ثم أبكر موعد.
  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const ap = a.slug && PINNED_COMP_SLUGS.includes(a.slug) ? PINNED_COMP_SLUGS.indexOf(a.slug) : 99;
        const bp = b.slug && PINNED_COMP_SLUGS.includes(b.slug) ? PINNED_COMP_SLUGS.indexOf(b.slug) : 99;
        if (ap !== bp) return ap - bp;
        if (a.liveCount !== b.liveCount) return b.liveCount - a.liveCount;
        return (a.matches[0]?.timestamp ?? 0) - (b.matches[0]?.timestamp ?? 0);
      }),
    [groups]
  );

  // قائمة مسطّحة بالوقت.
  const flat = useMemo(() => [...filtered].sort(compareMatches), [filtered]);

  const liveTotal = allMatches.filter((m) => m.status.live).length;

  const matchLensCount = (key: (typeof LENSES)[number]["key"]) =>
    allMatches.filter((m) => {
      if (key === "all") return true;
      if (key === "live") return m.status.live;
      if (key === "favorites") return m.competitionSlug ? IMPORTANT_COMP_SET.has(m.competitionSlug) : false;
      return m.competitionSlug ? compMeta.get(m.competitionSlug)?.category === key : false;
    }).length;

  const presentCompetitions = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; logo: string | null; count: number; live: number }>();
    for (const m of allMatches) {
      if (!m.competitionSlug) continue;
      const meta = compMeta.get(m.competitionSlug);
      const current = map.get(m.competitionSlug) ?? {
        slug: m.competitionSlug,
        name: m.competition || meta?.name || "بطولة",
        logo: meta?.logo ?? null,
        count: 0,
        live: 0,
      };
      current.count += 1;
      if (m.status.live) current.live += 1;
      map.set(m.competitionSlug, current);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.live !== b.live) return b.live - a.live;
      if (a.count !== b.count) return b.count - a.count;
      return a.name.localeCompare(b.name, "ar");
    });
  }, [allMatches, compMeta]);

  // شرائح البطولات ضمن نطاق العدسة المختار — العدسة = النطاق، الشرائح = التنقّل
  // داخله (نفس نموذج تطبيق iOS: صفّ فلترة واحد بلا تكرار).
  const scopedCompetitions = useMemo(() => {
    return presentCompetitions.filter((c) => {
      if (lens === "all") return true;
      if (lens === "live") return c.live > 0;
      if (lens === "favorites") return IMPORTANT_COMP_SET.has(c.slug);
      return compMeta.get(c.slug)?.category === lens;
    });
  }, [presentCompetitions, lens, compMeta]);

  const activeLensLabel = LENSES.find((l) => l.key === lens)?.label ?? "الكل";

  const toggle = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* هيدر الموقع غير لاصق — يمرّ طبيعيًا ويختفي عند النزول لتحرير المساحة */}
      <Header user={user || undefined} sticky={false} />

      <main className="flex-1">
          {/* ===== ترويسة — عبارة كبيرة في المنتصف بأسلوب /sabq-ai ===== */}
          <section className="border-b border-border bg-card px-4 pt-10 pb-8 text-center sm:pt-12 sm:pb-9" data-testid="matches-hero">
            <span className="mb-4 inline-block rounded-full border border-primary/20 bg-primary/10 px-5 py-1.5 text-xs font-bold text-primary md:text-[13px]">
              لوحة المباريات — كل بطولاتنا في يومٍ واحد
            </span>
            <h1 className="mx-auto max-w-2xl text-balance text-3xl font-extrabold leading-[1.4] text-foreground md:text-4xl">
              كل مبارياتنا اليوم… <span className="text-primary">لحظة بلحظة</span>
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              مرتّبة بالوقت ومجمّعة حسب البطولة — نتيجة لحظية ومسجّلو أهداف فور التسجيل.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {liveTotal > 0 && (
                <HeroChip tone="live">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" />
                  {liveTotal} مباشر الآن
                </HeroChip>
              )}
              {isToday && (
                <HeroChip>
                  {isLiveFetching
                    ? <Loader2 className="h-2 w-2 shrink-0 animate-spin text-red-500" strokeWidth={2.6} />
                    : <Radio className="h-2 w-2 shrink-0 text-red-500" strokeWidth={2.6} />}
                  تحديث تلقائي
                </HeroChip>
              )}
              <HeroChip href="/sports/live">
                <Radio className="h-2 w-2 shrink-0 text-red-500" strokeWidth={2.6} />
                البث المباشر · العالم
              </HeroChip>
              <HeroChip href="/sports">
                البوابة الرياضية
                <ChevronLeft className="h-2 w-2 shrink-0" strokeWidth={2.6} />
              </HeroChip>
            </div>
          </section>

          {/* ===== طبقة التحكم: التاريخ + البحث ===== */}
          <div className="border-b border-border bg-card">
            <div className="mx-auto max-w-[1200px] px-4 py-3 sm:px-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="grid w-full grid-cols-[40px_minmax(0,1fr)_40px_auto] items-center gap-1 sm:flex sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setDate((d) => shiftDate(d, -1))}
                    className="grid h-10 w-10 place-items-center rounded-[10px] border border-border bg-card transition-colors hover:border-ring sm:h-9 sm:w-9"
                    aria-label="اليوم السابق"
                  >
                    <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                  <div className="min-w-0 px-2 text-center sm:min-w-[150px] sm:px-3">
                    <div className="truncate text-sm font-black text-foreground">{humanDate(date)}</div>
                    <div className="text-[10px] tabular-nums text-muted-foreground" dir="ltr">{date}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDate((d) => shiftDate(d, 1))}
                    className="grid h-10 w-10 place-items-center rounded-[10px] border border-border bg-card transition-colors hover:border-ring sm:h-9 sm:w-9"
                    aria-label="اليوم التالي"
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
                  </button>
                  {!isToday && (
                    <button
                      type="button"
                      onClick={() => setDate(today)}
                      className="mr-0 h-10 rounded-[10px] bg-primary px-3 text-xs font-bold text-white transition-opacity hover:opacity-90 sm:mr-1 sm:h-9"
                    >
                      اليوم
                    </button>
                  )}
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className="col-span-4 mt-1 h-10 rounded-[10px] border border-border bg-card px-2 text-xs tabular-nums text-foreground sm:col-span-1 sm:mt-0 sm:mr-1 sm:h-9"
                  />
                </div>

                {/* البحث */}
                <div className="relative w-full sm:min-w-[180px] sm:max-w-xs sm:flex-1">
                  <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="ابحث عن فريق أو بطولة…"
                    className="h-10 w-full rounded-[10px] border border-border bg-card pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40 sm:h-9"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* شريط الفلاتر وحده لاصق أعلى الشاشة — يبقى عند النزول لتحرير المساحة */}
          <div className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
            <div className="mx-auto max-w-[1200px] px-4 py-2 sm:px-6 sm:py-2.5">
              <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black transition-colors sm:min-h-0 ${
                        lens !== "all"
                          ? "bg-primary text-white shadow-sm"
                          : "bg-card text-primary ring-1 ring-border hover:bg-primary/10"
                      }`}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      {activeLensLabel}
                      <ChevronDown className="h-3 w-3 opacity-80" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[11rem]">
                    <DropdownMenuLabel className="text-[11px] font-black text-primary">عدسة المباريات</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuRadioGroup
                      value={lens}
                      onValueChange={(v) => {
                        const key = v as (typeof LENSES)[number]["key"];
                        setLens(key);
                        setCompFilter("all");
                        if (key !== "all" && key !== "live" && key !== "favorites") setCatFilter("all");
                      }}
                    >
                      {LENSES.map((item) => (
                        <DropdownMenuRadioItem key={item.key} value={item.key} className="text-xs font-bold">
                          <span className="flex-1">{item.label}</span>
                          <span className="ml-2 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                            {matchLensCount(item.key).toLocaleString("en")}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {scopedCompetitions.length > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />}

                {scopedCompetitions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCompFilter("all")}
                    className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${
                      compFilter === "all" ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
                    }`}
                  >
                    كل البطولات
                  </button>
                )}
                {scopedCompetitions.map((comp) => {
                  const active = compFilter === comp.slug;
                  return (
                    <button
                      key={comp.slug}
                      type="button"
                      onClick={() => setCompFilter(comp.slug)}
                      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${
                        active ? "bg-foreground text-background" : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
                      }`}
                    >
                      {comp.logo && <img src={comp.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" />}
                      {comp.name}
                      <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-white/15" : "bg-muted"}`}>
                        {comp.live > 0 ? `${comp.live} مباشر` : comp.count.toLocaleString("en")}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide sm:pb-0">
                <div className="flex items-center gap-1 rounded-[10px] bg-muted p-0.5 shrink-0">
                  {STATE_FILTERS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStateFilter(s.key)}
                      className={`min-h-9 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${stateFilter === s.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {s.key === "live" && stateFilter !== "live" && liveTotal > 0 && (
                        <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 align-middle" />
                      )}
                      {s.label}
                    </button>
                  ))}
                </div>

                {presentCats.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="mx-1 h-5 w-px bg-border" />
                    <button
                      type="button"
                      onClick={() => setCatFilter("all")}
                      className={`min-h-9 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${catFilter === "all" ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:border-primary/40"}`}
                    >
                      كل الفئات
                    </button>
                    {presentCats.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCatFilter(cat)}
                        className={`min-h-9 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${catFilter === cat ? "bg-primary text-white" : "border border-border bg-card text-muted-foreground hover:border-primary/40"}`}
                      >
                        {COMP_CATEGORY_LABELS[cat]}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mr-auto flex shrink-0 items-center gap-1 rounded-[10px] bg-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => setGroupByComp(true)}
                    className={`min-h-9 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${groupByComp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    حسب البطولة
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupByComp(false)}
                    className={`min-h-9 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors sm:min-h-0 ${!groupByComp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    حسب الوقت
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* المحتوى — الجدول بالتصميم الجديد فقط */}
          <div className="mx-auto max-w-[1200px] px-4 py-4 sm:px-6 sm:py-6">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> جارٍ تحميل المباريات…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card py-20 text-center text-muted-foreground">
                <CalendarDays className="mx-auto mb-3 h-10 w-10 opacity-40" strokeWidth={1.8} />
                {allMatches.length === 0
                  ? "لا توجد مباريات في هذا اليوم ضمن بطولاتنا."
                  : "لا توجد مباريات مطابقة للفلاتر المختارة."}
              </div>
            ) : groupByComp ? (
              <div className="space-y-4">
                {sortedGroups.map((g) => (
                  <CompetitionGroup
                    key={g.name}
                    name={g.name}
                    logo={g.logo}
                    slug={g.slug}
                    category={g.category}
                    matches={g.matches}
                    expandedIds={expandedIds}
                    collapsed={collapsedGroups.has(g.slug ?? g.name)}
                    toggle={toggle}
                    onToggleGroup={() => toggleGroup(g.slug ?? g.name)}
                    onOpen={setOpenMatch}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border">
                {flat.map((m) => (
                  <div key={m.id}>
                    {m.competitionSlug ? (
                      <Link
                        href={competitionHref(m.competitionSlug)}
                        className="flex w-fit items-center gap-1 px-4 pt-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:text-primary"
                      >
                        {m.competition}
                        <ChevronLeft className="w-3 h-3" strokeWidth={1.8} />
                      </Link>
                    ) : (
                      <div className="px-4 pt-2.5 text-[11px] font-bold text-muted-foreground">
                        {m.competition}
                      </div>
                    )}
                    <MatchRow
                      f={m}
                      expanded={expandedIds.has(m.id)}
                      onToggle={() => toggle(m.id)}
                      onOpen={setOpenMatch}
                    />
                  </div>
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
