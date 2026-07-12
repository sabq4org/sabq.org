/**
 * نافذة تفاصيل مباراة كأس آسيا — تُفتح بالضغط على أي بطاقة مباراة.
 * تجلب /api/asian-cup/match/:id وتعرض: النتيجة/الموعد، قنوات البث حول العالم
 * (TheSports عبر جسر الخادم)، توقّع النموذج الداخلي، وسجل المواجهات المباشرة.
 * مرآة نحيفة لِـ MatchCenterDialog المونديالية — تكامل الويب مع تطبيق iOS.
 */
import { useQuery } from "@tanstack/react-query";
import { MapPin, Radio, Sparkles, Tv } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatKickoffDay,
  formatKickoffTime,
  type AcFixture,
  type AcMatchDetailSlim,
} from "./acTypes";

function TeamCol({ team }: { team: AcFixture["home"] }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <div className="h-14 w-14 rounded-full bg-white p-1.5 ring-1 ring-black/5">
        {team.logo ? (
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        ) : null}
      </div>
      <span className="text-center text-sm font-bold text-foreground line-clamp-2">{team.name}</span>
    </div>
  );
}

function ProbBar({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" }) {
  const barClass = tone === "emerald" ? "bg-emerald-500" : "bg-amber-500";
  const textClass =
    tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold text-muted-foreground truncate">{label}</span>
        <span className={`font-black tabular-nums ${textClass}`}>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
      </div>
    </div>
  );
}

export function AcMatchDialog({
  fixture,
  open,
  onOpenChange,
}: {
  fixture: AcFixture;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const started = fixture.status.live || fixture.status.finished;

  const { data: detail, isLoading } = useQuery<AcMatchDetailSlim>({
    queryKey: [`/api/asian-cup/match/${fixture.id}`],
    enabled: open,
    staleTime: fixture.status.live ? 60 * 1000 : 10 * 60 * 1000,
  });

  const fx = detail?.fixture ?? fixture;
  const tv = detail?.tv ?? [];
  const prediction = detail?.prediction ?? null;
  const h2h = detail?.headToHead ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2 text-sm font-bold text-muted-foreground">
            <span className="truncate">{fx.round}</span>
            {fx.status.live ? (
              <span className="flex items-center gap-1 font-black text-red-500">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                {fx.status.elapsed != null ? `${fx.status.elapsed}'` : "مباشر"}
              </span>
            ) : (
              <span>{fx.status.finished ? "انتهت" : formatKickoffDay(fx.date)}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* لوحة النتيجة */}
        <div className="rounded-2xl bg-gradient-to-bl from-emerald-700 to-emerald-500 p-4 text-white">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamCol team={fx.home} />
            <div className="px-2 text-center" dir="ltr">
              {started ? (
                <span className="text-3xl font-black tabular-nums">
                  {fx.goals.home ?? 0} - {fx.goals.away ?? 0}
                </span>
              ) : (
                <div>
                  <div className="text-2xl font-black tabular-nums">{formatKickoffTime(fx.date)}</div>
                  <div className="mt-0.5 text-[10px] text-white/70">بتوقيت الرياض</div>
                </div>
              )}
            </div>
            <TeamCol team={fx.away} />
          </div>
          {fx.venue?.name && (
            <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-white/75">
              <MapPin className="h-3 w-3" />
              <span className="truncate">
                {fx.venue.name}
                {fx.venue.city ? ` — ${fx.venue.city}` : ""}
              </span>
            </div>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        )}

        {/* أين تشاهد المباراة — قنوات البث حول العالم */}
        {tv.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-foreground">
              <Tv className="h-4 w-4 text-emerald-500" />
              أين تشاهد المباراة
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tv.slice(0, 12).map((channel, i) => (
                <div key={`${channel.name}-${i}`} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                  <div className="truncate text-xs font-bold text-foreground">{channel.name}</div>
                  {channel.country && (
                    <div className="truncate text-[10px] text-muted-foreground">{channel.country}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* توقّع النموذج الداخلي */}
        {prediction && !fx.status.finished && (
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <div className="mb-2.5 flex items-center gap-2 text-sm font-bold text-foreground">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              توقّع المباراة
            </div>
            <div className="space-y-2.5">
              <ProbBar label={fx.home.name} value={prediction.home} tone="emerald" />
              <ProbBar label="تعادل" value={prediction.draw} tone="amber" />
              <ProbBar label={fx.away.name} value={prediction.away} tone="emerald" />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">تقدير من نموذج التطبيق — للاسترشاد فقط.</p>
          </div>
        )}

        {/* سجل المواجهات المباشرة */}
        {h2h.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-3.5">
            <div className="mb-2.5 text-sm font-bold text-foreground">المواجهات المباشرة</div>
            <div className="space-y-1.5">
              {h2h.slice(0, 6).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{formatKickoffDay(m.date)}</span>
                  <span className="flex items-center gap-1.5 font-bold text-foreground" dir="ltr">
                    <img src={m.home.logo} alt={m.home.name} className="h-4 w-4 rounded-full bg-white object-contain" />
                    <span className="tabular-nums">
                      {m.goals.home ?? 0} - {m.goals.away ?? 0}
                    </span>
                    <img src={m.away.logo} alt={m.away.name} className="h-4 w-4 rounded-full bg-white object-contain" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
