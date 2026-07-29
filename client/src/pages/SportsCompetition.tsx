/**
 * صفحة البطولة المستقلة — /sports/competition/:slug
 *
 * هوية البطولة كاملة في مكان واحد: الشعار، الاسم، الفئة والحالة، الموسم الحالي،
 * عدّاد بدء الموسم (إن لم يبدأ)، ولمحة عن النسخة السابقة (حامل اللقب + هدّافها).
 * ثم تبويبات: المباريات (الافتراضي)، الترتيب، الهدّافون، صنّاع الأهداف، والبطاقات.
 *
 * تستهلك نقاط /api/sports/* القائمة دون أي اعتماد جديد:
 *   GET /api/sports/competitions          (شعار/فئة/موسم/حالة لكل بطولة)
 *   GET /api/sports/:comp/history          (حامل اللقب + هدّاف النسخة السابقة)
 *   GET /api/sports/:comp/standings|scorers|assists|cards|matches
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  ChevronLeft,
  Crown,
  Goal,
  Handshake,
  Loader2,
  Newspaper,
  Sparkles,
  Square,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { TeamOfTheWeekSection } from "@/components/worldcup/TeamOfTheWeekSection";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import { OptimizedImage } from "@/components/OptimizedImage";
import { getCacheBustedImageUrl } from "@/lib/imageUtils";
import type { ArticleWithDetails } from "@shared/schema";
import {
  ACCENT,
  CardLeaders,
  COMP_CATEGORY_LABELS,
  COMP_STATUS_LABELS,
  FollowControls,
  MatchDialog,
  PodiumCard,
  StandingsTable,
  TitleRace,
  timeAgo,
  type SpAssister,
  type SpCardLeader,
  type SpCompetition,
  type SpLiveItem,
  type SpScorer,
  type SpStandingRow,
} from "./SportsHub";
import { MatchRow } from "./SportsMatchesBoard";

// ---------- لمحة النسخة السابقة (مطابقة لـ SplCompetitionHistory) ----------

interface CompHistory {
  previousSeason: number | null;
  champion: { id: number; name: string; logo: string } | null;
  topScorer: { id: number; name: string; photo: string; team: { id: number; name: string; logo: string }; goals: number } | null;
}

// ---------- مساعدات ----------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(dt);
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

function seasonLabelFromStart(season: number | null | undefined, timestamp?: number | null, iso?: string | null): string {
  const anchor = timestamp
    ? new Date(timestamp * 1000)
    : iso
      ? new Date(iso)
      : null;
  if (anchor && Number.isFinite(anchor.getTime())) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth() + 1;
    const startYear = month >= 7 ? year : year - 1;
    return `${startYear}/${startYear + 1}`;
  }
  return seasonLabel(season);
}

// تجميع مباريات القائمة حسب يومها (بتوقيت الرياض — مطابق لوقت الانطلاق في صف
// المباراة) لفواصل تاريخ واضحة بين أيام «القادمة» و«النتائج».
const riyadhDayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" });
const dayDividerFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric" });

function groupMatchesByDay(rows: SpLiveItem[]): { key: string; label: string; rows: SpLiveItem[] }[] {
  const todayKey = riyadhDayKeyFmt.format(new Date());
  const tomorrowKey = riyadhDayKeyFmt.format(new Date(Date.now() + 86_400_000));
  const groups: { key: string; label: string; rows: SpLiveItem[] }[] = [];
  for (const f of rows) {
    const dt = new Date(f.timestamp * 1000);
    const key = riyadhDayKeyFmt.format(dt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.rows.push(f);
    } else {
      const prefix = key === todayKey ? "اليوم · " : key === tomorrowKey ? "غدًا · " : "";
      groups.push({ key, label: prefix + dayDividerFmt.format(dt), rows: [f] });
    }
  }
  return groups;
}

const COMP_EDITORIAL_NOTES: Record<string, string[]> = {
  "kings-cup": [
    "أغلى الكؤوس محليًا، وتُلعب بنظام خروج المغلوب من مباراة واحدة.",
    "تبدأ من دور الـ32، ثم تنتقل عبر الأدوار الإقصائية حتى النهائي.",
    "تعرف جماهيريًا باسم كأس الملك، وتجمع أندية دوري روشن ويَلو حسب نظام النسخة.",
  ],
};

type TabKey = "standings" | "scorers" | "assists" | "cards" | "matches" | "news";

const TAB_META: Record<TabKey, { label: string; icon: typeof Trophy }> = {
  standings: { label: "الترتيب", icon: Trophy },
  scorers: { label: "الهدّافون", icon: Goal },
  assists: { label: "صنّاع الأهداف", icon: Handshake },
  cards: { label: "البطاقات", icon: Square },
  matches: { label: "المباريات", icon: CalendarDays },
  news: { label: "الأخبار", icon: Newspaper },
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

function CompetitionBrief({
  comp,
  nextMatch,
  matchCount,
}: {
  comp: SpCompetition;
  // للاستدلال على موسم البطولة فقط — بطاقة «المباراة القادمة» حُذفت بقرار المالك
  // 2026-07-05 (تكرار لأول صف في تبويب المباريات)، ومعها بطاقة «من السجل الأخير»
  // (تكرار لبطاقتي حامل اللقب/الهدّاف أسفل الملف).
  nextMatch: SpLiveItem | null;
  matchCount: number;
}) {
  const notes = COMP_EDITORIAL_NOTES[comp.slug] ?? [
    comp.type === "cup"
      ? "بطولة خروج مغلوب؛ تتغير مراحلها حسب جدول كل نسخة."
      : "بطولة دوري؛ يتحدد المسار عبر الجولات وجدول الترتيب.",
  ];
  const info = [
    {
      label: "النظام",
      value: comp.type === "cup" ? "خروج مغلوب" : "دوري",
    },
    {
      label: "الموسم",
      value: seasonLabelFromStart(comp.season, nextMatch?.timestamp ?? null, comp.start) || "قيد التحديث",
    },
    {
      label: "الحالة",
      value: comp.status ? COMP_STATUS_LABELS[comp.status] : "قيد التحديث",
    },
    {
      label: "المباريات المتاحة",
      value: matchCount > 0 ? `${matchCount}` : "تظهر مع اعتماد الجدول",
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-gradient-to-l from-primary/10 to-transparent px-4 py-3">
        <div className="text-[11px] font-black uppercase tracking-wide text-primary">ملف البطولة</div>
        <h2 className="mt-1 text-lg font-black text-foreground">{comp.name}</h2>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {info.map((item) => (
            <div key={item.label} className="rounded-xl bg-muted/60 px-3 py-3">
              <div className="text-[11px] font-bold text-muted-foreground">{item.label}</div>
              <div className="mt-1 text-sm font-black text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 text-sm leading-7 text-muted-foreground">
          {notes.map((note) => (
            <div key={note} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- جدول الترتيب (نفس مكوّن البوابة الرياضية) ----------

function StandingsPane({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ standings: SpStandingRow[] }>({
    queryKey: [`/api/sports/${slug}/standings`],
    staleTime: 120_000,
    // ترتيب مبدئي لحظي مفعّل (صفّ live) → 8ث ليتحرّك الجدول مع المباراة
    refetchInterval: (query) =>
      (query.state.data?.standings ?? []).some((r) => r.live) ? 8_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const rows = Array.isArray(data?.standings) ? data!.standings : [];
  if (isLoading) return <TabLoader />;
  if (rows.length === 0) return <TabEmpty text="لا يتوفّر ترتيب لهذه البطولة." />;
  return (
    <div className="space-y-5">
      <TitleRace rows={rows} />
      <StandingsTable rows={rows} />
    </div>
  );
}

// ---------- الهدّافون / صنّاع الأهداف (منصّة موحّدة) ----------

function ScorersPane({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ scorers: SpScorer[] }>({
    queryKey: [`/api/sports/${slug}/scorers`],
    staleTime: 300_000,
  });
  const rows = Array.isArray(data?.scorers) ? data!.scorers : [];
  if (isLoading) return <TabLoader />;
  if (rows.length === 0) return <TabEmpty text="لا تتوفّر قائمة هدّافين لهذه البطولة." />;
  return (
    <>
      <PodiumCard
        entries={rows.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.goals, secondary: s.assists }))}
        primaryLabel="عدد الأهداف"
        secondaryLabel="الصناعة"
      />
      {/* تشكيلة الجولة (SportMonks) — تظهر فقط للبطولات المغطاة وعند توفر جولة */}
      <TeamOfTheWeekSection
        endpoint={`/api/sports/${slug}/totw`}
        subtitle="الأعلى تقييمًا في آخر جولة"
      />
    </>
  );
}

