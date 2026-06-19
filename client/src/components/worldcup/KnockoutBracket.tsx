/**
 * شجرة الأدوار الإقصائية لكأس العالم — مسار البطولة من دور الـ32 حتى النهائي.
 * تُبنى من نفس مصفوفة المباريات التي تجلبها الصفحة (roundEn الخام) دون أي
 * استدعاء API إضافي. الخانات غير المحسومة تظهر «يُحدَّد لاحقًا» (لا بيانات وهمية).
 */
import { useMemo } from "react";
import { Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKickoffTime, type WcFixture, type WcTeam } from "./wcTypes";
import { LiveMinute } from "./LiveMinute";

interface KnockoutBracketProps {
  fixtures: WcFixture[];
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

// ترتيب الأدوار الإقصائية ومسمياتها العربية — ثابتة حتى تظهر العناوين
// قبل توفّر مباريات الدور. المركز الثالث يُعرض منفصلًا خارج الشجرة.
const KNOCKOUT_ROUNDS: { key: string; label: string }[] = [
  { key: "round of 32", label: "دور الـ32" },
  { key: "round of 16", label: "دور الـ16" },
  { key: "quarter-finals", label: "ربع النهائي" },
  { key: "semi-finals", label: "نصف النهائي" },
  { key: "final", label: "النهائي" },
];
const THIRD_PLACE_KEYS = new Set(["3rd place final", "third place", "3rd place"]);

const norm = (round: string): string => (round || "").trim().toLowerCase();

/** منتخب محسوم فعلًا (له معرّف وشعار) مقابل خانة بانتظار التأهل */
const isResolved = (team: WcTeam): boolean => Boolean(team?.id && team?.logo);

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

export function KnockoutBracket({ fixtures, isLoading, onOpenMatch }: KnockoutBracketProps) {
  const { columns, thirdPlace, hasAny } = useMemo(() => {
    const cols: BracketColumn[] = KNOCKOUT_ROUNDS.map(({ key, label }) => ({
      key,
      label,
      matches: fixtures
        .filter((f) => norm(f.roundEn) === key)
        .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id),
    }));
    const third = fixtures.find((f) => THIRD_PLACE_KEYS.has(norm(f.roundEn))) ?? null;
    return { columns: cols, thirdPlace: third, hasAny: cols.some((c) => c.matches.length > 0) };
  }, [fixtures]);

  // الأعمدة التي بها مباريات فعلًا — تحدّد طرفَي الشجرة (أول/آخر) للموصّلات
  const liveCols = columns.filter((c) => c.matches.length > 0);
  const firstKey = liveCols[0]?.key;
  const lastKey = liveCols[liveCols.length - 1]?.key;

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

        {!isLoading && !hasAny && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
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
              تبدأ الأدوار الإقصائية بعد اكتمال دور المجموعات — وسيظهر مسار البطولة هنا تلقائيًا.
            </p>
          </div>
        )}

        {!isLoading && hasAny && (
          <>
            <p className="text-[11px] text-muted-foreground mb-2">← اسحب أفقيًا لتتبّع المسار</p>
            <div className="overflow-x-auto pb-3">
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
