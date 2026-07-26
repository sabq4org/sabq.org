// مركز التوقعات — صفحة الويب الموحّدة للمنصة المركزية (كل البطولات ما عدا
// مونديال 2026 الباقي على صفحاته). المرجع الوظيفي: التصميم المعتمد
// 2026-07-17 — بطاقة بطولة تفصل نقاط الترتيب عن المحفظة، تبويبات
// المباريات/سجلّي/المتصدرون، ولوحة تعلن نطاقها وما تشمله نقاطها.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, ListOrdered, LogIn, Trophy } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { formatNumber } from "@/lib/format";
import { rememberPostAuthReturn } from "@/lib/postAuthRedirect";
import { PredictionMatchCard } from "@/components/predictions/PredictionMatchCard";
import { PredictionRulesCard } from "@/components/predictions/PredictionRulesCard";
import { PredictionSeasonCard } from "@/components/predictions/PredictionSeasonCard";
import { PredictionSettlementDrawer } from "@/components/predictions/PredictionSettlementDrawer";
import {
  kickoffDayAr,
  type PredCompetitionDetail,
  type PredCompetitionSummary,
  type PredContest,
  type PredLeaderboardResponse,
  type PredLedgerResponse,
} from "@/components/predictions/predictionTypes";

type Tab = "matches" | "ledger" | "leaders";

const TABS: { key: Tab; label: string }[] = [
  { key: "matches", label: "المباريات" },
  { key: "ledger", label: "سجلّي" },
  { key: "leaders", label: "المتصدّرون" },
];

/** رابط عميق لكل بطولة: /predictions?competition=<slug> — تقرأه الصفحة عند
 *  الفتح وتزامنه عند التبديل، فتصلح الروابط للمشاركة وتحويلات المسارات القديمة. */
function competitionFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("competition");
}

