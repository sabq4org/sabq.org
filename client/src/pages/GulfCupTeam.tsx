import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Shirt, Star, Trophy, UserCog } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { GcMatchCard } from "@/components/gulfcup/GcMatchCard";
import { GcMatchCenterDialog } from "@/components/gulfcup/GcMatchCenterDialog";
import {
  SAUDI_TEAM_ID,
  type GcSquadPlayer,
  type GcStandingRow,
  type GcTeamProfile,
} from "@/components/gulfcup/gcTypes";

const POSITION_SECTIONS = [
  { en: "Goalkeeper", label: "حراسة المرمى" },
  { en: "Defender", label: "الدفاع" },
  { en: "Midfielder", label: "الوسط" },
  { en: "Attacker", label: "الهجوم" },
];

function GroupRow({ row, currentTeamId }: { row: GcStandingRow; currentTeamId: number }) {
  const isCurrent = row.team.id === currentTeamId;
  const inner = (
    <>
      <span className="w-6 text-center text-xs font-black tabular-nums text-muted-foreground">{row.rank}</span>
      <img src={row.team.logo} alt="" className="h-5 w-5 object-contain" loading="lazy" />
      <span className={`min-w-0 flex-1 truncate text-sm ${isCurrent ? "font-black" : "font-semibold"}`}>
        {row.team.name}
      </span>
      <span className="w-8 text-center text-xs tabular-nums text-muted-foreground">{row.played}</span>
      <span className="w-10 text-center text-sm font-black tabular-nums">{row.points}</span>
    </>
  );
  const className = `flex items-center gap-2 rounded-lg px-2 py-2 ${isCurrent ? "bg-sky-500/10" : ""}`;
  if (isCurrent) return <div className={className}>{inner}</div>;
  return (
    <Link href={`/gulf-cup/team/${row.team.id}`} className={`${className} hover:bg-muted/60`}>
      {inner}
    </Link>
  );
}

