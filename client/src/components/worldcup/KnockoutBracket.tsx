/**
 * شجرة الأدوار الإقصائية لكأس العالم — مسار البطولة من دور الـ32 حتى النهائي.
 * تُبنى من نفس مصفوفة المباريات التي تجلبها الصفحة (roundEn الخام) دون أي
 * استدعاء API إضافي. الخانات غير المحسومة تظهر «يُحدَّد لاحقًا» (لا بيانات وهمية).
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatKickoffTime, type WcFixture, type WcGroup, type WcStandingRow, type WcTeam } from "./wcTypes";
import { LiveMinute } from "./LiveMinute";

interface KnockoutBracketProps {
  fixtures: WcFixture[];
  groups: WcGroup[];
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

// شكل استجابة /api/world-cup/bracket (مصدر البنية الخادمي — API-Football حاليًّا،
// وTheSports bracket/season لاحقًا كمصدر أساسي دون تغيير في الواجهة).
interface BracketRoundDto {
  round: string;
  roundEn: string;
  matches: WcFixture[];
}
interface BracketDto {
  source: string;
  rounds: BracketRoundDto[];
}

// ترتيب الأدوار الإقصائية ومسمياتها العربية — ثابتة حتى تظهر العناوين
// قبل توفّر مباريات الدور. المركز الثالث يُعرض منفصلًا خارج الشجرة.
// تسمية الأدوار بعدد المنتخبات المتبقية: 32 ← 16 ← 8 ← 4 ← النهائي ثم البطل
// (المفاتيح تطابق round الخام من API-Football، والمسمّيات فقط هي ما يتغيّر)
const KNOCKOUT_ROUNDS: { key: string; label: string }[] = [
  { key: "round of 32", label: "دور الـ32" },
  { key: "round of 16", label: "دور الـ16" },
  { key: "quarter-finals", label: "دور الـ8" },
  { key: "semi-finals", label: "دور الـ4" },
  { key: "final", label: "النهائي" },
];
const THIRD_PLACE_KEYS = new Set(["3rd place final", "third place", "3rd place"]);

const norm = (round: string): string => (round || "").trim().toLowerCase();

/** الدور الافتراضي لتبويبات الجوال: حيث «الحدث» الآن — مباراة جارية، وإلا
 *  أبكر دور لم يكتمل، وإلا آخر دور (انتهت البطولة) */
function defaultRoundKey(cols: BracketColumn[]): string | undefined {
  const live = cols.find((c) => c.matches.some((m) => m.status.live));
  if (live) return live.key;
  const upcoming = cols.find((c) => c.matches.some((m) => !m.status.finished));
  if (upcoming) return upcoming.key;
  return cols[cols.length - 1]?.key ?? cols[0]?.key;
}

/** منتخب محسوم فعلًا (له معرّف وشعار) مقابل خانة بانتظار التأهل */
const isResolved = (team: WcTeam): boolean => Boolean(team?.id && team?.logo);

interface QualifiedGroup {
  group: WcGroup;
  qualifiers: WcStandingRow[];
}

