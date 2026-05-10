import { motion } from "framer-motion";
import { 
  Newspaper, 
  Eye, 
  Heart, 
  Users,
  TrendingUp
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface CategoryAnalytics {
  categoryName: string;
  categoryIcon?: string;
  categoryColor?: string;
  totalArticles: number;
  recentArticles: number;
  totalViews: number;
  avgViewsPerArticle: number;
  totalInteractions: number;
  topAuthor: {
    name: string;
    profileImageUrl?: string;
    count: number;
  } | null;
}

interface CategoryAnalyticsProps {
  analytics: CategoryAnalytics;
  language?: 'ar' | 'en' | 'ur';
}

const translations = {
  ar: {
    totalArticles: 'إجمالي المقالات',
    new: 'جديد',
    totalViews: 'إجمالي المشاهدات',
    avgPerArticle: 'متوسط',
    perArticle: 'لكل مقالة',
    totalInteractions: 'إجمالي التفاعلات',
    topAuthor: 'الكاتب الأنشط',
    articles: 'مقالة',
    noAuthors: 'لا يوجد كتّاب',
  },
  en: {
    totalArticles: 'Total Articles',
    new: 'New',
    totalViews: 'Total Views',
    avgPerArticle: 'Avg',
    perArticle: 'per article',
    totalInteractions: 'Total Interactions',
    topAuthor: 'Most Active Author',
    articles: 'articles',
    noAuthors: 'No authors',
  },
  ur: {
    totalArticles: 'کل مضامین',
    new: 'نیا',
    totalViews: 'کل نظریں',
    avgPerArticle: 'اوسط',
    perArticle: 'فی مضمون',
    totalInteractions: 'کل تعاملات',
    topAuthor: 'سب سے زیادہ فعال مصنف',
    articles: 'مضامین',
    noAuthors: 'کوئی مصنف نہیں',
  }
};

export function CategoryAnalytics({ analytics, language = 'ar' }: CategoryAnalyticsProps) {
  const t = translations[language];

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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8"
    >
      {/* Total Articles Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate shadow-sm border border-border/40 dark:border-card-border">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2.5 sm:p-3 rounded-lg bg-primary/10">
                <Newspaper className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              </div>
              {analytics.recentArticles > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {analytics.recentArticles} {t.new}
                </Badge>
              )}
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="stat-total-articles">
              {analytics.totalArticles.toLocaleString('en-US')}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t.totalArticles}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Total Views Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate shadow-sm border border-border/40 dark:border-card-border">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2.5 sm:p-3 rounded-lg bg-blue-500/10">
                <Eye className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="stat-total-views">
              {analytics.totalViews.toLocaleString('en-US')}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mb-2">
              {t.totalViews}
            </p>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>{t.avgPerArticle} {analytics.avgViewsPerArticle.toLocaleString('en-US')} {t.perArticle}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Total Interactions Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate shadow-sm border border-border/40 dark:border-card-border">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2.5 sm:p-3 rounded-lg bg-red-500/10">
                <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold mb-1" data-testid="stat-total-interactions">
              {analytics.totalInteractions.toLocaleString('en-US')}
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {t.totalInteractions}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Top Author Card */}
      <motion.div variants={itemVariants}>
        <Card className="hover-elevate shadow-sm border border-border/40 dark:border-card-border">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="p-2.5 sm:p-3 rounded-lg bg-green-500/10">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
            {analytics.topAuthor ? (
              <>
                <div className="flex items-center gap-2 sm:gap-3 mb-2">
                  <Avatar className="h-8 w-8 sm:h-10 sm:w-10">
                    {analytics.topAuthor.profileImageUrl ? (
                      <AvatarImage src={analytics.topAuthor.profileImageUrl} alt={analytics.topAuthor.name} />
                    ) : null}
                    <AvatarFallback className="text-xs sm:text-sm">
                      {getInitials(analytics.topAuthor.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm sm:text-base line-clamp-1" data-testid="text-top-author-name">
                      {analytics.topAuthor.name}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {analytics.topAuthor.count} {t.articles}
                    </p>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t.topAuthor}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg sm:text-xl font-bold mb-1">-</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {t.noAuthors}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
