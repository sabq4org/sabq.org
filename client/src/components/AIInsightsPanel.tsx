import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, TrendingUp, CheckCircle2, ChevronDown, ChevronUp, Zap, Target, BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface AIInsights {
  dailySummary: string;
  topTopics: Array<{ name: string; score: number }>;
  activityTrend: string;
  keyHighlights: string[];
}

interface AIInsightsPanelProps {
  insights: AIInsights;
}

export function AIInsightsPanel({ insights }: AIInsightsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Calculate activity score based on trend text
  const getActivityScore = () => {
    const trend = insights.activityTrend?.toLowerCase() || "";
    if (trend.includes("مرتفع") || trend.includes("نشط") || trend.includes("عالي")) return 85;
    if (trend.includes("متوسط") || trend.includes("معتدل")) return 55;
    if (trend.includes("منخفض") || trend.includes("هادئ")) return 25;
    return 65;
  };

  const activityScore = getActivityScore();
  const highlightsCount = insights.keyHighlights?.length || 0;
  const topicsCount = insights.topTopics?.length || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mb-6"
    >
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 overflow-hidden">
        <CardContent className="p-4">
          {/* Compact Header with Indicators */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Title Section */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">رؤى ذكية</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    مباشر
                  </Badge>
                </div>
              </div>
            </div>

            {/* Quick Metrics Row */}
            <div className="flex items-center gap-4 flex-wrap">
              {/* Activity Indicator */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Zap className={`h-3.5 w-3.5 ${activityScore > 60 ? 'text-green-500' : activityScore > 40 ? 'text-yellow-500' : 'text-gray-400'}`} />
                  <span className="text-xs text-muted-foreground">النشاط</span>
                </div>
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${activityScore}%` }}
                    transition={{ delay: 0.5, duration: 0.8 }}
                    className={`h-full rounded-full ${activityScore > 60 ? 'bg-green-500' : activityScore > 40 ? 'bg-yellow-500' : 'bg-gray-400'}`}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums">{activityScore}%</span>
              </div>

              {/* Topics Count */}
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-xs text-muted-foreground">مواضيع</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center">
                  {topicsCount}
                </Badge>
              </div>

              {/* Highlights Count */}
              <div className="flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-xs text-muted-foreground">نقاط</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 min-w-[20px] justify-center">
                  {highlightsCount}
                </Badge>
              </div>

              {/* Expand Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-7 px-2 text-xs"
                data-testid="button-expand-insights"
              >
                {isExpanded ? (
                  <>
                    <span className="ml-1">إخفاء</span>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    <span className="ml-1">التفاصيل</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Activity Trend Summary - Always Visible */}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
            <p className="line-clamp-1" data-testid="text-activity-trend">
              {insights.activityTrend}
            </p>
          </div>

          {/* Expandable Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t space-y-4">
                  {/* Top Topics with Progress Bars */}
                  {insights.topTopics && (insights?.topTopics?.length ?? 0) > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5 text-blue-500" />
                        أبرز المواضيع
                      </p>
                      <div className="space-y-2">
                        {insights?.topTopics?.slice(0, 4).map((topic, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1 * index }}
                            className="flex items-center gap-2"
                          >
                            <span className="text-xs text-foreground min-w-[80px] truncate">{topic.name}</span>
                            <Progress value={topic.score} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-left">
                              {topic.score}%
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Highlights */}
                  {insights.keyHighlights && insights.keyHighlights.length > 0 && (
                    <div>
                      <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5 text-purple-500" />
                        أبرز النقاط
                      </p>
                      <div className="grid gap-1.5">
                        {insights?.keyHighlights?.map((highlight, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + index * 0.1 }}
                            className="flex items-start gap-2 p-1.5 rounded-md bg-background/50"
                            data-testid={`highlight-${index}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-foreground leading-relaxed">{highlight}</p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Daily Summary */}
                  <div className="pt-3 border-t">
                    <p className="text-xs text-muted-foreground italic leading-relaxed" data-testid="text-daily-summary">
                      "{insights.dailySummary}"
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
}
