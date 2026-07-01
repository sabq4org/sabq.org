import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Flag, Shield } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./MatchCard";
import { PlayerCardDialog } from "./PlayerCardDialog";
import {
  formatKickoffDay,
  formatKickoffTime,
  type WcFixture,
  type WcGroup,
  type WcSquad,
  type WcSquadPlayer,
  type WcStandingRow,
  type WcTeam,
} from "./wcTypes";

const ARAB_TEAM_IDS = new Set([23, 28, 31, 32, 1532, 1548, 1567, 1569]);

interface ArabTeamsSpotlightProps {
  fixtures: WcFixture[];
  groups: WcGroup[];
  onOpenMatch: (fixtureId: number) => void;
}

interface ArabTeamDigest {
  team: WcTeam;
  row: WcStandingRow | null;
  group: WcGroup | null;
  fixtures: WcFixture[];
  next: WcFixture | null;
  latest: WcFixture | null;
}

function fixtureForTeam(fixture: WcFixture, teamId: number): boolean {
  return fixture.home.id === teamId || fixture.away.id === teamId;
}

function opponentOf(fixture: WcFixture, teamId: number): WcTeam {
  return fixture.home.id === teamId ? fixture.away : fixture.home;
}

function goalsForTeam(fixture: WcFixture, teamId: number): { team: number | null; opponent: number | null } {
  return fixture.home.id === teamId
    ? { team: fixture.goals.home, opponent: fixture.goals.away }
    : { team: fixture.goals.away, opponent: fixture.goals.home };
}

function teamState(row: WcStandingRow | null): { label: string; className: string } {
  if (!row) return { label: "بانتظار الترتيب", className: "bg-white/10 text-emerald-50 border-white/10" };
  if (row.qualifyStatus === "qualified") {
    return { label: "متأهل", className: "bg-emerald-300 text-emerald-950 border-0" };
  }
  if (row.qualifyStatus === "eliminated") {
    return { label: "خرج", className: "bg-white/[0.12] text-emerald-100 border-white/10" };
  }
  return { label: "في المنافسة", className: "bg-emerald-100 text-emerald-950 border-0" };
}

function buildArabTeams(fixtures: WcFixture[], groups: WcGroup[]): ArabTeamDigest[] {
  const teams = new Map<number, { team: WcTeam; row: WcStandingRow | null; group: WcGroup | null }>();

  for (const group of groups) {
    for (const row of group.rows) {
      if (ARAB_TEAM_IDS.has(row.team.id)) teams.set(row.team.id, { team: row.team, row, group });
    }
  }

  for (const fixture of fixtures) {
    for (const team of [fixture.home, fixture.away]) {
      if (ARAB_TEAM_IDS.has(team.id) && !teams.has(team.id)) {
        teams.set(team.id, { team, row: null, group: null });
      }
    }
  }

  return [...teams.values()]
    .map(({ team, row, group }) => {
      const teamFixtures = fixtures
        .filter((fixture) => fixtureForTeam(fixture, team.id))
        .sort((a, b) => a.timestamp - b.timestamp);
      const next = teamFixtures.find((fixture) => !fixture.status.finished) ?? null;
      const latest = [...teamFixtures].reverse().find((fixture) => fixture.status.finished) ?? null;
      return { team, row, group, fixtures: teamFixtures, next, latest };
    })
    .filter((digest) => digest.fixtures.length > 0 || digest.row)
    .sort((a, b) => {
      const aHasNext = Boolean(a.next);
      const bHasNext = Boolean(b.next);
      if (aHasNext !== bHasNext) return aHasNext ? -1 : 1;
      const aActive = a.row?.qualifyStatus === "eliminated" ? 1 : 0;
      const bActive = b.row?.qualifyStatus === "eliminated" ? 1 : 0;
      if (aActive !== bActive) return aActive - bActive;
      const aTime = a.next?.timestamp ?? a.latest?.timestamp ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.next?.timestamp ?? b.latest?.timestamp ?? Number.MAX_SAFE_INTEGER;
      if (aTime !== bTime) return aTime - bTime;
      return a.team.name.localeCompare(b.team.name, "ar");
    });
}

