import { useMutation, useQuery } from "@tanstack/react-query";
import { Radio, MapPin, History, Users, BarChart3, ListOrdered, Tv, Stethoscope, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  SAUDI_TEAM_ID,
  formatKickoffDay,
  formatKickoffTime,
  type GcFixture,
  type GcLineup,
  type GcMatchDetail,
  type GcMatchEvent,
  type GcRichLineup,
  type GcRichLineupPlayer,
  type GcTrend,
} from "./gcTypes";

/**
 * مركز مباراة خليجي 27 — نافذة تفاصيل تفتح من أي بطاقة مباراة:
 * ترويسة النتيجة/الموعد + تبويبات (الأحداث، التشكيلات، الإحصائيات،
 * المواجهات). البيانات من /api/gulf-cup/match/:id وتُحدَّث كل 15ث
 * أثناء البثّ. نظير MatchCenterDialog في المونديال بنسخة خليجية رشيقة.
 */

interface GcMatchCenterDialogProps {
  fixtureId: number | null;
  onClose: () => void;
}

function TeamBlock({ team, highlight }: { team: GcFixture["home"]; highlight: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="h-16 w-16 rounded-full bg-white p-1.5 ring-2 ring-emerald-500/20 shadow">
        {team.logo ? (
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        ) : null}
      </div>
      <span
        className={`text-sm text-center truncate max-w-[7.5rem] ${
          highlight ? "font-black text-emerald-600 dark:text-emerald-300" : "font-bold text-foreground"
        }`}
      >
        {team.name}
      </span>
    </div>
  );
}

// أيقونة نصية بسيطة لكل نوع حدث — بلا اعتماد على قاموس أيقونات خارجي
function eventGlyph(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("goal")) return "⚽";
  if (t.includes("card")) return t.includes("red") ? "🟥" : "🟨";
  if (t.includes("subst")) return "🔁";
  if (t.includes("var")) return "🖥️";
  return "•";
}

