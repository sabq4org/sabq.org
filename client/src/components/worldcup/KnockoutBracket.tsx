/**
 * شجرة الأدوار الإقصائية لكأس العالم 2026 — مسار البطولة من دور الـ32 حتى النهائي.
 *
 * البنية والترقيم رسميّان (FIFA): تُبنى الشجرة من البنية الثابتة في
 * `wc2026Bracket.ts` (أرقام المباريات 73–104 ومصادرها)، ثم نُسقط فوقها مباريات
 * الاشتراك (API-Football) مربوطةً بأرقامها الرسمية. الخانات غير المحسومة تعرض
 * مصدرها الحقيقي («الفائز من مباراة …») لا ترقيمًا اعتباطيًّا.
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatKickoffDay, formatKickoffTime, type WcFixture, type WcGroup, type WcStandingRow, type WcTeam } from "./wcTypes";
import { LiveMinute } from "./LiveMinute";
import {
  buildBracketModel,
  fixtureWinnerSide,
  WC_ROUND_KEYS,
  WC_ROUND_LABELS,
  type WcBracketColumn,
} from "./wc2026Bracket";

interface KnockoutBracketProps {
  fixtures: WcFixture[];
  groups: WcGroup[];
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

// شكل استجابة /api/world-cup/bracket (مصدر المباريات الخادمي — يُركّب أحدث نتيجة لحظية).
interface BracketRoundDto {
  round: string;
  roundEn: string;
  matches: WcFixture[];
}
interface BracketDto {
  source: string;
  rounds: BracketRoundDto[];
}

// عناوين الأدوار للشرائح التوضيحية (شاشة الانتظار + ترويسة المتأهّلين).
const ROUND_CHIPS = WC_ROUND_KEYS.map((key) => ({ key, label: WC_ROUND_LABELS[key] }));

/** الدور الافتراضي لتبويبات الجوال: حيث «الحدث» الآن — مباراة جارية، وإلا
 *  أبكر دور لم يكتمل، وإلا آخر دور (انتهت البطولة). */
function defaultRoundKey(cols: WcBracketColumn[]): string | undefined {
  const live = cols.find((c) => c.slots.some((s) => s.fixture?.status.live));
  if (live) return live.key;
  const upcoming = cols.find((c) => c.slots.some((s) => s.fixture && !s.fixture.status.finished));
  if (upcoming) return upcoming.key;
  return cols[cols.length - 1]?.key ?? cols[0]?.key;
}

/** منتخب محسوم فعلًا (له معرّف وشعار) مقابل خانة بانتظار التأهل. */
const isResolved = (team?: WcTeam): boolean => Boolean(team?.id && team?.logo);

interface QualifiedGroup {
  group: WcGroup;
  qualifiers: WcStandingRow[];
}

/**
 * المتأهّلون المؤكَّدون حتى الآن لكل مجموعة — قبل أن يوفّر المزوّد مباريات خروج
 * المغلوب. منتخب يُعدّ متأهّلًا إذا حسمه الخادم رياضيًّا (qualifyStatus) أو اكتملت
 * كل مباريات مجموعته وهو في المركزين الأوّلين. أفضل 8 من أصحاب المركز الثالث لا
 * يُحسبون هنا (يتحدّدون بعد اكتمال كل المجموعات).
 */
function computeQualified(groups: WcGroup[], fixtures: WcFixture[]): QualifiedGroup[] {
  const out: QualifiedGroup[] = [];
  for (const g of groups) {
    const ids = new Set(g.rows.map((r) => r.team.id));
    const groupMatches = fixtures.filter((f) => ids.has(f.home.id) && ids.has(f.away.id));
    const complete = groupMatches.length > 0 && groupMatches.every((f) => f.status.finished);
    const qualifiers = g.rows
      .filter((r) => r.qualifyStatus === "qualified" || (complete && r.rank <= 2))
      .sort((a, b) => a.rank - b.rank);
    if (qualifiers.length > 0) out.push({ group: g, qualifiers });
  }
  return out;
}