function AssistsPane({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ assists: SpAssister[] }>({
    queryKey: [`/api/sports/${slug}/assists`],
    staleTime: 300_000,
  });
  const rows = Array.isArray(data?.assists) ? data!.assists : [];
  if (isLoading) return <TabLoader />;
  if (rows.length === 0) return <TabEmpty text="لا تتوفّر قائمة صنّاع أهداف لهذه البطولة." />;
  return (
    <PodiumCard
      entries={rows.map((s) => ({ rank: s.rank, id: s.id, name: s.name, photo: s.photo, team: s.team, primary: s.assists, secondary: s.goals }))}
      primaryLabel="عدد الصناعات"
      secondaryLabel="الأهداف"
    />
  );
}

// ---------- البطاقات (نفس قائمة البوابة الرياضية) ----------

function CardsPane({ slug }: { slug: string }) {
  const { data, isLoading } = useQuery<{ yellow: SpCardLeader[]; red: SpCardLeader[] }>({
    queryKey: [`/api/sports/${slug}/cards`],
    staleTime: 300_000,
  });
  const yellow = Array.isArray(data?.yellow) ? data!.yellow : [];
  const red = Array.isArray(data?.red) ? data!.red : [];
  if (isLoading) return <TabLoader />;
  if (yellow.length === 0) return <TabEmpty text="لا تتوفّر إحصاءات بطاقات لهذه البطولة." />;
  return <CardLeaders leaders={yellow} red={red} />;
}

