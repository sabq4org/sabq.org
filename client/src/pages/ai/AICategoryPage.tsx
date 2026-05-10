import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { 
  Brain, 
  Newspaper, 
  ChartBar, 
  MessageSquare, 
  Wrench, 
  Mic, 
  GraduationCap, 
  Users,
  ArrowLeft,
  Filter,
  SortAsc
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AIHeader from "@/components/ai/AIHeader";
import { useLanguage } from "@/contexts/LanguageContext";

const categoryInfo: Record<string, any> = {
  "ai-news": { 
    icon: Newspaper, 
    nameAr: "آي سبق - أخبار AI", 
    nameEn: "AI News",
    color: "#22C55E",
    description: "أخبار عاجلة وانفرادات حصرية في عالم AI"
  },
  "ai-insights": { 
    icon: ChartBar, 
    nameAr: "آي عمق - تحليلات", 
    nameEn: "AI Insights",
    color: "#8B5CF6",
    description: "تحليلات وتقارير استقصائية طويلة"
  },
  "ai-opinions": { 
    icon: MessageSquare, 
    nameAr: "آي رأي - آراء", 
    nameEn: "AI Opinions",
    color: "#F59E0B",
    description: "مقالات خبراء ونقاشات فلسفية"
  },
  "ai-tools": { 
    icon: Wrench, 
    nameAr: "آي تطبيق - أدوات", 
    nameEn: "AI Tools",
    color: "#EF4444",
    description: "اختبارات ومراجعات للأدوات والتطبيقات"
  },
  "ai-voice": { 
    icon: Mic, 
    nameAr: "آي صوت - بودكاست", 
    nameEn: "AI Voice",
    color: "#EC4899",
    description: "بودكاست وفيديوهات حوارية"
  },
  "ai-academy": { 
    icon: GraduationCap, 
    nameAr: "آي أكاديمي - تعليم", 
    nameEn: "AI Academy",
    color: "#10B981",
    description: "دورات تعليمية مبسطة بلغة عربية احترافية"
  },
  "ai-community": { 
    icon: Users, 
    nameAr: "آي تواصل - مجتمع", 
    nameEn: "AI Community",
    color: "#6366F1",
    description: "مجتمع خاص لمبدعي المحتوى والمتابعين"
  }
};

// iFox approved categories
const IFOX_CATEGORIES = ['ai-news', 'ai-insights', 'ai-opinions', 'ai-tools', 'ai-voice'];

export default function AICategoryPage() {
  const params = useParams<{ category: string }>();
  const categorySlug = params.category || "ai-news";
  const category = categoryInfo[categorySlug] || categoryInfo["ai-news"];
  const { language } = useLanguage();
  const [sortBy, setSortBy] = useState("latest");
  const [filterBy, setFilterBy] = useState("all");

  // Check if this is an iFox category
  const isIFoxCategory = IFOX_CATEGORIES.includes(categorySlug);

  // Fetch articles - use iFox endpoint for iFox categories, legacy for others
  const { data, isLoading } = useQuery({
    queryKey: [
      isIFoxCategory ? '/api/ifox/articles' : `/api/categories/${categorySlug}/articles`,
      categorySlug,
      sortBy,
      filterBy
    ],
    queryFn: async () => {
      if (isIFoxCategory) {
        // iFox endpoint
        const params = new URLSearchParams();
        params.append('categorySlug', categorySlug);
        const url = `/api/ifox/articles?${params.toString()}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch iFox articles');
        const result = await response.json();
        // Backend returns { articles: [...], total: number }
        const articles = result.articles || result;
        
        // Normalize timestamps (publishedAt fallback to createdAt, convert Date to ISO string)
        return articles.map((article: any) => {
          const timestamp = article.publishedAt || article.createdAt || new Date().toISOString();
          const normalizedTimestamp = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
          return {
            ...article,
            publishedAt: normalizedTimestamp,
            createdAt: normalizedTimestamp
          };
        });
      } else {
        // Legacy endpoint for non-iFox categories
        const url = `/api/categories/${categorySlug}/articles`;
        const response = await fetch(url);
        if (!response.ok) {
          // Gracefully handle 404 for categories without data
          if (response.status === 404) {
            return [];
          }
          throw new Error('Failed to fetch articles');
        }
        const articles = await response.json();
        
        // Normalize timestamps for legacy articles too (convert Date to ISO string)
        return Array.isArray(articles) ? articles.map((article: any) => {
          const timestamp = article.publishedAt || article.createdAt || new Date().toISOString();
          const normalizedTimestamp = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
          return {
            ...article,
            publishedAt: normalizedTimestamp,
            createdAt: normalizedTimestamp
          };
        }) : [];
      }
    },
    enabled: true
  });

  const articles = data || [];

  const CategoryIcon = category.icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" dir="rtl" lang="ar">
      {/* Header */}
      <AIHeader logoUrl="/ifox" />

      {/* Category Hero */}
      <section className="relative px-4 py-8 border-b border-slate-800">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Back Button */}
            <Link href="/ai">
              <Button
                variant="ghost"
                className="text-gray-400 hover:text-white mb-4"
                data-testid="button-back-to-ai"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                {language === "ar" ? "العودة لـ iFox" : "Back to iFox"}
              </Button>
            </Link>

            {/* Category Header */}
            <div className="flex items-center gap-4">
              <div 
                className="w-16 h-16 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${category.color}20` }}
              >
                <CategoryIcon className="w-8 h-8" style={{ color: category.color }} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {language === "ar" ? category.nameAr : category.nameEn}
                </h1>
                <p className="text-gray-400 mt-1">
                  {category.description}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Filters and Sorting */}
      <section className="px-4 py-6 border-b border-slate-800">
        <div className="container mx-auto max-w-7xl">
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <div className="flex gap-2">
              <Badge
                variant={filterBy === "all" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterBy("all")}
              >
                {language === "ar" ? "الكل" : "All"}
              </Badge>
              <Badge
                variant={filterBy === "featured" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterBy("featured")}
              >
                {language === "ar" ? "المميز" : "Featured"}
              </Badge>
              <Badge
                variant={filterBy === "trending" ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setFilterBy("trending")}
              >
                {language === "ar" ? "الرائج" : "Trending"}
              </Badge>
            </div>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-48 bg-slate-900 border-slate-800 text-white">
                <SortAsc className="w-4 h-4 mr-2" />
                <SelectValue placeholder={language === "ar" ? "ترتيب حسب" : "Sort by"} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="latest" className="text-white">
                  {language === "ar" ? "الأحدث" : "Latest"}
                </SelectItem>
                <SelectItem value="popular" className="text-white">
                  {language === "ar" ? "الأكثر شعبية" : "Most Popular"}
                </SelectItem>
                <SelectItem value="discussed" className="text-white">
                  {language === "ar" ? "الأكثر نقاشاً" : "Most Discussed"}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Articles Grid */}
      <section className="px-4 py-8">
        <div className="container mx-auto max-w-7xl">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : articles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {articles.map((article: any) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90 transition-all cursor-pointer group h-full">
                    <Link href={`/ai/article/${article.englishSlug || article.slug}`}>
                      <CardContent className="p-0">
                        {/* Image */}
                        {article.imageUrl && (
                          <div className="relative w-full aspect-video overflow-hidden">
                            <img
                              src={article.imageUrl}
                              alt={article.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                              loading="lazy"
                            />
                          </div>
                        )}
                        
                        {/* Content */}
                        <div className="p-4">
                          {/* Category Badge */}
                          {article.category && (
                            <Badge className="mb-2 text-xs">
                              {typeof article.category === 'string' ? article.category : (article.category.nameAr || '')}
                            </Badge>
                          )}
                          
                          {/* Title */}
                          <h3 className="text-base font-bold text-white mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                            {article.title}
                          </h3>
                          
                          {/* Summary */}
                          {article.excerpt && (
                            <p className="text-sm text-gray-400 line-clamp-2">
                              {article.excerpt}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Link>
                  </Card>
                </motion.div>
              ))}
            </div>
          ) : (
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-12 text-center">
                <CategoryIcon className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <h3 className="text-xl font-bold text-white mb-2">
                  {language === "ar" ? "لا توجد مقالات حالياً" : "No articles yet"}
                </h3>
                <p className="text-gray-400">
                  {language === "ar" 
                    ? "سيتم إضافة محتوى جديد قريباً في هذا القسم"
                    : "New content will be added soon in this section"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}