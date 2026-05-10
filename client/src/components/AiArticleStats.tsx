import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Clock, Heart, MessageCircle, TrendingUp, Sparkles, Eye, Flame } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
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

interface AiArticleStatsProps {
  slug: string;
}

function formatReadTime(seconds: number): string {
  if (seconds === 0) return "لا توجد بيانات";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes === 0) {
    return `${secs} ثانية`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')} دقيقة`;
}

function StatItem({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  delay = 0,
  showFlame = false,
  flameThreshold = 10000,
  rawValue
}: { 
  icon: ElementType; 
  label: string; 
  value: string | number; 
  subtext?: string;
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

export function AiArticleStats({ slug }: AiArticleStatsProps) {
  const { data: insights, isLoading } = useQuery<AiInsights>({
    queryKey: ["/api/articles", slug, "ai-insights"],
    refetchInterval: 60000, // Refresh every minute
  });

  if (isLoading) {
    return (
      <Card className="p-4 rounded-2xl" data-testid="ai-stats-loading">
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (!insights) return null;

  // Generate engagement trend data for visualization (with views)
  const engagementData = [
    { 
      الاسم: 'المشاهدات', 
      القيمة: insights.totalViews,
      النسبة: 100
    },
    { 
      الاسم: 'القراءات', 
      القيمة: insights.totalReads,
      النسبة: insights.totalViews > 0 ? Math.round((insights.totalReads / insights.totalViews) * 100) : 0
    },
    { 
      الاسم: 'الإكمال', 
      القيمة: Math.round((insights.totalReads * insights.completionRate) / 100),
      النسبة: insights.completionRate
    },
    { 
      الاسم: 'التفاعل', 
      القيمة: insights.totalInteractions,
      النسبة: insights.totalViews > 0 ? Math.round((insights.totalInteractions / insights.totalViews) * 100) : 0
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
              إحصائيات الذكاء الاصطناعي
            </h3>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Sparkles className="w-2.5 h-2.5" />
            <span>لحظي</span>
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
            قمع التفاعل
          </div>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart 
              data={engagementData}
              margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
            >
              <defs>
                <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="الاسم" 
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
                  direction: 'rtl',
                  padding: '4px 8px'
                }}
                labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                formatter={(value: number, الاسم: string) => {
                  const item = engagementData.find(d => d.الاسم === الاسم);
                  return [`${value} (${item?.النسبة}%)`, الاسم];
                }}
              />
              <Area 
                type="monotone" 
                dataKey="القيمة" 
                stroke="hsl(var(--primary))" 
                strokeWidth={1.5}
                fill="url(#colorEngagement)" 
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Stats Grid - with views */}
        <div className="grid grid-cols-2 gap-2">
          <StatItem
            icon={Eye}
            label="المشاهدات"
            value={insights.totalViews?.toLocaleString('en-US') || 0}
            delay={0.2}
            showFlame={true}
            flameThreshold={10000}
            rawValue={insights.totalViews}
          />
          
          <StatItem
            icon={Clock}
            label="متوسط زمن القراءة"
            value={formatReadTime(insights.avgReadTime)}
            delay={0.25}
          />
          
          <StatItem
            icon={TrendingUp}
            label="نسبة الإكمال"
            value={`${insights.completionRate}%`}
            delay={0.3}
          />
          
          </div>
      </motion.div>
    </Card>
  );
}
