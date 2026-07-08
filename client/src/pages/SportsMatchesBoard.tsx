/**
 * لوحة "مباريات اليوم" — /sports/matches بهوية موقع سبق الفاتحة (مطابقة لـ /sports).
 *
 * ترويسة فاتحة (أيقونة بخلفية زرقاء + عنوان + وصف)، طبقة تحكّم بالتاريخ والبحث،
 * شريط فلاتر لاصق، ومجموعات بطولات ببطاقات فاتحة وترويسة رمادية خفيفة. الأزرق
 * الأساسي للتمييز والأحمر للمباشر، بدون أسطح كحلية غامقة أو خطوط خاصة.
 *
 * كل مباريات اليوم عبر بطولاتنا، مرتّبة بالوقت ومجمّعة حسب البطولة، مع توسيع
 * كل مباراة لإظهار الأهداف والبطاقات. فلترة: التاريخ، الحالة، الفئة، البحث،
 * وطريقة العرض (حسب البطولة / حسب الوقت).
 *
 * تستهلك نفس مصادر البوابة الرياضية /sports دون أي اعتماد جديد:
 *   GET /api/sports/today?date=YYYY-MM-DD   (لوحة اليوم)
 *   GET /api/sports/competitions            (شعار/فئة/حالة لكل بطولة)
 *   GET /api/sports/match/:id               (مسجّلو الأهداف عند التوسيع)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
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

// ---------- أدوات التاريخ (بتوقيت الرياض) ----------

const RIYADH_TZ = "Asia/Riyadh";

// إيقاع الاستطلاع اللحظي — مطابق لبقية صفحات سبق سبورت (لوحة البطولة/المونديال،
// رفع التأخير في #465): نتيجة لحظية كل 8ث أثناء وجود مباراة جارية، وتهدئة إلى
// 30ث عند غياب المباشر (توفير الحصة)، مع اعتبار اللحظي قديمًا بعد 5ث ليُعاد جلبه
// فورًا عند العودة للتبويب/الشبكة بدل انتظار دورة الاستطلاع التالية.
const LIVE_ACTIVE_MS = 8_000;
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

function mergeLiveMatches(today: SpLiveItem[], live: SpLiveItem[], includeLive: boolean): SpLiveItem[] {
  if (!includeLive || live.length === 0) return today;

  const liveById = new Map(live.map((m) => [m.id, m]));
  const seen = new Set<number>();
  const merged = today.map((m) => {
    seen.add(m.id);
    return liveById.get(m.id) ?? m;
  });

  for (const m of live) {
    if (!seen.has(m.id)) merged.push(m);
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

function livePhaseLabel(f: SpLiveItem): string {
  if (f.status.label && f.status.label !== f.status.code) return f.status.label;
  if (f.status.code === "1H") return "الشوط الأول";
  if (f.status.code === "2H") return "الشوط الثاني";
  if (f.status.code === "HT") return "استراحة الشوطين";
  return "مباشر";
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

// ---------- صف المباراة ----------

export function MatchRow({
  f,
  expanded,
  onToggle,
  onOpen,
  flat = false,
}: {
  f: SpLiveItem;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: number) => void;
  // flat: يُلغي خلفية المباشر الحمراء (لصفحة /sports/live حيث كل الصفوف مباشرة،
  // فالتعبئة الحمراء تطغى) — يبقى المؤشّر الدقيق (نقطة + دقيقة حمراء) فقط.
  flat?: boolean;
}) {
  const st = stateOf(f);
  const decided = st === "live" || st === "finished";
  const hg = f.goals.home;
  const ag = f.goals.away;
  // الترجيح يحسم الفائز حين تتعادل الأهداف (خروج المغلوب) — وإلا الأهداف.
  const pen = f.penalties;
  const penHome = pen?.home;
  const penAway = pen?.away;
  const hasPens = decided && penHome != null && penAway != null && penHome !== penAway;
  const homeWon = (decided && hg != null && ag != null && hg > ag) || (hasPens && penHome! > penAway!);
  const awayWon = (decided && hg != null && ag != null && ag > hg) || (hasPens && penAway! > penHome!);
  const isLive = st === "live";

  // وميض أخضر عند تغيّر النتيجة (تحديث لحظي) لمباراة جارية.
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

  return (
    <div
      className={`${flat ? "border-b-0" : "border-b border-border last:border-b-0"} ${
        isLive && !flat
          ? "relative overflow-hidden border-r-4 border-r-red-500 bg-red-500/[0.06] shadow-[inset_0_0_0_1px_rgba(239,68,68,0.12)] dark:bg-red-500/[0.12]"
          : ""
      }`}
    >
      <div
        className={`grid grid-cols-[44px_minmax(0,1fr)_58px_minmax(0,1fr)_34px] items-center gap-1.5 px-2.5 py-3 transition-colors sm:flex sm:gap-3 sm:px-4 sm:py-2.5 ${
          flash ? "bg-emerald-500/20" : isLive && !flat ? "hover:bg-red-500/[0.10]" : "hover:bg-muted/40"
        }`}
      >
        {/* الحالة (المباشر فقط) — وقت الانطلاق انتقل بين الفريقين بقرار المالك 2026-07-05 */}
        <button
          type="button"
          onClick={() => onOpen(f.id)}
          className="min-h-10 shrink-0 text-center sm:w-16"
          title="تفاصيل المباراة"
        >
          {isLive ? (
            // الجوال: العمود الجانبي أضيق من «الدقيقة + الشوط» فيزاحم اسم النادي —
            // تُعرض الدقيقة داخل كبسولة النتيجة بدلًا منه (sm فأوسع يبقيان هنا).
            <span className="hidden sm:inline-flex flex-col items-center gap-0.5 text-red-500">
              <span className="inline-flex items-center gap-1 text-xs font-black tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {liveClockLabel(f)}
              </span>
              <span className={`rounded-full px-1.5 py-px text-[9px] font-black leading-none whitespace-nowrap ${flat ? "bg-muted text-muted-foreground" : "bg-red-500 text-white"}`}>
                {livePhaseLabel(f)}
              </span>
            </span>
          ) : (
            <span aria-label={st === "finished" ? f.status.label || "انتهت" : "لم تبدأ"} />
          )}
        </button>

        {/* الفريق المضيف */}
        <Link
          href={`/sports/team/${f.home.id}`}
          className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:gap-2 ${homeWon ? "font-black text-foreground" : "font-semibold text-foreground/90"}`}
        >
          <span className="truncate text-[13px] leading-5 sm:text-sm">{f.home.name}</span>
          {f.home.logo ? (
            <img src={f.home.logo} alt="" className="h-6 w-6 shrink-0 object-contain sm:h-6 sm:w-6" loading="lazy" />
          ) : (
            <span className="h-6 w-6 shrink-0 rounded-full bg-muted" />
          )}
        </Link>

        {/* النتيجة / مقابل */}
        <button
          type="button"
          onClick={() => onOpen(f.id)}
          className="min-h-10 shrink-0 text-center"
        >
          {decided && hg != null && ag != null ? (
            <span
              className={`inline-flex min-w-[3.75rem] flex-col items-center justify-center rounded-[10px] px-2 py-1 text-base font-black tabular-nums leading-none sm:py-0.5 ${isLive && !flat ? "bg-red-600 text-white shadow-sm shadow-red-500/20" : "bg-muted text-foreground"}`}
              dir="ltr"
            >
              <span>{ag} - {hg}</span>
              {hasPens ? (
                <span className="mt-1 text-[9px] font-black leading-none text-emerald-600 dark:text-emerald-400" dir="rtl">
                  ترجيح <span dir="ltr">{Math.max(penHome!, penAway!)}-{Math.min(penHome!, penAway!)}</span>
                </span>
              ) : st === "finished" ? (
                <span className="mt-1 text-[9px] font-black leading-none text-muted-foreground" dir="rtl">
                  {f.status.label || "انتهت"}
                </span>
              ) : isLive ? (
                // دقيقة اللعب داخل الكبسولة — للجوال فقط (الساعة الجانبية تظهر من sm)
                <span className={`mt-1 inline-flex items-center gap-1 text-[9px] font-black leading-none sm:hidden ${flat ? "text-red-500" : "text-white/90"}`}>
                  <span className={`h-1 w-1 animate-pulse rounded-full ${flat ? "bg-red-500" : "bg-white"}`} />
                  <span dir="ltr">{liveClockLabel(f)}</span>
                </span>
              ) : null}
            </span>
          ) : (
            <span
              className="inline-flex min-w-[3.75rem] items-center justify-center rounded-[10px] bg-muted px-2 py-1 text-sm font-black tabular-nums text-foreground"
              dir="ltr"
            >
              {kickoffTime(f)}
            </span>
          )}
        </button>

        {/* الفريق الضيف */}
        <Link
          href={`/sports/team/${f.away.id}`}
          className={`flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2 ${awayWon ? "font-black text-foreground" : "font-semibold text-foreground/90"}`}
        >
          {f.away.logo ? (
            <img src={f.away.logo} alt="" className="h-6 w-6 shrink-0 object-contain sm:h-6 sm:w-6" loading="lazy" />
          ) : (
            <span className="h-6 w-6 shrink-0 rounded-full bg-muted" />
          )}
          <span className="truncate text-[13px] leading-5 sm:text-sm">{f.away.name}</span>
        </Link>

        {/* توسيع مسجّلي الأهداف */}
        <button
          type="button"
          onClick={onToggle}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors sm:h-7 sm:w-7 ${expanded ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"} ${!decided ? "opacity-0 pointer-events-none" : ""}`}
          title="مسجّلو الأهداف"
          aria-label="مسجّلو الأهداف"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </div>

      {expanded && decided && <MatchScorers fixture={f} />}
    </div>
  );
}

