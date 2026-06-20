/**
 * لوحة "مباريات اليوم" — صفحة مستقلة على /sports3/matches
 *
 * كل مباريات اليوم عبر بطولاتنا، مرتّبة بالوقت ومجمّعة حسب البطولة، بجدول
 * أنيق يعرض حالة كل مباراة (لم تبدأ / جارية الآن / انتهت) والنتيجة، مع توسيع
 * كل مباراة لإظهار مسجّلي الأهداف. فلترة قوية أعلى الجدول: التاريخ، الحالة،
 * الفئة، البحث، وطريقة العرض (حسب البطولة / حسب الوقت).
 *
 * تستهلك نفس مصادر /sports2-/sports3 دون أي اعتماد جديد:
 *   GET /api/sports/today?date=YYYY-MM-DD   (لوحة اليوم)
 *   GET /api/sports/competitions            (شعار/فئة/حالة لكل بطولة)
 *   GET /api/sports/match/:id               (مسجّلو الأهداف عند التوسيع)
 */
import { useEffect, useMemo, useState } from "react";
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
  Trophy,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import {
  ACCENT,
  COMP_CATEGORY_LABELS,
  COMP_CATEGORY_ORDER,
  MatchDialog,
  type SpCompetition,
  type SpCompetitionCategory,
  type SpLiveItem,
} from "./SportsHub";

// ---------- أدوات التاريخ (بتوقيت الرياض) ----------

const RIYADH_TZ = "Asia/Riyadh";

const ymdFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: RIYADH_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
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
  return new Intl.DateTimeFormat("ar", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(dt);
}

function kickoffTime(f: SpLiveItem): string {
  return timeFmt.format(new Date(f.timestamp * 1000));
}

// ---------- الحالة ----------

type MatchState = "upcoming" | "live" | "finished";

function stateOf(f: SpLiveItem): MatchState {
  if (f.status.live) return "live";
  if (f.status.finished) return "finished";
  return "upcoming";
}

const STATE_FILTERS: { key: "all" | MatchState; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "live", label: "جارية الآن" },
  { key: "upcoming", label: "لم تبدأ" },
  { key: "finished", label: "انتهت" },
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

// ---------- مسجّلو الأهداف (يُحمّل عند التوسيع) ----------