function MatchLine({
  digest,
  fixture,
  label,
  onOpen,
}: {
  digest: ArabTeamDigest;
  fixture: WcFixture;
  label: string;
  onOpen: (id: number) => void;
}) {
  const opponent = opponentOf(fixture, digest.team.id);
  const score = goalsForTeam(fixture, digest.team.id);
  const started = fixture.status.live || fixture.status.finished;

  return (
    <button
      type="button"
      onClick={() => onOpen(fixture.id)}
      className="w-full flex items-center justify-between gap-3 rounded-lg bg-white/[0.08] hover:bg-white/[0.13] ring-1 ring-white/10 px-3.5 py-3 transition-colors text-right"
      data-testid={`wc-arab-fixture-${digest.team.id}-${fixture.id}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 shrink-0 rounded-full bg-white p-1">
          <img src={opponent.logo} alt={opponent.name} className="h-full w-full object-contain" loading="lazy" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">ضد {opponent.name}</p>
          <p className="text-[11px] text-emerald-100/70 truncate">
            {label} · {fixture.round} · {formatKickoffDay(fixture.date)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {started ? (
          <>
            <span className="text-lg font-black text-white tabular-nums" dir="ltr">
              {score.team ?? 0} - {score.opponent ?? 0}
            </span>
            <StatusBadge fixture={fixture} />
          </>
        ) : (
          <span className="text-sm font-bold text-emerald-200">{formatKickoffTime(fixture.date)}</span>
        )}
        <ChevronLeft className="h-4 w-4 text-emerald-200/60" />
      </div>
    </button>
  );
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white/[0.06] px-3 py-2 text-center">
      <p className="text-[10px] text-emerald-100/60">{label}</p>
      <p className="text-sm font-black text-white tabular-nums" dir="ltr">
        {value}
      </p>
    </div>
  );
}

function GroupMiniTable({ group, selectedId }: { group: WcGroup | null; selectedId: number }) {
  if (!group) return null;
  return (
    <div className="rounded-lg bg-black/20 ring-1 ring-white/10 p-4">
      <p className="mb-3 text-sm font-bold text-emerald-100">{group.group}</p>
      <div className="space-y-1.5">
        {group.rows.map((row) => (
          <Link
            key={row.team.id}
            href={`/world-cup/team/${row.team.id}`}
            className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
              row.team.id === selectedId
                ? "bg-emerald-400/[0.18] ring-1 ring-emerald-300/35 font-bold text-white"
                : "text-emerald-50/80 hover:bg-white/[0.06]"
            }`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-4 text-center text-xs text-emerald-200/70 tabular-nums">{row.rank}</span>
              <img src={row.team.logo} alt={row.team.name} className="h-4 w-4 object-contain" loading="lazy" />
              <span className="truncate">{row.team.name}</span>
            </span>
            <span className="flex items-center gap-2 text-xs tabular-nums shrink-0">
              <span className="text-emerald-200/70">{row.played} لعب</span>
              <span className="font-black text-white">{row.points} ن</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * شريط تشكيلة المنتخب المختار — مطابق لتطبيق iOS (WCTeamSquadStrip). يُعاد
 * الجلب عند تبدّل المنتخب، وكل لاعب يفتح بطاقته الشاملة عبر PlayerCardDialog.
 */
function TeamSquadStrip({ teamId, onOpenPlayer }: { teamId: number; onOpenPlayer: (id: number) => void }) {
  const { data } = useQuery<WcSquad>({
    queryKey: [`/api/world-cup/squad/${teamId}`],
    enabled: teamId > 0,
    staleTime: 60 * 60 * 1000,
  });
  const players: WcSquadPlayer[] = Array.isArray(data?.players) ? data!.players : [];
  if (players.length === 0) return null;

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold text-emerald-100/85">التشكيلة — اضغط على اللاعب لملفه الكامل</p>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => p.id > 0 && onOpenPlayer(p.id)}
            disabled={p.id <= 0}
            className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center disabled:cursor-default"
            data-testid={`wc-arab-squad-player-${p.id}`}
          >
            <div className="h-12 w-12 overflow-hidden rounded-full bg-white/10 ring-2 ring-white/25">
              {p.photo ? (
                <img src={p.photo} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-black text-white/70">
                  {p.name.slice(0, 2)}
                </span>
              )}
            </div>
            <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-white/90">{p.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamPanel({
  digest,
  onOpenMatch,
  onOpenPlayer,
}: {
  digest: ArabTeamDigest;
  onOpenMatch: (fixtureId: number) => void;
  onOpenPlayer: (id: number) => void;
}) {
  const state = teamState(digest.row);
  const diff = digest.row ? `${digest.row.goalsDiff > 0 ? "+" : ""}${digest.row.goalsDiff}` : "-";

  return (
    <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Link href={`/world-cup/team/${digest.team.id}`} className="flex items-center gap-3 min-w-0 group">
            <span className="h-14 w-14 shrink-0 rounded-full bg-white p-2 ring-1 ring-white/20">
              <img src={digest.team.logo} alt={digest.team.name} className="h-full w-full object-contain" loading="lazy" />
            </span>
            <span className="min-w-0">
              <span className="block text-2xl font-black text-white group-hover:text-emerald-100 transition-colors truncate">
                {digest.team.name}
              </span>
              <span className="block text-sm text-emerald-100/70">
                {digest.group?.group ?? "كأس العالم 2026"}
                {digest.row ? ` · ${digest.row.played} لعب · ${digest.row.points} ن` : ""}
              </span>
            </span>
          </Link>
          <Badge className={state.className}>{state.label}</Badge>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <StatPill label="المركز" value={digest.row?.rank ?? "-"} />
          <StatPill label="النقاط" value={digest.row?.points ?? "-"} />
          <StatPill label="فاز" value={digest.row?.win ?? "-"} />
          <StatPill label="الفارق" value={diff} />
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {digest.next ? (
            <MatchLine digest={digest} fixture={digest.next} label="المباراة القادمة" onOpen={onOpenMatch} />
          ) : (
            <p className="rounded-lg bg-white/[0.06] px-3.5 py-3 text-sm text-emerald-100/75">
              لا توجد مباراة قادمة مجدولة.
            </p>
          )}
          {digest.latest ? (
            <MatchLine digest={digest} fixture={digest.latest} label="آخر نتيجة" onOpen={onOpenMatch} />
          ) : (
            <p className="rounded-lg bg-white/[0.06] px-3.5 py-3 text-sm text-emerald-100/75">
              لم يلعب بعد في البطولة.
            </p>
          )}
        </div>
      </div>

      <GroupMiniTable group={digest.group} selectedId={digest.team.id} />
    </div>

      <TeamSquadStrip teamId={digest.team.id} onOpenPlayer={onOpenPlayer} />
    </div>
  );
}

function TeamRail({
  teams,
  selectedId,
  onSelect,
}: {
  teams: ArabTeamDigest[];
  selectedId: number;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {teams.map((digest) => {
        const selected = digest.team.id === selectedId;
        return (
          <button
            key={digest.team.id}
            type="button"
            onClick={() => onSelect(digest.team.id)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-bold ring-1 transition-colors ${
              selected
                ? "bg-white text-emerald-950 ring-white"
                : "bg-white/[0.08] text-emerald-50 ring-white/10 hover:bg-white/[0.13]"
            }`}
            data-testid={`wc-arab-team-tab-${digest.team.id}`}
          >
            <span className="h-6 w-6 rounded-full bg-white p-0.5">
              <img src={digest.team.logo} alt="" className="h-full w-full object-contain" loading="lazy" />
            </span>
            {digest.team.name}
          </button>
        );
      })}
    </div>
  );
}

export function ArabTeamsSpotlight({ fixtures, groups, onOpenMatch }: ArabTeamsSpotlightProps) {
  const arabTeams = useMemo(() => buildArabTeams(fixtures, groups), [fixtures, groups]);
  const preferredTeam = arabTeams[0]?.team.id ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(preferredTeam);
  const [openPlayerId, setOpenPlayerId] = useState<number | null>(null);

  useEffect(() => {
    if (selectedId != null && arabTeams.some((team) => team.team.id === selectedId)) return;
    setSelectedId(preferredTeam);
  }, [arabTeams, preferredTeam, selectedId]);

  if (arabTeams.length === 0 || selectedId == null) return null;

  const selected = arabTeams.find((team) => team.team.id === selectedId) ?? arabTeams[0];

  return (
    <section dir="rtl" className="py-8" aria-label="المنتخبات العربية في المونديال">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-lg bg-gradient-to-bl from-emerald-800 via-emerald-900 to-[#063828] p-5 sm:p-6 lg:p-8 shadow-xl"
        >
          <div className="absolute bottom-0 right-0 opacity-[0.06]">
            <Shield className="h-56 w-56 text-white" />
          </div>

          <div className="relative space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Flag className="h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-emerald-200" />
                  <h2 className="text-lg sm:text-2xl lg:text-3xl font-black leading-tight text-white">المنتخبات العربية في المونديال</h2>
                </div>
                <p className="max-w-3xl text-sm font-medium text-white/85">
                  نتائج ومواعيد المنتخبات العربية المتبقية في البطولة، مع وضع المجموعة في بطاقة واحدة.
                </p>
              </div>
              <Badge className="bg-white/15 text-emerald-50 border-0">{arabTeams.length} منتخبات</Badge>
            </div>

            <TeamRail teams={arabTeams} selectedId={selected.team.id} onSelect={setSelectedId} />
            <TeamPanel digest={selected} onOpenMatch={onOpenMatch} onOpenPlayer={setOpenPlayerId} />
          </div>
        </motion.div>
      </div>

      <PlayerCardDialog playerId={openPlayerId} onClose={() => setOpenPlayerId(null)} />
    </section>
  );
}
