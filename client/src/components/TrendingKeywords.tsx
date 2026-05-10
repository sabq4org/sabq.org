import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Hash, Search } from "lucide-react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { FollowKeywordButton } from "@/components/FollowKeywordButton";

interface TrendingKeyword {
  keyword: string;
  count: number;
  category?: string;
}

const getCategoryStyles = (category?: string): { bg: string; text: string; badge: string } => {
  if (!category) return {
    bg: "bg-primary/10 dark:bg-primary/20",
    text: "text-primary",
    badge: "bg-primary/20 dark:bg-primary/30"
  };
  
  switch (category) {
    case "سياسة":
      return {
        bg: "bg-red-50 dark:bg-red-950/20",
        text: "text-red-700 dark:text-red-400",
        badge: "bg-red-100 dark:bg-red-900/40"
      };
    case "اقتصاد":
      return {
        bg: "bg-green-50 dark:bg-green-950/20",
        text: "text-green-700 dark:text-green-400",
        badge: "bg-green-100 dark:bg-green-900/40"
      };
    case "رياضة":
      return {
        bg: "bg-blue-50 dark:bg-blue-950/20",
        text: "text-blue-700 dark:text-blue-400",
        badge: "bg-blue-100 dark:bg-blue-900/40"
      };
    case "تقنية":
      return {
        bg: "bg-purple-50 dark:bg-purple-950/20",
        text: "text-purple-700 dark:text-purple-400",
        badge: "bg-purple-100 dark:bg-purple-900/40"
      };
    default:
      return {
        bg: "bg-primary/10 dark:bg-primary/20",
        text: "text-primary",
        badge: "bg-primary/20 dark:bg-primary/30"
      };
  }
};

export function TrendingKeywords() {
  const [, setLocation] = useLocation();

  const { data: keywords, isLoading, error } = useQuery<TrendingKeyword[]>({
    queryKey: ["/api/trending-keywords"],
  });

  if (isLoading) {
    return (
      <section className="space-y-4" dir="rtl">
        <div className="flex items-center gap-2">
          <Hash className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">الكلمات الأكثر تداولًا</h2>
        </div>
        
        <p className="text-muted-foreground">
          خلال الـ 24 ساعة الماضية
        </p>
        
        <div className="flex flex-wrap gap-3 p-6 bg-card rounded-lg border">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24 rounded-full" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4" dir="rtl">
        <div className="flex items-center gap-2">
          <Hash className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">الكلمات الأكثر تداولًا</h2>
        </div>
        
        <p className="text-muted-foreground">
          خلال الـ 24 ساعة الماضية
        </p>
        
        <div className="flex flex-wrap gap-3 p-6 bg-card rounded-lg border">
          <p className="text-sm text-muted-foreground">حدث خطأ أثناء تحميل الكلمات المتداولة</p>
        </div>
      </section>
    );
  }

  if (!keywords || keywords.length === 0) {
    return (
      <section className="space-y-4" dir="rtl">
        <div className="flex items-center gap-2">
          <Hash className="h-6 w-6 text-primary" />
          <h2 className="text-2xl md:text-3xl font-bold">الكلمات الأكثر تداولًا</h2>
        </div>
        
        <p className="text-muted-foreground">
          خلال الـ 24 ساعة الماضية
        </p>
        
        <div className="flex flex-wrap gap-3 p-6 bg-card rounded-lg border">
          <div className="flex flex-col items-center justify-center py-3 w-full">
            <Search className="h-6 w-6 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              لا توجد كلمات متداولة حاليًا
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Hash className="h-6 w-6 text-primary" />
        <h2 className="text-2xl md:text-3xl font-bold" data-testid="heading-trending-keywords">
          الكلمات الأكثر تداولًا
        </h2>
      </div>
      
      <p className="text-muted-foreground">
        خلال الـ 24 ساعة الماضية
      </p>

      <div className="flex flex-wrap gap-3 p-6 bg-card rounded-lg border">
        {keywords
          .filter((item) => item.keyword && typeof item.keyword === 'string' && item.keyword.trim())
          .slice(0, 8)
          .map((item) => {
            const styles = getCategoryStyles(item.category);
            
            return (
              <motion.div
                key={item.keyword}
                className="flex items-center gap-1"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <motion.button
                  onClick={() => setLocation(`/keyword/${encodeURIComponent(item.keyword)}`)}
                  className={`${styles.bg} border border-gray-200 dark:border-gray-700 hover-elevate active-elevate-2 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-sm transition-all duration-200 cursor-pointer text-sm font-medium`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  data-testid={`trending-keyword-${item.keyword}`}
                  aria-label={`الكلمة المفتاحية ${item.keyword} مع ${item.count} ${item.count === 1 ? 'مقال' : 'مقالات'}`}
                >
                  <span className={`${styles.text} font-semibold text-sm`}>#{item.keyword}</span>
                  <span className={`${styles.badge} px-1.5 py-0.5 rounded-full text-xs font-semibold ${styles.text}`}>
                    {item.count}
                  </span>
                </motion.button>
                <FollowKeywordButton keyword={item.keyword} variant="ghost" size="icon" />
              </motion.div>
            );
          })}
      </div>
    </section>
  );
}
