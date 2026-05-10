import { motion } from "framer-motion";
import { 
  Newspaper, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Eye, 
  Heart, 
  Sparkles,
  Users 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface NewsAnalytics {
  period: {
    today: number;
    week: number;
    month: number;
  };
  growth: {
    percentage: number;
    trend: 'up' | 'down' | 'stable';
    previousMonth: number;
  };
  topCategory: {
    name: string;
    icon: string;
    color: string;
    count: number;
  } | null;
  topAuthor: {
    name: string;
    profileImageUrl?: string;
    count: number;
  } | null;
  totalViews: number;
  totalInteractions: number;
}

interface UrduNewsAnalyticsHeroProps {
  analytics: NewsAnalytics;
}

export function UrduNewsAnalyticsHero({ analytics }: UrduNewsAnalyticsHeroProps) {
  const getTrendIcon = () => {
    switch (analytics.growth.trend) {
      case 'up':
        return <TrendingUp className="h-5 w-5 text-green-600" />;
      case 'down':
        return <TrendingDown className="h-5 w-5 text-red-600" />;
      default:
        return <Minus className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getTrendColor = () => {
    switch (analytics.growth.trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
      dir="rtl"
    >
      {/* Total News Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Newspaper className="h-6 w-6 text-primary" />
              </div>
              <Badge variant="secondary" className="text-xs">
                اس مہینے
              </Badge>
            </div>
            <h3 className="text-3xl font-bold mb-1" data-testid="stat-total-month">
              {analytics.period.month.toLocaleString('ur-PK')}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              کل مضامین
            </p>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">آج:</span>
              <span className="font-semibold" data-testid="stat-total-today">
                {analytics.period.today.toLocaleString('ur-PK')}
              </span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">اس ہفتے:</span>
              <span className="font-semibold" data-testid="stat-total-week">
                {analytics.period.week.toLocaleString('ur-PK')}
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Growth Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                {getTrendIcon()}
              </div>
              <Badge 
                variant="secondary" 
                className={`text-xs ${getTrendColor()}`}
              >
                {analytics.growth.trend === 'up' ? 'اضافہ' : analytics.growth.trend === 'down' ? 'کمی' : 'مستحکم'}
              </Badge>
            </div>
            <h3 className={`text-3xl font-bold mb-1 ${getTrendColor()}`} data-testid="stat-growth">
              {analytics.growth.percentage > 0 ? '+' : ''}
              {analytics.growth.percentage.toLocaleString('ur-PK')}%
            </h3>
            <p className="text-sm text-muted-foreground">
              نمو کی شرح
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              گزشتہ مہینے کے مقابلے ({analytics.growth.previousMonth.toLocaleString('ur-PK')} مضامین)
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Category Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div 
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: analytics.topCategory?.color 
                    ? `${analytics.topCategory.color}20` 
                    : 'hsl(var(--muted))'
                }}
              >
                {analytics.topCategory?.icon ? (
                  <span className="text-2xl">
                    {analytics.topCategory.icon}
                  </span>
                ) : (
                  <Newspaper className="h-6 w-6" style={{ color: analytics.topCategory?.color || 'hsl(var(--muted-foreground))' }} />
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                سب سے زیادہ فعال
              </Badge>
            </div>
            <h3 className="text-xl font-bold mb-1 line-clamp-1" data-testid="stat-top-category">
              {analytics.topCategory?.name || 'کوئی نہیں'}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              اعلیٰ زمرہ
            </p>
            <p className="text-xs text-muted-foreground">
              اس مہینے {analytics.topCategory?.count.toLocaleString('ur-PK')} مضامین
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Engagement Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <Eye className="h-6 w-6 text-purple-600" />
              </div>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                اوسط
              </Badge>
            </div>
            <h3 className="text-3xl font-bold mb-1" data-testid="stat-avg-engagement">
              {analytics.totalViews.toLocaleString('ur-PK')}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              اوسط مشغولیت
            </p>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <Eye className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">ملاحظات</span>
              </div>
              <span className="text-muted-foreground">•</span>
              <div className="flex items-center gap-1">
                <Heart className="h-3 w-3 text-muted-foreground" />
                <span data-testid="stat-total-interactions">
                  {analytics.totalInteractions.toLocaleString('ur-PK')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
