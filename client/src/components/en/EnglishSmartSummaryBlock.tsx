import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Link } from "wouter";
import { 
  Sparkles, 
  BookOpen, 
  Percent, 
  Heart, 
  MessageSquare,
  TrendingUp,
  ChevronDown
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TodayInsightsData {
  greeting: string;
  metrics: {
    readingTime: number;
    completionRate: number;
    likes: number;
    comments: number;
    articlesRead: number;
  };
  topInterests: string[];
  aiPhrase: string;
  quickSummary: string;
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}

function MetricCard({ icon, label, value, color }: MetricCardProps) {
  const colorClasses: Record<string, string> = {
    blue: "text-blue-500 bg-blue-50 dark:bg-blue-950/20",
    green: "text-green-500 bg-green-50 dark:bg-green-950/20",
    pink: "text-pink-500 bg-pink-50 dark:bg-pink-950/20",
    purple: "text-purple-500 bg-purple-50 dark:bg-purple-950/20",
  };

  const colorClass = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`${colorClass} rounded-xl p-3 space-y-2`} data-testid={`metric-${label}`}>
      <div className="flex items-center justify-between">
        <div className={`${color === 'blue' ? 'text-blue-500' : color === 'green' ? 'text-green-500' : color === 'pink' ? 'text-pink-500' : 'text-purple-500'}`}>
          {icon}
        </div>
        <TrendingUp className="h-3 w-3 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function EnglishSmartSummaryBlock() {
  const [isExpanded, setIsExpanded] = useState(true);
  
  const { data: insights, isLoading } = useQuery<TodayInsightsData>({
    queryKey: ["/api/en/ai/insights/today"],
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </Card>
    );
  }

  if (!insights) return null;

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card 
        className="rounded-2xl p-5 bg-gradient-to-br from-slate-50 to-white dark:from-gray-800 dark:to-gray-900 shadow-sm border-2 border-primary/10"
        data-testid="card-smart-summary"
      >
        {/* Header */}
        <CollapsibleTrigger className="w-full">
          <div className="flex justify-between items-center gap-3 mb-4 cursor-pointer group">
            <div className="flex-1 text-left">
              <h2 className="text-base font-bold group-hover:text-primary transition-colors" data-testid="text-greeting">
                {insights.greeting}
              </h2>
              <p className="text-sm text-muted-foreground">
                Your knowledge journey in Sabq today in brief
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <ChevronDown 
                className={cn(
                  "h-5 w-5 transition-transform duration-200 text-muted-foreground",
                  isExpanded && "rotate-180"
                )}
              />
              
              <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex-shrink-0">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          {/* Metrics - Mobile: Vertical List */}
          <Card className="overflow-hidden lg:hidden border-0 dark:border dark:border-card-border mb-5">
            <CardContent className="p-0">
              <div className="divide-y dark:divide-y">
                <div className="p-4 hover-elevate active-elevate-2 transition-all" data-testid="metric-reading-time-mobile">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
                      <BookOpen className="h-8 w-8 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">Reading Time</p>
                      <p className="text-lg font-bold">{insights.metrics.readingTime} min</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        <span>Active</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 hover-elevate active-elevate-2 transition-all" data-testid="metric-completion-rate-mobile">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
                      <Percent className="h-8 w-8 text-green-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">Completion Rate</p>
                      <p className="text-lg font-bold">{insights.metrics.completionRate}%</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        <span>Improving</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 hover-elevate active-elevate-2 transition-all" data-testid="metric-likes-mobile">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-pink-50 dark:bg-pink-950/20 flex items-center justify-center">
                      <Heart className="h-8 w-8 text-pink-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">Likes</p>
                      <p className="text-lg font-bold">{insights.metrics.likes}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        <span>Engaged</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 hover-elevate active-elevate-2 transition-all" data-testid="metric-comments-mobile">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-24 h-20 rounded-lg bg-purple-50 dark:bg-purple-950/20 flex items-center justify-center">
                      <MessageSquare className="h-8 w-8 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="text-xs text-muted-foreground">Comments</p>
                      <p className="text-lg font-bold">{insights.metrics.comments}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <TrendingUp className="h-3 w-3" />
                        <span>Interactive</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Metrics - Desktop: Grid */}
          <div className="hidden lg:grid grid-cols-4 gap-3 mb-5">
            <MetricCard
              icon={<BookOpen className="h-5 w-5" />}
              label="Reading Time"
              value={`${insights.metrics.readingTime} min`}
              color="blue"
            />
            <MetricCard
              icon={<Percent className="h-5 w-5" />}
              label="Completion Rate"
              value={`${insights.metrics.completionRate}%`}
              color="green"
            />
            <MetricCard
              icon={<Heart className="h-5 w-5" />}
              label="Likes"
              value={insights.metrics.likes}
              color="pink"
            />
            <MetricCard
              icon={<MessageSquare className="h-5 w-5" />}
              label="Comments"
              value={insights.metrics.comments}
              color="purple"
            />
          </div>

          {/* Top Interests */}
          {insights?.topInterests?.length > 0 && (
            <div className="border-t pt-4 mb-4">
              <p className="font-medium text-sm mb-2">Your interests today:</p>
              <div className="flex flex-wrap gap-2">
                {insights?.topInterests?.map((interest, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="px-3 py-1 text-xs rounded-full bg-primary/10 text-primary border-primary/20"
                    data-testid={`interest-${index}`}
                  >
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* AI Phrase & Summary */}
          <div className="space-y-3">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground italic" data-testid="text-ai-phrase">
                AI says: "{insights.aiPhrase}"
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground" data-testid="text-quick-summary">
                {insights.quickSummary}
              </p>
              <Link href="/en/dashboard/daily-summary">
                <a className="text-sm text-primary font-medium hover:underline whitespace-nowrap" data-testid="link-daily-summary">
                  View Daily Summary
                </a>
              </Link>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
