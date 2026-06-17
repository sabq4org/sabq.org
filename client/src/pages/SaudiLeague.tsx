/**
 * دوري روشن السعودي — نموذج تفاعلي حي (قسم مخفي قيد التطوير).
 * مسار غير مدرج في القائمة، وكل نقاط الـAPI خلف SAUDI_LEAGUE_ENABLED.
 * الهوية: سبق المطوّرة — فاتح ونظيف بلمسات أخضر روشن/ذهبي. RTL.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";

// ---------- الأنواع (مطابقة لـ saudiLeagueService) ----------
interface SplTeam {
  id: number;
  name: string;
  logo: string;
  winner: boolean | null;
}
interface SplFixture {
  id: number;
  date: string;
  timestamp: number;
  status: { code: string; label: string; elapsed: number | null; live: boolean; finished: boolean };
  round: string;
  venue: { name: string; city: string };
  home: SplTeam;
  away: SplTeam;
  goals: { home: number | null; away: number | null };
}
interface SplStandingRow {
  rank: number;
  team: SplTeam;
  played: number;
  win: number;
  draw: number;
  lose: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string | null;
}
interface SplScorer {
  rank: number;
  id: number;
  name: string;
  photo: string;
  team: SplTeam;
  goals: number;
  assists: number;
  penalties: number;
  matches: number;
}
interface SplMatchEvent {
  minute: number | null;
  extra: number | null;
  teamId: number;
  team: string;
  player: string;
  assist: string | null;
  type: string;
  label: string;
}
interface SplStatRow {
  type: string;
  label: string;
  home: string | number | null;
  away: string | number | null;
}
interface SplLineupPlayer {
  number: number | null;
  name: string;
  pos: string;
}
interface SplLineup {
  team: { id: number; name: string; logo: string };
  formation: string | null;
  coach: string | null;
  startXI: SplLineupPlayer[];
  substitutes: SplLineupPlayer[];
}
interface SplMatchDetail {
  fixture: SplFixture;
  events: SplMatchEvent[];
  statistics: { home: { id: number; name: string }; away: { id: number; name: string }; rows: SplStatRow[] } | null;
  lineups: SplLineup[];
}

// ---------- أدوات تنسيق ----------
const dayFmt = new Intl.DateTimeFormat("ar", { weekday: "short", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit", hour12: true });

function fmtDay(ts: number) {
  return dayFmt.format(new Date(ts * 1000));
}
function fmtTime(ts: number) {
  return timeFmt.format(new Date(ts * 1000));
}

const EVENT_EMOJI: Record<string, string> = {
  goal: "⚽",
  "missed-penalty": "❌",
  "yellow-card": "🟨",
  "red-card": "🟥",
  substitution: "🔁",
  var: "📺",
};

// ---------- بطاقة مباراة ----------
function MatchCard({ fixture, onOpen }: { fixture: SplFixture; onOpen: (id: number) => void }) {
  const { home, away, goals, status } = fixture;
  const decided = status.live || status.finished;
  return (
    <button
      onClick={() => onOpen(fixture.id)}
      className="w-full text-right bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-400 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
        <span>{fixture.round}</span>
        {status.live ? (
          <span className="inline-flex items-center gap-1 text-red-600 font-bold">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            {status.elapsed ? `${status.elapsed}'` : "مباشر"}
          </span>
        ) : status.finished ? (
          <span className="text-emerald-700 font-medium">{status.label}</span>
        ) : (
          <span>{fmtDay(fixture.timestamp)}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3">
        {/* المضيف */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {home.logo && <img src={home.logo} alt="" className="w-7 h-7 object-contain shrink-0" />}
          <span className="truncate font-semibold text-slate-800">{home.name}</span>
        </div>
        {/* النتيجة / الموعد */}
        <div className="shrink-0 px-3">
          {decided ? (
            <div className="text-xl font-extrabold text-slate-900 tabular-nums tracking-wider">
              {goals.home ?? 0} : {goals.away ?? 0}
            </div>
          ) : (
            <div className="text-sm font-bold text-emerald-700 tabular-nums">{fmtTime(fixture.timestamp)}</div>
          )}
        </div>
        {/* الضيف */}
        <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span className="truncate font-semibold text-slate-800 text-left">{away.name}</span>
          {away.logo && <img src={away.logo} alt="" className="w-7 h-7 object-contain shrink-0" />}
        </div>
      </div>
    </button>
  );
}

