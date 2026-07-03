/**
 * قسم مباريات دوري روشن — نفس قسم مباريات المونديال: ترويسة بأيقونة، تبويبات
 * (مباشر/اليوم/القادمة/النتائج) من دلاء /api/sports/pro-league/matches الجاهزة،
 * وتجميع بالأيام مع شبكة بطاقات متحرّكة الظهور.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RslMatchCard } from "./RslMatchCard";
import { formatKickoffDay, riyadhDayKey, type RslFixture } from "./rslTypes";

export interface RslMatchBuckets {
  live: RslFixture[];
  today: RslFixture[];
  upcoming: RslFixture[];
  results: RslFixture[];
}

interface RslMatchesProps {
  buckets: RslMatchBuckets;
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

interface DayGroup {
  key: string;
  label: string;
  items: RslFixture[];
}

function groupByDay(fixtures: RslFixture[], newestFirst = false): DayGroup[] {
  const sorted = [...fixtures].sort((a, b) =>
    newestFirst ? b.timestamp - a.timestamp : a.timestamp - b.timestamp,
  );
  const groups: DayGroup[] = [];
  for (const fx of sorted) {
    const key = riyadhDayKey(fx.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(fx);
    else groups.push({ key, label: formatKickoffDay(fx.date), items: [fx] });
  }
  return groups;
}

function DayGroupedGrid({ fixtures, onOpenMatch, emptyMessage, newestFirst = false }: {
  fixtures: RslFixture[];
  onOpenMatch: (id: number) => void;
  emptyMessage: string;
  newestFirst?: boolean;
}) {
  if (fixtures.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-10">{emptyMessage}</p>;
  }
  const days = groupByDay(fixtures, newestFirst);
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.key}>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h3 className="text-sm font-bold">{day.label}</h3>
            <span className="text-xs text-muted-foreground">
              ({day.items.length} {day.items.length === 1 ? "مباراة" : "مباريات"})
              {day.items[0]?.round ? ` · ${day.items[0].round}` : ""}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {day.items.map((fixture, index) => (
              <motion.div
                key={fixture.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
              >
                <RslMatchCard fixture={fixture} onOpen={onOpenMatch} />
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RslMatches({ buckets, isLoading, onOpenMatch }: RslMatchesProps) {
  const { live, today, upcoming, results } = buckets;
  const defaultTab = live.length > 0 ? "live" : today.length > 0 ? "today" : "upcoming";
  const [tab, setTab] = useState<string | null>(null);

  return (
    <section dir="rtl" className="py-10" id="matches">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-emerald-500/10">
            <CalendarRange className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">المباريات</h2>
            <p className="text-sm text-muted-foreground">جدول دوري روشن جولةً بجولة بتوقيت الرياض</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        ) : (
          <Tabs value={tab ?? defaultTab} onValueChange={setTab} dir="rtl">
            <TabsList className="mb-5 flex-wrap h-auto">
              <TabsTrigger value="live" className="gap-1.5">
                <Radio className={`h-3.5 w-3.5 ${live.length > 0 ? "text-red-500 animate-pulse" : ""}`} />
                مباشر
                {live.length > 0 && (
                  <Badge className="bg-red-500 text-white border-0 h-4 min-w-4 px-1 text-[10px]">{live.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="today">اليوم</TabsTrigger>
              <TabsTrigger value="upcoming">القادمة</TabsTrigger>
              <TabsTrigger value="results">النتائج</TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              <DayGroupedGrid fixtures={live} onOpenMatch={onOpenMatch} emptyMessage="لا توجد مباريات مباشرة الآن — عُد عند صافرة البداية" />
            </TabsContent>
            <TabsContent value="today">
              <DayGroupedGrid fixtures={today} onOpenMatch={onOpenMatch} emptyMessage="لا توجد مباريات اليوم" />
            </TabsContent>
            <TabsContent value="upcoming">
              <DayGroupedGrid
                fixtures={upcoming}
                onOpenMatch={onOpenMatch}
                emptyMessage="جدول الموسم الجديد يُعلن قريبًا — ستجده هنا فور اعتماده"
              />
            </TabsContent>
            <TabsContent value="results">
              <DayGroupedGrid
                fixtures={results}
                onOpenMatch={onOpenMatch}
                newestFirst
                emptyMessage={
                  live.length > 0
                    ? "مباراة جارية الآن — نتيجتها تظهر هنا فور صافرة النهاية"
                    : "النتائج تظهر هنا فور انتهاء أول مباراة في الموسم"
                }
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </section>
  );
}
