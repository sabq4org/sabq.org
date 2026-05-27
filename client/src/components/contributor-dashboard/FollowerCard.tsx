import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { format } from "date-fns";

interface FollowerCardProps {
  count: number;
  dailyGrowth: Array<{ date: string; count: number }>;
  loading?: boolean;
}

export function FollowerCard({ count, dailyGrowth, loading }: FollowerCardProps) {
  const cumulativeData = buildCumulative(dailyGrowth);

  return (
    <Card className="hover-elevate">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Users className="h-4 w-4" />
          المتابعون
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
            <div className="h-16 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <>
            <div className="text-3xl font-bold">{count.toLocaleString()}</div>
            {cumulativeData.length > 1 && (
              <div className="mt-3 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cumulativeData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="followerGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <Tooltip
                      formatter={(v: number) => [v.toLocaleString(), "متابعين جدد"]}
                      labelFormatter={(l) => {
                        try { return format(new Date(l), "dd MMM"); } catch { return l; }
                      }}
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="url(#followerGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {dailyGrowth.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                +{dailyGrowth.reduce((s, d) => s + d.count, 0).toLocaleString()} متابع جديد آخر 30 يوم
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function buildCumulative(daily: Array<{ date: string; count: number }>) {
  let running = 0;
  return daily.map((d) => {
    running += d.count;
    return { date: d.date, count: running };
  });
}