// ---------- مجموعة بطولة ----------

function CompetitionGroup({
  name,
  logo,
  slug,
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
  matches: SpLiveItem[];
  expandedIds: Set<number>;
  collapsed: boolean;
  toggle: (id: number) => void;
  onToggleGroup: () => void;
  onOpen: (id: number) => void;
}) {
  const liveCount = matches.filter((m) => m.status.live).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/60 px-3 py-2.5 sm:px-4 sm:py-3">
        <button
          type="button"
          onClick={onToggleGroup}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-card text-muted-foreground ring-1 ring-border transition-colors hover:text-primary"
          aria-label={collapsed ? "إظهار مباريات البطولة" : "إخفاء مباريات البطولة"}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "rotate-90" : ""}`} strokeWidth={2} />
        </button>
        {slug ? (
          <Link
            href={competitionHref(slug)}
            className="group flex min-w-0 flex-1 items-center gap-2.5"
            title={`صفحة بطولة ${name}`}
          >
            {logo ? (
              <img src={logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />
            ) : (
              <Trophy className={`w-5 h-5 shrink-0 ${ACCENT}`} strokeWidth={1.8} />
            )}
            <span className="truncate font-black text-foreground transition-colors group-hover:text-primary">{name}</span>
            <ChevronLeft className="w-4 h-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.8} />
          </Link>
        ) : (
          <>
            {logo ? (
              <img src={logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />
            ) : (
              <Trophy className={`w-5 h-5 shrink-0 ${ACCENT}`} strokeWidth={1.8} />
            )}
            <span className="truncate font-black text-foreground flex-1">{name}</span>
          </>
        )}
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            {liveCount} مباشر
          </span>
        ) : (
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{matches.length}</span>
        )}
      </div>
      {!collapsed && (
        <div>
          {matches.map((m) => (
            <MatchRow key={m.id} f={m} expanded={expandedIds.has(m.id)} onToggle={() => toggle(m.id)} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
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
      return { name, matches: sorted, logo: meta?.logo ?? null, slug, liveCount };
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-[12px] font-bold tabular-nums text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {liveTotal} مباشر الآن
                </span>
              )}
              {isToday && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground">
                  {isLiveFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5 text-red-500" strokeWidth={1.8} />}
                  تحديث تلقائي
                </span>
              )}
              <Link
                href="/sports/live"
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <Radio className="h-3.5 w-3.5 text-red-500" strokeWidth={1.8} /> البث المباشر · العالم
              </Link>
              <Link
                href="/sports"
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                البوابة الرياضية <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />
              </Link>
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
              {/* صفّ فلترة واحد: قائمة «العدسة» تتصدّره ثم شرائح البطولات ضمن نطاقها.
                  دمج صفّ العدسة المنفصل هنا وفّر صفًّا كاملًا وألغى تكرار «الكل». */}
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
              {/* الحالة + الفئة + طريقة العرض */}
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

          {/* المحتوى */}
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
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {flat.map((m) => (
                  <div key={m.id} className="border-b border-border last:border-b-0">
                    {m.competitionSlug ? (
                      <Link
                        href={competitionHref(m.competitionSlug)}
                        className="flex w-fit items-center gap-1 px-4 pt-2 text-[11px] font-bold text-muted-foreground transition-colors hover:text-primary"
                      >
                        {m.competition}
                        <ChevronLeft className="w-3 h-3" strokeWidth={1.8} />
                      </Link>
                    ) : (
                      <div className="flex items-center gap-2 px-4 pt-2 text-[11px] font-bold text-muted-foreground">
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
