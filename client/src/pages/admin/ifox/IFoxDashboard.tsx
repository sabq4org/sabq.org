import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IFoxStatusCards } from "@/components/admin/ifox/IFoxStatusCards";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";
import {
  Brain,
  Plus,
  Image,
  Calendar,
  BarChart3,
  TrendingUp,
  Sparkles,
  Zap,
  Eye,
  Clock,
  FileText,
  ArrowUpRight,
  Cpu,
  Activity,
  Layers
} from "lucide-react";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  Line,
  LineChart,
} from "recharts";

interface DashboardStats {
  published: number;
  scheduled: number;
  draft: number;
  archived: number;
  todayViews: number;
  weeklyGrowth: number;
  totalEngagement: number;
  averageReadTime: string;
}

interface RecentArticle {
  id: string;
  title: string;
  category: {
    id: string;
    nameAr: string;
    slug: string;
    color?: string;
  };
  author: {
    id: string;
    firstName: string;
    lastName: string;
  };
  publishedAt: string;
  views: number;
  engagement: number;
  aiScore: number;
}

interface PublishingActivity {
  date: string;
  articles: number;
  views: number;
  engagement: number;
}

export default function IFoxDashboard() {
  useRoleProtection('admin');
  const [activeStatus, setActiveStatus] = useState<"published" | "scheduled" | "draft" | "archived">("published");

  // Fetch statistics
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/ifox/articles/stats"]
  });

  // Fetch recent articles
  const { data: recentArticlesData, isLoading: articlesLoading, error: articlesError } = useQuery<{ articles: RecentArticle[], total: number }>({
    queryKey: ["/api/admin/ifox/articles?limit=5&sort=publishedAt"]
  });
  
  const recentArticles = recentArticlesData?.articles;

  // Fetch activity data
  const { data: activityData, error: analyticsError } = useQuery<PublishingActivity[]>({
    queryKey: ["/api/admin/ifox/analytics/summary"]
  });

  const quickActions = [
    {
      title: "إنشاء مقال جديد",
      icon: Plus,
      href: "/dashboard/admin/ifox/articles/new",
      color: "from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]",
      description: "ابدأ بإنشاء محتوى AI جديد"
    },
    {
      title: "إدارة الوسائط",
      icon: Image,
      href: "/dashboard/admin/ifox/media",
      color: "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
      description: "تنظيم الصور والفيديوهات"
    },
    {
      title: "جدولة المحتوى",
      icon: Calendar,
      href: "/dashboard/admin/ifox/schedule",
      color: "from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]",
      description: "خطط لنشر المحتوى"
    },
    {
      title: "التحليلات",
      icon: BarChart3,
      href: "/dashboard/admin/ifox/analytics",
      color: "from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]",
      description: "تتبع أداء المحتوى"
    }
  ];

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-2"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Animated AI Mascot */}
                  <motion.div
                    className="relative"
                    animate={{
                      y: [0, -8, 0],
                      rotate: [0, 2, -2, 0],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-full blur-xl opacity-60"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.4, 0.7, 0.4],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      style={{
                        background: "radial-gradient(circle, hsl(var(--ifox-accent-glow) / 0.6), hsl(var(--ifox-accent-glow-secondary) / 0.6))",
                      }}
                    />
                    <img 
                      src={mascotImage} 
                      alt="iFox AI Mascot" 
                      className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 relative z-10"
                      style={{ filter: 'drop-shadow(0 25px 50px hsl(var(--ifox-surface-overlay) / 0.2))' }}
                    />
                    {/* Eyes Glow Effect */}
                    <motion.div
                      className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full"
                      animate={{
                        boxShadow: [
                          "0 0 10px hsl(var(--ifox-success-glow) / 0.3)",
                          "0 0 25px hsl(var(--ifox-success-glow) / 0.6)",
                          "0 0 10px hsl(var(--ifox-success-glow) / 0.3)",
                        ],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  </motion.div>
                  <div>
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent" data-testid="text-page-title">
                      لوحة تحكم آي فوكس
                    </h1>
                    <p className="text-[hsl(var(--ifox-text-primary))] text-sm sm:text-base md:text-lg" data-testid="text-page-description">
                      بوابة إدارة المحتوى الذكي
                    </p>
                  </div>
                </div>
                {/* AI Status Indicator */}
                <motion.div
                  className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-[hsl(var(--ifox-success)/.2)] to-[hsl(var(--ifox-success)/.2)] border border-[hsl(var(--ifox-success)/.3)] text-xs sm:text-sm"
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <motion.div
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[hsl(var(--ifox-success))]"
                    animate={{
                      opacity: [0.5, 1, 0.5],
                      boxShadow: [
                        "0 0 5px hsl(var(--ifox-success-glow) / 0.5)",
                        "0 0 15px hsl(var(--ifox-success))",
                        "0 0 5px hsl(var(--ifox-success-glow) / 0.5)",
                      ],
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <span className="text-xs font-medium text-[hsl(var(--ifox-success))]">AI Online</span>
                  <Sparkles className="w-3 h-3 text-[hsl(var(--ifox-success))]" />
                </motion.div>
              </div>

              {/* Key Metrics Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4 sm:mt-6">
                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/.4)] to-[hsl(var(--ifox-accent-secondary)/.3)] border-[hsl(var(--ifox-accent-primary)/.3)] backdrop-blur-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))]">المشاهدات اليوم</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                          {stats?.todayViews.toLocaleString('ar-SA') || '0'}
                        </p>
                      </div>
                      <Eye className="w-6 h-6 sm:w-8 sm:h-8 text-[hsl(var(--ifox-accent-primary))]" />
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-success))]" />
                      <span className="text-xs font-semibold text-[hsl(var(--ifox-success))]">+12.5%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-info)/.4)] to-[hsl(var(--ifox-info)/.3)] border-[hsl(var(--ifox-info)/.3)] backdrop-blur-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))]">التفاعل الكلي</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                          {stats?.totalEngagement.toLocaleString('ar-SA') || '0'}
                        </p>
                      </div>
                      <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-[hsl(var(--ifox-info))]" />
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-success))]" />
                      <span className="text-xs font-semibold text-[hsl(var(--ifox-success))]">+{stats?.weeklyGrowth || 0}%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-warning)/.4)] to-[hsl(var(--ifox-warning)/.3)] border-[hsl(var(--ifox-warning)/.3)] backdrop-blur-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))]">متوسط وقت القراءة</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                          {stats?.averageReadTime || '0:00'}
                        </p>
                      </div>
                      <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-[hsl(var(--ifox-warning))]" />
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-success))]" />
                      <span className="text-xs font-semibold text-[hsl(var(--ifox-success))]">+8.2%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-success)/.4)] to-[hsl(var(--ifox-success)/.3)] border-[hsl(var(--ifox-success)/.3)] backdrop-blur-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))]">AI Score</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">92</p>
                      </div>
                      <Cpu className="w-6 h-6 sm:w-8 sm:h-8 text-[hsl(var(--ifox-success))]" />
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-warning))]" />
                      <span className="text-xs font-semibold text-[hsl(var(--ifox-text-primary))]">ممتاز</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Status Cards */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <IFoxStatusCards
                metrics={{
                  published: stats?.published || 0,
                  scheduled: stats?.scheduled || 0,
                  draft: stats?.draft || 0,
                  archived: stats?.archived || 0
                }}
                activeStatus={activeStatus}
                onSelect={setActiveStatus}
                loading={statsLoading}
              />
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            >
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <motion.div
                    key={action.title}
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + index * 0.05 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Link href={action.href}>
                      <Card 
                        className="cursor-pointer bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg hover:bg-[hsl(var(--ifox-surface-overlay)/.6)] hover:border-[hsl(var(--ifox-surface-overlay))] transition-all duration-300"
                        data-testid={`quick-action-${action.title}`}
                      >
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start justify-between mb-2 sm:mb-3">
                            <div className={`p-2 sm:p-3 rounded-xl bg-gradient-to-br ${action.color} shadow-[0_10px_15px_hsl(var(--ifox-surface-overlay)/.1)]`}>
                              <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-text-primary))]" />
                            </div>
                            <ArrowUpRight className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-text-primary))]" />
                          </div>
                          <h3 className="text-sm sm:text-base font-bold text-[hsl(var(--ifox-text-primary))] mb-1">{action.title}</h3>
                          <p className="text-xs text-[hsl(var(--ifox-text-secondary))]">{action.description}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })}
            </motion.div>

            {/* Charts and Recent Articles */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              {/* Publishing Activity Chart */}
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))] font-bold">
                      <Activity className="w-5 h-5 text-[hsl(var(--ifox-accent-primary))]" />
                      نشاط النشر آخر 7 أيام
                    </CardTitle>
                    <CardDescription className="text-[hsl(var(--ifox-text-secondary))]">
                      عدد المقالات المنشورة والمشاهدات
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6">
                    <ResponsiveContainer width="100%" height={200} className="sm:h-[250px]">
                      <AreaChart data={activityData}>
                        <defs>
                          <linearGradient id="colorArticles" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--ifox-accent-glow))" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="hsl(var(--ifox-accent-glow))" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--ifox-info-glow))" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="hsl(var(--ifox-info-glow))" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ifox-neutral) / 0.1)" />
                        <XAxis 
                          dataKey="date" 
                          stroke="hsl(var(--ifox-text-secondary))"
                          style={{ fontSize: '10px' }}
                          className="sm:text-xs"
                        />
                        <YAxis 
                          stroke="hsl(var(--ifox-text-secondary))"
                          style={{ fontSize: '10px' }}
                          className="sm:text-xs"
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--ifox-surface-muted) / 0.9)', 
                            border: '1px solid hsl(var(--ifox-surface-overlay))',
                            borderRadius: '8px'
                          }}
                          labelStyle={{ color: 'white' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="articles" 
                          stroke="hsl(var(--ifox-accent-glow))" 
                          fillOpacity={1} 
                          fill="url(#colorArticles)"
                          name="المقالات"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="views" 
                          stroke="hsl(var(--ifox-info-glow))" 
                          fillOpacity={1} 
                          fill="url(#colorViews)"
                          name="المشاهدات"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Recent Articles */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))] font-bold">
                        <FileText className="w-5 h-5 text-[hsl(var(--ifox-accent-primary))]" />
                        آخر المقالات المنشورة
                      </CardTitle>
                      <Link href="/dashboard/admin/ifox/articles">
                        <Button variant="ghost" size="sm" className="text-[hsl(var(--ifox-text-secondary))] hover:text-[hsl(var(--ifox-text-primary))]">
                          عرض الكل
                          <ArrowUpRight className="w-4 h-4 mr-1" />
                        </Button>
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-6">
                    <div className="space-y-2 sm:space-y-3">
                      {articlesLoading ? (
                        <div className="text-center py-8 text-[hsl(var(--ifox-text-primary))]">جاري التحميل...</div>
                      ) : recentArticles?.map((article) => (
                        <motion.div
                          key={article.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-2.5 sm:p-3 rounded-lg bg-[hsl(var(--ifox-surface-muted)/.7)] hover:bg-[hsl(var(--ifox-surface-overlay)/.6)] transition-all duration-200 cursor-pointer border border-[hsl(var(--ifox-surface-overlay))] hover:border-[hsl(var(--ifox-surface-overlay))]"
                          data-testid={`recent-article-${article.id}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] mb-1 line-clamp-1">
                                {article.title}
                              </h4>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs text-[hsl(var(--ifox-text-secondary))]">
                                <span className="truncate">{article.author?.firstName} {article.author?.lastName}</span>
                                <span className="hidden sm:inline">•</span>
                                <span>{format(new Date(article.publishedAt), 'dd MMM', { locale: ar })}</span>
                                <span className="hidden sm:inline">•</span>
                                <span className="flex items-center gap-1">
                                  <Eye className="w-3 h-3" />
                                  {article.views.toLocaleString('ar-SA')}
                                </span>
                              </div>
                            </div>
                            <Badge 
                              className={`
                                px-2 py-0.5 text-xs
                                ${article.aiScore >= 90 ? 'bg-gradient-to-r from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]' : 
                                  article.aiScore >= 80 ? 'bg-gradient-to-r from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]' :
                                  'bg-gradient-to-r from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]'}
                                text-[hsl(var(--ifox-text-primary))] border-0
                              `}
                            >
                              AI {article.aiScore}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-xs text-[hsl(var(--ifox-accent-primary))] border-[hsl(var(--ifox-accent-primary)/.4)]">
                              {article.category?.nameAr || 'غير محدد'}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-[hsl(var(--ifox-text-primary))]">
                              <Activity className="w-3 h-3" />
                              <span>{article.engagement}%</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Footer Stats */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-8 py-4 sm:py-6"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-warning))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))]">AI Performance: 92%</span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-accent-primary))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))]">Neural Network: Active</span>
              </div>
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-info))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))]">Processing: Optimal</span>
              </div>
            </motion.div>
          </div>
        </ScrollArea>
    </IFoxLayout>
  );
}