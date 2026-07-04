import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { KcPlayerCard } from "./kcTypes";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2 text-center">
      <p className="text-lg font-black tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function KcPlayerDialog({
  playerId,
  onClose,
}: {
  playerId: number | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<KcPlayerCard>({
    queryKey: [`/api/kings-cup/player/${playerId}`],
    enabled: playerId != null,
    staleTime: 10 * 60_000,
  });

  const cupStats = data?.seasonStats?.find((s) => s.competition.includes("كأس")) ?? data?.seasonStats?.[0];

  return (
    <Dialog open={playerId != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-base">{data?.name ?? "بطاقة اللاعب"}</DialogTitle>
        </DialogHeader>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground py-8 text-center">جارٍ التحميل…</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {data.photo ? (
                <img src={data.photo} alt={data.name} className="h-20 w-20 rounded-full object-cover bg-muted" />
              ) : (
                <span className="h-20 w-20 rounded-full bg-muted" />
              )}
              <div className="min-w-0">
                <p className="text-lg font-black truncate">{data.name}</p>
                <p className="text-xs text-muted-foreground">{data.position}</p>
                {data.currentTeam && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <img src={data.currentTeam.logo} alt="" className="h-4 w-4 object-contain" />
                    <span className="text-xs">{data.currentTeam.name}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              {data.age != null && <Stat label="العمر" value={data.age} />}
              {data.nationality && <Stat label="الجنسية" value={data.nationality} />}
              {data.number != null && <Stat label="الرقم" value={data.number} />}
              {data.height != null && <Stat label="الطول (سم)" value={data.height} />}
              {data.weight != null && <Stat label="الوزن (كجم)" value={data.weight} />}
              {data.birthPlace && <Stat label="مكان الميلاد" value={data.birthPlace} />}
            </div>

            {cupStats && (
              <div>
                <h3 className="text-sm font-black mb-2">أرقام الموسم ({cupStats.competition})</h3>
                <div className="grid grid-cols-4 gap-2">
                  <Stat label="مباريات" value={cupStats.matches} />
                  <Stat label="أهداف" value={cupStats.goals} />
                  <Stat label="صناعة" value={cupStats.assists} />
                  <Stat label="التقييم" value={cupStats.rating?.toFixed(1) ?? "—"} />
                </div>
              </div>
            )}

            {data.trophies.length > 0 && (
              <div>
                <h3 className="text-sm font-black mb-2">الألقاب</h3>
                <ul className="space-y-1 text-xs text-muted-foreground max-h-40 overflow-y-auto">
                  {data.trophies.slice(0, 12).map((t, i) => (
                    <li key={i} className="flex justify-between">
                      <span className="truncate">{t.competition}</span>
                      <span className="shrink-0 tabular-nums">{t.season}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* البطاقة عرض سريع — الملف الكامل (قيمة سوقية/فورمة/انتقالات/إصابات) في صفحة اللاعب */}
            <Link
              href={`/kings-cup/player/${data.id}`}
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-400/10 border border-amber-300/30 py-2.5 text-sm font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-400/20 transition-colors"
            >
              الملف الكامل للاعب
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
