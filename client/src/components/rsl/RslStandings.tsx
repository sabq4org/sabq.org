/**
 * جدول ترتيب دوري روشن — قطعة الدوري المركزية بنمط أقسام المونديال:
 * تلوين مناطق (اللقب/آسيا/الهبوط)، فورمة آخر 5 مباريات، صفوف حية أثناء
 * الجولات، ووسم صريح «الترتيب النهائي للموسم الماضي» قبل انطلاق الموسم الجديد
 * (مع تراجُع تلقائي لأرشيف الموسم السابق إن كان جدول الموسم الجديد صفريًّا).
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RSL_SLUG, type RslStandingRow } from "./rslTypes";

const ZONE = {
  title: "border-r-2 border-r-amber-400",
  acl: "border-r-2 border-r-emerald-500",
  relegation: "border-r-2 border-r-red-500",
  none: "border-r-2 border-r-transparent",
} as const;

function zoneOf(rank: number, total: number): keyof typeof ZONE {
  if (rank === 1) return "title";
  if (rank <= 3) return "acl";
  if (total >= 6 && rank > total - 3) return "relegation";
  return "none";
}

function FormBubbles({ form }: { form: string | null }) {
  if (!form) return <span className="text-muted-foreground">—</span>;
  // أحدث نتيجة أولًا: السلسلة تصل من الأقدم للأحدث فنعكسها، وبتدفق RTL الطبيعي
  // (بلا dir="ltr" الذي كان يقلب القراءة) يقع الأحدث يمينًا حيث تبدأ العين
  const items = form.slice(-5).split("").reverse();
  return (
    <span className="inline-flex items-center gap-0.5">
      {items.map((c, i) => (
        <span
          key={i}
          className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-black text-white ${
            c === "W" ? "bg-emerald-500" : c === "D" ? "bg-zinc-400" : "bg-red-500"
          }`}
        >
          {c === "W" ? "ف" : c === "D" ? "ت" : "خ"}
        </span>
      ))}
    </span>
  );
}

interface RslStandingsProps {
  /** ترتيب الموسم الجاري (من الصفحة) */
  standings: RslStandingRow[];
  isLoading: boolean;
  /** موسم جارٍ فعلًا؟ يتحكم بالوسم وبالتراجع لأرشيف الموسم السابق */
  inSeason: boolean;
  /** الموسم السابق (للأرشيف والوسم) */
  previousSeason: number | null;
}

export function RslStandings({ standings, isLoading, inSeason, previousSeason }: RslStandingsProps) {
  // قبل انطلاق الموسم الجديد وجدوله صفري/فارغ — نعرض أرشيف الموسم الماضي موسومًا.
  const currentEmpty = standings.length === 0 || standings.every((r) => r.played === 0);
  const wantArchive = !inSeason && currentEmpty && previousSeason != null;

  const { data: archiveData, isLoading: archiveLoading } = useQuery<{ standings: RslStandingRow[] }>({
    queryKey: [`/api/sports/${RSL_SLUG}/standings?season=${previousSeason}`],
    enabled: wantArchive,
    staleTime: 60 * 60_000,
  });

  const archive = Array.isArray(archiveData?.standings) ? archiveData.standings : [];
  const rows = wantArchive && archive.length > 0 ? archive : standings;
  // قبل انطلاق الموسم الجديد أي جدول معروض هو ختام الموسم الماضي — سواء جاء من
  // مسار الأرشيف الصريح أو كان المزوّد ما يزال يخدم جدول الموسم المنقضي.
  const showingArchive = !inSeason && rows.some((r) => r.played > 0);
  const loading = isLoading || (wantArchive && archiveLoading && rows.length === 0);
  const anyLive = rows.some((r) => r.live);

  if (!loading && rows.length === 0) return null;

  return (
    <section dir="rtl" className="py-10 bg-muted/30" id="standings">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <BarChart3 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-bold">ترتيب الدوري</h2>
            <p className="text-sm text-muted-foreground">
              {showingArchive
                ? previousSeason != null
                  ? `الترتيب النهائي لموسم ${previousSeason}-${(previousSeason + 1) % 100} — يتصفّر مع أول جولة للموسم الجديد`
                  : "الترتيب النهائي للموسم الماضي — يتصفّر مع أول جولة للموسم الجديد"
                : anyLive
                  ? "ترتيب لحظي — يتحدّث مع أهداف المباريات الجارية"
                  : "سباق اللقب والمراكز الآسيوية ومعركة البقاء"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> اللقب</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> آسيا</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> هبوط</span>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-[480px] rounded-xl" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] text-muted-foreground">
                  <th className="px-3 py-2.5 text-right font-semibold">#</th>
                  <th className="px-2 py-2.5 text-right font-semibold">النادي</th>
                  <th className="px-2 py-2.5 text-center font-semibold">لعب</th>
                  <th className="px-2 py-2.5 text-center font-semibold hidden sm:table-cell">ف</th>
                  <th className="px-2 py-2.5 text-center font-semibold hidden sm:table-cell">ت</th>
                  <th className="px-2 py-2.5 text-center font-semibold hidden sm:table-cell">خ</th>
                  <th className="px-2 py-2.5 text-center font-semibold hidden md:table-cell">له</th>
                  <th className="px-2 py-2.5 text-center font-semibold hidden md:table-cell">عليه</th>
                  <th className="px-2 py-2.5 text-center font-semibold">+/−</th>
                  <th className="px-2 py-2.5 text-center font-black">نقاط</th>
                  <th className="px-3 py-2.5 text-center font-semibold hidden lg:table-cell">آخر 5</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <tr
                    key={r.team.id}
                    className={`${ZONE[zoneOf(r.rank, rows.length)]} transition-colors hover:bg-muted/40 ${
                      r.live ? "bg-emerald-500/[0.06]" : ""
                    }`}
                    data-testid={`rsl-standing-${r.team.id}`}
                  >
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.rank}</td>
                    <td className="px-2 py-2">
                      <Link href={`/sports/team/${r.team.id}`} className="flex items-center gap-2 min-w-0 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
                        <span className="h-6 w-6 shrink-0 rounded-full bg-white ring-1 ring-border p-0.5">
                          <img src={r.team.logo} alt={r.team.name} className="h-full w-full object-contain" loading="lazy" />
                        </span>
                        <span className="truncate font-bold">{r.team.name}</span>
                        {r.live && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 animate-pulse" title="تُحدَّث لحظيًّا" />
                        )}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">{r.played}</td>
                    <td className="px-2 py-2 text-center tabular-nums hidden sm:table-cell">{r.win}</td>
                    <td className="px-2 py-2 text-center tabular-nums hidden sm:table-cell">{r.draw}</td>
                    <td className="px-2 py-2 text-center tabular-nums hidden sm:table-cell">{r.lose}</td>
                    <td className="px-2 py-2 text-center tabular-nums hidden md:table-cell">{r.goalsFor}</td>
                    <td className="px-2 py-2 text-center tabular-nums hidden md:table-cell">{r.goalsAgainst}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${r.goalsDiff > 0 ? "text-emerald-600 dark:text-emerald-400" : r.goalsDiff < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                      <span dir="ltr">{r.goalsDiff > 0 ? `+${r.goalsDiff}` : r.goalsDiff}</span>
                    </td>
                    <td className="px-2 py-2 text-center font-black tabular-nums">{r.points}</td>
                    <td className="px-3 py-2 text-center hidden lg:table-cell">
                      <FormBubbles form={r.form} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
