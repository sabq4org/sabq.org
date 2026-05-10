import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Newspaper,
  ChartBar,
  MessageSquare,
  Wrench,
  Mic,
  GraduationCap,
  Users,
  ArrowLeft,
  Sparkles,
  Eye,
  TrendingUp,
  Clock
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AIAnimatedLogo from "@/components/ai/AIAnimatedLogo";
import type { Article } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { useIFoxBlockVisibility } from "@/hooks/useIFoxBlockVisibility";
import { getObjectPosition } from "@/lib/imageUtils";

const categories = [
  {
    slug: "ai-news",
    icon: Newspaper,
    nameAr: "آي سبق",
    color: "#22C55E",
  },
  {
    slug: "ai-insights",
    icon: ChartBar,
    nameAr: "آي عمق",
    color: "#8B5CF6",
  },
  {
    slug: "ai-opinions",
    icon: MessageSquare,
    nameAr: "آي رأي",
    color: "#F59E0B",
  },
  {
    slug: "ai-tools",
    icon: Wrench,
    nameAr: "آي تطبيق",
    color: "#EF4444",
  },
  {
    slug: "ai-voice",
    icon: Mic,
    nameAr: "آي صوت",
    color: "#EC4899",
  },
  {
    slug: "ai-academy",
    icon: GraduationCap,
    nameAr: "آي أكاديمي",
    color: "#10B981",
  },
  {
    slug: "ai-community",
    icon: Users,
    nameAr: "آي تواصل",
    color: "#6366F1",
  },
];

interface IFoxHomeBlockProps {
  enabled?: boolean;
}

export function IFoxHomeBlock({ enabled = true }: IFoxHomeBlockProps) {
  // Check visibility setting
  const { showIFoxBlock, isLoading: visibilityLoading } = useIFoxBlockVisibility();

  // Fetch latest AI articles
  const { data: articlesRaw, isLoading } = useQuery<Article[]>({
    queryKey: ["/api/ifox/home-featured"],
    enabled,
  });
  const articles = Array.isArray(articlesRaw) ? articlesRaw : [];

  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Don't render if loading or hidden
  if (visibilityLoading || !showIFoxBlock) {
    return null;
  }

  return (
    <section 
      className="relative py-8 md:py-12 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
      dir="rtl"
      data-testid="section-ifox-home"
    >
      {/* Animated Background Elements */}
      {!prefersReducedMotion && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute -top-20 -right-20 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"
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
            className="absolute -bottom-20 -left-20 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"
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
      )}

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          {/* Animated Logo */}
          <div className="flex justify-center mb-4">
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <AIAnimatedLogo />
            </motion.div>
          </div>

          {/* Title */}
          <Link href="/ifox" data-testid="link-ifox-title">
            <h2 className="text-2xl md:text-4xl font-bold mb-2 cursor-pointer hover:opacity-80 transition-opacity">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                آي فوكس
              </span>
              {" "}
              <span className="text-gray-400 text-xl md:text-2xl">| iFox AI</span>
            </h2>
          </Link>

          <p className="text-sm md:text-base text-gray-400 max-w-2xl mx-auto mb-4">
            بوابتك المتخصصة لعالم الذكاء الاصطناعي - أخبار، تحليلات، وأدوات عملية
          </p>

          {/* Live Status Indicator */}
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full"
            animate={prefersReducedMotion ? {} : {
              boxShadow: [
                "0 0 10px rgba(34, 197, 94, 0.2)",
                "0 0 20px rgba(34, 197, 94, 0.4)",
                "0 0 10px rgba(34, 197, 94, 0.2)",
              ],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <motion.div
              className="w-2 h-2 bg-green-500 rounded-full"
              animate={prefersReducedMotion ? {} : {
                opacity: [0.5, 1, 0.5],
                scale: [0.8, 1.2, 0.8],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <span className="text-sm font-medium text-green-400">
              متابعة حية لآخر التطورات
            </span>
            <Sparkles className="w-4 h-4 text-green-400" />
          </motion.div>
        </motion.div>

        {/* Categories Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-8"
        >
          {categories.map((category, index) => {
            const Icon = category.icon;
            return (
              <motion.div
                key={category.slug}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                whileHover={prefersReducedMotion ? {} : { scale: 1.05, y: -5 }}
                whileTap={prefersReducedMotion ? {} : { scale: 0.95 }}
              >
                <Link href={`/ai/category/${category.slug}`}>
                  <Card
                    className="bg-slate-900/60 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/80 transition-all cursor-pointer group backdrop-blur-sm"
                    data-testid={`card-category-${category.slug}`}
                  >
                    <CardContent className="p-3 text-center">
                      <motion.div
                        className="w-10 h-10 mx-auto mb-1.5 rounded-lg flex items-center justify-center transition-all group-hover:shadow-lg"
                        style={{
                          backgroundColor: `${category.color}20`,
                        }}
                        whileHover={{
                          boxShadow: `0 0 20px ${category.color}40`,
                        }}
                      >
                        <Icon className="w-5 h-5" style={{ color: category.color }} />
                      </motion.div>
                      <h3 className="text-xs font-bold text-white">
                        {category.nameAr}
                      </h3>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Featured Articles */}
        {!isLoading && articles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-violet-400" />
                أحدث مقالات آي فوكس
              </h3>
              <Link href="/ifox">
                <Button
                  variant="ghost"
                  className="text-gray-300 hover:text-white group"
                  data-testid="button-view-all-ifox"
                >
                  <span>عرض الكل</span>
                  <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {articles.slice(0, 4).map((article, index) => (
                <motion.div
                  key={article.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                  whileHover={prefersReducedMotion ? {} : { y: -8 }}
                >
                  <Link href={`/ai/article/${article.englishSlug || article.slug}`}>
                    <Card
                      className="bg-slate-900/60 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/80 transition-all cursor-pointer group backdrop-blur-sm h-full"
                      data-testid={`card-article-${article.id}`}
                    >
                      {article.imageUrl && (
                        <div className="relative overflow-hidden rounded-t-lg">
                          <img
                            src={article.imageUrl}
                            alt={article.title}
                            className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                            style={{ objectPosition: getObjectPosition(article) }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        {/* Category Badge */}
                        {article.categoryId && (
                          <Badge
                            className="mb-2 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-blue-400/30 text-blue-300"
                            data-testid={`badge-category-${article.id}`}
                          >
                            آي فوكس
                          </Badge>
                        )}

                        {/* Title */}
                        <h4 className="text-base font-bold text-white mb-2 line-clamp-2 group-hover:text-blue-300 transition-colors">
                          {article.title}
                        </h4>

                        {/* Excerpt */}
                        {article.excerpt && (
                          <p className="text-sm text-gray-400 mb-3 line-clamp-2">
                            {article.excerpt}
                          </p>
                        )}

                        {/* Meta Information */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>
                                {article.publishedAt
                                  ? formatDistanceToNow(new Date(article.publishedAt), {
                                      addSuffix: true,
                                      locale: ar,
                                    })
                                  : 'غير محدد'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-center mt-8"
        >
          <Link href="/ifox">
            <Button
              size="default"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all"
              data-testid="button-explore-ifox"
            >
              <Sparkles className="w-5 h-5 ml-2" />
              اكتشف بوابة آي فوكس الكاملة
              <ArrowLeft className="w-5 h-5 mr-2" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
