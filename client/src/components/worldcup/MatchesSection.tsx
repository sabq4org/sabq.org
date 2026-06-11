import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchCard } from "./MatchCard";
import {
  groupFixturesByDay,
  todayRiyadhKey,
  riyadhDayKey,
  type WcFixture,
} from "./wcTypes";

interface MatchesSectionProps {
  fixtures: WcFixture[] | undefined;
  isLoading: boolean;
  onOpenMatch: (fixtureId: number) => void;
}

function DayGroupedGrid({ fixtures, onOpenMatch, emptyMessage }: {
  fixtures: WcFixture[];
  onOpenMatch: (id: number) => void;
  emptyMessage: string;
}) {
  if (fixtures.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-10">{emptyMessage}</p>;
  }
  const days = groupFixturesByDay(fixtures);
  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.key}>
          <div className="flex items-center gap-2 mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <h3 className="text-sm font-bold">{day.label}</h3>
            <span className="text-xs text-muted-foreground">({day.items.length} {day.items.length === 1 ? "مباراة" : "مباريات"})</span>
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
                <MatchCard fixture={fixture} onOpen={onOpenMatch} />
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MatchesSection({ fixtures, isLoading, onOpenMatch }: MatchesSectionProps) {
  const { live, today, upcoming, finished } = useMemo(() => {
    const all = fixtures ?? [];
    const todayKey = todayRiyadhKey();
    return {
      live: all.filter((f) => f.status.live),
      today: all.filter((f) => riyadhDayKey(f.date) === todayKey),
      upcoming: all.filter((f) => !f.status.live && !f.status.finished),
      finished: all.filter((f) => f.status.finished).slice().reverse(),
    };
  }, [fixtures]);

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
            <p className="text-sm text-muted-foreground">جدول مونديال 2026 كاملًا بتوقيت الرياض</p>
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
              <TabsTrigger value="finished">النتائج</TabsTrigger>
            </TabsList>

            <TabsContent value="live">
              <DayGroupedGrid fixtures={live} onOpenMatch={onOpenMatch} emptyMessage="لا توجد مباريات مباشرة الآن — عُد عند صافرة البداية" />
            </TabsContent>
            <TabsContent value="today">
              <DayGroupedGrid fixtures={today} onOpenMatch={onOpenMatch} emptyMessage="لا توجد مباريات اليوم" />
            </TabsContent>
            <TabsContent value="upcoming">
              <DayGroupedGrid fixtures={upcoming} onOpenMatch={onOpenMatch} emptyMessage="لا توجد مباريات قادمة معلنة بعد" />
            </TabsContent>
            <TabsContent value="finished">
              {/* «الانطلاقة قريبًا» تصبح خاطئة لحظة انطلاق البطولة — الرسالة تتبع الحالة */}
              <DayGroupedGrid
                fixtures={finished}
                onOpenMatch={onOpenMatch}
                emptyMessage={
                  live.length > 0
                    ? "مباراة جارية الآن — نتيجتها تظهر هنا فور صافرة النهاية"
                    : "النتائج تظهر هنا فور انتهاء أول مباراة"
                }
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </section>
  );
}