// ---------- المباريات (نفس صف صفحة «مباريات اليوم») ----------

type SpRound = { key: string; label: string };

function MatchesPane({ slug, onOpen }: { slug: string; onOpen: (id: number) => void }) {
  const { data, isLoading } = useQuery<{ live: SpLiveItem[]; today: SpLiveItem[]; upcoming: SpLiveItem[]; results: SpLiveItem[] }>({
    queryKey: [`/api/sports/${slug}/matches`],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const { data: roundsData } = useQuery<{ rounds: SpRound[]; current: string | null }>({
    queryKey: [`/api/sports/${slug}/rounds`],
    staleTime: 30 * 60_000,
  });
  const rounds = Array.isArray(roundsData?.rounds) ? roundsData.rounds : [];
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const effectiveRound = selectedRound ?? roundsData?.current ?? rounds[0]?.key ?? null;
  useEffect(() => {
    if (!selectedRound && effectiveRound) setSelectedRound(effectiveRound);
  }, [effectiveRound, selectedRound]);
  const { data: roundData, isLoading: roundLoading } = useQuery<{ fixtures: SpLiveItem[] }>({
    queryKey: [`/api/sports/${slug}/round`, { name: effectiveRound }],
    enabled: !!effectiveRound,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const roundFixturesRaw = Array.isArray(roundData?.fixtures) ? roundData.fixtures : [];
  /** مباشر → قادمة → منتهية (قائمة الدور كانت تُرتَّب بالوقت فقط فتظهر «انتهت» فوق المباشر). */
  const roundFixtures = useMemo(
    () =>
      [...roundFixturesRaw].sort((a, b) => {
        const rank = (f: SpLiveItem) => (f.status.live ? 0 : f.status.finished ? 2 : 1);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (ra === 2) return b.timestamp - a.timestamp;
        return a.timestamp - b.timestamp;
      }),
    [roundFixturesRaw],
  );
  const selectedRoundLabel = rounds.find((r) => r.key === effectiveRound)?.label ?? effectiveRound ?? "";
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) return <TabLoader />;
  const live = Array.isArray(data?.live) ? data!.live : [];
  const today = Array.isArray(data?.today) ? data!.today : [];
  const upcoming = Array.isArray(data?.upcoming) ? data!.upcoming : [];
  const results = Array.isArray(data?.results) ? data!.results : [];
  if (live.length + today.length + upcoming.length + results.length === 0 && rounds.length === 0) {
    return <TabEmpty text="لا توجد مباريات متاحة لهذه البطولة حاليًا." />;
  }
  const section = (title: string, rows: SpLiveItem[], opts?: { accentLive?: boolean; byDay?: boolean }) =>
    rows.length > 0 && (
      <div className="overflow-hidden rounded-xl border border-border bg-card sm:rounded-2xl">
        <div className={`flex items-center gap-2.5 border-b border-border px-3 py-2.5 sm:px-4 sm:py-3 ${opts?.accentLive ? "bg-red-500/10" : "bg-gradient-to-l from-muted/60 to-transparent"}`}>
          {opts?.accentLive && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />}
          <span className="flex-1 truncate font-black text-foreground">{title}</span>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{rows.length}</span>
        </div>
        <div>
          {opts?.byDay
            ? groupMatchesByDay(rows).map((g) => (
                <div key={g.key}>
                  <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground sm:px-4">
                    <CalendarDays className="h-3.5 w-3.5 text-primary" /> {g.label}
                  </div>
                  {g.rows.map((f) => (
                    <MatchRow key={f.id} f={f} expanded={expanded.has(f.id)} onToggle={() => toggle(f.id)} onOpen={onOpen} />
                  ))}
                </div>
              ))
            : rows.map((f) => (
                <MatchRow key={f.id} f={f} expanded={expanded.has(f.id)} onToggle={() => toggle(f.id)} onOpen={onOpen} />
              ))}
        </div>
      </div>
    );
  return (
    <div className="space-y-4">
      {rounds.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-card sm:rounded-2xl">
          <div className="flex items-center gap-2.5 border-b border-border bg-gradient-to-l from-primary/10 to-transparent px-3 py-2.5 sm:px-4 sm:py-3">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="flex-1 font-black text-foreground">أدوار البطولة</span>
            {roundsData?.current && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                الجاري الآن
              </span>
            )}
          </div>
          <div className="border-b border-border px-3 py-2 sm:px-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {rounds.map((round) => {
                const active = round.key === effectiveRound;
                return (
                  <button
                    key={round.key}
                    type="button"
                    onClick={() => setSelectedRound(round.key)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
                      active ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    }`}
                  >
                    {round.label}
                  </button>
                );
              })}
            </div>
          </div>
          {roundLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">جارٍ تحميل مباريات الدور…</div>
          ) : roundFixtures.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground sm:px-4">
                <CalendarDays className="h-3.5 w-3.5 text-primary" /> {selectedRoundLabel}
              </div>
              {roundFixtures.map((f) => (
                <MatchRow key={f.id} f={f} expanded={expanded.has(f.id)} onToggle={() => toggle(f.id)} onOpen={onOpen} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد مباريات معتمدة لهذا الدور بعد.</div>
          )}
        </div>
      )}
      {section("مباشر الآن", live, { accentLive: true })}
      {section("مباريات اليوم", today.filter((t) => !live.some((l) => l.id === t.id)))}
      {section("مباريات قادمة", upcoming.slice(0, 20), { byDay: true })}
      {section("أحدث النتائج", results.slice(0, 20), { byDay: true })}
    </div>
  );
}

// ---------- أخبار البطولة (مقالات قسم الرياضة المطابقة لاسم البطولة) ----------

const compImgOf = (a: ArticleWithDetails) => getCacheBustedImageUrl(a.imageUrl || a.thumbnailUrl, a.updatedAt);

function NewsPane({ comp }: { comp: SpCompetition | undefined }) {
  const { data: newsRaw, isLoading } = useQuery<ArticleWithDetails[]>({
    queryKey: ["/api/categories", "sports", "articles"],
  });
  const items = useMemo(() => {
    const list = Array.isArray(newsRaw) ? newsRaw : [];
    if (!comp) return list.slice(0, 12);
    // نطابق اسم البطولة بعد تجريد بادئات عامة (كأس/دوري/بطولة) لالتقاط أكبر عدد.
    const needles = [comp.name]
      .filter(Boolean)
      .map((s) => String(s).replace(/^(كأس|دوري|بطولة)\s+/, "").trim())
      .filter((s) => s.length >= 3);
    const matched = list.filter((a) =>
      needles.some((n) => a.title?.includes(n) || (a as any).excerpt?.includes?.(n)),
    );
    return matched.slice(0, 12);
  }, [newsRaw, comp]);

  if (isLoading) return <TabLoader />;
  if (items.length === 0) return <TabEmpty text="لا توجد أخبار مطابقة لهذه البطولة حاليًا — تابع البوابة الرياضية." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((a) => (
        <Link
          key={a.id}
          href={`/article/${a.englishSlug || a.slug}`}
          className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
        >
          {compImgOf(a) && (
            <div className="h-[72px] w-[104px] shrink-0 overflow-hidden rounded-xl">
              <OptimizedImage
                src={compImgOf(a)!}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                wrapperClassName="w-full h-full"
              />
            </div>
          )}
          <div className="min-w-0">
            <h4 className="text-[13.5px] font-bold leading-relaxed text-foreground line-clamp-2 transition-colors group-hover:text-primary">
              {a.title}
            </h4>
            <span className="mt-1.5 block text-[10.5px] text-muted-foreground tabular-nums">{timeAgo(a.publishedAt)}</span>
          </div>
        </Link>
      ))}
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

  const { data: matchesSummaryData } = useQuery<{
    live: SpLiveItem[];
    today: SpLiveItem[];
    upcoming: SpLiveItem[];
    results: SpLiveItem[];
  }>({
    queryKey: [`/api/sports/${slug}/matches`],
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const summaryMatches = useMemo(() => {
    const live = Array.isArray(matchesSummaryData?.live) ? matchesSummaryData!.live : [];
    const today = Array.isArray(matchesSummaryData?.today) ? matchesSummaryData!.today : [];
    const upcoming = Array.isArray(matchesSummaryData?.upcoming) ? matchesSummaryData!.upcoming : [];
    const results = Array.isArray(matchesSummaryData?.results) ? matchesSummaryData!.results : [];
    return { live, today, upcoming, results };
  }, [matchesSummaryData]);
  const nextMatch = useMemo(() => {
    const now = Date.now() / 1000;
    return [...summaryMatches.today, ...summaryMatches.upcoming]
      .filter((f) => !f.status.finished && !f.status.live && f.timestamp > now)
      .sort((a, b) => a.timestamp - b.timestamp)[0] ?? null;
  }, [summaryMatches]);
  const summaryMatchCount =
    summaryMatches.live.length +
    summaryMatches.today.length +
    summaryMatches.upcoming.length +
    summaryMatches.results.length;

  // «المباريات» تتصدّر دائمًا ثم «الترتيب» — قرار المالك 2026-07-05 (يعمّ كل البطولات).
  const tabs = useMemo<TabKey[]>(() => {
    const t: TabKey[] = ["matches"];
    if (!comp || comp.hasStandings) t.push("standings");
    if (!comp || comp.hasScorers) t.push("scorers", "assists", "cards");
    t.push("news");
    return t;
  }, [comp]);

  const [tab, setTab] = useState<TabKey>("matches");
  useEffect(() => {
    if (tabs.length && !tabs.includes(tab)) setTab(tabs[0]);
  }, [tabs, tab]);

  useEffect(() => {
    document.title = comp ? `${comp.name} | سبق سبورت` : "البطولة | سبق سبورت";
  }, [comp]);
  useCanonical(`https://sabq.org/sports/competition/${slug}`);

  const startDays = daysUntil(comp?.start);
  const statusLabel = comp?.status ? COMP_STATUS_LABELS[comp.status] : "";

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />

      <main className="flex-1">
        {/* ترويسة البطولة */}
        <div className="border-b border-border bg-card">
          <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-6">
            <Link href="/sports/matches" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
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
                      <CalendarDays className="h-3.5 w-3.5" /> موسم {seasonLabelFromStart(comp.season, nextMatch?.timestamp ?? null, comp.start)}
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
              {comp && (
                <div className="shrink-0 self-start">
                  <FollowControls
                    kind="competition"
                    refId={slug}
                    refName={comp.name}
                    refLogo={comp.logo}
                    size="md"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl space-y-5 px-3 py-5 sm:px-4 sm:py-6">
          {comp && (
            <CompetitionBrief
              comp={comp}
              nextMatch={nextMatch}
              matchCount={summaryMatchCount}
            />
          )}

          {/* لمحة النسخة السابقة */}
          {history && <PreviousEdition history={history} />}

          {/* التبويبات */}
          <div id="competition-tabs" className="sticky top-16 z-20 -mx-3 scroll-mt-20 border-b border-border bg-background/90 px-3 backdrop-blur-md sm:mx-0 sm:rounded-xl sm:border sm:px-2 sm:py-1.5">
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
            {tab === "standings" && <StandingsPane slug={slug} />}
            {tab === "scorers" && <ScorersPane slug={slug} />}
            {tab === "assists" && <AssistsPane slug={slug} />}
            {tab === "cards" && <CardsPane slug={slug} />}
            {tab === "matches" && <MatchesPane slug={slug} onOpen={setOpenMatch} />}
            {tab === "news" && <NewsPane comp={comp} />}
          </div>

          <div className="flex items-center justify-center pt-2">
            <Link href="/sports" className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:border-primary/40">
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
