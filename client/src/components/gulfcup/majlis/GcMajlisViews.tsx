import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Coins,
  Crown,
  Flame,
  Medal,
  RefreshCcw,
  ShieldQuestion,
  Sparkles,
  Swords,
  Target,
  Trophy,
  UserRound,
  Users,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { todayRiyadhKey } from "@/components/gulfcup/gcTypes";
import type {
  GcMajlisChampion,
  GcMajlisChampionPickRow,
  GcMajlisDuel,
  GcMajlisFantasyRow,
  GcMajlisHarvestAward,
  GcMajlisHarvestResponse,
  GcMajlisLeaderboardRow,
  GcMajlisMatchdayMatch,
  GcMajlisMatchdayResponse,
  GcMajlisMemberPrediction,
} from "./gcMajlisTypes";
import { gcMajlisKeys } from "./gcMajlisTypes";
import { GcMajlisHarvestShareDialog } from "./GcMajlisShareDialog";

type ApiRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ApiRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function objectOf(value: unknown): ApiRecord {
  return isRecord(value) ? value : {};
}

function rootOf(raw: unknown): ApiRecord {
  const root = objectOf(raw);
  return isRecord(root.data) ? root.data : root;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeMember(raw: ApiRecord): GcMajlisMemberPrediction {
  const prediction = isRecord(raw.prediction) ? raw.prediction : raw;
  const predHome = numberOrNull(prediction.predHome ?? prediction.home);
  const predAway = numberOrNull(prediction.predAway ?? prediction.away);
  return {
    userId: String(raw.userId ?? raw.id ?? ""),
    name: String(raw.name ?? raw.displayName ?? "عضو سبق"),
    avatar: typeof raw.avatar === "string" ? raw.avatar : typeof raw.profileImageUrl === "string" ? raw.profileImageUrl : null,
    isOwner: raw.isOwner === true,
    hasPredicted: raw.hasPredicted === true || raw.submitted === true || predHome != null,
    predHome,
    predAway,
    status: typeof prediction.status === "string" ? prediction.status : null,
    tier: typeof prediction.tier === "string" ? prediction.tier : typeof prediction.evaluation === "string" ? prediction.evaluation : null,
    pointsAwarded: Number(prediction.pointsAwarded ?? prediction.points ?? 0),
    provisional: prediction.provisional === true,
  };
}

function normalizeMatch(raw: ApiRecord): GcMajlisMatchdayMatch {
  const fixture = isRecord(raw.fixture) ? raw.fixture : raw;
  const fixtureStatus = objectOf(fixture.status);
  const rawStatus = String(raw.status ?? fixtureStatus.code ?? fixtureStatus.short ?? fixture.status ?? "open").toLowerCase();
  const visibility = typeof raw.visibility === "string" ? raw.visibility : "";
  const authoritativeVisibility = ["sealed", "revealed", "settled"].includes(visibility);
  const settled = authoritativeVisibility
    ? visibility === "settled"
    : raw.settled === true || rawStatus === "settled" || rawStatus === "finished" || rawStatus === "ft";
  const live = fixtureStatus.live === true || raw.live === true || ["live", "1h", "ht", "2h", "et", "p"].includes(rawStatus);
  const locked = authoritativeVisibility
    ? visibility !== "sealed"
    : raw.locked === true || settled || live || rawStatus === "locked";
  const home = objectOf(raw.homeTeam ?? fixture.homeTeam ?? fixture.home);
  const away = objectOf(raw.awayTeam ?? fixture.awayTeam ?? fixture.away);
  const members = asArray<ApiRecord>(raw.members ?? raw.predictions).map(normalizeMember);
  const voided = ["canc", "abd", "wo", "awd", "void"].includes(rawStatus) ||
    members.some((member) => member.status === "void" || member.tier === "void");
  const result = objectOf(raw.result);
  const score = objectOf(raw.score);
  const goals = objectOf(fixture.goals);
  const kickoff = raw.kickoffAt ?? fixture.kickoffAt ?? fixture.date ?? (
    typeof fixture.timestamp === "number" ? new Date(fixture.timestamp * 1000).toISOString() : ""
  );
  return {
    fixtureId: String(raw.fixtureId ?? fixture.fixtureId ?? fixture.id ?? ""),
    kickoffAt: String(kickoff),
    status: rawStatus,
    locked,
    live,
    settled,
    voided,
    homeTeam: {
      name: String(home.name ?? raw.homeTeamName ?? "الفريق الأول"),
      logo: typeof home.logo === "string" ? home.logo : typeof raw.homeTeamLogo === "string" ? raw.homeTeamLogo : null,
    },
    awayTeam: {
      name: String(away.name ?? raw.awayTeamName ?? "الفريق الثاني"),
      logo: typeof away.logo === "string" ? away.logo : typeof raw.awayTeamLogo === "string" ? raw.awayTeamLogo : null,
    },
    finalHome: numberOrNull(raw.finalHome ?? result.home ?? score.home ?? goals.home),
    finalAway: numberOrNull(raw.finalAway ?? result.away ?? score.away ?? goals.away),
    members,
  };
}

function normalizeMatchday(raw: unknown): GcMajlisMatchdayResponse {
  const root = rootOf(raw);
  const dayChampion = objectOf(root.dayChampion);
  const championRows = asArray<ApiRecord>(root.champions ?? dayChampion.winners ?? (root.champion ? [root.champion] : []));
  return {
    majlis: isRecord(root.majlis) ? root.majlis as unknown as GcMajlisMatchdayResponse["majlis"] : undefined,
    dayKey: typeof root.dayKey === "string" ? root.dayKey : undefined,
    matches: asArray<ApiRecord>(root.matches).map(normalizeMatch),
    champions: championRows.map(
      (row): GcMajlisChampion => ({
        userId: String(row.userId ?? row.id ?? ""),
        name: String(row.name ?? row.displayName ?? "عضو سبق"),
        avatar: typeof row.avatar === "string" ? row.avatar : null,
        points: Number(row.points ?? row.totalPoints ?? 0),
      }),
    ),
  };
}

function Avatar({ name, src, size = "md" }: { name: string; src?: string | null; size?: "sm" | "md" }) {
  const classes = size === "sm" ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-xs";
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-emerald-900/10 font-black text-sky-800 ring-1 ring-border ${classes}`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : name.slice(0, 1)}
    </span>
  );
}

function StateCard({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
      <Icon className="mx-auto h-9 w-9 text-muted-foreground/50" aria-hidden="true" />
      <h3 className="mt-3 font-black">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="جارٍ تحميل بيانات المجلس">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-28 rounded-2xl" />
      ))}
    </div>
  );
}

function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <StateCard
      icon={CircleAlert}
      title="تعذّر تحديث المجلس"
      description="بياناتك محفوظة. تحقق من الاتصال وحاول مرة أخرى."
      action={
        <Button variant="outline" onClick={retry} className="gap-2">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" /> إعادة المحاولة
        </Button>
      }
    />
  );
}

function kickoffLabel(value: string): string {
  if (!value) return "موعد المباراة قريبًا";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "موعد المباراة قريبًا";
  return new Intl.DateTimeFormat("ar-SA", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

function tierLabel(tier?: string | null): string {
  if (tier === "void") return "أُلغيت المباراة — لا تُحتسب";
  if (tier === "exact") return "مطابقة دقيقة";
  if (tier === "margin") return "فارق صحيح";
  if (tier === "outcome") return "نتيجة صحيحة";
  if (!tier || tier === "pending") return "قيد المتابعة";
  return "لم تُصب";
}

function MatchCard({ match, focused = false }: { match: GcMajlisMatchdayMatch; focused?: boolean }) {
  return (
    <article
      id={`gc-majlis-fixture-${match.fixtureId}`}
      className={`overflow-hidden rounded-2xl border bg-card shadow-sm transition-colors motion-reduce:transition-none ${
        focused ? "border-sky-400 ring-2 ring-sky-400/30" : "border-border"
      }`}
      aria-label={focused ? "المباراة المرتبطة بالإشعار" : undefined}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/25 px-4 py-3">
        <Clock3 className="h-4 w-4 text-sky-600" aria-hidden="true" />
        <p className="text-xs font-bold text-muted-foreground">{kickoffLabel(match.kickoffAt)}</p>
        <span
          className={`mr-auto rounded-full px-2.5 py-1 text-[10px] font-black ${
            match.live
              ? "bg-red-500/10 text-red-600 dark:text-red-300"
              : match.voided
                ? "bg-slate-500/10 text-slate-600 dark:text-slate-300"
              : match.settled
                ? "bg-sky-600/10 text-emerald-700 dark:text-sky-300"
                : match.locked
                  ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
                  : "bg-sky-500/10 text-sky-700 dark:text-sky-300"
          }`}
        >
          {match.live ? "مباشر" : match.voided ? "أُلغيت — لا تُحتسب" : match.settled ? "انتهت" : match.locked ? "أُقفلت التوقعات" : "التوقعات مفتوحة"}
        </span>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5 text-center">
        <Team name={match.homeTeam.name} logo={match.homeTeam.logo} />
        <div className="rounded-xl bg-muted px-4 py-2 font-black tabular-nums">
          {match.voided ? "—" : match.finalHome != null && match.finalAway != null ? `${match.finalHome} — ${match.finalAway}` : "ضد"}
        </div>
        <Team name={match.awayTeam.name} logo={match.awayTeam.logo} />
      </div>

      <div className="border-t border-border px-3 py-3">
        <p className="mb-2 px-1 text-[11px] font-bold text-muted-foreground">
          {match.locked ? "وش توقّع مجلسك؟" : "من حسم توقّعه؟"}
        </p>
        {match.members.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">لا أعضاء ظاهرين لهذه المباراة بعد.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {match.members.map((member) => {
              const revealed = match.locked && member.predHome != null && member.predAway != null;
              return (
                <li key={member.userId} className="flex items-center gap-2 rounded-xl bg-muted/35 px-3 py-2">
                  <Avatar name={member.name} src={member.avatar} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-xs font-bold">
                    {member.name}{member.isOwner ? " · صاحب المجلس" : ""}
                  </span>
                  {revealed ? (
                    <div className="text-left">
                      <p className="rounded-lg bg-background px-2 py-1 text-sm font-black tabular-nums ring-1 ring-border" dir="ltr">
                        {member.predHome} - {member.predAway}
                      </p>
                      {match.settled || match.live || member.provisional ? (
                        <p className={`mt-1 text-[9px] font-bold ${member.pointsAwarded ? "text-emerald-700 dark:text-sky-300" : "text-muted-foreground"}`}>
                          {match.voided
                            ? "أُلغيت المباراة — لا تُحتسب"
                            : match.live
                            ? `${tierLabel(member.tier)} الآن`
                            : !match.settled || member.provisional
                              ? "بانتظار احتساب النقاط"
                              : `${tierLabel(member.tier)} · ${formatNumber(member.pointsAwarded ?? 0)} نقطة`}
                        </p>
                      ) : null}
                    </div>
                  ) : member.hasPredicted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-600/10 px-2 py-1 text-[10px] font-black text-emerald-700 dark:text-sky-300">
                      <Check className="h-3 w-3" aria-hidden="true" /> توقّع
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground">لم يتوقّع</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </article>
  );
}

function Team({ name, logo }: { name: string; logo?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-white p-1.5 ring-1 ring-border dark:bg-white/90">
        {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <ShieldQuestion className="h-6 w-6 text-muted-foreground" />}
      </span>
      <span className="line-clamp-2 text-xs font-black">{name}</span>
    </div>
  );
}

function matchdayDateFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("date") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function shiftDateKey(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function matchdayDateLabel(value: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  }).format(new Date(`${value}T12:00:00Z`));
}

function fixtureDateKey(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const iso = raw.date ?? raw.kickoffAt;
  const date = typeof iso === "string"
    ? new Date(iso)
    : typeof raw.timestamp === "number"
      ? new Date(raw.timestamp * 1000)
      : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return value.year && value.month && value.day ? `${value.year}-${value.month}-${value.day}` : null;
}

export function GcMajlisTodayView({ majlisId, focusFixtureId }: { majlisId: string; focusFixtureId?: string | null }) {
  const today = todayRiyadhKey();
  const scrolledFixture = useRef<string | null>(null);
  const [date, setDate] = useState(() => {
    const requested = matchdayDateFromUrl();
    return requested ?? today;
  });

  useEffect(() => {
    const sync = () => {
      const requested = matchdayDateFromUrl();
      setDate(requested ?? todayRiyadhKey());
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const selectDate = (next: string) => {
    setDate(next);
    const url = new URL(window.location.href);
    if (next === today) url.searchParams.delete("date");
    else url.searchParams.set("date", next);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const fixturesQuery = useQuery<unknown>({
    queryKey: ["/api/gulf-cup/fixtures"],
    enabled: Boolean(focusFixtureId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!focusFixtureId) return;
    const root = rootOf(fixturesQuery.data);
    const fixture = asArray<ApiRecord>(root.fixtures).find(
      (item) => String(item.id ?? item.fixtureId ?? "") === focusFixtureId,
    );
    const targetDate = fixtureDateKey(fixture);
    if (!targetDate || targetDate === date) return;
    setDate(targetDate);
    const url = new URL(window.location.href);
    url.searchParams.set("date", targetDate);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [date, fixturesQuery.data, focusFixtureId]);

  const query = useQuery<unknown>({
    queryKey: gcMajlisKeys.matchday(majlisId, date),
    enabled: Boolean(majlisId),
    staleTime: 8_000,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (state) => {
      const data = normalizeMatchday(state.state.data);
      if (data.matches.some((match) => match.live)) return 10_000;
      if (data.matches.some((match) => match.locked && !match.settled)) return 30_000;
      return 60_000;
    },
  });
  const data = normalizeMatchday(query.data);

  useEffect(() => {
    if (!focusFixtureId || scrolledFixture.current === `${majlisId}:${focusFixtureId}`) return;
    if (!data.matches.some((match) => match.fixtureId === focusFixtureId)) return;
    scrolledFixture.current = `${majlisId}:${focusFixtureId}`;
    window.requestAnimationFrame(() => {
      document.getElementById(`gc-majlis-fixture-${focusFixtureId}`)?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "center",
      });
    });
  }, [data.matches, focusFixtureId, majlisId]);
  const navigator = (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm" aria-label="التنقل بين أيام المجلس">
      <Button type="button" size="icon" variant="ghost" onClick={() => selectDate(shiftDateKey(date, -1))} aria-label="اليوم السابق">
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1 text-center">
        <p className="truncate text-sm font-black">{date === today ? "اليوم · " : ""}{matchdayDateLabel(date)}</p>
        {date !== today ? <button type="button" onClick={() => selectDate(today)} className="mt-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-300">العودة إلى اليوم</button> : <p className="mt-0.5 text-[10px] text-muted-foreground">بتوقيت الرياض</p>}
      </div>
      <Button type="button" size="icon" variant="ghost" onClick={() => selectDate(shiftDateKey(date, 1))} aria-label="اليوم التالي">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
  const withNavigator = (content: React.ReactNode) => <div className="space-y-4">{navigator}{content}</div>;

  if (query.isLoading) return withNavigator(<LoadingCards />);
  if (query.isError) return withNavigator(<ErrorCard retry={() => void query.refetch()} />);
  if (data.matches.length === 0) {
    return withNavigator(
      <StateCard
        icon={CalendarDays}
        title={date === today ? "لا مباريات للمجلس اليوم" : "لا مباريات في هذا اليوم"}
        description={date === today ? "سنضع مباريات اليوم هنا فور فتح التوقعات. يمكنك مراجعة توقعاتك أو ترتيب المجلس الآن." : "جرّب اليوم السابق أو عد إلى اليوم لمراجعة توقعات المجلس."}
        action={
          <Button asChild className="gap-2 bg-sky-600 text-white hover:bg-sky-800">
            <Link href="/gulf-cup/predictions">
              اذهب إلى التوقعات <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        }
      />,
    );
  }

  return withNavigator(
    <>
      {data.champions.length > 0 ? (
        <section className="relative overflow-hidden rounded-2xl border border-sky-400/30 bg-gradient-to-l from-sky-400/15 via-card to-card p-4">
          <Trophy className="absolute -bottom-5 left-4 h-24 w-24 text-sky-400/10" aria-hidden="true" />
          <p className="text-xs font-black text-sky-700 dark:text-sky-300">بطل اليوم في مجلسك</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {data.champions.map((champion) => (
              <div key={champion.userId} className="flex items-center gap-2 rounded-full bg-background/80 py-1.5 pl-3 pr-1.5 ring-1 ring-sky-400/30">
                <Avatar name={champion.name} src={champion.avatar} size="sm" />
                <span className="text-sm font-black">{champion.name}</span>
                <span className="text-xs font-black text-sky-700 dark:text-sky-300">+{formatNumber(champion.points)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {data.matches.map((match) => (
        <MatchCard key={match.fixtureId} match={match} focused={match.fixtureId === focusFixtureId} />
      ))}
    </>,
  );
}

export function GcMajlisLeaderboardView({ majlisId, currentUserId }: { majlisId: string; currentUserId?: string }) {
  const query = useQuery<{ rows?: GcMajlisLeaderboardRow[] }>({
    queryKey: gcMajlisKeys.leaderboard(majlisId),
    enabled: Boolean(majlisId),
    staleTime: 20_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const rows = asArray<GcMajlisLeaderboardRow>(rootOf(query.data).rows);
  if (query.isLoading) return <LoadingCards count={5} />;
  if (query.isError) return <ErrorCard retry={() => void query.refetch()} />;
  if (!rows.length) return <StateCard icon={Medal} title="الترتيب ينتظر أول مباراة" description="كل أعضاء المجلس سيظهرون هنا، حتى من لم يبدأ التوقع بعد." />;

  return (
    <ol className="space-y-2">
      {rows.map((row) => {
        const me = row.userId === currentUserId;
        return (
          <li key={row.userId} className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${me ? "border-sky-400/50 bg-sky-400/[0.07]" : "border-border bg-card"}`}>
            <span className="grid w-7 place-items-center font-black text-muted-foreground">{row.rank <= 3 ? ["🥇", "🥈", "🥉"][row.rank - 1] : formatNumber(row.rank)}</span>
            <Avatar name={row.name} src={row.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">
                {row.name}{me ? " (أنت)" : ""}{row.isOwner ? " · صاحب المجلس" : ""}{row.isDayChampion ? " 🏆" : ""}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {row.isDayChampion ? "بطل الجولة · " : ""}
                {formatNumber(row.correctCount)} إصابة · {formatNumber(row.exactCount)} مطابقة دقيقة
              </p>
            </div>
            <div className="text-left">
              <p className="text-lg font-black tabular-nums text-sky-800 dark:text-sky-300">{formatNumber(row.totalPoints)}</p>
              <p className="text-[9px] text-muted-foreground">نقطة</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function GcMajlisFantasyView({ majlisId, currentUserId }: { majlisId: string; currentUserId?: string }) {
  const query = useQuery<unknown>({
    queryKey: gcMajlisKeys.fantasy(majlisId),
    enabled: Boolean(majlisId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const root = rootOf(query.data);
  const rows = asArray<GcMajlisFantasyRow>(root.rows ?? root.leaders ?? root.members);
  if (query.isLoading) return <LoadingCards count={4} />;
  if (query.isError) return <ErrorCard retry={() => void query.refetch()} />;
  if (!rows.some((row) => row.hasSquad)) {
    return <StateCard icon={Sparkles} title="لا تشكيلات في المجلس بعد" description="كوّن تشكيلتك في فانتازي خليجي، وستظهر منافستكم هنا تلقائيًا." action={<Button asChild variant="outline"><Link href="/gulf-cup/predictions?tab=fantasy">كوّن تشكيلتك</Link></Button>} />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row, index) => (
        <article key={row.userId} className={`rounded-2xl border p-4 ${row.userId === currentUserId ? "border-sky-400/50 bg-sky-400/[0.07]" : "border-border bg-card"}`}>
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-600/10 font-black text-sky-800">#{formatNumber(row.rank ?? index + 1)}</span>
            <Avatar name={row.name} src={row.avatar} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{row.name}</p>
              {row.captainName ? <p className="truncate text-[10px] text-muted-foreground">القائد: {row.captainName}</p> : null}
            </div>
            <div className="text-left">
              <p className="text-lg font-black text-sky-800 dark:text-sky-300">{row.hasSquad ? formatNumber(row.totalPoints) : "—"}</p>
              {!row.hasSquad ? <p className="text-[9px] text-muted-foreground">بلا تشكيلة</p> : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function GcMajlisChampionPicksView({ majlisId }: { majlisId: string }) {
  const query = useQuery<unknown>({
    queryKey: gcMajlisKeys.championPicks(majlisId),
    enabled: Boolean(majlisId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const root = rootOf(query.data);
  const rows = asArray<ApiRecord>(root.rows ?? root.picks ?? root.members).map((row): GcMajlisChampionPickRow => {
    const pick = objectOf(row.pick);
    return {
      userId: String(row.userId ?? row.id ?? ""),
      name: String(row.name ?? "عضو سبق"),
      avatar: typeof row.avatar === "string" ? row.avatar : null,
      hasPicked: row.hasPicked === true,
      teamId: numberOrNull(pick.teamId ?? row.teamId),
      teamName: typeof pick.teamName === "string" ? pick.teamName : typeof row.teamName === "string" ? row.teamName : null,
      teamLogo: typeof pick.teamLogo === "string" ? pick.teamLogo : typeof row.teamLogo === "string" ? row.teamLogo : null,
    };
  });
  if (query.isLoading) return <LoadingCards count={4} />;
  if (query.isError) return <ErrorCard retry={() => void query.refetch()} />;
  if (!rows.length) return <StateCard icon={Crown} title="توقعات البطل لم تظهر بعد" description="تظهر اختيارات أعضاء المجلس هنا وفق قواعد إقفال توقع بطل البطولة." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <article key={row.userId} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <Avatar name={row.name} src={row.avatar} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{row.name}</p>
            <p className="text-[10px] text-muted-foreground">اختيار البطل</p>
          </div>
          {row.teamLogo ? <img src={row.teamLogo} alt="" className="h-9 w-9 object-contain" /> : null}
          <p className="max-w-28 truncate text-sm font-black text-sky-700 dark:text-sky-300">{row.teamName || (row.hasPicked ? "اختار سرًا" : "لم يختر")}</p>
        </article>
      ))}
    </div>
  );
}

function duelStatus(status: string): string {
  const labels: Record<string, string> = { pending: "بانتظار القبول", accepted: "التحدي قائم", declined: "مرفوض", cancelled: "ملغي", expired: "انتهت المهلة", settled: "تم الحسم", refunded: "أُعيد الرهان" };
  return labels[status] ?? status;
}

export function GcMajlisDuelsView({ majlisId, currentUserId }: { majlisId: string; currentUserId?: string }) {
  const { toast } = useToast();
  const [challengedUserId, setChallengedUserId] = useState("");
  const [fixtureId, setFixtureId] = useState("");
  const [stake, setStake] = useState(50);
  const query = useQuery<unknown>({
    queryKey: gcMajlisKeys.duels(majlisId),
    enabled: Boolean(majlisId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const matchdayQuery = useQuery<unknown>({
    queryKey: gcMajlisKeys.matchday(majlisId),
    enabled: Boolean(majlisId),
    staleTime: 30_000,
  });
  const root = rootOf(query.data);
  const matchday = normalizeMatchday(matchdayQuery.data);
  const duels = asArray<ApiRecord>(root.duels ?? root.rows).map((row): GcMajlisDuel => {
    const challenger = objectOf(row.challenger);
    const challenged = objectOf(row.challenged);
    const fixtureId = String(row.fixtureId ?? "");
    const fixture = matchday.matches.find((match) => match.fixtureId === fixtureId);
    const challengerId = String(row.challengerId ?? challenger.userId ?? "");
    const challengedId = String(row.challengedId ?? challenged.userId ?? "");
    const challengerName = String(row.challengerName ?? challenger.name ?? "عضو سبق");
    const challengedName = String(row.challengedName ?? challenged.name ?? "عضو سبق");
    return {
      id: String(row.id ?? ""),
      status: String(row.status ?? "pending"),
      stake: Number(row.stake ?? 0),
      fixtureId,
      challengerId,
      challengedId,
      challengerName,
      challengedName,
      winnerId: typeof row.winnerId === "string" ? row.winnerId : null,
      createdAt: typeof row.createdAt === "string" ? row.createdAt : undefined,
      homeTeamName: typeof row.homeTeamName === "string" ? row.homeTeamName : fixture?.homeTeam.name,
      awayTeamName: typeof row.awayTeamName === "string" ? row.awayTeamName : fixture?.awayTeam.name,
      challenger: {
        userId: challengerId,
        name: challengerName,
        avatar: typeof challenger.avatar === "string" ? challenger.avatar : null,
      },
      challenged: {
        userId: challengedId,
        name: challengedName,
        avatar: typeof challenged.avatar === "string" ? challenged.avatar : null,
      },
    };
  });
  const memberOptions = useMemo(() => {
    const eligible = asArray<ApiRecord>(root.eligibleMembers).map(normalizeMember);
    if (eligible.length) return eligible;
    const byId = new Map<string, GcMajlisMemberPrediction>();
    for (const match of matchday.matches) for (const member of match.members) if (member.userId && member.userId !== currentUserId) byId.set(member.userId, member);
    return Array.from(byId.values());
  }, [root.eligibleMembers, matchday.matches, currentUserId]);
  const matchOptions = matchday.matches.filter((match) => !match.locked);

  const create = useMutation({
    mutationFn: () => apiRequest(`/api/gulf-cup/majlis/${majlisId}/duels`, {
      method: "POST",
      body: JSON.stringify({ challengedUserId, fixtureId: Number(fixtureId), stake }),
    }),
    onSuccess: () => {
      toast({ title: "أُرسل التحدي ⚔️", description: "بانتظار قبول عضو مجلسك" });
      setChallengedUserId("");
      setFixtureId("");
      void queryClient.invalidateQueries({ queryKey: gcMajlisKeys.duels(majlisId) });
    },
    onError: (error: Error) => toast({ title: "تعذّر إرسال التحدي", description: error.message, variant: "destructive" }),
  });
  const act = useMutation({
    mutationFn: ({ duelId, action }: { duelId: string; action: "accept" | "decline" | "cancel" }) =>
      apiRequest(`/api/gulf-cup/majlis/duels/${duelId}/${action}`, { method: "POST" }),
    onSuccess: (_data, variables) => {
      const messages = { accept: "قُبل التحدي ⚔️", decline: "رُفض التحدي وأُعيد الرهان", cancel: "أُلغي التحدي وأُعيد الرهان" };
      toast({ title: messages[variables.action] });
      void queryClient.invalidateQueries({ queryKey: gcMajlisKeys.duels(majlisId) });
    },
    onError: (error: Error) => toast({ title: "تعذّر تحديث التحدي", description: error.message, variant: "destructive" }),
  });

  if (query.isLoading) return <LoadingCards count={4} />;
  if (query.isError) return <ErrorCard retry={() => void query.refetch()} />;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-sky-600" aria-hidden="true" />
          <h3 className="font-black">تحدَّ عضوًا من مجلسك</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">اختر مباراة مفتوحة ورهانًا ضمن سقفك اليومي. لا يُحسم شيء قبل قبول الطرف الآخر.</p>
        {memberOptions.length && matchOptions.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-bold">
              العضو
              <select value={challengedUserId} onChange={(event) => setChallengedUserId(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 font-normal">
                <option value="">اختر عضوًا</option>
                {memberOptions.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold">
              المباراة
              <select value={fixtureId} onChange={(event) => setFixtureId(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 font-normal">
                <option value="">اختر مباراة</option>
                {matchOptions.map((match) => <option key={match.fixtureId} value={match.fixtureId}>{match.homeTeam.name} × {match.awayTeam.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold">
              الرهان
              <select value={stake} onChange={(event) => setStake(Number(event.target.value))} className="h-10 w-full rounded-xl border border-border bg-background px-3 font-normal">
                {[10, 50, 100].map((value) => <option key={value} value={value}>{formatNumber(value)} نقطة</option>)}
              </select>
            </label>
            <Button onClick={() => create.mutate()} disabled={!challengedUserId || !fixtureId || create.isPending} className="gap-2 bg-sky-600 text-white hover:bg-sky-800 sm:col-span-3 sm:mr-auto">
              <Swords className="h-4 w-4" /> {create.isPending ? "جارٍ الإرسال…" : "أرسل التحدي"}
            </Button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-muted/50 px-3 py-3 text-xs text-muted-foreground">تُفتح التحديات عندما تتوفر مباراة مفتوحة وعضو آخر في المجلس.</p>
        )}
      </section>

      {duels.length === 0 ? (
        <StateCard icon={Swords} title="لا تحديات بعد" description="ابدأ أول مواجهة جانبية في المجلس؛ الرهان يعود للطرفين عند التعادل." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {duels.map((duel) => (
            <article key={duel.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs font-black">
                <Swords className="h-4 w-4 text-sky-600" />
                {duel.challengerName} <span className="text-muted-foreground">ضد</span> {duel.challengedName}
              </div>
              {duel.homeTeamName ? <p className="mt-2 text-xs text-muted-foreground">{duel.homeTeamName} × {duel.awayTeamName}</p> : null}
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/10 px-2 py-1 text-[10px] font-black text-sky-700 dark:text-sky-300"><Coins className="h-3 w-3" /> {formatNumber(duel.stake)}</span>
                <span className="mr-auto rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{duelStatus(duel.status)}</span>
              </div>
              {duel.status === "settled" && duel.winnerId ? (
                <p className="mt-3 rounded-xl bg-sky-600/10 px-3 py-2 text-xs font-bold text-emerald-800 dark:text-emerald-200">
                  الفائز: {duel.winnerId === duel.challengerId ? duel.challengerName : duel.winnerId === duel.challengedId ? duel.challengedName : "عضو المجلس"} 🏆
                </p>
              ) : duel.status === "refunded" ? (
                <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">انتهى التحدي بالتعادل وعاد الرهان للطرفين.</p>
              ) : null}
              {duel.status === "pending" && duel.challengedId === currentUserId ? (
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ duelId: duel.id, action: "accept" })} className="flex-1 bg-sky-600 text-white hover:bg-sky-800">قبول</Button>
                  <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ duelId: duel.id, action: "decline" })} variant="outline" className="flex-1">رفض</Button>
                </div>
              ) : duel.status === "pending" && duel.challengerId === currentUserId ? (
                <Button size="sm" disabled={act.isPending} onClick={() => act.mutate({ duelId: duel.id, action: "cancel" })} variant="ghost" className="mt-3 w-full text-muted-foreground">إلغاء التحدي</Button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function awardIcon(key: string) {
  if (key.includes("champion")) return Trophy;
  if (key.includes("accurate")) return Target;
  if (key.includes("bold")) return Flame;
  if (key.includes("stubborn")) return Crown;
  return Sparkles;
}

export function GcMajlisHarvestView({ majlisId }: { majlisId: string }) {
  const query = useQuery<unknown>({
    queryKey: gcMajlisKeys.harvest(majlisId),
    enabled: Boolean(majlisId),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
  const root = rootOf(query.data);
  const majlis = objectOf(root.majlis);
  const majlisName = typeof majlis.name === "string" ? majlis.name : "مجلسكم";
  const rawAwards = objectOf(root.awards);
  const normalizeAwardRows = (
    key: string,
    title: string,
    description: (row: ApiRecord) => string,
    value: (row: ApiRecord) => string | number | undefined,
    rows: unknown,
  ): GcMajlisHarvestAward[] => asArray<ApiRecord>(rows).map((row) => ({
    key,
    title,
    description: description(row),
    userId: typeof row.userId === "string" ? row.userId : undefined,
    name: String(row.name ?? "عضو سبق"),
    avatar: typeof row.avatar === "string" ? row.avatar : null,
    value: value(row),
  }));
  const awards = Array.isArray(root.awards)
    ? (root.awards as GcMajlisHarvestAward[])
    : [
        ...normalizeAwardRows("champion", "بطل المجلس", (row) => `${formatNumber(Number(row.exactCount ?? 0))} مطابقة دقيقة`, (row) => `${formatNumber(Number(row.totalPoints ?? 0))} نقطة`, rawAwards.champions),
        ...normalizeAwardRows("accurate", "الأدق", (row) => `${formatNumber(Number(row.correctCount ?? 0))} إصابة من ${formatNumber(Number(row.playedCount ?? 0))}`, (row) => `${formatNumber(Number(row.accuracy ?? 0))}%`, rawAwards.mostAccurate),
        ...normalizeAwardRows("bold", "الأجرأ", (row) => "أصاب توقعًا خالف الاحتمالات", (row) => `${formatNumber(Number(row.pickProb ?? 0))}%`, rawAwards.boldest),
        ...normalizeAwardRows("stubborn", "العنيد", (row) => `تمسّك بـ${String(row.teamName ?? "اختياره")}`, (row) => `${formatNumber(Number(row.picksCount ?? 0))} مرات`, rawAwards.stubborn),
      ];
  const data: GcMajlisHarvestResponse = {
    ready: root.ready === true || root.status === "ready",
    title: typeof root.title === "string" ? root.title : undefined,
    awards,
  };
  if (query.isLoading) return <LoadingCards count={4} />;
  if (query.isError) return <ErrorCard retry={() => void query.refetch()} />;
  if (!data.ready) return <StateCard icon={Trophy} title="حصاد المجلس بعد النهائي" description="عند نهاية البطولة نلخّص بطل المجلس، الأدق، الأجرأ والعنيد في بطاقة واحدة قابلة للمشاركة." />;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-gradient-to-bl from-sky-500 via-sky-600 to-[#075339] p-5 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-sky-100">خليجي 27 · الختام</p>
            <h3 className="mt-1 text-2xl font-black">{data.title || "حصاد مجلسكم"}</h3>
            <p className="mt-2 text-sm text-emerald-50/85">14 يومًا من التوقعات والمسامرة… وهذه حكاية المجلس بالأرقام.</p>
          </div>
          <GcMajlisHarvestShareDialog majlisId={majlisId} majlisName={majlisName} awards={data.awards} />
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.awards.map((award) => {
          const Icon = awardIcon(award.key);
          return (
            <article key={`${award.key}-${award.userId ?? award.name}`} className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-gradient-to-l from-sky-400/[0.08] to-card p-4">
              <Icon className="absolute -bottom-3 left-1 h-20 w-20 text-sky-400/10" />
              <p className="text-[10px] font-black text-sky-700 dark:text-sky-300">{award.title}</p>
              <div className="mt-3 flex items-center gap-3">
                <Avatar name={award.name} src={award.avatar} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black">{award.name}</p>
                  {award.description ? <p className="mt-0.5 text-[10px] text-muted-foreground">{award.description}</p> : null}
                </div>
                {award.value != null ? <span className="font-black text-sky-800 dark:text-sky-300">{String(award.value)}</span> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
