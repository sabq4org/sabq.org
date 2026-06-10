import { motion } from "framer-motion";
import { Award, Goal, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { WcScorer } from "./wcTypes";

interface ScorersSectionProps {
  scorers: WcScorer[] | undefined;
  isLoading: boolean;
}

const PODIUM_RING = [
  "ring-amber-400", // الذهب
  "ring-zinc-300", // الفضة
  "ring-orange-700/70", // البرونز
];

function PodiumCard({ scorer, place }: { scorer: WcScorer; place: number }) {
  const isFirst = place === 0;
  return (
    <div className={`flex flex-col items-center gap-2 ${isFirst ? "" : "mt-8"}`}>
      <div className="relative">
        <div className={`${isFirst ? "h-24 w-24" : "h-18 w-18 h-[72px] w-[72px]"} rounded-full overflow-hidden ring-4 ${PODIUM_RING[place]} bg-muted`}>
          {scorer.photo ? (
            <img src={scorer.photo} alt={scorer.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-muted-foreground font-black text-xl">
              {scorer.name.slice(0, 2)}
            </div>
          )}
        </div>
        <span className={`absolute -bottom-1.5 right-1/2 translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-black text-white ${
          place === 0 ? "bg-amber-500" : place === 1 ? "bg-zinc-400" : "bg-orange-700"
        }`}>
          {place + 1}
        </span>
      </div>
      <div className="text-center">
        <p className={`font-extrabold ${isFirst ? "text-base" : "text-sm"}`}>{scorer.name}</p>
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <img src={scorer.team.logo} alt={scorer.team.name} className="h-3.5 w-3.5 object-contain" loading="lazy" />
          {scorer.team.name}
        </p>
      </div>
      <div className={`flex items-baseline gap-1 ${isFirst ? "text-amber-500" : "text-foreground"}`}>
        <span className={`font-black tabular-nums ${isFirst ? "text-3xl" : "text-2xl"}`}>{scorer.goals}</span>
        <span className="text-xs text-muted-foreground">{scorer.goals === 1 ? "هدف" : "أهداف"}</span>
      </div>
    </div>
  );
}

export function ScorersSection({ scorers, isLoading }: ScorersSectionProps) {
  const podium = (scorers ?? []).slice(0, 3);
  const rest = (scorers ?? []).slice(3);

  return (
    <section dir="rtl" className="py-10" id="scorers">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-amber-500/10">
            <Award className="h-6 w-6 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">الحذاء الذهبي</h2>
            <p className="text-sm text-muted-foreground">سباق هدافي المونديال</p>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        )}

        {!isLoading && podium.length === 0 && (
          <Card className="border-0 dark:border dark:border-card-border max-w-xl mx-auto">
            <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
              <Goal className="h-8 w-8 text-amber-500" />
              <p className="font-bold">سباق الحذاء الذهبي ينطلق مع أول صافرة</p>
              <p className="text-sm text-muted-foreground">تابع هنا ترتيب الهدافين أولًا بأول طوال البطولة</p>
            </CardContent>
          </Card>
        )}

        {!isLoading && podium.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            {/* منصة التتويج: الثاني — الأول — الثالث */}
            <div className="grid grid-cols-3 items-start gap-3 max-w-xl mx-auto mb-8">
              {podium[1] ? <PodiumCard scorer={podium[1]} place={1} /> : <span />}
              <PodiumCard scorer={podium[0]} place={0} />
              {podium[2] ? <PodiumCard scorer={podium[2]} place={2} /> : <span />}
            </div>

            {rest.length > 0 && (
              <div className="max-w-2xl mx-auto space-y-1.5">
                {rest.map((scorer) => (
                  <div
                    key={`${scorer.rank}-${scorer.name}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-card px-3.5 py-2.5 dark:border dark:border-card-border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-5 text-center text-sm text-muted-foreground tabular-nums">{scorer.rank}</span>
                      <div className="h-9 w-9 rounded-full overflow-hidden bg-muted shrink-0">
                        {scorer.photo && (
                          <img src={scorer.photo} alt={scorer.name} className="h-full w-full object-cover" loading="lazy" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{scorer.name}</p>
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <img src={scorer.team.logo} alt={scorer.team.name} className="h-3 w-3 object-contain" loading="lazy" />
                          {scorer.team.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                      <span className="hidden sm:flex items-center gap-1">
                        <Timer className="h-3 w-3" />
                        {scorer.minutes} د
                      </span>
                      <span className="hidden sm:inline">{scorer.assists} صناعة</span>
                      <span className="text-lg font-black text-foreground tabular-nums">{scorer.goals}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}
