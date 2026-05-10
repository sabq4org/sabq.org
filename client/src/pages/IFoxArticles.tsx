import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { 
  Newspaper, 
  ChartBar, 
  MessageSquare, 
  Wrench, 
  Mic, 
  Sparkles,
  TrendingUp,
  Zap,
  Bot,
  Activity,
  ArrowRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AIHeader from "@/components/ai/AIHeader";
import AIAnimatedLogo from "@/components/ai/AIAnimatedLogo";
import AINewsCard from "@/components/ai/AINewsCard";
import AITrendsWidget from "@/components/ai/AITrendsWidget";

interface IFoxArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: Date | string | null;
  categoryId: string;
  views: number | null;
  commentsCount: number | null;
  reactionsCount: number | null;
  category: {
    id: string;
    slug: string;
    nameAr: string;
    nameEn: string | null;
    color: string | null;
    icon: string | null;
  } | null;
  createdAt: Date | string;
  aiClassification?: string | null;
  articleType?: string | null;
}

interface IFoxCategory {
  id: string;
  slug: string;
  nameAr: string;
}

// Static metadata for category icons and colors
const categoryMetadata: Record<string, { icon: typeof Sparkles; color: string; description: string }> = {
  "ai-news": { 
    icon: Newspaper, 
    color: "#22C55E",
    description: "أخبار عاجلة وانفرادات حصرية"
  },
  "ai-insights": { 
    icon: ChartBar, 
    color: "#8B5CF6",
    description: "تحليلات وتقارير استقصائية"
  },
  "ai-opinions": { 
    icon: MessageSquare, 
    color: "#F59E0B",
    description: "مقالات خبراء ونقاشات"
  },
  "ai-tools": { 
    icon: Wrench, 
    color: "#EF4444",
    description: "مراجعات أدوات وتطبيقات"
  },
  "ai-voice": { 
    icon: Mic, 
    color: "#EC4899",
    description: "بودكاست وفيديوهات"
  }
};

