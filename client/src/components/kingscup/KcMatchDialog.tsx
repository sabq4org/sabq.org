import { useQuery } from "@tanstack/react-query";
import { Goal, Square, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PenaltyResult } from "../worldcup/PenaltyResult";
import {
  elapsedLabel,
  formatKickoffDay,
  formatKickoffTime,
  type KcMatchDetail,
  type KcMatchEvent,
} from "./kcTypes";

function EventIcon({ type }: { type: string }) {
  if (type === "goal") return <Goal className="h-4 w-4 text-emerald-600" />;
  if (type === "yellow-card") return <Square className="h-4 w-4 fill-yellow-400 text-yellow-500" />;
  if (type === "red-card") return <Square className="h-4 w-4 fill-red-500 text-red-600" />;
  if (type === "substitution") return <RefreshCw className="h-4 w-4 text-sky-500" />;
  return <span className="h-4 w-4 inline-block rounded-full bg-muted" />;
}

function EventRow({ ev, homeId }: { ev: KcMatchEvent; homeId: number }) {
  const isHome = ev.teamId === homeId;
  const minute = ev.minute != null ? `${ev.minute}${ev.extra ? `+${ev.extra}` : ""}'` : "";
  return (
    <div className={`flex items-center gap-2 ${isHome ? "" : "flex-row-reverse text-left"}`}>
      <span className="text-xs text-muted-foreground tabular-nums w-8 shrink-0">{minute}</span>
      <EventIcon type={ev.type} />
      <div className={`min-w-0 ${isHome ? "" : "text-left"}`}>
        <span className="text-sm font-semibold">{ev.player}</span>
        {ev.assist && <span className="text-[11px] text-muted-foreground"> ({ev.assist})</span>}
      </div>
    </div>
  );
}

export function KcMatchDialog({
  fixtureId,
  onClose,
  onOpenPlayer,
}: {
  fixtureId: number | null;
  onClose: () => void;
  onOpenPlayer?: (id: number) => void;
}) {
  const { data, isLoading } = useQuery<KcMatchDetail>({
    queryKey: [`/api/kings-cup/match/${fixtureId}`],
    enabled: fixtureId != null,
    refetchInterval: (query) => (query.state.data?.fixture.status.live ? 15_000 : false),
  });

  const fx = data?.fixture;

  return (
    <Dialog open={fixtureId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {fx ? `${fx.home.name} ضد ${fx.away.name}` : "مركز المباراة"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !fx ? (
          <p className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</p>
        ) : (
          <div className="space-y-6">
            {/* النتيجة */}
            <div className="flex items-center justify-center gap-6 rounded-xl bg-muted/40 p-4">
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <img src={fx.home.logo} alt={fx.home.name} className="h-14 w-14 object-contain" />
                <span className="text-sm font-bold text-center truncate w-full">{fx.home.name}</span>
              </div>
              <div className="flex flex-col items-center shrink-0">
                {fx.status.live || fx.status.finished ? (
                  // رقما النتيجة منفصلان بلا dir="ltr": في RTL يقع رقم المضيف يمينًا
                  // (تحت شعاره) — dir="ltr" مع المضيف أولًا كان يقلب النتيجة تحت الشعارات
                  <span className="flex items-center gap-2 text-3xl font-black tabular-nums">
                    <span>{fx.goals.home ?? 0}</span>
                    <span className="text-xl text-muted-foreground">-</span>
                    <span>{fx.goals.away ?? 0}</span>
                  </span>
                ) : (
                  <span className="text-xl font-black">{formatKickoffTime(fx.date)}</span>
                )}
                {/* الترجيح بصيغة «فاز {الفائز} (W-L)» الموحّدة — لا تنقلب بحسب الاتجاه */}
                <PenaltyResult fixture={fx} className="text-[11px] text-muted-foreground" />
                <Badge variant={fx.status.live ? "destructive" : "outline"} className="mt-1 text-[10px]">
                  {fx.status.live ? elapsedLabel(fx.status) : fx.status.label}
                </Badge>
              </div>
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <img src={fx.away.logo} alt={fx.away.name} className="h-14 w-14 object-contain" />
                <span className="text-sm font-bold text-center truncate w-full">{fx.away.name}</span>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              {formatKickoffDay(fx.date)} · {fx.round}
              {fx.venue?.name ? ` · ${fx.venue.name}` : ""}
            </p>

            {/* الأحداث */}
            {data.events.length > 0 && (
              <div>
                <h3 className="text-sm font-black mb-3">أحداث المباراة</h3>
                <div className="space-y-2">
                  {data.events.map((ev, i) => (
                    <EventRow key={i} ev={ev} homeId={fx.home.id} />
                  ))}
                </div>
              </div>
            )}

            {/* الإحصائيات */}
            {data.statistics && data.statistics.rows.length > 0 && (
              <div>
                <h3 className="text-sm font-black mb-3">الإحصائيات</h3>
                <div className="space-y-2">
                  {data.statistics.rows.map((r) => (
                    <div key={r.type} className="text-xs">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-bold tabular-nums">{r.home ?? 0}</span>
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-bold tabular-nums">{r.away ?? 0}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* التشكيلات */}
            {data.lineups.length === 2 && (
              <div className="grid grid-cols-2 gap-4">
                {data.lineups.map((l) => (
                  <div key={l.team.id}>
                    <div className="flex items-center gap-2 mb-2">
                      <img src={l.team.logo} alt="" className="h-5 w-5 object-contain" />
                      <span className="text-xs font-bold truncate">{l.team.name}</span>
                      {l.formation && <span className="text-[10px] text-muted-foreground">{l.formation}</span>}
                    </div>
                    <ul className="space-y-1">
                      {l.startXI.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => p.id > 0 && onOpenPlayer?.(p.id)}
                            className="text-xs hover:text-emerald-600 text-right w-full truncate"
                          >
                            {p.number != null ? `${p.number}. ` : ""}
                            {p.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
