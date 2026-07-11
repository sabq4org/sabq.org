import { motion } from "framer-motion";
import { MapPin, Radio, Trophy } from "lucide-react";
import { SAUDI_TEAM_ID, formatKickoffDay, formatKickoffTime, type GcFixture } from "./gcTypes";

/**
 * شجرة «الطريق إلى اللقب» — نصفَا النهائي يتفرّعان بموصل SVG واضح إلى النهائي.
 */

function winnerSide(f: GcFixture): "home" | "away" | null {
  if (!f.status.finished) return null;
  const hg = f.goals.home ?? 0;
  const ag = f.goals.away ?? 0;
  if (hg > ag) return "home";
  if (ag > hg) return "away";
  return null;
}

function BracketTeam({
  team,
  goals,
  winner,
  showGoals,
}: {
  team: GcFixture["home"];
  goals: number | null;
  winner: boolean;
  showGoals: boolean;
}) {
  const unresolved = !team.id;
  const saudi = team.id === SAUDI_TEAM_ID;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        {!unresolved && (
          <div className="h-6 w-6 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-border">
            {team.logo ? (
              <img src={team.logo} alt="" className="h-full w-full object-contain" loading="lazy" />
            ) : null}
          </div>
        )}
        <span
          className={`truncate text-xs sm:text-sm ${
            unresolved
              ? "font-medium text-muted-foreground"
              : winner || saudi
                ? "font-extrabold text-foreground"
                : "font-semibold text-foreground/80"
          }`}
        >
          {team.name}
        </span>
      </div>
      {showGoals && goals != null && (
        <span
          className={`shrink-0 text-sm tabular-nums ${
            winner ? "font-black text-sky-600 dark:text-sky-400" : "font-bold text-muted-foreground"
          }`}
        >
          {goals}
        </span>
      )}
    </div>
  );
}

function BracketMatch({
  fixture,
  onOpen,
  featured = false,
}: {
  fixture: GcFixture;
  onOpen?: (id: number) => void;
  featured?: boolean;
}) {
  const started = fixture.status.live || fixture.status.finished;
  const win = winnerSide(fixture);
  const clickable = !!onOpen && !!fixture.home.id && !!fixture.away.id;

  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onOpen!(fixture.id) : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onOpen!(fixture.id);
            }
          : undefined
      }
      className={`relative z-[1] w-full rounded-xl border bg-card px-3 py-2 shadow-sm transition ${
        clickable ? "cursor-pointer hover:border-sky-400/60 hover:shadow-md" : ""
      } ${
        featured
          ? "border-sky-400/60 shadow-md ring-2 ring-sky-400/25 dark:border-sky-400/40"
          : "border-border"
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="font-bold text-sky-600 dark:text-sky-400">#{fixture.matchNo}</span>
        {fixture.status.live ? (
          <span className="flex items-center gap-1 font-bold text-red-500">
            <Radio className="h-3 w-3 animate-pulse" />
            {fixture.status.elapsed != null ? `${fixture.status.elapsed}′` : "مباشر"}
          </span>
        ) : started ? (
          <span className="font-semibold">انتهت</span>
        ) : (
          <span>
            {formatKickoffDay(fixture.date)} · {formatKickoffTime(fixture.date)}
          </span>
        )}
      </div>

      <div className="divide-y divide-border/60">
        <BracketTeam
          team={fixture.home}
          goals={started ? fixture.goals.home ?? 0 : null}
          winner={win === "home"}
          showGoals={started}
        />
        <BracketTeam
          team={fixture.away}
          goals={started ? fixture.goals.away ?? 0 : null}
          winner={win === "away"}
          showGoals={started}
        />
      </div>

      {fixture.venue?.name && (
        <p className="mt-1.5 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {fixture.venue.name}
            {fixture.venue.city ? ` — ${fixture.venue.city}` : ""}
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * موصل شجري واضح: فرعان من نصفَي النهائي يلتقيان ثم سهم للأسفل نحو النهائي.
 * SVG بعرض كامل الصف حتى يطابق مراكز البطاقتين.
 */
function BracketConnector() {
  return (
    <div className="relative -my-1 w-full px-2 sm:px-6" aria-hidden>
      {/* سطح المكتب: شجرة بفرعين */}
      <svg
        className="mx-auto hidden h-16 w-full max-w-xl text-sky-500 dark:text-sky-400 sm:block"
        viewBox="0 0 400 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* فرع يمين (وسط البطاقة اليمنى ≈ 100) */}
        <path
          d="M100 0 V22 H200"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* فرع يسار (وسط البطاقة اليسرى ≈ 300) */}
        <path
          d="M300 0 V22 H200"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* جذع للأسفل */}
        <path d="M200 22 V48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        {/* رأس السهم */}
        <path
          d="M200 56 L192 44 H208 Z"
          fill="currentColor"
        />
      </svg>

      {/* الجوال: سهم رأسي واحد سميك */}
      <svg
        className="mx-auto block h-14 w-10 text-sky-500 dark:text-sky-400 sm:hidden"
        viewBox="0 0 40 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M20 0 V40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M20 48 L12 36 H28 Z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function GcKnockoutSection({
  fixtures,
  onOpenMatch,
}: {
  fixtures: GcFixture[];
  onOpenMatch?: (fixtureId: number) => void;
}) {
  const semis = fixtures
    .filter((f) => (f.roundEn ?? "").toLowerCase().includes("semi"))
    .sort((a, b) => a.timestamp - b.timestamp);
  const final = fixtures.find((f) => (f.roundEn ?? "").trim().startsWith("Final"));
  if (semis.length === 0 && !final) return null;

  return (
    <section id="gc-knockout" dir="rtl" className="container mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center gap-2">
        <Trophy className="h-6 w-6 text-sky-500" />
        <h2 className="text-2xl font-black text-foreground">الطريق إلى اللقب</h2>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="mx-auto max-w-3xl"
      >
        {semis.length > 0 && (
          <div>
            <p className="mb-3 text-center text-xs font-bold tracking-wide text-muted-foreground">
              نصف النهائي
            </p>
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-8">
              {semis.map((f) => (
                <BracketMatch key={f.id} fixture={f} onOpen={onOpenMatch} />
              ))}
            </div>
          </div>
        )}

        {semis.length > 0 && final && <BracketConnector />}

        {final && (
          <div className="mx-auto max-w-sm">
            <p className="mb-3 flex items-center justify-center gap-1.5 text-xs font-black text-sky-700 dark:text-sky-300">
              <Trophy className="h-3.5 w-3.5" />
              النهائي
            </p>
            <BracketMatch fixture={final} onOpen={onOpenMatch} featured />
          </div>
        )}
      </motion.div>
    </section>
  );
}
