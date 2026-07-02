import { useQuery } from "@tanstack/react-query";
import { Radio, MapPin, History, Users, BarChart3, ListOrdered } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SAUDI_TEAM_ID,
  formatKickoffDay,
  formatKickoffTime,
  type GcFixture,
  type GcLineup,
  type GcMatchDetail,
  type GcMatchEvent,
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
    refetchInterval: (query) => (query.state.data?.fixture.status.live ? 15_000 : false),
    refetchIntervalInBackground: false,
  });

  const f = detail?.fixture;
  const started = f ? f.status.live || f.status.finished : false;

  return (
    <Dialog open={fixtureId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
        {/* ترويسة النتيجة بهوية خليجي: أخضر عميق + لمسة ذهبية */}
        <div className="relative overflow-hidden bg-gradient-to-bl from-[#02160f] via-[#04392a] to-[#021a12] px-5 pb-5 pt-4">
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
                      <span className="flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-black text-white">
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

          {f?.venue?.name && (
            <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-emerald-100/60">
              <MapPin className="h-3 w-3" />
              {f.venue.name}
              {f.venue.city ? ` — ${f.venue.city}` : ""}
            </p>
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
            </TabsContent>

            <TabsContent value="lineups">
              {detail && detail.lineups.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 py-2">
                  {detail.lineups.map((l) => (
                    <LineupColumn key={l.teamId} lineup={l} />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  تُعلن التشكيلات قبل انطلاق المباراة بنحو ساعة
                </p>
              )}
            </TabsContent>

            <TabsContent value="stats">
              {detail && detail.statistics.length > 0 ? (
                <div className="space-y-3 py-2">
                  {detail.statistics.map((s) => (
                    <StatBar key={s.key} label={s.label} home={s.home} away={s.away} />
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  تظهر إحصائيات المباراة هنا بعد الانطلاق
                </p>
              )}
            </TabsContent>

            <TabsContent value="h2h">{detail && <H2HBlock detail={detail} />}</TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