function SquadList({ squad }: { squad: GcSquadPlayer[] }) {
  const known = new Set(POSITION_SECTIONS.map((s) => s.en));
  return (
    <div className="space-y-4">
      {POSITION_SECTIONS.map((section) => {
        const rows = squad.filter((p) => (p.positionEn ?? "") === section.en);
        if (rows.length === 0) return null;
        return (
          <div key={section.en}>
            <p className="mb-2 text-[11px] font-black text-sky-700 dark:text-sky-300">
              {section.label} · {rows.length}
            </p>
            <ul className="space-y-1.5">
              {rows.map((p) => (
                <li key={`${p.id}-${p.number}`} className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-2.5 py-1.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-sky-500/10 text-[11px] font-black tabular-nums text-sky-800 dark:text-sky-200">
                    {p.number ?? "–"}
                  </span>
                  {p.photo ? (
                    <img src={p.photo} alt="" className="h-8 w-8 rounded-full object-cover" loading="lazy" />
                  ) : (
                    <span className="h-8 w-8 rounded-full bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.position}
                      {p.age != null ? ` · ${p.age} سنة` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {squad.filter((p) => !known.has(p.positionEn ?? "")).map((p) => (
        <p key={p.id} className="text-sm font-bold">
          {p.name}
        </p>
      ))}
    </div>
  );
}

export default function GulfCupTeam() {
  const { user } = useAuth();
  const params = useParams<{ id: string }>();
  const teamId = parseInt(params.id ?? "", 10);
  const validId = Number.isFinite(teamId) && teamId > 0;
  const [openFixtureId, setOpenFixtureId] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<GcTeamProfile>({
    queryKey: [`/api/gulf-cup/team/${teamId}`],
    enabled: validId,
    staleTime: 60_000,
    refetchInterval: (query) =>
      (query.state.data?.fixtures ?? []).some((f) => f.status.live) ? 30_000 : false,
  });

  useEffect(() => {
    document.title = data?.team ? `${data.team.name} — خليجي 27 | سبق` : "المنتخب — خليجي 27 | سبق";
  }, [data?.team]);

  const fixtures = Array.isArray(data?.fixtures) ? data.fixtures : [];
  const upcoming = fixtures.filter((f) => !f.status.finished);
  const finished = fixtures.filter((f) => f.status.finished).slice().reverse();

  return (
    <div className="public-page flex min-h-screen flex-col bg-[#EEF1F2] dark:bg-[#090E0F]" dir="rtl" lang="ar-SA-u-nu-latn">
      <Header user={user || undefined} />
      <NavigationBar />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        <Link href="/gulf-cup" className="mb-4 inline-flex items-center gap-1 text-[13px] font-bold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          مركز خليجي 27
        </Link>

        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-3xl" />
        ) : isError || !data ? (
          <p className="rounded-2xl border border-dashed py-16 text-center text-muted-foreground">
            تعذّر جلب ملف المنتخب حاليًا.
          </p>
        ) : (
          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl bg-gradient-to-bl from-[#041C22] via-[#052830] to-[#0A3D45] px-5 py-8 text-center text-white">
              <div className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full bg-white p-2">
                {data.team.logo ? <img src={data.team.logo} alt="" className="h-full w-full object-contain" /> : null}
              </div>
              <h1 className="text-2xl font-black">{data.team.name}</h1>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[12px] text-sky-100/80">
                {data.stats.groupName && (
                  <span>
                    {data.stats.groupName}
                    {data.stats.rank != null ? ` · #${data.stats.rank}` : ""}
                  </span>
                )}
                {data.team.id === SAUDI_TEAM_ID && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-400/20 px-2 py-0.5 font-bold text-sky-100">
                    <Star className="h-3 w-3 fill-current" />
                    المضيف
                  </span>
                )}
                {data.legacy && data.legacy.titles > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="h-3.5 w-3.5 text-sky-300" />
                    {data.legacy.titles} ألقاب
                  </span>
                )}
                {data.coach && (
                  <span className="inline-flex items-center gap-1">
                    <UserCog className="h-3.5 w-3.5" />
                    {data.coach}
                  </span>
                )}
                {data.fifaRank && <span dir="ltr">فيفا #{data.fifaRank.rank}</span>}
              </div>
            </section>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {[
                [data.stats.played, "لعب"],
                [data.stats.points, "نقاط"],
                [data.stats.goalsDiff, "فارق", true],
                [data.stats.win, "فوز"],
                [data.stats.draw, "تعادل"],
                [data.stats.lose, "خسارة"],
              ].map(([value, label, ltr]) => (
                <div key={String(label)} className="rounded-2xl border border-border bg-card px-2 py-3 text-center">
                  <p dir={ltr ? "ltr" : undefined} className="text-lg font-black tabular-nums">
                    {ltr && typeof value === "number" && value > 0 ? `+${value}` : value}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {upcoming.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black text-foreground">المباريات القادمة</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {upcoming.map((f) => (
                    <GcMatchCard key={f.id} fixture={f} onOpen={setOpenFixtureId} />
                  ))}
                </div>
              </section>
            )}

            {data.squad.length > 0 && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h2 className="mb-3 flex items-center gap-1.5 text-sm font-black">
                  <Shirt className="h-4 w-4 text-sky-600" />
                  التشكيلة
                </h2>
                <SquadList squad={data.squad} />
              </section>
            )}

            {finished.length > 0 && (
              <section>
                <h2 className="mb-3 text-sm font-black text-foreground">النتائج</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {finished.map((f) => (
                    <GcMatchCard key={f.id} fixture={f} onOpen={setOpenFixtureId} />
                  ))}
                </div>
              </section>
            )}

            {data.group && (
              <section className="rounded-2xl border border-border bg-card p-3">
                <h2 className="mb-2 px-1 text-sm font-black">{data.group.name}</h2>
                {data.group.rows.map((row) => (
                  <GroupRow key={row.team.id} row={row} currentTeamId={teamId} />
                ))}
              </section>
            )}
          </div>
        )}
      </main>
      <GcMatchCenterDialog fixtureId={openFixtureId} onClose={() => setOpenFixtureId(null)} />
      <Footer />
    </div>
  );
}