export default function IFoxArticles() {
  const [activeTab, setActiveTab] = useState("latest");
  const searchParams = useSearch();
  const [, setLocation] = useLocation();
  
  // Read category from URL query params
  const categoryFromUrl = new URLSearchParams(searchParams).get('category') || 'all';
  const categoryFilter = categoryFromUrl;

  // Fetch iFox categories (only active, non-deleted categories)
  const { data: apiCategoriesRaw } = useQuery<IFoxCategory[]>({
    queryKey: ["/api/ifox/categories"],
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });
  const apiCategories = Array.isArray(apiCategoriesRaw) ? apiCategoriesRaw : [];

  // Build query params for API
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (categoryFilter && categoryFilter !== 'all') {
      params.append('categorySlug', categoryFilter);
    }
    return params.toString();
  };

  // Fetch iFox articles with category filter
  const { 
    data: articlesRaw, 
    isLoading
  } = useQuery<IFoxArticle[]>({
    queryKey: ['/api/ifox/articles', categoryFilter],
    queryFn: async () => {
      const queryString = buildQueryParams();
      const url = `/api/ifox/articles${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch articles');
      const data = await response.json();
      // Backend returns { articles: [...], total: number }, extract articles
      return data.articles || data;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // AI trends (placeholder for now)
  const trends: any[] = [];

  // Handle category navigation
  const handleCategoryClick = (categorySlug: string) => {
    setLocation(`/ifox?category=${categorySlug}`);
  };

  // Merge API categories with static metadata
  const enrichedCategories = apiCategories.map(cat => ({
    ...cat,
    ...(categoryMetadata[cat.slug] || {
      icon: Sparkles,
      color: "#3B82F6",
      description: cat.nameAr
    })
  }));

  // Transform articles to match AINewsCard interface
  const transformedArticles = articles.map(article => {
    // Use publishedAt if available, fallback to createdAt, then current time
    const timestamp = article.publishedAt || article.createdAt || new Date().toISOString();
    const createdAtString = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
    
    return {
      id: article.id,
      title: article.title,
      summary: article.excerpt,
      slug: article.slug,
      imageUrl: article.imageUrl,
      viewCount: article.views,
      commentCount: article.commentsCount,
      createdAt: createdAtString,
      categoryId: article.category?.id,
      categorySlug: article.category?.slug,
      aiClassification: article.aiClassification,
      articleType: article.articleType,
      featured: false,
      trending: false
    };
  });

  // Convert categories for AIHeader (only active, non-deleted categories)
  const headerCategories = apiCategories.map(cat => ({
    slug: cat.slug,
    nameAr: cat.nameAr,
    nameEn: categoryMetadata[cat.slug]?.description || cat.nameAr
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" dir="rtl" lang="ar">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-10 -right-10 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, -30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute -bottom-10 -left-10 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, 30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      {/* Header */}
      <AIHeader categories={headerCategories} baseUrl="/ai" logoUrl="/ifox" />

      {/* Hero Section */}
      <section className="relative px-4 py-12 md:py-20">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="flex justify-center mb-6">
              <AIAnimatedLogo />
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4" data-testid="text-page-title">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                آي فوكس
              </span>
              {" "}
              <span className="text-gray-300">|</span>
              {" "}
              <span className="text-2xl md:text-4xl text-gray-400">iFox AI</span>
            </h1>
            
            <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto" data-testid="text-page-subtitle">
              بوابتك المتخصصة لعالم الذكاء الاصطناعي - أخبار، تحليلات، وأدوات عملية
            </p>

            {/* Live Indicator */}
            <div className="flex justify-center mt-6">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm text-green-400">متابعة حية لآخر التطورات</span>
              </div>
            </div>
          </motion.div>

          {/* Category Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-12"
          >
            {enrichedCategories.map((category, index) => {
              const CategoryIcon = category.icon || Sparkles;
              return (
                <motion.div
                  key={category.slug}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div
                    onClick={() => handleCategoryClick(category.slug)}
                    data-testid={`button-category-${category.slug}`}
                  >
                    <Card className={`bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/70 transition-all cursor-pointer group ${
                      categoryFilter === category.slug ? 'border-blue-500/50 bg-slate-900/70' : ''
                    }`}>
                      <CardContent className="p-4 text-center">
                        <div 
                          className="w-12 h-12 mx-auto mb-2 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                          style={{ backgroundColor: `${category.color}20` }}
                        >
                          <CategoryIcon className="w-6 h-6" style={{ color: category.color }} />
                        </div>
                        <h3 className="text-sm font-bold text-white mb-1">{category.nameAr}</h3>
                        <p className="text-xs text-gray-500">{category.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-12">
            <TabsList className="bg-slate-900/50 border border-slate-800">
              <TabsTrigger value="latest" className="data-[state=active]:bg-slate-800">
                <Sparkles className="w-4 h-4 mr-2" />
                الأحدث
              </TabsTrigger>
              <TabsTrigger value="trending" className="data-[state=active]:bg-slate-800">
                <TrendingUp className="w-4 h-4 mr-2" />
                الأكثر رواجاً
              </TabsTrigger>
              <TabsTrigger value="featured" className="data-[state=active]:bg-slate-800">
                <Zap className="w-4 h-4 mr-2" />
                المميز
              </TabsTrigger>
            </TabsList>

            <TabsContent value="latest" className="mt-6">
              {/* News Section - Full Width */}
              <div>
                <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2" dir="rtl">
                  آخر الأخبار والتطورات
                  <Activity className="w-6 h-6 text-blue-500" />
                </h2>
                {isLoading ? (
                  <div className="text-center py-12" data-testid="loading-state">
                    <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto" />
                  </div>
                ) : transformedArticles.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
                    {transformedArticles.slice(0, 8).map((article) => (
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
                                  {article.categorySlug && (
                                    <Badge className="mb-2 text-xs">
                                      {(() => {
                                        const categoryNames: Record<string, string> = {
                                          "ai-news": "أخبار",
                                          "ai-insights": "تحليلات",
                                          "ai-opinions": "آراء",
                                          "ai-tools": "أدوات",
                                          "ai-voice": "صوت"
                                        };
                                        return categoryNames[article.categorySlug] || "عام";
                                      })()}
                                    </Badge>
                                  )}
                                  
                                  {/* Title */}
                                  <h3 className="text-base font-bold text-white mb-2 line-clamp-2 group-hover:text-blue-400 transition-colors">
                                    {article.title}
                                  </h3>
                                  
                                  {/* Summary */}
                                  {article.summary && (
                                    <p className="text-sm text-gray-400 line-clamp-2 mb-3">
                                      {article.summary}
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
                    <Card className="bg-slate-900/50 border-slate-800" data-testid="empty-state">
                      <CardContent className="p-8 text-center">
                        <Bot className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                        <p className="text-gray-400">لا توجد مقالات متاحة حالياً في قسم iFox</p>
                      </CardContent>
                    </Card>
                  )}
                
                {/* Blocks Below Articles: Trending & Newsletter */}
                <div className="grid md:grid-cols-2 gap-6 mt-12">
                  {/* Trending Widget */}
                  <div>
                    <AITrendsWidget trends={trends} />
                  </div>

                  {/* Newsletter CTA */}
                  <div>
                    <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-slate-700 h-full">
                      <CardContent className="p-6">
                        <h3 className="text-lg font-bold text-white mb-2">
                          نشرة AI اليومية
                        </h3>
                        <p className="text-sm text-gray-400 mb-4">
                          احصل على ملخص يومي لأهم تطورات الذكاء الاصطناعي
                        </p>
                        <Button 
                          className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                          data-testid="button-newsletter-subscribe"
                        >
                          اشترك الآن
                          <ArrowRight className="w-4 h-4 mr-2" />
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="trending">
              <div className="text-center py-12">
                <TrendingUp className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">قسم الأكثر رواجاً قيد التطوير</p>
              </div>
            </TabsContent>

            <TabsContent value="featured">
              <div className="text-center py-12">
                <Zap className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <p className="text-gray-400">قسم المحتوى المميز قيد التطوير</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}
