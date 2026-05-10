import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Clock, Eye, Heart, MessageCircle, TrendingUp, Sparkles } from "lucide-react";
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

interface UrAiArticleStatsProps {
  slug: string;
}

function formatReadTime(seconds: number): string {
  if (seconds === 0) return "کوئی ڈیٹا نہیں";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (minutes === 0) {
    return `${secs} سیکنڈ`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')} منٹ`;
}

function StatItem({ 
  icon: Icon, 
  label, 
  value, 
  subtext,
  delay = 0
}: { 
  icon: ElementType; 
  label: string; 
  value: string | number; 
  subtext?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-start gap-3 p-3 rounded-lg hover-elevate active-elevate-2 bg-card/50 dark:bg-card/30"
      data-testid={`stat-${label}`}
      dir="rtl"
    >
      <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="text-lg font-bold text-foreground">{value}</div>
        {subtext && (
          <div className="text-xs text-muted-foreground/80 mt-1">{subtext}</div>
        )}
      </div>
    </motion.div>
  );
}

export function UrAiArticleStats({ slug }: UrAiArticleStatsProps) {
  const { data: insights, isLoading } = useQuery<AiInsights>({
    queryKey: ["/api/ur/articles", slug, "ai-insights"],
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

  // Generate engagement trend data for visualization
  const engagementData = [
    { 
      name: 'مناظر', 
      value: insights.totalViews,
      percentage: 100 
    },
    { 
      name: 'پڑھا گیا', 
      value: insights.totalReads,
      percentage: insights.totalViews > 0 ? Math.round((insights.totalReads / insights.totalViews) * 100) : 0
    },
    { 
      name: 'تکمیل', 
      value: Math.round((insights.totalReads * insights.completionRate) / 100),
      percentage: insights.completionRate
    },
    { 
      name: 'تعامل', 
      value: insights.totalInteractions,
      percentage: insights.totalViews > 0 ? Math.round((insights.totalInteractions / insights.totalViews) * 100) : 0
    }
  ];

  return (
    <Card className="p-4 rounded-2xl shadow-lg bg-gradient-to-br from-card/95 to-card dark:from-card/90 dark:to-card/80" data-testid="ai-stats-panel">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4" dir="rtl">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-bold text-lg text-foreground" data-testid="ai-stats-title">
              AI تجزیات
            </h3>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex items-center gap-1 text-xs text-muted-foreground"
          >
            <Sparkles className="w-3 h-3" />
            <span>براہ راست اپ ڈیٹس</span>
          </motion.div>
        </div>

        {/* Interactive Chart - Engagement Funnel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-4 p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/15"
        >
          <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2" dir="rtl">
            <TrendingUp className="w-4 h-4 text-primary" />
            مشغولیت کا راستہ
          </div>
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart 
              data={engagementData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id="colorEngagementUr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                stroke="hsl(var(--border))"
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                stroke="hsl(var(--border))"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
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
                strokeWidth={2}
                fill="url(#colorEngagementUr)" 
                animationDuration={1000}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="text-xs text-muted-foreground mt-2 text-center" dir="rtl">
            چارٹ قاری کے سفر کو دیکھنے سے لے کر مشغولیت تک دکھاتا ہے
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
          <StatItem
            icon={Clock}
            label="اوسط پڑھنے کا وقت"
            value={formatReadTime(insights.avgReadTime)}
            subtext={`${insights.totalReads} قارئین`}
            delay={0.2}
          />
          
          <StatItem
            icon={TrendingUp}
            label="تکمیل کی شرح"
            value={`${insights.completionRate}%`}
            subtext={insights.completionRate >= 70 ? "بہترین" : insights.completionRate >= 50 ? "اچھا" : "اوسط"}
            delay={0.25}
          />
          
          <StatItem
            icon={Eye}
            label="کل مناظر"
            value={insights.totalViews}
            delay={0.3}
          />
          
          <StatItem
            icon={Heart}
            label="تعاملات"
            value={insights.totalInteractions}
            subtext={`${insights.totalReactions} پسند، ${insights.totalComments} تبصرے`}
            delay={0.35}
          />
        </div>

        {/* Engagement Rate */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="mt-4 p-4 rounded-lg bg-primary/5 dark:bg-primary/10 border border-primary/20"
        >
          <div className="flex items-center justify-between" dir="rtl">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">مشغولیت کی شرح</span>
            </div>
            <div className="text-xl font-bold text-primary">
              {insights.engagementRate.toFixed(2)}
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground" dir="rtl">
            {insights.engagementRate >= 0.5 
              ? "بہترین قارئین کی مشغولیت" 
              : insights.engagementRate >= 0.2 
              ? "اچھی مشغولیت" 
              : "محدود مشغولیت"}
          </div>
        </motion.div>

        {/* AI Label */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-4 pt-4 border-t border-border/50"
        >
          <div className="flex items-center gap-2 justify-center" dir="rtl">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-xs text-muted-foreground">
              AI تجزیات کی طاقت سے
            </span>
          </div>
        </motion.div>
      </motion.div>
    </Card>
  );
}