function MatchScorers({ fixture }: { fixture: SpLiveItem }) {
  const { data, isLoading } = useQuery<BoardMatchDetail>({
    queryKey: [`/api/sports/match/${fixture.id}`],
    staleTime: 30_000,
    refetchInterval: fixture.status.live ? 30_000 : false,
  });

  const goals = useMemo(
    () => (Array.isArray(data?.events) ? data!.events.filter((e) => e.type === "goal") : []),
    [data]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل تفاصيل المباراة…
      </div>
    );
  }

  if (goals.length === 0) {
    return (
      <div className="py-3 text-center text-xs text-muted-foreground">
        {fixture.status.finished ? "لا توجد أهداف في هذه المباراة." : "لم تُسجَّل أهداف بعد."}
      </div>
    );
  }

  const homeGoals = goals.filter((g) => g.teamId === fixture.home.id);
  const awayGoals = goals.filter((g) => g.teamId === fixture.away.id);

  const list = (rows: BoardMatchEvent[], align: "end" | "start") => (
    <ul className={`space-y-1.5 ${align === "end" ? "text-end" : "text-start"}`}>
      {rows.map((g, i) => (
        <li key={i} className="flex items-center gap-1.5 text-sm" dir="rtl">
          {align === "end" ? (
            <>
              <span className="font-semibold text-foreground">{g.player}</span>
              <Goal className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-[11px] text-muted-foreground tabular-nums">{eventMinute(g)}</span>
              {g.label !== "هدف" && <span className="text-[10px] text-muted-foreground">({g.label})</span>}
            </>
          ) : (
            <>
              <span className="text-[11px] text-muted-foreground tabular-nums">{eventMinute(g)}</span>
              <Goal className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="font-semibold text-foreground">{g.player}</span>
              {g.label !== "هدف" && <span className="text-[10px] text-muted-foreground">({g.label})</span>}
            </>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="grid grid-cols-2 gap-4 px-4 py-3 bg-muted/30">
      {list(homeGoals, "end")}
      {list(awayGoals, "start")}
    </div>
  );
}

// ---------- صف المباراة ----------

function MatchRow({
  f,
  expanded,
  onToggle,
  onOpen,
}: {
  f: SpLiveItem;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (id: number) => void;
}) {
  const st = stateOf(f);
  const decided = st === "live" || st === "finished";
  const hg = f.goals.home;
  const ag = f.goals.away;
  const homeWon = decided && hg != null && ag != null && hg > ag;
  const awayWon = decided && hg != null && ag != null && ag > hg;

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-muted/40 transition-colors sm:gap-3 sm:px-4">
        {/* الوقت / الحالة */}
        <button
          type="button"
          onClick={() => onOpen(f.id)}
          className="w-14 shrink-0 text-center sm:w-16"
          title="تفاصيل المباراة"
        >
          {st === "live" ? (
            <span className="inline-flex flex-col items-center gap-0.5 text-red-500">
              <span className="inline-flex items-center gap-1 text-xs font-black tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                {f.status.elapsed != null ? `'${f.status.elapsed}` : "مباشر"}
              </span>
            </span>
          ) : st === "finished" ? (
            <span className="text-[11px] font-bold text-muted-foreground">انتهت</span>
          ) : (
            <span className="text-sm font-black text-foreground tabular-nums" dir="ltr">
              {kickoffTime(f)}
            </span>
          )}
        </button>

        {/* الفريق المضيف */}
        <Link
          href={`/sports2/team/${f.home.id}`}
          className={`flex flex-1 items-center justify-end gap-2 min-w-0 ${homeWon ? "font-black text-foreground" : "font-semibold text-foreground/90"}`}
        >
          <span className="truncate text-sm">{f.home.name}</span>
          {f.home.logo ? (
            <img src={f.home.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-muted shrink-0" />
          )}
        </Link>

        {/* النتيجة / مقابل */}
        <button
          type="button"
          onClick={() => onOpen(f.id)}
          className="shrink-0 min-w-[52px] text-center"
        >
          {decided && hg != null && ag != null ? (
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-base font-black tabular-nums ${st === "live" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-muted text-foreground"}`}
              dir="ltr"
            >
              {hg} - {ag}
            </span>
          ) : (
            <span className="text-xs font-bold text-muted-foreground">vs</span>
          )}
        </button>

        {/* الفريق الضيف */}
        <Link
          href={`/sports2/team/${f.away.id}`}
          className={`flex flex-1 items-center gap-2 min-w-0 ${awayWon ? "font-black text-foreground" : "font-semibold text-foreground/90"}`}
        >
          {f.away.logo ? (
            <img src={f.away.logo} alt="" className="w-6 h-6 object-contain shrink-0" loading="lazy" />
          ) : (
            <span className="w-6 h-6 rounded-full bg-muted shrink-0" />
          )}
          <span className="truncate text-sm">{f.away.name}</span>
        </Link>

        {/* توسيع مسجّلي الأهداف */}
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 grid place-items-center w-7 h-7 rounded-full transition-colors ${expanded ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"} ${!decided ? "opacity-0 pointer-events-none" : ""}`}
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
  status,
  matches,
  expandedIds,
  toggle,
  onOpen,
}: {
  name: string;
  logo: string | null;
  status?: SpCompetition["status"];
  matches: SpLiveItem[];
  expandedIds: Set<number>;
  toggle: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const liveCount = matches.filter((m) => m.status.live).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-gradient-to-l from-muted/60 to-transparent">
        {logo ? (
          <img src={logo} alt="" className="w-7 h-7 object-contain shrink-0" loading="lazy" />
        ) : (
          <Trophy className={`w-5 h-5 shrink-0 ${ACCENT}`} />
        )}
        <span className="font-black text-foreground truncate flex-1">{name}</span>
        {status === "ongoing" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 dark:text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> جارية
          </span>
        )}
        {liveCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-black text-red-600 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {liveCount} مباشر
          </span>
        ) : (
          <span className="text-[11px] font-bold text-muted-foreground tabular-nums">{matches.length}</span>
        )}
      </div>
      <div>
        {matches.map((m) => (
          <MatchRow key={m.id} f={m} expanded={expandedIds.has(m.id)} onToggle={() => toggle(m.id)} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

// ---------- الصفحة ----------

export default function SportsMatchesBoard() {
  const { user } = useAuth();
  const [date, setDate] = useState<string>(() => riyadhToday());
  const [stateFilter, setStateFilter] = useState<"all" | MatchState>("all");
  const [catFilter, setCatFilter] = useState<"all" | SpCompetitionCategory>("all");
  const [search, setSearch] = useState("");
  const [groupByComp, setGroupByComp] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  const today = riyadhToday();
  const isToday = date === today;

  useEffect(() => {
    document.title = "مباريات اليوم | سبق";
  }, []);
  useCanonical("https://sabq.org/sports3/matches");

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

  const { data: todayData, isLoading } = useQuery<{ today: SpLiveItem[] }>({
    queryKey: ["/api/sports/today", { date }],
    refetchInterval: isToday ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  const allMatches = Array.isArray(todayData?.today) ? todayData!.today : [];

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
  }, [allMatches, stateFilter, catFilter, search, compMeta]);

  // التجميع حسب البطولة (مع ترتيب المباريات بالوقت داخل كل مجموعة).
  const groups = useMemo(() => {
    const byComp = new Map<string, SpLiveItem[]>();
    for (const m of filtered) {
      const key = m.competition || "أخرى";
      if (!byComp.has(key)) byComp.set(key, []);
      byComp.get(key)!.push(m);
    }
    return Array.from(byComp.entries()).map(([name, matches]) => {
      const sorted = [...matches].sort((a, b) => {
        if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
        return a.timestamp - b.timestamp;
      });
      const slug = sorted[0]?.competitionSlug ?? null;
      const meta = slug ? compMeta.get(slug) : undefined;
      const liveCount = matches.filter((m) => m.status.live).length;
      return { name, matches: sorted, logo: meta?.logo ?? null, status: meta?.status, liveCount };
    });
  }, [filtered, compMeta]);

  // ترتيب المجموعات: الأكثر مباريات مباشرة أولاً ثم أبكر موعد.
  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        if (a.liveCount !== b.liveCount) return b.liveCount - a.liveCount;
        return (a.matches[0]?.timestamp ?? 0) - (b.matches[0]?.timestamp ?? 0);
      }),
    [groups]
  );

  // قائمة مسطّحة بالوقت.
  const flat = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (a.status.live !== b.status.live) return a.status.live ? -1 : 1;
        return a.timestamp - b.timestamp;
      }),
    [filtered]
  );

  const liveTotal = allMatches.filter((m) => m.status.live).length;

  const toggle = (id: number) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ترويسة */}
        <div className="bg-card border-b border-border">
          <div className="max-w-5xl mx-auto px-4 py-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-accent-blue/30 shrink-0">
                  <CalendarDays className={`w-5 h-5 ${ACCENT}`} />
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground tracking-wide uppercase">سبق سبورت</span>
                  <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-none">مباريات اليوم</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {liveTotal > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-bold border border-red-500/20">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {liveTotal} مباشر الآن
                  </span>
                )}
                <Link
                  href="/sports3"
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-foreground hover:border-primary/40 transition-colors"
                >
                  البوابة الرياضية <ChevronLeft className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* شريط الفلاتر اللاصق */}
        <div className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 py-3 space-y-3">
            {/* التاريخ */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDate((d) => shiftDate(d, -1))}
                  className="grid place-items-center w-9 h-9 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors"
                  aria-label="اليوم السابق"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="px-3 text-center min-w-[150px]">
                  <div className="text-sm font-black text-foreground">{humanDate(date)}</div>
                  <div className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">{date}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setDate((d) => shiftDate(d, 1))}
                  className="grid place-items-center w-9 h-9 rounded-lg border border-border bg-card hover:border-primary/40 transition-colors"
                  aria-label="اليوم التالي"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {!isToday && (
                  <button
                    type="button"
                    onClick={() => setDate(today)}
                    className="mr-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition-colors"
                  >
                    اليوم
                  </button>
                )}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="mr-1 h-9 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                />
              </div>

              {/* البحث */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث عن فريق أو بطولة…"
                  className="w-full h-9 rounded-lg border border-border bg-card pr-9 pl-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
            </div>

            {/* الحالة + الفئة + طريقة العرض */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 shrink-0">
                {STATE_FILTERS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setStateFilter(s.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-colors ${stateFilter === s.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {s.key === "live" && stateFilter !== "live" && liveTotal > 0 && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 ml-1 align-middle animate-pulse" />
                    )}
                    {s.label}
                  </button>
                ))}
              </div>

              {presentCats.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="w-px h-5 bg-border mx-1" />
                  <button
                    type="button"
                    onClick={() => setCatFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${catFilter === "all" ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    كل الفئات
                  </button>
                  {presentCats.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCatFilter(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${catFilter === cat ? "bg-foreground text-background" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {COMP_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5 shrink-0 mr-auto">
                <button
                  type="button"
                  onClick={() => setGroupByComp(true)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-colors ${groupByComp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  حسب البطولة
                </button>
                <button
                  type="button"
                  onClick={() => setGroupByComp(false)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition-colors ${!groupByComp ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  حسب الوقت
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* المحتوى */}
        <div className="max-w-5xl mx-auto px-4 py-6">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> جارٍ تحميل المباريات…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-20 bg-card rounded-2xl border border-dashed border-border">
              <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
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
                  status={g.status}
                  matches={g.matches}
                  expandedIds={expandedIds}
                  toggle={toggle}
                  onOpen={setOpenMatch}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {flat.map((m) => (
                <div key={m.id} className="border-b border-border last:border-b-0">
                  <div className="flex items-center gap-2 px-4 pt-2 text-[11px] font-bold text-muted-foreground">
                    {m.competition}
                  </div>
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
