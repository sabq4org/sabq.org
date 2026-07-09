import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
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
  ChevronDown,
  UserPlus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LoyaltyStrip } from "@/components/loyalty/LoyaltyStrip";

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
    blue: "bg-blue-50 dark:bg-gray-900/40 border border-blue-200 dark:border-blue-900/50",
    green: "bg-green-50 dark:bg-gray-900/40 border border-green-200 dark:border-green-900/50",
    pink: "bg-pink-50 dark:bg-gray-900/40 border border-pink-200 dark:border-pink-900/50",
    purple: "bg-purple-50 dark:bg-gray-900/40 border border-purple-200 dark:border-purple-900/50",
  };

  const iconClasses: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    pink: "text-pink-600 dark:text-pink-400",
    purple: "text-purple-600 dark:text-purple-400",
  };

  const colorClass = colorClasses[color] || colorClasses.blue;
  const iconClass = iconClasses[color] || iconClasses.blue;

  return (
    <div className={`${colorClass} rounded-xl p-3 space-y-2`} data-testid={`metric-${label}`}>
      <div className="flex items-center justify-between">
        <div className={iconClass}>
          {icon}
        </div>
        <TrendingUp className="h-3 w-3 text-muted-foreground" />
      </div>
      <div>
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function SmartSummaryBlock() {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Check if user is logged in
  const { data: user, isLoading: isLoadingUser } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });
  
  const { data: insights, isLoading: isLoadingInsights } = useQuery<TodayInsightsData>({
    queryKey: ["/api/ai/insights/today"],
    retry: false,
    enabled: !!user, // Only fetch insights if user is logged in
  });

  // Loading state while checking authentication
  if (isLoadingUser) {
    return (
      <Card className="rounded-2xl p-5 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </Card>
    );
  }

  // Show compact promotional banner for non-logged-in users
  if (!user) {
    return (
      <Card 
        className="rounded-xl p-4 bg-gradient-to-l from-blue-50 via-purple-50/50 to-transparent dark:from-blue-950/20 dark:via-purple-950/10 dark:to-transparent shadow-sm border border-primary/10"
        data-testid="card-guest-welcome"
        dir="rtl"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex-shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold bg-gradient-to-r from-purple-600 to-blue-600 dark:from-purple-400 dark:to-blue-400 bg-clip-text text-transparent">
              سبق الذكية — ملخصات وتوصيات مخصصة لك
            </h2>
            <p className="mt-0.5 hidden text-xs font-medium text-foreground/70 sm:block">
              سجّل مجاناً واحصل على إشعارات فورية وأخبار تناسب اهتماماتك
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <Button 
              asChild
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-xs px-3"
              data-testid="button-register"
            >
              <Link href="/register">
                <UserPlus className="h-3 w-3 ml-1" />
                سجّل مجاناً
              </Link>
            </Button>
            <Button 
              asChild
              variant="ghost"
              size="sm"
              className="text-xs hidden sm:inline-flex"
              data-testid="button-login-summary"
            >
              <Link href="/login">
                دخول
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (isLoadingInsights) {
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
        className="rounded-2xl p-5 bg-white dark:bg-gray-900 shadow-sm border border-border"
        data-testid="card-smart-summary"
        dir="rtl"
      >
        {/* Header */}
        <CollapsibleTrigger className="w-full">
          <div className="flex justify-between items-center gap-3 mb-4 cursor-pointer group">
            <div className="flex-1 text-right">
              <h2 className="text-base font-bold group-hover:text-primary transition-colors" data-testid="text-greeting">
                {insights.greeting}
              </h2>
              <p className="text-sm font-medium text-foreground/70">
                رحلتك المعرفية في سبق اليوم باختصار
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

        <LoyaltyStrip />

        <CollapsibleContent>
          {/* Metrics - Mobile: 2x2 Grid */}
          <div className="grid grid-cols-2 gap-2 lg:hidden mb-4">
            <div className="rounded-lg p-2.5 space-y-1.5 bg-blue-50 dark:bg-gray-900/40 border border-blue-200 dark:border-blue-900/50" data-testid="metric-وقت القراءة-mobile">
              <div className="flex items-center justify-between">
                <div className="text-blue-600 dark:text-blue-400">
                  <BookOpen className="h-4 w-4" />
                </div>
                <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{insights.metrics.readingTime} دقيقة</p>
                <p className="text-[10px] font-medium text-foreground/65">وقت القراءة</p>
              </div>
            </div>
            
            <div className="rounded-lg p-2.5 space-y-1.5 bg-green-50 dark:bg-gray-900/40 border border-green-200 dark:border-green-900/50" data-testid="metric-معدل الإكمال-mobile">
              <div className="flex items-center justify-between">
                <div className="text-green-600 dark:text-green-400">
                  <Percent className="h-4 w-4" />
                </div>
                <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{insights.metrics.completionRate}%</p>
                <p className="text-[10px] font-medium text-foreground/65">معدل الإكمال</p>
              </div>
            </div>
            
            <div className="rounded-lg p-2.5 space-y-1.5 bg-pink-50 dark:bg-gray-900/40 border border-pink-200 dark:border-pink-900/50" data-testid="metric-الإعجابات-mobile">
              <div className="flex items-center justify-between">
                <div className="text-pink-600 dark:text-pink-400">
                  <Heart className="h-4 w-4" />
                </div>
                <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{insights.metrics.likes}</p>
                <p className="text-[10px] font-medium text-foreground/65">الإعجابات</p>
              </div>
            </div>
            
            <div className="rounded-lg p-2.5 space-y-1.5 bg-purple-50 dark:bg-gray-900/40 border border-purple-200 dark:border-purple-900/50" data-testid="metric-التعليقات-mobile">
              <div className="flex items-center justify-between">
                <div className="text-purple-600 dark:text-purple-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <TrendingUp className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-base font-bold text-foreground">{insights.metrics.comments}</p>
                <p className="text-[10px] font-medium text-foreground/65">التعليقات</p>
              </div>
            </div>
          </div>

          {/* Metrics - Desktop: Grid */}
          <div className="hidden lg:grid grid-cols-4 gap-3 mb-5">
            <MetricCard
              icon={<BookOpen className="h-5 w-5" />}
              label="وقت القراءة"
              value={`${insights.metrics.readingTime} دقيقة`}
              color="blue"
            />
            <MetricCard
              icon={<Percent className="h-5 w-5" />}
              label="معدل الإكمال"
              value={`${insights.metrics.completionRate}%`}
              color="green"
            />
            <MetricCard
              icon={<Heart className="h-5 w-5" />}
              label="الإعجابات"
              value={insights.metrics.likes}
              color="pink"
            />
            <MetricCard
              icon={<MessageSquare className="h-5 w-5" />}
              label="التعليقات"
              value={insights.metrics.comments}
              color="purple"
            />
          </div>

          {/* Top Interests */}
          {insights?.topInterests?.length > 0 && (
            <div className="border-t pt-4 mb-4">
              <p className="font-medium text-sm mb-2">اهتماماتك اليوم:</p>
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
                الذكاء الاصطناعي يقول: "{insights.aiPhrase}"
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground" data-testid="text-quick-summary">
                {insights.quickSummary}
              </p>
              <Link href="/daily-brief" className="text-sm text-primary font-medium hover:underline whitespace-nowrap" data-testid="link-daily-summary">
                  عرض الملخص اليومي
              </Link>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
