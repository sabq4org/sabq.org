import { useQuery } from "@tanstack/react-query";
import { Activity, Cake, History, Ruler, Shirt, TrendingUp, Trophy, Weight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMarketValue, type WcPlayerCard, type WcPlayerCareerStop, type WcPlayerMarket, type WcPlayerTournamentStats } from "@/components/worldcup/wcTypes";

/**
 * بطاقة اللاعب الشاملة — تُفتح بالضغط على أي لاعب في مركز كأس آسيا
 * (قوائم المنتخبات، السباقات، التشكيلات، التقييمات، أحداث المباراة).
 * تجمع كل ما يوفره المزود: الملف الشخصي، المسيرة، الألقاب، وأرقام البطولة.
 */

export interface AcPlayerCardDialogProps {
  playerId: number | null;
  onClose: () => void;
}

// ميلادي + أرقام لاتينية — نفس اصطلاح بقية القسم
const birthFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/** [2019..2025] → "2019–2025"، وموسم واحد يُعرض مفردًا */
function seasonsLabel(seasons: number[]): string {
  if (seasons.length === 0) return "";
  const first = seasons[0];
  const last = seasons[seasons.length - 1];
  return first === last ? `${first}` : `${first}–${last}`;
}

function ratingColor(rating: number): string {
  if (rating >= 8) return "bg-emerald-500 text-white";
  if (rating >= 7) return "bg-lime-500 text-white";
  if (rating >= 6) return "bg-amber-500 text-white";
  return "bg-red-500 text-white";
}

function FactTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-2 text-center">
      <p className="text-sm font-black tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function TournamentStats({ stats, isGoalkeeper }: { stats: WcPlayerTournamentStats; isGoalkeeper: boolean }) {
  // البلاطات تُبنى حسب المركز — لا معنى لعرض «تصديات» لمهاجم أو «مراوغات» لحارس
  const tiles: { label: string; value: string }[] = [
    { label: "مباريات", value: `${stats.matches}` },
    { label: "دقائق اللعب", value: `${stats.minutes}` },
    { label: "أساسي", value: `${stats.lineups}` },
    { label: "أهداف", value: `${stats.goals}` },
    { label: "صناعة", value: `${stats.assists}` },
  ];
  if (isGoalkeeper) {
    tiles.push(
      { label: "تصديات", value: `${stats.saves}` },
      { label: "أهداف استقبلها", value: `${stats.conceded}` }
    );
  } else {
    tiles.push(
      { label: "تسديدات (على المرمى)", value: `${stats.shots} (${stats.shotsOn})` },
      { label: "تمريرات مفتاحية", value: `${stats.keyPasses}` },
      { label: "مراوغات ناجحة", value: `${stats.dribblesSuccess}/${stats.dribblesAttempts}` },
      { label: "تدخلات", value: `${stats.tackles}` }
    );
  }
  if (stats.penaltiesScored + stats.penaltiesMissed > 0) {
    tiles.push({ label: "ركلات جزاء", value: `${stats.penaltiesScored}/${stats.penaltiesScored + stats.penaltiesMissed}` });
  }
  if (stats.yellow + stats.red > 0) {
    tiles.push({ label: "بطاقات (صفراء/حمراء)", value: `${stats.yellow}/${stats.red}` });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">أرقامه في كأس آسيا 2027</h4>
        {stats.rating != null && (
          <span className={`rounded-md px-1.5 py-0.5 text-xs font-black tabular-nums ${ratingColor(stats.rating)}`}>
            {stats.rating.toFixed(1)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((tile) => (
          <FactTile key={tile.label} value={tile.value} label={tile.label} />
        ))}
      </div>
    </div>
  );
}

function CareerList({ career }: { career: WcPlayerCareerStop[] }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1">
        <History className="h-3.5 w-3.5" />
        المسيرة
      </h4>
      <div className="space-y-1.5">
        {career.map((stop) => (
          <div
            key={`${stop.teamId}-${stop.team}`}
            className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-1.5"
          >
            <span className="h-7 w-7 rounded-full bg-white ring-1 ring-border p-0.5 shrink-0">
              {stop.logo && (
                <img src={stop.logo} alt={stop.team} className="h-full w-full object-contain" loading="lazy" />
              )}
            </span>
            <p className="text-sm font-bold truncate flex-1">{stop.team}</p>
            {stop.seasons.length > 0 && (
              <span className="text-[11px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
                {seasonsLabel(stop.seasons)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrophiesList({ player }: { player: WcPlayerCard }) {
  const titles = player.trophies.filter((t) => t.winner).length;
  return (
    <div>
      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1">
        <Trophy className="h-3.5 w-3.5 text-amber-500" />
        الألقاب
        {titles > 0 && (
          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 tabular-nums">{titles} بطولة</Badge>
        )}
      </h4>
      <div className="space-y-1.5">
        {player.trophies.map((trophy, index) => (
          <div
            key={index}
            className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-1.5"
          >
            <Trophy
              className={`h-4 w-4 shrink-0 ${trophy.winner ? "text-amber-500" : "text-muted-foreground/50"}`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate">{trophy.competition}</p>
              {trophy.country && <p className="text-[10px] text-muted-foreground truncate">{trophy.country}</p>}
            </div>
            <Badge
              className={`text-[10px] h-5 border-0 shrink-0 ${
                trophy.winner ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {trophy.place}
            </Badge>
            <span className="text-[11px] text-muted-foreground tabular-nums shrink-0" dir="ltr">
              {trophy.season}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// فورمة اللاعب + xG (SportMonks) — /api/asian-cup/player/:id/form
interface WcPlayerFormMatch {
  date: string;
  opponent: string;
  opponentLogo: string;
  homeAway: "home" | "away";
  result: "W" | "D" | "L";
  scoreFor: number;
  scoreAgainst: number;
  xg: number | null;
  goals: number;
  rating: number | null;
  league: string;
}
interface WcPlayerForm {
  available: boolean;
  matches: WcPlayerFormMatch[];
}

function PlayerForm({ playerId }: { playerId: number }) {
  const { data } = useQuery<WcPlayerForm>({
    queryKey: [`/api/asian-cup/player/${playerId}/form`],
    enabled: playerId != null,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
  const matches = Array.isArray(data?.matches) ? data!.matches : [];
  if (matches.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1">
        <Activity className="h-3.5 w-3.5" />
        الفورمة الأخيرة · الأهداف المتوقّعة
      </h4>
      <div className="space-y-1.5">
        {matches.map((m, i) => (
          <div key={i} className="flex items-center gap-2.5 rounded-lg bg-muted/40 px-2.5 py-1.5">
            <span
              className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-black text-white shrink-0 ${
                m.result === "W" ? "bg-emerald-500" : m.result === "L" ? "bg-red-500" : "bg-zinc-400"
              }`}
            >
              {m.result === "W" ? "ف" : m.result === "L" ? "خ" : "ت"}
            </span>
            <span className="h-6 w-6 rounded-full bg-white ring-1 ring-border p-0.5 shrink-0">
              {m.opponentLogo && (
                <img src={m.opponentLogo} alt="" className="h-full w-full object-contain" loading="lazy" />
              )}
            </span>
            <span className="text-sm font-bold tabular-nums shrink-0" dir="ltr">
              {m.scoreFor}-{m.scoreAgainst}
            </span>
            <span className="flex-1" />
            {m.goals > 0 && (
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
                {m.goals} ⚽
              </span>
            )}
            {m.xg != null && (
              <span
                className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0"
                dir="ltr"
              >
                xG {m.xg.toFixed(2)}
              </span>
            )}
            {m.rating != null && (
              <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black tabular-nums shrink-0 ${ratingColor(m.rating)}`}>
                {m.rating.toFixed(1)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// مخطّط بسيط (SVG) لتطوّر القيمة السوقية عبر الزمن — أخضر صاعد/أحمر هابط.
function MarketSparkline({ history }: { history: { time: number; value: number }[] }) {
  if (history.length < 2) return null;
  const W = 260;
  const H = 56;
  const pad = 4;
  const vals = history.map((h) => h.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = history.length;
  const pts = history
    .map((h, i) => {
      const x = pad + (i / (n - 1)) * (W - 2 * pad);
      const y = H - pad - ((h.value - min) / span) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const up = vals[n - 1] >= vals[0];
  const stroke = up ? "#10b981" : "#ef4444";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// القيمة السوقية وتاريخها (TheSports) — /api/asian-cup/player/:id/market
function PlayerMarketValue({ playerId }: { playerId: number }) {
  const { data } = useQuery<WcPlayerMarket>({
    queryKey: [`/api/asian-cup/player/${playerId}/market`],
    enabled: playerId != null,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  if (!data?.available) return null;
  const history = Array.isArray(data.history) ? data.history : [];
  const current = data.marketValue ?? (history.length ? history[history.length - 1].value : null);
  const formatted = formatMarketValue(current, data.currency);
  if (!formatted && history.length < 2) return null;
  const peak = history.length ? Math.max(...history.map((h) => h.value)) : null;
  return (
    <div>
      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-1">
        <TrendingUp className="h-3.5 w-3.5" />
        القيمة السوقية
      </h4>
      <div className="rounded-xl bg-muted/40 px-3 py-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-lg font-black text-emerald-600 tabular-nums">{formatted ?? "—"}</span>
          {peak != null && peak !== current && (
            <span className="text-[10px] text-muted-foreground">الأعلى: {formatMarketValue(peak, data.currency)}</span>
          )}
        </div>
        {history.length >= 2 && <MarketSparkline history={history} />}
      </div>
    </div>
  );
}

export function AcPlayerCardDialog({ playerId, onClose }: AcPlayerCardDialogProps) {
  const { data: player, isLoading } = useQuery<WcPlayerCard>({
    queryKey: [`/api/asian-cup/player/${playerId}`],
    enabled: playerId != null,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  return (
    <Dialog open={playerId != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md max-h-[85vh] overflow-hidden flex flex-col [&>button]:left-4 [&>button]:right-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">بطاقة اللاعب</DialogTitle>
          {isLoading && (
            <div className="flex items-center gap-4 py-2">
              <Skeleton className="h-20 w-20 rounded-full shrink-0" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          )}
          {player && (
            <div className="flex items-center gap-4 text-right">
              <div className="h-20 w-20 rounded-full overflow-hidden bg-muted ring-4 ring-emerald-500/30 shrink-0">
                {player.photo && (
                  <img src={player.photo} alt={player.name} className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black leading-tight">{player.name}</p>
                {player.fullName && (
                  <p className="text-[11px] text-muted-foreground truncate">{player.fullName}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  {player.position && (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-0 text-[10px] font-bold">
                      {player.position}
                    </Badge>
                  )}
                  {player.number != null && (
                    <Badge variant="secondary" className="text-[10px] gap-1 tabular-nums">
                      <Shirt className="h-2.5 w-2.5" />
                      {player.number}
                    </Badge>
                  )}
                  {player.injury && (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 text-[10px] font-bold">
                      مصاب حاليًا
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogHeader>

        {/* تمرير أصلي — react-remove-scroll في نافذة Radix يحجب ScrollArea على اللمس */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain pe-2"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {isLoading && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && !player && (
            <p className="text-center text-sm text-muted-foreground py-8">
              ملف اللاعب غير متاح حاليًا
            </p>
          )}

          {player && (
            <div className="space-y-5 py-1">
              {/* شريط الحقائق الشخصية */}
              {(player.age != null || player.height != null || player.weight != null) && (
                <div className="grid grid-cols-3 gap-1.5">
                  {player.age != null && <FactTile value={`${player.age} سنة`} label="العمر" />}
                  {player.height != null && <FactTile value={`${player.height} سم`} label="الطول" />}
                  {player.weight != null && <FactTile value={`${player.weight} كجم`} label="الوزن" />}
                </div>
              )}
              {(player.birthDate || player.birthPlace) && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 -mt-2">
                  <Cake className="h-3.5 w-3.5 shrink-0" />
                  {[
                    player.birthDate ? birthFmt.format(new Date(player.birthDate)) : null,
                    player.birthPlace,
                  ]
                    .filter(Boolean)
                    .join(" — ")}
                </p>
              )}

              {player.stats && (
                <TournamentStats stats={player.stats} isGoalkeeper={player.positionEn === "Goalkeeper"} />
              )}

              {playerId != null && <PlayerMarketValue playerId={playerId} />}

              {playerId != null && <PlayerForm playerId={playerId} />}

              {player.career.length > 0 && <CareerList career={player.career} />}

              {player.trophies.length > 0 && <TrophiesList player={player} />}

              {(player.height != null || player.weight != null) && (
                <p className="text-[10px] text-muted-foreground/70 text-center flex items-center justify-center gap-1">
                  <Ruler className="h-3 w-3" />
                  <Weight className="h-3 w-3" />
                  البيانات من مزود الإحصائيات الرياضية وتُحدَّث دوريًا
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