/**
 * المتأهّلون المؤكَّدون حتى الآن لكل مجموعة — قبل أن يوفّر المزوّد مباريات خروج
 * المغلوب. منتخب يُعدّ متأهّلًا إذا:
 *   • حسمه الخادم رياضيًّا (qualifyStatus === "qualified")، أو
 *   • اكتملت كل مباريات مجموعته وهو في المركزين الأوّلين (عندها qualifyStatus = null).
 * أفضل 8 من أصحاب المركز الثالث لا يُحسبون هنا (يتحدّدون بعد اكتمال كل المجموعات).
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
          {KNOCKOUT_ROUNDS.map((r) => (
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

interface BracketColumn {
  key: string;
  label: string;
  matches: WcFixture[];
}

function TeamLine({
  team,
  goals,
  winner,
  started,
}: {
  team: WcTeam;
  goals: number | null;
  winner: boolean;
  started: boolean;
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

function BracketMatch({ fixture, onOpen }: { fixture: WcFixture; onOpen: (id: number) => void }) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <div
      onClick={() => onOpen(fixture.id)}
      className="wc-match cursor-pointer rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm transition-colors hover:border-emerald-500/60"
      data-testid={`wc-bracket-match-${fixture.id}`}
    >
      <div className="divide-y divide-border/50">
        <TeamLine team={fixture.home} goals={started ? fixture.goals.home ?? 0 : null} winner={fixture.home.winner === true} started={started} />
        <TeamLine team={fixture.away} goals={started ? fixture.goals.away ?? 0 : null} winner={fixture.away.winner === true} started={started} />
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
        <p className="pt-1 text-center text-[10px] text-muted-foreground">{formatKickoffTime(fixture.date)}</p>
      ) : null}
    </div>
  );
}

export function KnockoutBracket({ fixtures, groups, isLoading, onOpenMatch }: KnockoutBracketProps) {
  // مصدر البنية من الخادم (يُركّب أحدث نتيجة لحظية ويُمهّد لإثراء TheSports). يتراجع
  // للمباريات الممرَّرة من الصفحة عند تعذّره فلا تتعطّل الشجرة.
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

  const { columns, thirdPlace, hasAny } = useMemo(() => {
    const cols: BracketColumn[] = KNOCKOUT_ROUNDS.map(({ key, label }) => ({
      key,
      label,
      matches: sourceFixtures
        .filter((f) => norm(f.roundEn) === key)
        .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id),
    }));
    const third = sourceFixtures.find((f) => THIRD_PLACE_KEYS.has(norm(f.roundEn))) ?? null;
    return { columns: cols, thirdPlace: third, hasAny: cols.some((c) => c.matches.length > 0) };
  }, [sourceFixtures]);

  // المتأهّلون المؤكَّدون حتى الآن — يُعرضون مكان النص التحفيزي قبل توفّر مباريات
  // خروج المغلوب، ويُعبَّأون تدريجيًّا فور حسم كل مجموعة (أول/ثاني).
  const qualifiedGroups = useMemo(
    () => (hasAny ? [] : computeQualified(groups, fixtures)),
    [hasAny, groups, fixtures],
  );

  // الأعمدة التي بها مباريات فعلًا — تحدّد طرفَي الشجرة (أول/آخر) للموصّلات
  const liveCols = columns.filter((c) => c.matches.length > 0);
  const firstKey = liveCols[0]?.key;
  const lastKey = liveCols[liveCols.length - 1]?.key;

  // تبويبات الجوال — الدور النشط (مع تعويض إن اختفى دوره بعد تحديث البيانات)
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
              {KNOCKOUT_ROUNDS.map((r) => (
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
            {/* الجوال فقط: تبويبات حسب الدور تلتف لسطرين —
                نفس نمط tabs قسم «المباريات» */}
            <div className="md:hidden">
              <Tabs value={activeKey} onValueChange={setTab} dir="rtl">
                <TabsList className="mb-4 flex-wrap h-auto w-full justify-start">
                  {liveCols.map((col) => (
                    <TabsTrigger key={col.key} value={col.key} className="gap-1.5" data-testid={`wc-bracket-tab-${col.key}`}>
                      {col.matches.some((m) => m.status.live) && (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                      {col.label}
                      {col.key === "final" && " 🏆"}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {liveCols.map((col) => (
                  <TabsContent key={col.key} value={col.key} className="space-y-2 mt-0">
                    {col.matches.map((fx) => (
                      <BracketMatch key={fx.id} fixture={fx} onOpen={onOpenMatch} />
                    ))}
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            {/* سطح المكتب/التابلت: الشجرة الأفقية تملأ العرض دون سحب أفقي */}
            <div className="hidden md:block">
              <div className="pb-3">
                <div className="wc-bracket">
                  {liveCols.map((col) => {
                    const cls = [
                      "wc-round",
                      col.key === firstKey ? "is-first" : "",
                      col.key === lastKey ? "is-last" : "",
                      col.key === "final" ? "is-final" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div key={col.key} className={cls}>
                        <div className="mb-1.5 rounded-md bg-emerald-500/[0.07] py-1.5 text-center text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                          {col.label}
                        </div>
                        <div className="wc-round-body">
                          {col.matches.map((fx) => (
                            <div key={fx.id} className="wc-slot">
                              <BracketMatch fixture={fx} onOpen={onOpenMatch} />
                            </div>
                          ))}
                        </div>
                        {col.key === "final" && (
                          <p className="pt-2 text-center text-[11px] font-extrabold text-amber-600 dark:text-amber-400">
                            🏆 بطل العالم
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {thirdPlace && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
                  🥉 مباراة المركز الثالث
                </p>
                <div className="max-w-[260px]">
                  <BracketMatch fixture={thirdPlace} onOpen={onOpenMatch} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