function syncCompetitionUrl(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("competition", slug);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function PredictionCenter() {
  const { user, isAuthenticated } = useAuth();
  const [tab, setTab] = useState<Tab>("matches");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(competitionFromUrl);
  const [settlementContestId, setSettlementContestId] = useState<string | null>(null);

  const goLogin = () => {
    rememberPostAuthReturn(window.location.pathname + window.location.search);
    window.location.href = "/login";
  };

  // البطولات النشطة
  const { data: competitionsRaw, isLoading: competitionsLoading } = useQuery<{
    competitions: PredCompetitionSummary[];
  }>({ queryKey: ["/api/predictions/competitions"], staleTime: 60_000 });
  const competitions = Array.isArray(competitionsRaw?.competitions)
    ? competitionsRaw.competitions
    : [];
  const selected = competitions.find((c) => c.slug === selectedSlug) ?? competitions[0] ?? null;
  // رابط لبطولة غير متاحة (معطّلة/خاطئة): لا نتظاهر — نصحّح الرابط ونخبر الزائر
  // بدل السقوط الصامت لأول بطولة بينما العنوان يوحي بغيرها.
  const requestedMissing =
    Boolean(selectedSlug) && competitions.length > 0 && !competitions.some((c) => c.slug === selectedSlug);
  useEffect(() => {
    if (requestedMissing && selected) syncCompetitionUrl(selected.slug);
  }, [requestedMissing, selected]);

  // مسابقات البطولة المختارة
  const { data: detailRaw, isLoading: detailLoading } = useQuery<PredCompetitionDetail>({
    queryKey: [`/api/predictions/competitions/${selected?.slug}`],
    enabled: Boolean(selected),
    staleTime: 30_000,
  });
  const contests = Array.isArray(detailRaw?.contests) ? detailRaw.contests : [];
  const rules = Array.isArray(detailRaw?.rules) ? detailRaw.rules : [];

  // اللوحة (تُستخدم أيضًا لترتيبي في البطاقة)
  const { data: boardRaw } = useQuery<PredLeaderboardResponse>({
    queryKey: ["/api/predictions/leaderboards", { competition: selected?.slug ?? "" }],
    enabled: Boolean(selected),
    staleTime: 60_000,
  });

  // سجل نقاطي
  const { data: ledgerRaw, isLoading: ledgerLoading } = useQuery<PredLedgerResponse>({
    queryKey: ["/api/predictions/me/ledger", { competition: selected?.slug ?? "" }],
    enabled: Boolean(selected) && isAuthenticated && tab === "ledger",
  });
  const ledgerItems = Array.isArray(ledgerRaw?.items) ? ledgerRaw.items : [];

  const grouped = useMemo(() => groupContests(contests), [contests]);

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-6">
        {/* بطاقة البطولة */}
        {competitionsLoading ? (
          <Skeleton className="h-40 w-full rounded-3xl" />
        ) : competitions.length === 0 ? (
          <EmptyBlock
            icon={<Trophy className="h-8 w-8" />}
            title="لا بطولات توقعات متاحة حاليًا"
            subtitle="ستظهر البطولات هنا فور انطلاقها"
          />
        ) : (
          <>
            {requestedMissing && selected && (
              <p className="mb-3 rounded-xl bg-amber-500/10 px-4 py-2.5 text-[12px] font-semibold text-amber-800 dark:text-amber-300">
                البطولة المطلوبة غير متاحة حاليًا — عرضنا لك {selected.nameAr}.
              </p>
            )}
            {competitions.length > 1 && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {competitions.map((comp) => (
                  <button
                    key={comp.slug}
                    type="button"
                    onClick={() => {
                      setSelectedSlug(comp.slug);
                      syncCompetitionUrl(comp.slug);
                    }}
                    className={`whitespace-nowrap rounded-full px-4 py-1.5 text-[12px] font-bold transition ${
                      comp.slug === selected?.slug
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {comp.nameAr}
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <HeroCard
                competition={selected}
                myRank={boardRaw?.myRank ?? null}
                isAuthenticated={isAuthenticated}
                onLogin={goLogin}
              />
            )}

            {/* شرح النظام — ظاهر للجميع قبل تسجيل الدخول وقبل فتح أي عدّاد */}
            <PredictionRulesCard rules={rules} />

            {/* التبويبات */}
            <div className="mt-4 flex gap-2">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`flex-1 rounded-xl py-2 text-[13px] font-bold transition ${
                    tab === item.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {tab === "matches" && (
                <MatchesTab
                  grouped={grouped}
                  loading={detailLoading}
                  competitionSlug={selected?.slug ?? ""}
                  isAuthenticated={isAuthenticated}
                  onLoginNeeded={goLogin}
                  onOpenSettlement={setSettlementContestId}
                />
              )}
              {tab === "ledger" &&
                (isAuthenticated ? (
                  <LedgerTab items={ledgerItems} loading={ledgerLoading} />
                ) : (
                  <SignInPrompt onLogin={goLogin} />
                ))}
              {tab === "leaders" && <LeadersTab board={boardRaw ?? null} />}
            </div>
          </>
        )}
      </main>

      <PredictionSettlementDrawer
        contestId={settlementContestId}
        onClose={() => setSettlementContestId(null)}
      />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// بطاقة البطولة — نقاط الترتيب (كهرماني التميّز) منفصلة عن كل ما سواها
// ---------------------------------------------------------------------------

function HeroCard({
  competition,
  myRank,
  isAuthenticated,
  onLogin,
}: {
  competition: PredCompetitionSummary;
  myRank: { rank: number; points: number } | null;
  isAuthenticated: boolean;
  onLogin: () => void;
}) {
  return (
    <div className="rounded-3xl bg-gradient-to-bl from-slate-900 via-slate-800 to-slate-900 p-5 text-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-xl">
          <Trophy className="h-5 w-5 text-amber-400" />
        </span>
        <div>
          <h1 className="text-lg font-extrabold">{competition.nameAr}</h1>
          <p className="text-[11.5px] text-white/60">موسم {competition.seasonKey}</p>
        </div>
      </div>

      {isAuthenticated ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <HeroStat value={formatNumber(competition.myPoints ?? 0)} label="نقاطي في البطولة" gold />
          <HeroStat value={myRank ? `#${formatNumber(myRank.rank)}` : "—"} label="ترتيبي" />
          <HeroStat value={formatNumber(competition.openContests)} label="توقّعات مفتوحة" />
        </div>
      ) : (
        <button
          type="button"
          onClick={onLogin}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 py-2.5 text-[13px] font-bold text-white transition hover:bg-white/20"
        >
          <LogIn className="h-4 w-4" />
          سجّل الدخول لتتوقّع وتنافس على النقاط
        </button>
      )}
    </div>
  );
}

function HeroStat({ value, label, gold }: { value: string; label: string; gold?: boolean }) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-2.5">
      <div className={`text-lg font-extrabold tabular-nums ${gold ? "text-amber-400" : "text-white"}`}>
        {value}
      </div>
      <div className="text-[10.5px] text-white/60">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// تبويب المباريات
// ---------------------------------------------------------------------------

type GroupedContests = {
  /** مسابقات الموسم الطويلة (بطل/هدّاف) — كانت تُرشَّح فتختفي كليًا من الويب. */
  season: PredContest[];
  open: PredContest[];
  locked: PredContest[];
  finished: PredContest[];
};

function groupContests(contests: PredContest[]): GroupedContests {
  const matchScore = contests.filter((c) => c.contestType === "match_score");
  return {
    season: contests
      .filter((c) => c.contestType === "champion" || c.contestType === "top_scorer")
      .sort((a, b) => a.contestType.localeCompare(b.contestType)),
    open: matchScore
      .filter((c) => c.status === "open")
      .sort((a, b) => a.locksAt.localeCompare(b.locksAt)),
    locked: matchScore
      .filter((c) => c.status === "locked" || c.status === "ready")
      .sort((a, b) => a.locksAt.localeCompare(b.locksAt)),
    finished: matchScore
      .filter((c) => c.status === "settled" || c.status === "void")
      .sort((a, b) => (b.settledAt ?? b.locksAt).localeCompare(a.settledAt ?? a.locksAt))
      .slice(0, 10),
  };
}

function MatchesTab({
  grouped,
  loading,
  competitionSlug,
  isAuthenticated,
  onLoginNeeded,
  onOpenSettlement,
}: {
  grouped: GroupedContests;
  loading: boolean;
  competitionSlug: string;
  isAuthenticated: boolean;
  onLoginNeeded: () => void;
  onOpenSettlement: (contestId: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const isEmpty =
    grouped.season.length === 0 &&
    grouped.open.length === 0 &&
    grouped.locked.length === 0 &&
    grouped.finished.length === 0;
  if (isEmpty) {
    return (
      <EmptyBlock
        icon={<CalendarClock className="h-8 w-8" />}
        title="لا مباريات متاحة للتوقّع الآن"
        subtitle="تُفتح التوقّعات فور إعلان جدول المباريات"
      />
    );
  }

  const renderCard = (contest: PredContest) => (
    <PredictionMatchCard
      key={contest.id}
      contest={contest}
      competitionSlug={competitionSlug}
      isAuthenticated={isAuthenticated}
      onLoginNeeded={onLoginNeeded}
      onOpenSettlement={onOpenSettlement}
    />
  );

  return (
    <div className="space-y-3">
      {grouped.season.length > 0 && (
        <>
          <h3 className="text-[12px] font-extrabold text-muted-foreground">توقّعات الموسم</h3>
          {grouped.season.map((contest) => (
            <PredictionSeasonCard
              key={contest.id}
              contest={contest}
              competitionSlug={competitionSlug}
              isAuthenticated={isAuthenticated}
              onLoginNeeded={onLoginNeeded}
            />
          ))}
          <h3 className="pt-2 text-[12px] font-extrabold text-muted-foreground">المباريات</h3>
        </>
      )}
      {[...grouped.open, ...grouped.locked].map(renderCard)}
      {grouped.finished.length > 0 && (
        <>
          <h3 className="pt-2 text-[12px] font-extrabold text-muted-foreground">انتهت</h3>
          {grouped.finished.map(renderCard)}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// تبويب سجلّي
// ---------------------------------------------------------------------------

function LedgerTab({
  items,
  loading,
}: {
  items: PredLedgerResponse["items"];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <EmptyBlock
        icon={<ListOrdered className="h-8 w-8" />}
        title="لا قيود نقاط بعد"
        subtitle="ستظهر نقاطك هنا فور تسوية أول مباراة توقّعتها"
      />
    );
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
        >
          <div>
            <div className="text-[12.5px] font-bold text-foreground">{item.reasonLabelAr}</div>
            <div className="text-[10.5px] text-muted-foreground">{kickoffDayAr(item.createdAt)}</div>
          </div>
          <span
            className={`text-sm font-extrabold tabular-nums ${
              item.points >= 0 ? "text-primary" : "text-destructive"
            }`}
          >
            {item.points >= 0 ? `+${formatNumber(item.points)}` : formatNumber(item.points)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// تبويب المتصدرين — الرأس يعلن النطاق وما تشمله النقاط
// ---------------------------------------------------------------------------

function LeadersTab({ board }: { board: PredLeaderboardResponse | null }) {
  if (!board || board.entries.length === 0) {
    return (
      <EmptyBlock
        icon={<Trophy className="h-8 w-8" />}
        title="لا ترتيب بعد"
        subtitle="تُبنى اللوحة بعد تسوية أول مباريات البطولة"
      />
    );
  }
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="text-[13px] font-extrabold text-foreground">{board.nameAr}</div>
        <div className="text-[10.5px] text-muted-foreground">
          توقّعات المباريات · النقاط الأساسية دون مضاعف العضوية
        </div>
      </div>

      {board.myRank && (
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-bl from-slate-900 to-slate-800 px-4 py-3 text-white">
          <span className="text-[12.5px] font-bold">ترتيبك الحالي</span>
          <span className="text-sm font-extrabold tabular-nums">
            #{formatNumber(board.myRank.rank)} · {formatNumber(board.myRank.points)}
          </span>
        </div>
      )}

      {board.entries.map((entry) => (
        <div
          key={entry.userId}
          className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5"
        >
          <span
            className={`w-6 text-center text-[12.5px] font-extrabold tabular-nums ${
              entry.rank <= 3 ? "text-amber-500" : "text-muted-foreground"
            }`}
          >
            {entry.rank}
          </span>
          {entry.profileImageUrl ? (
            <img src={entry.profileImageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[12px] font-extrabold text-primary">
              {entry.name.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-bold text-foreground">{entry.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {formatNumber(entry.exactCount)} نتيجة دقيقة
            </div>
          </div>
          <span className="text-[13px] font-extrabold tabular-nums text-primary">
            {formatNumber(entry.points)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// عناصر مشتركة
// ---------------------------------------------------------------------------

function EmptyBlock({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-12 text-center">
      <span className="text-primary">{icon}</span>
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="text-[12px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function SignInPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
      <LogIn className="h-8 w-8 text-primary" />
      <p className="text-sm font-bold text-foreground">سجّل الدخول لعرض سجل نقاطك</p>
      <button
        type="button"
        onClick={onLogin}
        className="rounded-xl bg-primary px-6 py-2 text-[13px] font-bold text-primary-foreground transition hover:opacity-90"
      >
        تسجيل الدخول
      </button>
    </div>
  );
}