function EventsTimeline({ events, fixture }: { events: GcMatchEvent[]; fixture: GcFixture }) {
  if (events.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {fixture.status.finished || fixture.status.live
          ? "لا أحداث مسجّلة لهذه المباراة"
          : "تظهر أحداث المباراة هنا لحظة بلحظة بعد الانطلاق"}
      </p>
    );
  }
  return (
    <ol className="space-y-2 py-2">
      {events.map((e, i) => {
        const isHome = e.teamId === fixture.home.id;
        return (
          <li
            key={i}
            className={`flex items-center gap-2 text-sm ${isHome ? "flex-row" : "flex-row-reverse"}`}
          >
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-black tabular-nums">
              {e.minute}{e.extraMinute ? `+${e.extraMinute}` : ""}′
            </span>
            <span className="shrink-0">{eventGlyph(e.type)}</span>
            <span className="min-w-0 truncate">
              <span className="font-bold text-foreground">{e.player ?? ""}</span>{" "}
              <span className="text-muted-foreground">{e.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function LineupColumn({ lineup }: { lineup: GcLineup }) {
  return (
    <div className="min-w-0">
      <div className="mb-2">
        <p className="font-black text-foreground text-sm truncate">{lineup.teamName}</p>
        <p className="text-[11px] text-muted-foreground">
          {lineup.formation ? `الخطة ${lineup.formation}` : ""}
          {lineup.coach ? `${lineup.formation ? " · " : ""}المدرب: ${lineup.coach}` : ""}
        </p>
      </div>
      <ul className="space-y-1">
        {lineup.startXI.map((p) => (
          <li key={`${p.id}-${p.number}`} className="flex items-center gap-2 text-sm">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-[10px] font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
              {p.number ?? "–"}
            </span>
            <span className="truncate text-foreground">{p.name}</span>
          </li>
        ))}
      </ul>
      {lineup.substitutes.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">
            البدلاء ({lineup.substitutes.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {lineup.substitutes.map((p) => (
              <li key={`${p.id}-${p.number}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums w-5 text-center">{p.number ?? "–"}</span>
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * ملعب تفاعلي لتشكيلة منتخب — يرسم اللاعبين بإحداثيات المزوّد (0..100) على
 * نصف ملعب رأسي، مع رقم القميص والتقييم الحي. يظهر فقط متى توفّرت الإحداثيات.
 */
function PitchHalf({ players, formation, teamName }: { players: GcRichLineupPlayer[]; formation: string | null; teamName: string }) {
  const starters = players.filter((p) => p.starter && p.x != null && p.y != null);
  return (
    <div className="min-w-0">
      <p className="mb-1.5 truncate text-center text-xs font-black text-foreground">
        {teamName}
        {formation ? <span className="text-muted-foreground font-semibold"> · {formation}</span> : null}
      </p>
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-emerald-900/20"
        style={{ aspectRatio: "3 / 4", background: "linear-gradient(180deg,#0F7A4D,#0A6B47)" }}
        dir="ltr"
      >
        {/* خطوط الملعب */}
        <div className="absolute inset-x-0 top-0 h-px bg-white/25" />
        <div className="absolute left-1/2 top-0 h-3 w-24 -translate-x-1/2 rounded-b-xl border border-t-0 border-white/25" />
        <div className="absolute inset-x-6 bottom-0 h-10 rounded-t-[50%] border border-b-0 border-white/15" />
        {starters.map((p) => (
          <div
            key={p.id}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-white text-[10px] font-black text-emerald-900 shadow">
              {p.number ?? "•"}
              {p.captain && (
                <span className="absolute -top-1.5 -right-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-amber-400 text-[7px] font-black text-emerald-950">C</span>
              )}
            </span>
            {p.rating != null && (
              <span className={`mt-0.5 rounded px-1 text-[8px] font-black text-white ${p.rating >= 7.5 ? "bg-emerald-500" : p.rating >= 6 ? "bg-amber-500" : "bg-red-500"}`}>
                {p.rating.toFixed(1)}
              </span>
            )}
            <span className="mt-0.5 max-w-[4.5rem] truncate text-center text-[8px] font-bold text-white/90" dir="rtl">
              {p.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RichLineups({ rich }: { rich: GcRichLineup }) {
  const hasCoords =
    rich.home.some((p) => p.starter && p.x != null && p.y != null) &&
    rich.away.some((p) => p.starter && p.x != null && p.y != null);
  if (!hasCoords) return null;
  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      <PitchHalf players={rich.home} formation={rich.homeFormation} teamName="المضيف" />
      <PitchHalf players={rich.away} formation={rich.awayFormation} teamName="الضيف" />
    </div>
  );
}

/** مؤشر الزخم: أعمدة ±100 — موجب (زمردي) ضغط المضيف، سالب (كهرماني) ضغط الضيف. */
function TrendChart({ trend }: { trend: GcTrend }) {
  if (!trend.values.length) return null;
  const w = 100 / trend.values.length;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-bold text-muted-foreground">مؤشر الخطورة والزخم</p>
      <div className="flex h-16 items-center gap-px overflow-hidden rounded-xl bg-muted/50 px-1" dir="ltr">
        {trend.values.map((v, i) => {
          const h = Math.min(Math.abs(v.value), 100) / 2; // نصف الارتفاع لكل اتجاه
          return (
            <div key={i} className="relative h-full" style={{ width: `${w}%` }}>
              <div
                className={`absolute left-0 right-0 ${v.value >= 0 ? "bottom-1/2 bg-emerald-500" : "top-1/2 bg-amber-500"}`}
                style={{ height: `${h}%`, minHeight: v.value !== 0 ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MotmBoard {
  total: number;
  myPick: { playerId: string; playerName: string } | null;
  open: boolean;
  results: { playerId: string; playerName: string; votes: number; percent: number }[];
}

/**
 * «رجل المباراة — الجمهور ضد الأرقام»: تصويت جماهيري حي يقارن غلبة الجمهور
 * بأعلى تقييم بيانات. مرشّحو التصويت من التشكيلة الغنية (أو تقييمات اللاعبين).
 */
function ManOfTheMatch({ detail }: { detail: GcMatchDetail }) {
  const { isAuthenticated } = useAuth();
  const fixtureId = detail.fixture.id;
  const { data: board } = useQuery<MotmBoard>({
    queryKey: [`/api/gulf-cup/motm/${fixtureId}`],
    refetchInterval: (q) => (q.state.data?.open ? 20_000 : false),
  });

  const vote = useMutation({
    mutationFn: (p: { playerId: string; playerName: string }) =>
      apiRequest(`/api/gulf-cup/motm/${fixtureId}`, { method: "POST", body: JSON.stringify(p) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/gulf-cup/motm/${fixtureId}`] }),
  });

  // مرشّحون: أصحاب التقييمات (بعد المباراة) أو التشكيلة الغنية (أثناءها).
  const candidates: { id: string; name: string; side: "home" | "away" | null }[] = (() => {
    const stats = (detail.playerStats ?? []).filter((p) => p.rating != null);
    if (stats.length > 0) return stats.slice(0, 12).map((p) => ({ id: p.playerId, name: p.name, side: p.side }));
    const rich = detail.lineupsRich;
    if (!rich) return [];
    return [
      ...rich.home.filter((p) => p.starter).map((p) => ({ id: p.id, name: p.name, side: "home" as const })),
      ...rich.away.filter((p) => p.starter).map((p) => ({ id: p.id, name: p.name, side: "away" as const })),
    ];
  })();

  if (candidates.length === 0 && (board?.total ?? 0) === 0) return null;

  const dataStar = (detail.playerStats ?? []).filter((p) => p.rating != null)[0] ?? null;
  const crowdTop = board?.results?.[0] ?? null;

  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-3.5">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-foreground">
        <Star className="h-4 w-4 text-amber-500" />
        رجل المباراة — الجمهور ضد الأرقام
      </p>

      {/* المقارنة عند توفر الطرفين */}
      {(crowdTop || dataStar) && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
            <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">اختيار الجمهور</p>
            <p className="truncate text-sm font-black text-foreground">{crowdTop?.playerName ?? "—"}</p>
            {crowdTop && <p className="text-[10px] text-muted-foreground">{crowdTop.percent}% من {board?.total ?? 0} صوت</p>}
          </div>
          <div className="rounded-xl bg-amber-500/10 px-3 py-2">
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">بطل الأرقام</p>
            <p className="truncate text-sm font-black text-foreground">{dataStar?.name ?? "—"}</p>
            {dataStar?.rating != null && <p className="text-[10px] text-muted-foreground">تقييم {dataStar.rating.toFixed(1)}</p>}
          </div>
        </div>
      )}

      {/* أزرار التصويت */}
      {board?.open && isAuthenticated && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c) => {
            const picked = board?.myPick?.playerId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => vote.mutate({ playerId: c.id, playerName: c.name })}
                disabled={vote.isPending}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  picked
                    ? "bg-[#0F8054] text-white"
                    : "bg-card text-foreground hover:bg-emerald-500/10 border border-border"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
      {board?.open && !isAuthenticated && (
        <p className="text-[11px] text-muted-foreground">سجّل دخولك للتصويت لرجل المباراة</p>
      )}
      {board && !board.open && (board.total ?? 0) === 0 && (
        <p className="text-[11px] text-muted-foreground">يُفتح التصويت من الشوط الثاني</p>
      )}
    </div>
  );
}

/** أعلى تقييمات اللاعبين — رجل المباراة أولًا (مرتّبة من الخادم). */
function PlayerRatings({ detail }: { detail: GcMatchDetail }) {
  const stats = (detail.playerStats ?? []).filter((p) => p.rating != null).slice(0, 10);
  if (stats.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold text-muted-foreground">تقييمات اللاعبين</p>
      <ul className="space-y-1.5">
        {stats.map((p, i) => (
          <li key={p.playerId} className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-1.5 text-sm">
            {i === 0 && <span title="رجل المباراة">⭐</span>}
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
              {p.photo ? <img src={p.photo} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
            </div>
            <span className="min-w-0 flex-1 truncate font-bold text-foreground">{p.name}</span>
            <span className="text-[10px] text-muted-foreground">
              {p.side === "home" ? detail.fixture.home.name : p.side === "away" ? detail.fixture.away.name : ""}
            </span>
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black text-white tabular-nums ${(p.rating ?? 0) >= 7.5 ? "bg-emerald-500" : (p.rating ?? 0) >= 6 ? "bg-amber-500" : "bg-red-500"}`}>
              {p.rating!.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** الغيابات والإصابات — قبل المباراة وأثناءها. */
function InjuriesBlock({ detail }: { detail: GcMatchDetail }) {
  const inj = detail.injuries;
  if (!inj || (inj.home.length === 0 && inj.away.length === 0)) return null;
  const side = (title: string, list: typeof inj.home) =>
    list.length > 0 && (
      <div className="min-w-0">
        <p className="mb-1 truncate text-[11px] font-black text-foreground">{title}</p>
        <ul className="space-y-1">
          {list.slice(0, 5).map((x, i) => (
            <li key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Stethoscope className="h-3 w-3 shrink-0 text-[#DE2B3D]" />
              <span className="truncate font-semibold text-foreground">{x.player}</span>
              {x.reason ? <span className="truncate">— {x.reason}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-bold text-muted-foreground">الغيابات والإصابات</p>
      <div className="grid grid-cols-2 gap-3">
        {side(detail.fixture.home.name, inj.home)}
        {side(detail.fixture.away.name, inj.away)}
      </div>
    </div>
  );
}

/** توقّع النموذج (ELO + Sportmonks) — شريط ثلاثي فوز/تعادل/فوز. */
function ForecastBar({ detail }: { detail: GcMatchDetail }) {
  const fc = detail.forecast;
  if (!fc) return null;
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-xs font-bold text-muted-foreground">توقّع النموذج</p>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" dir="rtl">
        <div className="bg-emerald-500" style={{ width: `${fc.home}%` }} />
        <div className="bg-muted-foreground/30" style={{ width: `${fc.draw}%` }} />
        <div className="bg-amber-400" style={{ width: `${fc.away}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] font-bold">
        <span className="text-emerald-600 dark:text-emerald-400">{detail.fixture.home.name} {fc.home}%</span>
        <span className="text-muted-foreground">تعادل {fc.draw}%</span>
        <span className="text-amber-600 dark:text-amber-400">{detail.fixture.away.name} {fc.away}%</span>
      </div>
    </div>
  );
}

/** التشكيلة المتوقعة قبل المباراة — تختفي فور توفر التشكيلة الرسمية. */
function ExpectedLineups({ detail }: { detail: GcMatchDetail }) {
  const el = detail.expectedLineups;
  if (!el || (!el.home && !el.away) || detail.lineups.length > 0 || detail.lineupsRich) return null;
  const side = (s: NonNullable<typeof el.home>, name: string) => (
    <div className="min-w-0">
      <p className="truncate text-xs font-black text-foreground">
        {name}
        {s.formation ? <span className="font-semibold text-muted-foreground"> · {s.formation}</span> : null}
      </p>
      <ul className="mt-1.5 space-y-1">
        {s.starters.map((p, i) => (
          <li key={`${p.name}-${i}`} className="flex items-center gap-2 text-sm">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-[10px] font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
              {p.jersey ?? "–"}
            </span>
            <span className="truncate text-foreground">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="py-2">
      <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
        تشكيلة متوقعة — تُستبدل بالرسمية فور إعلانها
      </p>
      <div className="grid grid-cols-2 gap-4">
        {el.home && side(el.home, detail.fixture.home.name)}
        {el.away && side(el.away, detail.fixture.away.name)}
      </div>
    </div>
  );
}

/** بطاقة الحكم وسجله — زاوية نقاش جماهيرية. */
function RefereeCard({ detail }: { detail: GcMatchDetail }) {
  const r = detail.referee;
  if (!r) return null;
  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-3.5 py-3">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {r.photo ? <img src={r.photo} alt={r.name} className="h-full w-full object-cover" loading="lazy" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">
          الحكم: {r.name}
          {r.country ? <span className="font-semibold text-muted-foreground"> · {r.country}</span> : null}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {r.matches != null ? `${r.matches} مباراة` : ""}
          {r.yellowAvg != null ? ` · ${r.yellowAvg} بطاقة صفراء/مباراة` : ""}
          {r.penaltiesAvg != null ? ` · ${r.penaltiesAvg} ركلة جزاء/مباراة` : ""}
        </p>
      </div>
      <span>🟨</span>
    </div>
  );
}

/** التعليق النصي الحي (معرّب) — أسفل شريط الأحداث. */
function CommentaryList({ detail }: { detail: GcMatchDetail }) {
  const items = detail.commentary ?? [];
  if (items.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold text-muted-foreground">التعليق المباشر</p>
      <ol className="space-y-1.5">
        {items.slice(0, 20).map((c, i) => (
          <li key={i} className={`flex gap-2 rounded-xl px-3 py-1.5 text-xs leading-relaxed ${c.goal ? "bg-emerald-500/10" : c.important ? "bg-amber-500/10" : "bg-muted/40"}`}>
            <span className="shrink-0 font-black tabular-nums text-muted-foreground">
              {c.minute != null ? `${c.minute}${c.extraMinute ? `+${c.extraMinute}` : ""}′` : "•"}
            </span>
            {c.goal && <span className="shrink-0">⚽</span>}
            <span className={c.important || c.goal ? "font-bold text-foreground" : "text-muted-foreground"}>{c.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StatBar({ label, home, away }: { label: string; home: string; away: string }) {
  // نِسَب الشريط تُحسب فقط للقيم الرقمية (أو النسب المئوية)
  const num = (v: string) => Number(String(v).replace("%", "")) || 0;
  const h = num(home);
  const a = num(away);
  const total = h + a;
  const homePct = total > 0 ? (h / total) * 100 : 50;
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-foreground">
        <span className="tabular-nums">{home}</span>
        <span className="text-muted-foreground font-semibold">{label}</span>
        <span className="tabular-nums">{away}</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted" dir="rtl">
        <div className="bg-emerald-500" style={{ width: `${homePct}%` }} />
        <div className="bg-amber-400" style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

function H2HBlock({ detail }: { detail: GcMatchDetail }) {
  const h = detail.history;
  if (!h || h.total === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        لا سجلّ مواجهات متاح بين المنتخبين حاليًا
      </p>
    );
  }
  return (
    <div className="space-y-4 py-2">
      {/* ملخّص كل التاريخ */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: `فوز ${detail.fixture.home.name}`, value: h.homeWins },
          { label: "تعادل", value: h.draws },
          { label: `فوز ${detail.fixture.away.name}`, value: h.awayWins },
        ].map((cell) => (
          <div key={cell.label} className="rounded-2xl bg-muted/60 px-2 py-3">
            <p className="text-2xl font-black text-foreground tabular-nums">{cell.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground truncate">{cell.label}</p>
          </div>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        من أصل {h.total} مواجهة عبر التاريخ (كل البطولات)
      </p>

      {h.recent.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground">آخر المواجهات</p>
          <ul className="space-y-2">
            {h.recent.map((m, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-xs"
              >
                <span className="truncate text-muted-foreground">{m.competition}</span>
                <span className="flex items-center gap-1.5 font-bold text-foreground">
                  <span className="truncate max-w-[5.5rem]">{m.home.name}</span>
                  <span className="tabular-nums font-black" dir="ltr">
                    {m.goals.away ?? 0} - {m.goals.home ?? 0}
                  </span>
                  <span className="truncate max-w-[5.5rem]">{m.away.name}</span>
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {(m.date ?? "").slice(0, 4)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function GcMatchCenterDialog({ fixtureId, onClose }: GcMatchCenterDialogProps) {
  const { data: detail, isLoading } = useQuery<GcMatchDetail>({
    queryKey: [`/api/gulf-cup/match/${fixtureId}`],
    enabled: fixtureId != null,
    // الفتح يجلب دائمًا (staleTime العام 5 دقائق كان يعيد لقطة «قادمة» قديمة).
    refetchOnMount: "always",
    // حية → 15ث. حول الانطلاق (≤30د قبله وحتى ساعتين بعده إن ظلّت «لم تبدأ») →
    // 25ث لالتقاط قادمة→مباشر — الصيغة القديمة كانت قفل جمود قبل الصافرة.
    refetchInterval: (query) => {
      const f = query.state.data?.fixture;
      if (!f) return false;
      if (f.status.live) return 15_000;
      if (f.status.finished) return false;
      const msToKickoff = f.timestamp * 1000 - Date.now();
      return msToKickoff <= 30 * 60_000 && msToKickoff > -2 * 3_600_000 ? 25_000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const f = detail?.fixture;
  const started = f ? f.status.live || f.status.finished : false;

  return (
    <Dialog open={fixtureId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
        {/* ترويسة النتيجة بهوية خليجي: تدرج المونديال الزمردي + لمسة ذهبية */}
        <div className="relative overflow-hidden bg-gradient-to-bl from-[#14905C] via-[#0F8054] to-[#08573B] px-5 pb-5 pt-4">
          <div className="absolute -top-16 -left-10 h-40 w-40 rounded-full bg-amber-400/10 blur-3xl" />
          <DialogHeader className="mb-3">
            <DialogTitle className="text-right text-xs font-bold text-emerald-100/70">
              {f ? (
                <>
                  <span className="text-amber-300">#{f.matchNo}</span> {f.round} ·{" "}
                  {formatKickoffDay(f.date)}
                </>
              ) : (
                "مركز المباراة"
              )}
            </DialogTitle>
          </DialogHeader>

          {isLoading || !f ? (
            <div className="flex items-center justify-center gap-6 py-2">
              <Skeleton className="h-16 w-16 rounded-full bg-white/10" />
              <Skeleton className="h-8 w-16 bg-white/10" />
              <Skeleton className="h-16 w-16 rounded-full bg-white/10" />
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TeamBlock team={f.home} highlight={f.home.id === SAUDI_TEAM_ID} />
              <div className="flex flex-col items-center gap-1 px-2">
                {started ? (
                  <>
                    {/* المضيف يمينًا في RTL — الضيف أولًا داخل LTR */}
                    <span className="text-4xl font-black text-white tabular-nums" dir="ltr">
                      {f.goals.away ?? 0} - {f.goals.home ?? 0}
                    </span>
                    {f.status.live ? (
                      <span className="flex items-center gap-1 rounded-full bg-[#DE2B3D] px-2.5 py-0.5 text-[11px] font-black text-white">
                        <Radio className="h-3 w-3 animate-pulse" />
                        {f.status.elapsed != null ? `${f.status.elapsed}′` : f.status.label}
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-bold text-emerald-100">
                        {f.status.label}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="text-2xl font-black text-white">{formatKickoffTime(f.date)}</span>
                    <span className="text-[11px] text-emerald-100/70">بتوقيت الرياض</span>
                  </>
                )}
              </div>
              <TeamBlock team={f.away} highlight={f.away.id === SAUDI_TEAM_ID} />
            </div>
          )}

          {/* تصنيف الفيفا للطرفين — يظهر متى توفّر الجسر */}
          {detail?.fifa && (detail.fifa.home || detail.fifa.away) && (
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
              <span className="text-[10px] font-bold text-emerald-100/70">
                {detail.fifa.home ? `فيفا #${detail.fifa.home.rank}` : ""}
              </span>
              <span />
              <span className="text-[10px] font-bold text-emerald-100/70">
                {detail.fifa.away ? `فيفا #${detail.fifa.away.rank}` : ""}
              </span>
            </div>
          )}

          {f?.venue?.name && (
            <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-emerald-100/60">
              <MapPin className="h-3 w-3" />
              {f.venue.name}
              {f.venue.city ? ` — ${f.venue.city}` : ""}
            </p>
          )}

          {/* القنوات الناقلة — «وين أشوف المباراة؟» */}
          {(detail?.tv?.length ?? 0) > 0 && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              {detail!.tv!.slice(0, 4).map((c, i) => (
                <span
                  key={`${c.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-0.5 text-[10px] font-bold text-white"
                >
                  <Tv className="h-3 w-3 text-amber-300" />
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* التبويبات */}
        <div className="p-4">
          <Tabs defaultValue={started ? "events" : "h2h"} dir="rtl">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="events" className="gap-1 text-xs">
                <ListOrdered className="h-3.5 w-3.5" />
                الأحداث
              </TabsTrigger>
              <TabsTrigger value="lineups" className="gap-1 text-xs">
                <Users className="h-3.5 w-3.5" />
                التشكيلات
              </TabsTrigger>
              <TabsTrigger value="stats" className="gap-1 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                الإحصائيات
              </TabsTrigger>
              <TabsTrigger value="h2h" className="gap-1 text-xs">
                <History className="h-3.5 w-3.5" />
                المواجهات
              </TabsTrigger>
            </TabsList>

            <TabsContent value="events">
              {detail && f && <EventsTimeline events={detail.events} fixture={f} />}
              {detail && <CommentaryList detail={detail} />}
            </TabsContent>

            <TabsContent value="lineups">
              {detail?.lineupsRich && <RichLineups rich={detail.lineupsRich} />}
              {detail && <ExpectedLineups detail={detail} />}
              {detail && detail.lineups.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 py-2">
                  {detail.lineups.map((l) => (
                    <LineupColumn key={l.teamId} lineup={l} />
                  ))}
                </div>
              ) : detail?.lineupsRich || detail?.expectedLineups ? null : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  تُعلن التشكيلات قبل انطلاق المباراة بنحو ساعة
                </p>
              )}
              {detail && <InjuriesBlock detail={detail} />}
            </TabsContent>

            <TabsContent value="stats">
              {detail && <ForecastBar detail={detail} />}
              {detail?.trend && <TrendChart trend={detail.trend} />}
              {detail?.xg && (detail.xg.home != null || detail.xg.away != null) && (
                <div className="mb-3">
                  <StatBar
                    label="الأهداف المتوقعة xG"
                    home={String(detail.xg.home ?? 0)}
                    away={String(detail.xg.away ?? 0)}
                  />
                </div>
              )}
              {detail && detail.statistics.length > 0 ? (
                <div className="space-y-3 py-2">
                  {detail.statistics.map((s) => (
                    <StatBar key={s.key} label={s.label} home={s.home} away={s.away} />
                  ))}
                </div>
              ) : detail?.trend || detail?.forecast || (detail?.playerStats?.length ?? 0) > 0 ? null : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  تظهر إحصائيات المباراة هنا بعد الانطلاق
                </p>
              )}
              {detail && <PlayerRatings detail={detail} />}
              {detail && <ManOfTheMatch detail={detail} />}
              {detail && <RefereeCard detail={detail} />}
            </TabsContent>

            <TabsContent value="h2h">{detail && <H2HBlock detail={detail} />}</TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
