import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Clock, Heart, MessageCircle, TrendingUp, Sparkles, Eye, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { ElementType } from "react";

interface AiInsights {
  avgReadTime: number;
  totalReads: number;
  totalReactions: number;
  totalComments: number;
  totalViews: number;
  engagementRate: number;
  completionRate: number;
  totalInteractions: number;
}

interface EnAiArticleStatsProps {
  slug: string;
}

function formatReadTime(seconds: number): string {
  if (seconds === 0) return "No data";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes === 0) {
    return `${secs}s`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')} min`;
}

function StatItem({ 
  icon: Icon, 
  label, 
  value, 
  delay = 0,
  showFlame = false,
  flameThreshold = 10000,
  rawValue
}: { 
  icon: ElementType; 
  label: string; 
  value: string | number; 
  delay?: number;
  showFlame?: boolean;
  flameThreshold?: number;
  rawValue?: number;
}) {
  const isTrending = showFlame && rawValue !== undefined && rawValue >= flameThreshold;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center gap-2 p-2 rounded-lg hover-elevate active-elevate-2 bg-card/50 dark:bg-card/30"
      data-testid={`stat-${label}`}
    >
      <div className="p-1.5 rounded-md bg-primary/10 dark:bg-primary/20 shrink-0">
        <Icon className="w-3 h-3 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
        <div className="text-sm font-bold text-foreground flex items-center gap-1">
          {value}
          {isTrending && (
            <Flame className="w-3 h-3 text-orange-500" data-testid="icon-flame-trending" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function EnAiArticleStats({ slug }: EnAiArticleStatsProps) {
  const { data: insights, isLoading } = useQuery<AiInsights>({
    queryKey: ["/api/en/articles", slug, "ai-insights"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <Card className="p-3 rounded-xl" data-testid="ai-stats-loading">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!insights) return null;

  const engagementData = [
    { 
      name: 'Views', 
      value: insights.totalViews,
      percentage: 100 
    },
    { 
      name: 'Reads', 
      value: insights.totalReads,
      percentage: insights.totalViews > 0 ? Math.round((insights.totalReads / insights.totalViews) * 100) : 0
    },
    { 
      name: 'Complete', 
      value: Math.round((insights.totalReads * insights.completionRate) / 100),
      percentage: insights.completionRate
    },
    { 
      name: 'Engage', 
      value: insights.totalInteractions,
      percentage: insights.totalViews > 0 ? Math.round((insights.totalInteractions / insights.totalViews) * 100) : 0
    }
  ];

  return (
    <Card className="p-3 rounded-xl" data-testid="ai-stats-panel">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header - Compact */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <div className="p-1 rounded-md bg-primary/10 dark:bg-primary/20">
              <Brain className="w-3.5 h-3.5 text-primary" />
            </div>
            <h3 className="font-bold text-sm text-foreground" data-testid="ai-stats-title">
              AI Analytics
            </h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Sparkles className="w-2.5 h-2.5" />
            <span>Live</span>
          </div>
        </div>

        {/* Interactive Chart - Engagement Funnel - Compact */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-3 p-2 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/15"
        >
          <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-primary" />
            Engagement Funnel
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart 
              data={engagementData}
              margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
            >
              <defs>
                <linearGradient id="colorEngagementEn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }}
                stroke="hsl(var(--border))"
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  fontSize: '10px',
                  padding: '4px 8px'
                }}
                labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                formatter={(value: number, name: string) => {
                  const item = engagementData.find(d => d.name === name);
                  return [`${value} (${item?.percentage}%)`, name];
                }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={1.5}
                fill="url(#colorEngagementEn)" 
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Stats Grid - Compact */}
        <div className="grid grid-cols-2 gap-2">
          <StatItem
            icon={Eye}
            label="Views"
            value={insights.totalViews?.toLocaleString('en-US') || 0}
            delay={0.2}
            showFlame={true}
            flameThreshold={10000}
            rawValue={insights.totalViews}
          />
          
          <StatItem
            icon={Clock}
            label="Avg Read Time"
            value={formatReadTime(insights.avgReadTime)}
            delay={0.25}
          />
          
          <StatItem
            icon={TrendingUp}
            label="Completion Rate"
            value={`${insights.completionRate}%`}
            delay={0.3}
          />
          
          <StatItem
            icon={Heart}
            label="Interactions"
            value={insights.totalInteractions?.toLocaleString('en-US') || 0}
            delay={0.35}
          />
        </div>

        {/* Engagement Rate - Compact */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="mt-2 p-2 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-foreground">Engagement Rate</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-primary">
                {insights.engagementRate.toFixed(2)}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {insights.engagementRate >= 0.5 ? "Excellent" : insights.engagementRate >= 0.2 ? "Good" : "Limited"}
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </Card>
  );
}
