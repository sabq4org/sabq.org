/**
 * «قصص الموسم» لبطولة — أنماط/أرقام صادمة يولّدها المحرّك من الترتيب والهدّافين.
 * يستهلك /api/sports/intel/competition/:slug. يختفي بسلاسة إن لا قصص.
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Flame, LineChart } from "lucide-react";
import type { TrendsResponse } from "./types";

export function CompetitionTrends({ slug }: { slug: string }) {
  const { data } = useQuery<TrendsResponse>({
    queryKey: [`/api/sports/intel/competition/${slug}`],
    enabled: !!slug,
    staleTime: 30 * 60_000,
  });

  if (!data?.configured) return null;
  const cards = Array.isArray(data.cards) ? data.cards : [];
  if (cards.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <h3 className="text-base font-extrabold text-foreground">قصص الموسم</h3>
          <span className="text-[11px] font-bold text-primary/70">قراءة ذكية للأرقام — من سبق</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const isAnomaly = c.kind === "anomaly";
          return (
            <div
              key={c.id}
              data-testid={`trend-card-${c.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-1.5">
                {isAnomaly ? (
                  <Flame className="h-3.5 w-3.5 text-amber-500" />
                ) : (
                  <LineChart className="h-3.5 w-3.5 text-primary" />
                )}
                <span className={`text-[11px] font-bold ${isAnomaly ? "text-amber-500" : "text-primary/70"}`}>
                  {isAnomaly ? "رقم لافت" : "نمط الموسم"}
                </span>
              </div>
              <h4 className="text-sm font-extrabold leading-snug text-foreground">{c.headline}</h4>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{c.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