function QualifiedSoFar({ qualifiedGroups }: { qualifiedGroups: QualifiedGroup[] }) {
  const total = qualifiedGroups.reduce((n, q) => n + q.qualifiers.length, 0);
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3.5 py-1.5 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          <Trophy className="h-4 w-4" />
          المتأهّلون حتى الآن
          <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-black text-white tabular-nums">
            {total}
          </span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {ROUND_CHIPS.map((r) => (
            <span
              key={r.key}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
            >
              {r.label}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {qualifiedGroups.map(({ group, qualifiers }) => (
          <div
            key={group.groupEn}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <p className="text-xs font-extrabold text-emerald-700 dark:text-emerald-300">{group.group}</p>
              <span className="text-[10px] font-semibold text-muted-foreground">متأهّل</span>
            </div>
            <div className="divide-y divide-border/60">
              {qualifiers.map((r) => (
                <Link
                  key={r.team.id}
                  href={`/world-cup/team/${r.team.id}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 transition-all hover-elevate active-elevate-2"
                  data-testid={`wc-qualified-${r.team.id}`}
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[10px] font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                    {r.rank}
                  </span>
                  <span className="h-6 w-6 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-border">
                    <img src={r.team.logo} alt={r.team.name} className="h-full w-full object-contain" loading="lazy" />
                  </span>
                  <span className="flex-1 truncate text-sm font-bold">{r.team.name}</span>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        تُحدَّد المواجهات وأفضل 8 من أصحاب المركز الثالث بعد اكتمال دور المجموعات (28 يونيو 2026).
      </p>
    </div>
  );
}

/** بطاقة مباراة لعرض الجوال (قائمة عمودية لكل دور). */
function BracketMatch({
  fixture,
  matchNo,
  onOpen,
}: {
  fixture: WcFixture;
  matchNo?: number;
  onOpen: (id: number) => void;
}) {
  const started = fixture.status.live || fixture.status.finished;
  const winSide = fixtureWinnerSide(fixture);
  return (
    <div
      onClick={() => onOpen(fixture.id)}
      className="wc-match cursor-pointer rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm transition-colors hover:border-emerald-500/60"
      data-testid={`wc-bracket-match-${fixture.id}`}
    >
      {matchNo != null && (
        <p className="pb-1 text-[10px] font-bold text-muted-foreground">
          مباراة <span className="tabular-nums">{matchNo}</span>
        </p>
      )}
      <div className="divide-y divide-border/50">
        <TeamLine team={fixture.home} goals={started ? fixture.goals.home ?? 0 : null} winner={winSide === "home"} />
        <TeamLine team={fixture.away} goals={started ? fixture.goals.away ?? 0 : null} winner={winSide === "away"} />
      </div>
      {fixture.penalties && (
        <p className="pt-1 text-center text-[9.5px] text-muted-foreground" dir="rtl">
          ركلات الترجيح <span dir="ltr" className="tabular-nums">{fixture.penalties.home} - {fixture.penalties.away}</span>
        </p>
      )}
      {fixture.status.live ? (
        <p className="pt-1 text-center text-[10px] font-bold text-red-600 dark:text-red-400">
          ● <LiveMinute status={fixture.status} /> مباشر
        </p>
      ) : !started && fixture.status.code !== "TBD" && fixture.timestamp > 0 ? (
        <p className="pt-1 text-center text-[10px] text-muted-foreground">
          {formatKickoffDay(fixture.date)} · {formatKickoffTime(fixture.date)}
        </p>
      ) : null}
    </div>
  );
}

function TeamLine({
  team,
  goals,
  winner,
}: {
  team: WcTeam;
  goals: number | null;
  winner: boolean;
}) {
  if (!isResolved(team)) {
    return (
      <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground/70">
        <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-muted" />
        <span className="truncate">يُحدَّد لاحقًا</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="flex items-center gap-2 min-w-0">
        <span className="h-[18px] w-[18px] shrink-0 rounded-full bg-white ring-1 ring-border p-px">
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        </span>
        <span className={`truncate text-xs ${winner ? "font-extrabold" : "font-semibold"}`}>{team.name}</span>
      </span>
      {goals != null && (
        <span
          className={`text-sm tabular-nums ${winner ? "font-black text-emerald-600 dark:text-emerald-400" : "font-bold text-muted-foreground"}`}
        >
          {goals}
        </span>
      )}
    </div>
  );
}

function TreeTeamLine({
  team,
  goals,
  winner,
  label,
}: {
  team?: WcTeam;
  goals?: number | null;
  winner?: boolean;
  label?: string;
}) {
  if (!team || !isResolved(team)) {
    return (
      <div className="wc-tree-team is-placeholder">
        <span className="wc-tree-logo" />
        <span className="truncate">{label ?? "يتحدد لاحقًا"}</span>
      </div>
    );
  }
  return (
    <div className={`wc-tree-team ${winner ? "is-winner-row" : ""}`}>
      <span className="wc-tree-logo">
        <img src={team.logo} alt={team.name} loading="lazy" />
      </span>
      <span className={`truncate ${winner ? "font-black" : "font-semibold"}`}>{team.name}</span>
      {goals != null && (
        <span className={`wc-tree-score ${winner ? "is-winner" : ""}`}>{goals}</span>
      )}
    </div>
  );
}

function TreeMatchCard({
  match,
  matchNo,
  isFinal,
  topLabel,
  bottomLabel,
  topTeam,
  bottomTeam,
  onOpen,
}: {
  match?: WcFixture;
  matchNo: number;
  isFinal: boolean;
  topLabel?: string;
  bottomLabel?: string;
  topTeam?: WcTeam;
  bottomTeam?: WcTeam;
  onOpen: (id: number) => void;
}) {
  const shortStatus = (fx: WcFixture) => {
    if (fx.status.live) return "مباشرة الآن";
    if (fx.status.finished) return "انتهت";
    if (fx.status.code !== "TBD" && fx.timestamp > 0) return formatKickoffTime(fx.date);
    return "قريبًا";
  };

  const started = Boolean(match?.status.live || match?.status.finished);
  const winSide = fixtureWinnerSide(match);
  return (
    <button
      type="button"
      disabled={!match}
      onClick={() => match && onOpen(match.id)}
      className={`wc-tree-card ${match ? "is-clickable" : "is-empty"} ${isFinal ? "is-final" : ""}`}
      data-testid={match ? `wc-tree-match-${match.id}` : `wc-tree-slot-${matchNo}`}
    >
      <div className="wc-tree-card-head">
        <span>{match ? shortStatus(match) : "بانتظار التأهل"}</span>
        <strong>
          {isFinal ? "النهائي" : "مباراة "}
          {!isFinal && <span className="tabular-nums">{matchNo}</span>}
        </strong>
      </div>
      <div className="wc-tree-lines">
        <TreeTeamLine
          team={match?.home ?? topTeam}
          goals={match && started ? match.goals.home ?? 0 : null}
          winner={winSide === "home"}
          label={topLabel}
        />
        <TreeTeamLine
          team={match?.away ?? bottomTeam}
          goals={match && started ? match.goals.away ?? 0 : null}
          winner={winSide === "away"}
          label={bottomLabel}
        />
      </div>
      {match?.penalties && (
        <p className="wc-tree-note">
          ركلات الترجيح <span dir="ltr">{match.penalties.home} - {match.penalties.away}</span>
        </p>
      )}
      {isFinal && !match?.status.finished && (
        <p className="wc-tree-champion">🏆 بطل العالم</p>
      )}
    </button>
  );
}

function DesktopKnockoutTree({ columns, onOpen }: { columns: WcBracketColumn[]; onOpen: (id: number) => void }) {
  const rounds = columns.map((col) => {
    const rowSpan = Math.max(1, 2 ** col.roundIndex);
    const isFinalRound = col.roundIndex === columns.length - 1;
    const slots = col.slots.map((slot, slotIndex) => ({
      ...slot,
      rowStart: 2 + slotIndex * rowSpan,
      rowSpan,
      isUpper: slotIndex % 2 === 0,
      // وسوم المصادر الرسمية للخانات غير المحسومة (لا تظهر لدور الـ32 — له فرقه).
      topLabel: slot.sources ? `الفائز من مباراة ${slot.sources[0]}` : "يُحدَّد لاحقًا",
      bottomLabel: slot.sources ? `الفائز من مباراة ${slot.sources[1]}` : "يُحدَّد لاحقًا",
    }));
    return { ...col, isFinalRound, slots };
  });
  const hasRoundOf32 = columns.some((c) => c.key === "round of 32" && c.slots.some((s) => s.fixture));

  return (
    <div className="wc-tree-shell">
      <div className="wc-tree-toolbar">
        <div>
          <p className="text-xs font-black text-emerald-700 dark:text-emerald-300">مسار خروج المغلوب</p>
          <h3 className="text-xl font-black tracking-normal text-foreground">
            {hasRoundOf32 ? "من دور الـ32 حتى النهائي" : "الأدوار الإقصائية"}
          </h3>
        </div>
        <span className="wc-tree-hint">← اسحب أفقيًا لتتبع المسار</span>
      </div>

      <div className="wc-tree-scroll" dir="rtl">
        <div className="wc-tree-grid">
          {rounds.map((round) => (
            <div
              key={`${round.key}-title`}
              className="wc-tree-round-title"
              style={{ gridColumn: round.roundIndex + 1, gridRow: 1 }}
            >
              {round.label}
            </div>
          ))}

          {rounds.map((round) =>
            round.slots.map((slot) => (
              <div
                key={`${round.key}-${slot.matchNo}`}
                className={`wc-tree-node ${
                  round.isFinalRound ? "is-last-round" : slot.isUpper ? "is-upper" : "is-lower"
                }`}
                style={{
                  gridColumn: round.roundIndex + 1,
                  gridRow: `${slot.rowStart} / span ${slot.rowSpan}`,
                }}
              >
                <TreeMatchCard
                  match={slot.fixture}
                  matchNo={slot.matchNo}
                  isFinal={round.isFinalRound}
                  topLabel={round.roundIndex === 0 ? undefined : slot.topLabel}
                  bottomLabel={round.roundIndex === 0 ? undefined : slot.bottomLabel}
                  topTeam={slot.topTeam}
                  bottomTeam={slot.bottomTeam}
                  onOpen={onOpen}
                />
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

export function KnockoutBracket({ fixtures, groups, isLoading, onOpenMatch }: KnockoutBracketProps) {
  // مصدر المباريات من الخادم (يُركّب أحدث نتيجة لحظية). يتراجع للمباريات الممرَّرة
  // من الصفحة عند تعذّره فلا تتعطّل الشجرة.
  const { data: bracketData } = useQuery<BracketDto>({
    queryKey: ["/api/world-cup/bracket"],
    refetchInterval: (query) =>
      (query.state.data?.rounds ?? []).some((r) => r.matches.some((m) => m.status.live))
        ? 8_000
        : 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const sourceFixtures = useMemo(() => {
    const fromServer = bracketData?.rounds?.flatMap((r) => r.matches) ?? [];
    return fromServer.length > 0 ? fromServer : fixtures;
  }, [bracketData, fixtures]);

  // نموذج الشجرة الرسمي (أرقام + مصادر) مع إسقاط مباريات الاشتراك على مواضعها.
  const { columns, thirdPlace, hasAny } = useMemo(() => buildBracketModel(sourceFixtures), [sourceFixtures]);

  // المتأهّلون المؤكَّدون حتى الآن — يُعرضون مكان الشجرة قبل توفّر مباريات الإقصاء.
  const qualifiedGroups = useMemo(
    () => (hasAny ? [] : computeQualified(groups, fixtures)),
    [hasAny, groups, fixtures],
  );

  // الأعمدة التي بها مباريات فعلًا — لتبويبات الجوال.
  const liveCols = columns.filter((c) => c.slots.some((s) => s.fixture));

  const [tab, setTab] = useState<string | null>(null);
  const activeKey = tab && liveCols.some((c) => c.key === tab) ? tab : defaultRoundKey(liveCols);

  return (
    <section dir="rtl" className="py-10" id="knockout">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <Trophy className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">الأدوار الإقصائية</h2>
            <p className="text-sm text-muted-foreground">
              مسار البطولة من دور الـ32 حتى النهائي — تتحدّث النتائج لحظة بلحظة
            </p>
          </div>
        </div>

        {isLoading && <Skeleton className="h-[420px] rounded-xl" />}

        {!isLoading && !hasAny && qualifiedGroups.length > 0 && (
          <QualifiedSoFar qualifiedGroups={qualifiedGroups} />
        )}

        {!isLoading && !hasAny && qualifiedGroups.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center sm:p-8">
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
              {ROUND_CHIPS.map((r) => (
                <span
                  key={r.key}
                  className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                >
                  {r.label}
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              تبدأ الأدوار الإقصائية بعد اكتمال دور المجموعات (28 يونيو 2026) — وسيظهر مسار البطولة هنا تلقائيًا لحظة بلحظة.
            </p>
          </div>
        )}

        {!isLoading && hasAny && (
          <>
            {/* الجوال فقط: تبويبات حسب الدور */}
            <div className="md:hidden">
              <Tabs value={activeKey} onValueChange={setTab} dir="rtl">
                <TabsList className="mb-4 flex-wrap h-auto w-full justify-start">
                  {liveCols.map((col) => (
                    <TabsTrigger key={col.key} value={col.key} className="gap-1.5" data-testid={`wc-bracket-tab-${col.key}`}>
                      {col.slots.some((s) => s.fixture?.status.live) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                      {col.label}
                      {col.key === "final" && " 🏆"}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {liveCols.map((col) => (
                  <TabsContent key={col.key} value={col.key} className="space-y-2 mt-0">
                    {/* قائمة مسطّحة (لا شجرة) → ترتيب زمني حسب موعد الانطلاق الفعلي
                        (رقم المباراة الرسمي ليس مطابقًا للتسلسل الزمني دائمًا) */}
                    {col.slots
                      .filter((s) => s.fixture)
                      .sort((a, b) => a.fixture!.timestamp - b.fixture!.timestamp || a.matchNo - b.matchNo)
                      .map((s) => (
                        <BracketMatch key={s.matchNo} fixture={s.fixture!} matchNo={s.matchNo} onOpen={onOpenMatch} />
                      ))}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* سطح المكتب/التابلت: الشجرة البنيوية الأفقية */}
            <div className="hidden md:block">
              <DesktopKnockoutTree columns={columns} onOpen={onOpenMatch} />
            </div>

            {thirdPlace && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  🥉 مباراة المركز الثالث
                </p>
                <div className="max-w-[260px]">
                  <BracketMatch fixture={thirdPlace} matchNo={103} onOpen={onOpenMatch} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