// ---------- مركز المباريات ----------
function MatchHub({ fixtures, live, onOpen }: { fixtures: SplFixture[]; live: SplFixture[]; onOpen: (id: number) => void }) {
  const liveIds = new Set(live.map((f) => f.id));
  const liveAll = useMemo(
    () => [...live, ...fixtures.filter((f) => f.status.live && !liveIds.has(f.id))],
    [fixtures, live] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const upcoming = useMemo(
    () => fixtures.filter((f) => !f.status.live && !f.status.finished).slice(0, 12),
    [fixtures]
  );
  const results = useMemo(
    () => fixtures.filter((f) => f.status.finished).sort((a, b) => b.timestamp - a.timestamp).slice(0, 12),
    [fixtures]
  );

  const tabs = [
    { key: "live", label: "مباشر", count: liveAll.length, list: liveAll },
    { key: "upcoming", label: "قادمة", count: upcoming.length, list: upcoming },
    { key: "results", label: "النتائج", count: results.length, list: results },
  ];
  const [active, setActive] = useState(liveAll.length ? "live" : "upcoming");
  const current = tabs.find((t) => t.key === active) ?? tabs[1];

  return (
    <section className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              active === t.key ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
            {t.key === "live" && t.count > 0 && (
              <span className="mr-1.5 inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse align-middle" />
            )}
            {t.key !== "live" && <span className="mr-1.5 opacity-60">{t.count}</span>}
          </button>
        ))}
      </div>
      {current.list.length === 0 ? (
        <div className="text-center text-slate-400 py-12 bg-white rounded-2xl border border-dashed border-slate-200">
          {active === "live" ? "لا توجد مباريات مباشرة الآن" : "لا توجد مباريات"}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {current.list.map((f) => (
            <MatchCard key={f.id} fixture={f} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

// ---------- الترتيب ----------
function FormChips({ form }: { form: string | null }) {
  if (!form) return null;
  const map: Record<string, string> = { W: "bg-emerald-500", D: "bg-amber-400", L: "bg-red-400" };
  return (
    <div className="flex gap-1 justify-center" dir="ltr">
      {form
        .slice(-5)
        .split("")
        .map((r, i) => (
          <span key={i} className={`w-4 h-4 rounded-sm ${map[r] ?? "bg-slate-300"}`} title={r} />
        ))}
    </div>
  );
}

function StandingsTable({ rows }: { rows: SplStandingRow[] }) {
  return (
    <section className="max-w-5xl mx-auto px-4 py-6">
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-emerald-700 text-white text-xs">
                <th className="py-3 px-2 text-center w-10">#</th>
                <th className="py-3 px-3 text-right">النادي</th>
                <th className="py-3 px-2 text-center">لعب</th>
                <th className="py-3 px-2 text-center">فاز</th>
                <th className="py-3 px-2 text-center">تعادل</th>
                <th className="py-3 px-2 text-center">خسر</th>
                <th className="py-3 px-2 text-center">له</th>
                <th className="py-3 px-2 text-center">عليه</th>
                <th className="py-3 px-2 text-center">+/−</th>
                <th className="py-3 px-2 text-center font-extrabold">نقاط</th>
                <th className="py-3 px-3 text-center hidden md:table-cell">آخر 5</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const band =
                  r.rank <= 3
                    ? "border-r-4 border-emerald-500"
                    : r.rank >= rows.length - 2
                    ? "border-r-4 border-red-400"
                    : "border-r-4 border-transparent";
                return (
                  <tr key={r.team.id} className={`border-b border-slate-100 hover:bg-slate-50 ${band}`}>
                    <td className="py-2.5 px-2 text-center font-bold text-slate-500">{r.rank}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {r.team.logo && <img src={r.team.logo} alt="" className="w-6 h-6 object-contain" />}
                        <span className="font-semibold text-slate-800">{r.team.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">{r.played}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">{r.win}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">{r.draw}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">{r.lose}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">{r.goalsFor}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">{r.goalsAgainst}</td>
                    <td className="py-2.5 px-2 text-center text-slate-600 tabular-nums">
                      {r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}
                    </td>
                    <td className="py-2.5 px-2 text-center font-extrabold text-emerald-800 tabular-nums">{r.points}</td>
                    <td className="py-2.5 px-3 hidden md:table-cell">
                      <FormChips form={r.form} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-4 px-4 py-3 text-xs text-slate-500 border-t border-slate-100">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500" /> مراكز البطولة الآسيوية
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-400" /> مراكز الهبوط
          </span>
        </div>
      </div>
    </section>
  );
}

// ---------- الهدّافون ----------
function ScorersList({ scorers }: { scorers: SplScorer[] }) {
  return (
    <section className="max-w-3xl mx-auto px-4 py-6">
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
        {scorers.map((s) => (
          <div key={`${s.id}-${s.rank}`} className="flex items-center gap-3 p-3">
            <span className="w-7 text-center font-bold text-slate-400 tabular-nums">{s.rank}</span>
            {s.photo ? (
              <img src={s.photo} alt="" className="w-11 h-11 rounded-full object-cover bg-slate-100" />
            ) : (
              <span className="w-11 h-11 rounded-full bg-slate-100" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-800 truncate">{s.name}</div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                {s.team.logo && <img src={s.team.logo} alt="" className="w-4 h-4 object-contain" />}
                {s.team.name} · {s.matches} مباراة
              </div>
            </div>
            <div className="text-center px-2">
              <div className="text-xl font-extrabold text-emerald-800 tabular-nums">{s.goals}</div>
              <div className="text-[10px] text-slate-400">هدف</div>
            </div>
            <div className="text-center px-2 border-r border-slate-100">
              <div className="text-lg font-bold text-amber-600 tabular-nums">{s.assists}</div>
              <div className="text-[10px] text-slate-400">صناعة</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- شريط إحصاء (لغة الأرقام) ----------
function StatBar({ row }: { row: SplStatRow }) {
  const toNum = (v: string | number | null) => {
    if (v == null) return 0;
    const n = parseFloat(String(v).replace("%", ""));
    return Number.isFinite(n) ? n : 0;
  };
  const h = toNum(row.home);
  const a = toNum(row.away);
  const total = h + a || 1;
  const hPct = Math.round((h / total) * 100);
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="font-bold text-slate-700 tabular-nums">{row.home ?? "—"}</span>
        <span className="text-slate-500">{row.label}</span>
        <span className="font-bold text-slate-700 tabular-nums">{row.away ?? "—"}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100" dir="ltr">
        <div className="bg-emerald-600" style={{ width: `${hPct}%` }} />
        <div className="bg-amber-400" style={{ width: `${100 - hPct}%` }} />
      </div>
    </div>
  );
}

// ---------- نافذة تفاصيل المباراة ----------
function LineupTeam({ lineup }: { lineup: SplLineup }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="flex items-center gap-2 mb-2">
        {lineup.team.logo && <img src={lineup.team.logo} alt="" className="w-6 h-6 object-contain" />}
        <span className="font-bold text-slate-800">{lineup.team.name}</span>
        {lineup.formation && (
          <span className="text-xs bg-emerald-50 text-emerald-700 rounded px-1.5 py-0.5 font-bold tabular-nums" dir="ltr">
            {lineup.formation}
          </span>
        )}
      </div>
      {lineup.coach && <div className="text-xs text-slate-400 mb-2">المدرب: {lineup.coach}</div>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {lineup.startXI.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-6 text-center text-xs font-bold text-emerald-700 tabular-nums shrink-0">{p.number ?? ""}</span>
            <span className="text-slate-700 truncate">{p.name}</span>
          </div>
        ))}
      </div>
      {lineup.substitutes.length > 0 && (
        <div className="mt-3 pt-2 border-t border-slate-100">
          <div className="text-xs font-bold text-slate-400 mb-1">البدلاء</div>
          <div className="text-xs text-slate-500 leading-6">{lineup.substitutes.map((p) => p.name).join("، ")}</div>
        </div>
      )}
    </div>
  );
}

function MatchDialog({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<SplMatchDetail>({
    queryKey: [`/api/saudi-league/match/${id}`],
    enabled: id != null,
    refetchInterval: (q) => (q.state.data?.fixture?.status?.live ? 15_000 : false),
  });
  const [tab, setTab] = useState("events");
  if (id == null) return null;

  const fx = data?.fixture;
  const stats = data?.statistics;
  const events = Array.isArray(data?.events) ? data!.events : [];
  const lineups = Array.isArray(data?.lineups) ? data!.lineups : [];

  // التابات المتاحة تُبنى حسب البيانات الموجودة فعلًا لهذه المباراة
  const tabs = [
    events.length > 0 ? { key: "events", label: "مجريات المباراة" } : null,
    stats && stats.rows.length > 0 ? { key: "stats", label: "نبض الأرقام" } : null,
    lineups.length > 0 ? { key: "lineups", label: "التشكيلات" } : null,
  ].filter(Boolean) as { key: string; label: string }[];
  const activeKey = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl max-h-[88vh] flex flex-col overflow-hidden"
      >
        {/* رأس ثابت */}
        <div className="shrink-0 relative bg-emerald-700 text-white p-4 sm:rounded-t-2xl">
          <button onClick={onClose} className="absolute left-3 top-3 text-white/80 hover:text-white text-xl leading-none">
            ✕
          </button>
          {isLoading || !fx ? (
            <div className="h-16 animate-pulse" />
          ) : (
            <>
              <div className="text-center text-xs text-emerald-100 mb-2">
                {fx.round} {fx.venue.name ? `· ${fx.venue.name}` : ""}
              </div>
              <div className="flex items-center justify-center gap-4">
                <div className="flex-1 flex flex-col items-center gap-1">
                  {fx.home.logo && <img src={fx.home.logo} alt="" className="w-12 h-12 object-contain" />}
                  <span className="font-semibold text-sm text-center">{fx.home.name}</span>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-extrabold tabular-nums tracking-wider">
                    {fx.status.finished || fx.status.live ? `${fx.goals.home ?? 0} : ${fx.goals.away ?? 0}` : fmtTime(fx.timestamp)}
                  </div>
                  <div className="text-xs text-emerald-100 mt-1">
                    {fx.status.live ? `${fx.status.elapsed ?? ""}'` : fx.status.label}
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  {fx.away.logo && <img src={fx.away.logo} alt="" className="w-12 h-12 object-contain" />}
                  <span className="font-semibold text-sm text-center">{fx.away.name}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* شريط التابات الثابت */}
        {tabs.length > 0 && (
          <div className="shrink-0 flex border-b border-slate-200 bg-white">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-3 text-sm font-bold transition-colors ${
                  activeKey === t.key
                    ? "text-emerald-800 border-b-2 border-emerald-700"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* المحتوى المتمرّر */}
        <div className="overflow-y-auto p-4">
          {isLoading && <div className="py-10 text-center text-slate-400 text-sm">جارٍ تحميل التفاصيل…</div>}

          {!isLoading && activeKey === "events" && (
            <ul className="relative space-y-3 pr-4 border-r-2 border-slate-100">
              {events.map((e, i) => {
                const homeSide = e.teamId === fx?.home.id;
                return (
                  <li key={i} className="relative flex items-start gap-2.5 text-sm">
                    <span
                      className={`absolute -right-[21px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                        homeSide ? "bg-emerald-600" : "bg-amber-500"
                      }`}
                    />
                    <span className="w-8 shrink-0 text-xs font-bold text-slate-400 tabular-nums">
                      {e.minute != null ? `${e.minute}'` : ""}
                    </span>
                    <span className="shrink-0 leading-5">{EVENT_EMOJI[e.type] ?? "•"}</span>
                    <div className="min-w-0">
                      <span className="font-semibold text-slate-800">{e.player}</span>
                      {e.assist && <span className="text-xs text-slate-400"> (صناعة {e.assist})</span>}
                      <div className="text-xs text-slate-400">
                        {e.type !== "goal" ? `${e.label} · ` : ""}
                        {e.team}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!isLoading && activeKey === "stats" && stats && (
            <>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-sm bg-emerald-600" />
                  {stats.home.name}
                </span>
                <span className="flex items-center gap-1">
                  {stats.away.name}
                  <span className="w-3 h-3 rounded-sm bg-amber-400" />
                </span>
              </div>
              {stats.rows.map((r) => (
                <StatBar key={r.type} row={r} />
              ))}
            </>
          )}

          {!isLoading && activeKey === "lineups" && lineups.map((l) => <LineupTeam key={l.team.id} lineup={l} />)}

          {!isLoading && tabs.length === 0 && (
            <div className="py-8 text-center text-slate-400 text-sm">لا توجد تفاصيل متاحة لهذه المباراة بعد</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- الصفحة ----------
interface SplCompetition {
  slug: string;
  name: string;
  type: "league" | "cup";
  hasStandings: boolean;
  hasScorers: boolean;
  hasStats: boolean;
}

export default function SaudiLeague() {
  const { user } = useAuth();
  const [compSlug, setCompSlug] = useState("pro-league");
  const [tab, setTab] = useState<"matches" | "standings" | "scorers">("matches");
  const [openMatch, setOpenMatch] = useState<number | null>(null);

  useEffect(() => {
    document.title = "البطولات السعودية — نموذج تجريبي | سبق";
  }, []);

  // قائمة البطولات (مبدّل البطولات)
  const { data: compsData } = useQuery<{ competitions: SplCompetition[] }>({
    queryKey: ["/api/saudi-league/competitions"],
    staleTime: 60 * 60_000,
  });
  const competitions = Array.isArray(compsData?.competitions) ? compsData.competitions : [];
  const comp = competitions.find((c) => c.slug === compSlug);
  // قبل وصول القائمة نفترض قدرات دوري روشن (الافتراضي) كي تظهر التبويبات فورًا
  const hasStandings = comp?.hasStandings ?? compSlug === "pro-league";
  const hasScorers = comp?.hasScorers ?? compSlug === "pro-league";
  const compName = comp?.name ?? "دوري روشن للمحترفين";
  const isCup = comp?.type === "cup";

  const { data: fixturesData } = useQuery<{ fixtures: SplFixture[] }>({
    queryKey: [`/api/saudi-league/${compSlug}/fixtures`],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const { data: liveData } = useQuery<{ fixtures: SplFixture[] }>({
    queryKey: [`/api/saudi-league/${compSlug}/live`],
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const { data: standingsData } = useQuery<{ standings: SplStandingRow[] }>({
    queryKey: [`/api/saudi-league/${compSlug}/standings`],
    staleTime: 5 * 60_000,
    enabled: hasStandings,
  });
  const { data: scorersData } = useQuery<{ scorers: SplScorer[] }>({
    queryKey: [`/api/saudi-league/${compSlug}/scorers`],
    staleTime: 10 * 60_000,
    enabled: hasScorers,
  });

  const fixtures = Array.isArray(fixturesData?.fixtures) ? fixturesData.fixtures : [];
  const live = Array.isArray(liveData?.fixtures) ? liveData.fixtures : [];
  const standings = Array.isArray(standingsData?.standings) ? standingsData.standings : [];
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers : [];

  const tabs = [
    { key: "matches" as const, label: "المباريات" },
    hasStandings ? { key: "standings" as const, label: "الترتيب" } : null,
    hasScorers ? { key: "scorers" as const, label: "الهدّافون" } : null,
  ].filter(Boolean) as { key: "matches" | "standings" | "scorers"; label: string }[];
  // لو لم تعد التبويبة الحالية متاحة بعد تبديل البطولة، نعود للمباريات
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "matches";

  const switchComp = (slug: string) => {
    setCompSlug(slug);
    setTab("matches");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        {/* هيرو */}
        <div className="bg-gradient-to-l from-emerald-800 to-emerald-700 text-white">
          <div className="max-w-5xl mx-auto px-4 py-7">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold mb-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-300/15 border border-amber-300/30">نموذج تجريبي</span>
              {live.length > 0 && (
                <span className="inline-flex items-center gap-1 text-red-200">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" /> {live.length} مباراة مباشرة
                </span>
              )}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-1">{compName}</h1>
            <p className="text-emerald-100 text-sm">
              البطولات السعودية · بيانات حيّة · {isCup ? "مباريات وأدوار إقصائية" : "جداول وترتيب وهدّافون"}
            </p>

            {/* مبدّل البطولات */}
            {competitions.length > 0 && (
              <div className="mt-4 -mx-4 px-4 flex gap-2 overflow-x-auto pb-1">
                {competitions.map((c) => (
                  <button
                    key={c.slug}
                    onClick={() => switchComp(c.slug)}
                    className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                      compSlug === c.slug
                        ? "bg-white text-emerald-800"
                        : "bg-white/10 text-emerald-50 hover:bg-white/20"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* تبويبات القسم */}
          <div className="max-w-5xl mx-auto px-4">
            <div className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-5 py-3 text-sm font-bold rounded-t-xl transition-colors ${
                    activeTab === t.key ? "bg-slate-50 text-emerald-800" : "text-emerald-100 hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === "matches" && <MatchHub key={compSlug} fixtures={fixtures} live={live} onOpen={setOpenMatch} />}
        {activeTab === "standings" &&
          (standings.length ? (
            <StandingsTable rows={standings} />
          ) : (
            <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-400">جارٍ تحميل الترتيب…</div>
          ))}
        {activeTab === "scorers" &&
          (scorers.length ? (
            <ScorersList scorers={scorers} />
          ) : (
            <div className="max-w-5xl mx-auto px-4 py-12 text-center text-slate-400">جارٍ تحميل الهدّافين…</div>
          ))}
      </main>

      <MatchDialog id={openMatch} onClose={() => setOpenMatch(null)} />
      <Footer />
    </div>
  );
}
