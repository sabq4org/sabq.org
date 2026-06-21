/**
 * صفحة البطولة المستقلة — /sports2/competition/:slug
 *
 * هوية البطولة كاملة في مكان واحد: الشعار، الاسم، الفئة والحالة، الموسم الحالي،
 * عدّاد بدء الموسم (إن لم يبدأ)، ولمحة عن النسخة السابقة (حامل اللقب + هدّافها).
 * ثم تبويبات: الترتيب، الهدّافون، صنّاع الأهداف، البطاقات، والمباريات.
 *
 * تستهلك نقاط /api/sports/* القائمة دون أي اعتماد جديد:
 *   GET /api/sports/competitions          (شعار/فئة/موسم/حالة لكل بطولة)
 *   GET /api/sports/:comp/history          (حامل اللقب + هدّاف النسخة السابقة)
 *   GET /api/sports/:comp/standings|scorers|assists|cards|matches
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  Crown,
  Goal,
  Handshake,
  Loader2,
  Square,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import {
  ACCENT,
  COMP_CATEGORY_LABELS,
  COMP_STATUS_LABELS,
  MatchDialog,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpLiveItem,
  type SpScorer,
  type SpStandingRow,
} from "./SportsHub";

// ---------- لمحة النسخة السابقة (مطابقة لـ SplCompetitionHistory) ----------

interface CompHistory {
  previousSeason: number | null;
  champion: { id: number; name: string; logo: string } | null;
  topScorer: { id: number; name: string; photo: string; team: { id: number; name: string; logo: string }; goals: number } | null;
}

// ---------- مساعدات ----------

const timeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
  timeZone: "Asia/Riyadh",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" }).format(dt);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const diff = dt.getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / 86_400_000);
}

function seasonLabel(season: number | null | undefined): string {
  if (season == null) return "";
  // مواسم الدوريات تمتد عبر سنتين (مثل 2025/2026).
  return `${season}/${season + 1}`;
}

type TabKey = "standings" | "scorers" | "assists" | "cards" | "matches";

const TAB_META: Record<TabKey, { label: string; icon: typeof Trophy }> = {
  standings: { label: "الترتيب", icon: Trophy },
  scorers: { label: "الهدّافون", icon: Goal },
  assists: { label: "صنّاع الأهداف", icon: Handshake },
  cards: { label: "البطاقات", icon: Square },
  matches: { label: "المباريات", icon: CalendarDays },
};

// ---------- بطاقة حامل اللقب / هدّاف الموسم الماضي ----------

function PreviousEdition({ history }: { history: CompHistory }) {
  if (!history.champion && !history.topScorer) return null;
  const season = history.previousSeason;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {history.champion && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-gradient-to-l from-amber-400/10 to-transparent p-4">
          <div className="relative shrink-0">
            {history.champion.logo ? (
              <img src={history.champion.logo} alt="" className="h-14 w-14 object-contain" loading="lazy" />
            ) : (
              <Trophy className="h-12 w-12 text-amber-500" />
            )}
            <Crown className="absolute -top-2 -left-1 h-5 w-5 text-amber-500 drop-shadow" fill="currentColor" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
              حامل اللقب{season ? ` · موسم ${seasonLabel(season)}` : ""}
            </div>
            <div className="truncate text-lg font-black text-foreground">{history.champion.name}</div>
          </div>
        </div>
      )}
      {history.topScorer && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/30 bg-gradient-to-l from-emerald-400/10 to-transparent p-4">
          <div className="relative shrink-0">
            {history.topScorer.photo ? (
              <img src={history.topScorer.photo} alt="" className="h-14 w-14 rounded-full object-cover" loading="lazy" />
            ) : (
              <Goal className="h-12 w-12 text-emerald-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              هدّاف النسخة السابقة{season ? ` · موسم ${seasonLabel(season)}` : ""}
            </div>
            <div className="truncate text-lg font-black text-foreground">{history.topScorer.name}</div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {history.topScorer.team?.logo && (
                <img src={history.topScorer.team.logo} alt="" className="h-4 w-4 object-contain" loading="lazy" />
              )}
              <span className="truncate">{history.topScorer.team?.name}</span>
              <span className="mr-auto font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {history.topScorer.goals} هدف
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- جدول الترتيب ----------

function StandingsTable({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${slug}/standings`],
    staleTime: 120_000,
  });
  const rows = Array.isArray(data?.standings) ? data!.standings : [];

  if (isLoading) return <TabLoader />;
  if (rows.length === 0) return <TabEmpty text="لا يتوفّر ترتيب لهذه البطولة." />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[11px] font-bold text-muted-foreground">
            <th className="px-2 py-2.5 text-center">#</th>
            <th className="px-2 py-2.5 text-right">الفريق</th>
            <th className="px-2 py-2.5 text-center">لعب</th>
            <th className="px-2 py-2.5 text-center">فوز</th>
            <th className="px-2 py-2.5 text-center">تعادل</th>
            <th className="px-2 py-2.5 text-center">خسارة</th>
            <th className="px-2 py-2.5 text-center">له/عليه</th>
            <th className="px-2 py-2.5 text-center">±</th>
            <th className="px-2 py-2.5 text-center font-black text-foreground">نقاط</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/30">
              <td className="px-2 py-2 text-center">
                <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-[11px] font-black ${r.rank <= 3 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {r.rank}
                </span>
              </td>
              <td className="px-2 py-2">
                <Link href={`/sports2/team/${r.team.id}`} className="flex items-center gap-2 font-bold text-foreground hover:text-primary">
                  {r.team.logo && <img src={r.team.logo} alt="" className="h-5 w-5 object-contain shrink-0" loading="lazy" />}
                  <span className="truncate">{r.team.name}</span>
                </Link>
              </td>
              <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{r.played}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.win}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.draw}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.lose}</td>
              <td className="px-2 py-2 text-center tabular-nums text-muted-foreground" dir="ltr">{r.goalsFor}:{r.goalsAgainst}</td>
              <td className="px-2 py-2 text-center tabular-nums">{r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}</td>
              <td className="px-2 py-2 text-center font-black tabular-nums text-foreground">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- الهدّافون / صنّاع الأهداف ----------

function ScorersList({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ scorers: SpScorer[] }>({
    queryKey: [`/api/sports/${slug}/scorers`],
    staleTime: 300_000,
  });
  const rows = Array.isArray(data?.scorers) ? data!.scorers : [];
  if (isLoading) return <TabLoader />;
  if (rows.length === 0) return <TabEmpty text="لا تتوفّر قائمة هدّافين لهذه البطولة." />;
  return (
    <PlayerRanking
      rows={rows.map((r) => ({ ...r, value: r.goals, sub: r.assists ? `${r.assists} صناعة` : null }))}
      valueLabel="هدف"
    />
  );
}

function AssistsList({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ assists: SpAssister[] }>({
    queryKey: [`/api/sports/${slug}/assists`],
    staleTime: 300_000,
  });
  const rows = Array.isArray(data?.assists) ? data!.assists : [];
  if (isLoading) return <TabLoader />;
  if (rows.length === 0) return <TabEmpty text="لا تتوفّر قائمة صنّاع أهداف لهذه البطولة." />;
  return (
    <PlayerRanking
      rows={rows.map((r) => ({ ...r, value: r.assists, sub: r.goals ? `${r.goals} هدف` : null }))}
      valueLabel="صناعة"
    />
  );
}

interface RankingRow {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: { id: number; name: string; logo: string };
  value: number;
  sub: string | null;
}

function PlayerRanking({ rows, valueLabel }: { rows: RankingRow[]; valueLabel: string }) {
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
      {rows.map((r) => (
        <li key={`${r.id}-${r.rank}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30">
          <span className={`w-6 shrink-0 text-center text-sm font-black tabular-nums ${r.rank === 1 ? ACCENT : "text-muted-foreground"}`}>{r.rank}</span>
          {r.photo ? (
            <img src={r.photo} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" loading="lazy" />
          ) : (
            <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <Link href={`/sports2/player/${r.id}`} className="block truncate text-sm font-bold text-foreground hover:text-primary">{r.name}</Link>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {r.team?.logo && <img src={r.team.logo} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />}
              <span className="truncate">{r.team?.name}</span>
            </div>
          </div>
          <div className="shrink-0 text-left">
            <div className="text-lg font-black tabular-nums text-foreground">{r.value}</div>
            <div className="text-[10px] text-muted-foreground">{r.sub || valueLabel}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- البطاقات ----------

function CardsList({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({
    queryKey: [`/api/sports/${slug}/cards`],
    staleTime: 300_000,
  });
  const yellow = Array.isArray(data?.yellow) ? data!.yellow : [];
  const red = Array.isArray(data?.red) ? data!.red : [];
  if (isLoading) return <TabLoader />;
  if (yellow.length === 0 && red.length === 0) return <TabEmpty text="لا تتوفّر إحصاءات بطاقات لهذه البطولة." />;

  const column = (rows: SpCardLeader[], color: string, label: string, pick: (r: SpCardLeader) => number) => (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2.5">
        <span className={`inline-block h-4 w-3 rounded-[2px] ${color}`} />
        <span className="text-sm font-black text-foreground">{label}</span>
      </div>
      <ul className="divide-y divide-border/60">
        {rows.slice(0, 12).map((r) => (
          <li key={`${r.id}-${r.rank}`} className="flex items-center gap-2.5 px-3 py-2">
            <span className="w-5 shrink-0 text-center text-xs font-black tabular-nums text-muted-foreground">{r.rank}</span>
            {r.photo ? (
              <img src={r.photo} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" loading="lazy" />
            ) : (
              <span className="h-8 w-8 shrink-0 rounded-full bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <Link href={`/sports2/player/${r.id}`} className="block truncate text-sm font-bold text-foreground hover:text-primary">{r.name}</Link>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {r.teamLogo && <img src={r.teamLogo} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />}
                <span className="truncate">{r.team}</span>
              </div>
            </div>
            <span className="shrink-0 text-base font-black tabular-nums text-foreground">{pick(r)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {column(yellow, "bg-yellow-400", "أكثر الإنذارات", (r) => r.yellow)}
      {column(red, "bg-red-500", "أكثر الطرد", (r) => r.red)}
    </div>
  );
}

// ---------- المباريات ----------

function MatchLine({ f, onOpen }: { f: SpLiveItem; onOpen: (id: number) => void }) {
  const live = f.status.live;
  const decided = live || f.status.finished;
  return (
    <button
      type="button"
      onClick={() => onOpen(f.id)}
      className={`flex w-full items-center gap-2 px-3 py-2.5 text-right transition-colors hover:bg-muted/40 ${live ? "border-r-4 border-r-red-500 bg-red-500/[0.05]" : ""}`}
    >
      <span className="w-12 shrink-0 text-center text-[11px] font-bold tabular-nums text-muted-foreground">
        {live ? (
          <span className="inline-flex items-center gap-1 text-red-500">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
            {f.status.elapsed != null ? `'${f.status.elapsed}` : "مباشر"}
          </span>
        ) : f.status.finished ? "انتهت" : <span dir="ltr">{timeFmt.format(new Date(f.timestamp * 1000))}</span>}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-sm font-semibold text-foreground">
        <span className="truncate">{f.home.name}</span>
        {f.home.logo && <img src={f.home.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
      </span>
      <span className="shrink-0 px-1 text-center">
        {decided && f.goals.home != null && f.goals.away != null ? (
          <span className={`inline-block rounded-md px-1.5 py-0.5 text-sm font-black tabular-nums ${live ? "bg-red-600 text-white" : "bg-muted text-foreground"}`} dir="ltr">
            {f.goals.away} - {f.goals.home}
          </span>
        ) : (
          <span className="text-xs font-bold text-muted-foreground">vs</span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-foreground">
        {f.away.logo && <img src={f.away.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />}
        <span className="truncate">{f.away.name}</span>
      </span>
    </button>
  );
}

function MatchesPane({ slug, onOpen }: { slug: string; onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery<{ live: SpLiveItem[]; today: SpLiveItem[]; upcoming: SpLiveItem[]; results: SpLiveItem[] }>({
    queryKey: [`/api/sports/${slug}/matches`],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  if (isLoading) return <TabLoader />;
  const live = Array.isArray(data?.live) ? data!.live : [];
  const today = Array.isArray(data?.today) ? data!.today : [];
  const upcoming = Array.isArray(data?.upcoming) ? data!.upcoming : [];
  const results = Array.isArray(data?.results) ? data!.results : [];
  if (live.length + today.length + upcoming.length + results.length === 0) {
    return <TabEmpty text="لا توجد مباريات متاحة لهذه البطولة حاليًا." />;
  }
  const section = (title: string, rows: SpLiveItem[], accentLive = false) =>
    rows.length > 0 && (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className={`flex items-center gap-2 border-b border-border px-3 py-2.5 ${accentLive ? "bg-red-500/10" : "bg-muted/40"}`}>
          {accentLive && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
          <span className="text-sm font-black text-foreground">{title}</span>
          <span className="mr-auto text-[11px] font-bold text-muted-foreground tabular-nums">{rows.length}</span>
        </div>
        <div className="divide-y divide-border/60">
          {rows.map((f) => <MatchLine key={f.id} f={f} onOpen={onOpen} />)}
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      {section("مباشر الآن", live, true)}
      {section("مباريات اليوم", today.filter((t) => !live.some((l) => l.id === t.id)))}
      {section("مباريات قادمة", upcoming.slice(0, 12))}
      {section("أحدث النتائج", results.slice(0, 12))}
    </div>
  );
}

// ---------- حالات مشتركة ----------

function TabLoader() {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحميل…
    </div>
  );
}

function TabEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

// ---------- الصفحة ----------

export default function SportsCompetition() {
  const { user } = useAuth();
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "pro-league";
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  const { data: compsData } = useQuery<{ competitions: SpCompetition[] }>({
    queryKey: ["/api/sports/competitions"],
    staleTime: 60 * 60_000,
  });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = useMemo(() => competitions.find((c) => c.slug === slug), [competitions, slug]);

  const { data: historyData } = useQuery<{ history: CompHistory }>({
    queryKey: [`/api/sports/${slug}/history`],
    staleTime: 6 * 60 * 60_000,
  });
  const history = historyData?.history ?? null;

  const tabs = useMemo<TabKey[]>(() => {
    const t: TabKey[] = [];
    if (!comp || comp.hasStandings) t.push("standings");
    if (!comp || comp.hasScorers) t.push("scorers", "assists", "cards");
    t.push("matches");
    return t;
  }, [comp]);

  const [tab, setTab] = useState<TabKey>("standings");
  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  useEffect(() => {
    document.title = comp ? `${comp.name} | سبق سبورت` : "البطولة | سبق سبورت";
  }, [comp]);
  useCanonical(`https://sabq.org/sports2/competition/${slug}`);

  const startDays = daysUntil(comp?.start);
  const statusLabel = comp?.status ? COMP_STATUS_LABELS[comp.status] : "";

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ترويسة البطولة */}
        <div className="border-b border-border bg-card">
          <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-6">
            <Link href="/sports3/matches" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" /> كل المباريات
            </Link>
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-accent-blue/20 sm:h-20 sm:w-20">
                {comp?.logo ? (
                  <img src={comp.logo} alt="" className="h-12 w-12 object-contain sm:h-16 sm:w-16" />
                ) : (
                  <Trophy className={`h-10 w-10 ${ACCENT}`} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-2xl font-black leading-tight text-foreground sm:text-3xl">
                  {comp?.name || "البطولة"}
                </h1>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {comp?.category && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                      {COMP_CATEGORY_LABELS[comp.category]}
                    </span>
                  )}
                  {comp && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                      {comp.type === "cup" ? "كأس" : "دوري"}
                    </span>
                  )}
                  {comp?.season != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                      <CalendarDays className="h-3.5 w-3.5" /> موسم {seasonLabel(comp.season)}
                    </span>
                  )}
                  {statusLabel && (
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                      {statusLabel}
                    </span>
                  )}
                  {startDays != null && startDays > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Target className="h-3.5 w-3.5" />
                      ينطلق بعد {startDays} {startDays === 1 ? "يوم" : "يومًا"}
                      {comp?.start ? ` (${fmtDate(comp.start)})` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-4 sm:py-6">
          {/* لمحة النسخة السابقة */}
          {history && <PreviousEdition history={history} />}

          {/* التبويبات */}
          <div className="sticky top-16 z-20 -mx-3 border-b border-border bg-background/90 px-3 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border sm:px-2 sm:py-1.5">
            <div className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-hide sm:py-0">
              {tabs.map((key) => {
                const Icon = TAB_META[key].icon;
                const active = tab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold whitespace-nowrap transition-colors ${active ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <Icon className="h-4 w-4" /> {TAB_META[key].label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* محتوى التبويب */}
          <div>
            {tab === "standings" && <StandingsTable slug={slug} />}
            {tab === "scorers" && <ScorersList slug={slug} />}
            {tab === "assists" && <AssistsList slug={slug} />}
            {tab === "cards" && <CardsList slug={slug} />}
            {tab === "matches" && <MatchesPane slug={slug} onOpen={setOpenMatch} />}
          </div>

          <div className="flex items-center justify-center pt-2">
            <Link href="/sports2" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:border-primary/40">
              <Users className="h-4 w-4" /> البوابة الرياضية
            </Link>
          </div>
        </div>
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
