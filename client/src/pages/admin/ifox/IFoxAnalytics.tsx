import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, subDays } from "date-fns";
import { ar } from "date-fns/locale";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  Clock,
  Users,
  Sparkles,
  Brain,
  Cpu,
  Zap,
  Activity,
  Calendar,
  FileText,
  Target,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  Layers
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadialBarChart,
  RadialBar
} from "recharts";

interface AnalyticsOverview {
  totalViews: number;
  viewsGrowth: number;
  totalEngagement: number;
  engagementGrowth: number;
  totalArticles: number;
  articlesGrowth: number;
  averageAIScore: number;
  aiScoreGrowth: number;
  readTime: string;
  readTimeGrowth: number;
  activeUsers: number;
  usersGrowth: number;
}

interface TimeSeriesData {
  date: string;
  views: number;
  engagement: number;
  articles: number;
  aiScore: number;
}

interface CategoryPerformance {
  category: string;
  categoryAr: string;
  views: number;
  engagement: number;
  articles: number;
  avgAIScore: number;
  growth: number;
}

interface TopArticle {
  id: string;
  title: string;
  category: string;
  views: number;
  engagement: number;
  aiScore: number;
  publishedAt: string;
}

interface EngagementMetrics {
  likes: number;
  comments: number;
  shares: number;
  bookmarks: number;
}

const COLORS = {
  primary: 'hsl(var(--ifox-accent-primary))',
  secondary: 'hsl(var(--ifox-info))',
  accent: 'hsl(var(--ifox-warning))',
  success: 'hsl(var(--ifox-success))',
  warning: 'hsl(var(--ifox-warning))',
  danger: 'hsl(var(--ifox-error))',
  purple: 'hsl(var(--ifox-accent-primary))',
  pink: 'hsl(var(--ifox-accent-secondary))',
  blue: 'hsl(var(--ifox-info))',
  green: 'hsl(var(--ifox-success))',
};

const categoryColors: Record<string, string> = {
  'ai-news': COLORS.purple,
  'ai-insights': COLORS.blue,
  'ai-opinions': COLORS.pink,
  'ai-tools': COLORS.accent,
  'ai-voice': COLORS.secondary,
  'ai-academy': COLORS.warning,
  'ai-community': COLORS.green,
};

export default function IFoxAnalytics() {
  useRoleProtection('admin');
  
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "1y">("30d");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Fetch analytics overview
  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/admin/ifox/analytics/overview", timeRange]
  });

  // Fetch time series data
  const { data: timeSeriesDataRaw } = useQuery<TimeSeriesData[]>({
    queryKey: ["/api/admin/ifox/analytics/timeseries", timeRange]
  });
  const timeSeriesData = Array.isArray(timeSeriesDataRaw) ? timeSeriesDataRaw : [];

  // Fetch category performance
  const { data: categoryPerformanceRaw } = useQuery<CategoryPerformance[]>({
    queryKey: ["/api/admin/ifox/analytics/categories", timeRange]
  });
  const categoryPerformance = Array.isArray(categoryPerformanceRaw) ? categoryPerformanceRaw : [];

  // Fetch top articles
  const { data: topArticlesRaw } = useQuery<TopArticle[]>({
    queryKey: ["/api/admin/ifox/analytics/top-articles", timeRange]
  });
  const topArticles = Array.isArray(topArticlesRaw) ? topArticlesRaw : [];

  // Fetch engagement metrics
  const { data: engagementMetrics } = useQuery<EngagementMetrics>({
    queryKey: ["/api/admin/ifox/analytics/engagement", timeRange]
  });

  const MetricCard = ({ title, value, growth, icon: Icon, color, suffix = "" }: any) => (
    <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid={`metric-card-${title}`}>
      <CardContent className="p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4">
          <div className={`p-2 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br ${color} shadow-[0_10px_15px_hsl(var(--ifox-surface-overlay)/.1)]`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[hsl(var(--ifox-text-primary))]" />
          </div>
          <div className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full ${
            growth >= 0 ? 'bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))]' : 'bg-[hsl(var(--ifox-error)/.2)] text-[hsl(var(--ifox-error))]'
          }`}>
            {growth >= 0 ? <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
            <span className="text-[10px] sm:text-xs font-bold">{Math.abs(growth)}%</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] mb-0.5 sm:mb-1 truncate">{title}</p>
          <p className="text-xl sm:text-2xl md:text-3xl font-bold text-[hsl(var(--ifox-text-primary))] truncate">
            {typeof value === 'number' ? value.toLocaleString('ar-SA') : value}
            {suffix && <span className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-secondary))] mr-1">{suffix}</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 md:space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                {/* Animated AI Mascot */}
                <motion.div
                  className="relative flex-shrink-0"
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
                    className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 relative z-10"
                    style={{ filter: 'drop-shadow(0 25px 50px hsl(var(--ifox-surface-overlay) / 0.2))' }}
                    data-testid="img-mascot"
                  />
                </motion.div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent truncate" data-testid="text-page-title">
                    تحليلات آي فوكس
                  </h1>
                  <p className="text-[hsl(var(--ifox-text-primary))] text-sm sm:text-base md:text-lg truncate" data-testid="text-page-description">
                    مقاييس الأداء والإحصائيات الذكية
                  </p>
                </div>
              </div>

              {/* Time Range Selector */}
              <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
                  <SelectTrigger className="w-full sm:w-[140px] md:w-[180px] bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-time-range">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7d" data-testid="option-7d">آخر 7 أيام</SelectItem>
                    <SelectItem value="30d" data-testid="option-30d">آخر 30 يوم</SelectItem>
                    <SelectItem value="90d" data-testid="option-90d">آخر 90 يوم</SelectItem>
                    <SelectItem value="1y" data-testid="option-1y">آخر سنة</SelectItem>
                  </SelectContent>
                </Select>
                
                {/* AI Status */}
                <motion.div
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-[hsl(var(--ifox-success)/.2)] to-[hsl(var(--ifox-success)/.2)] border border-[hsl(var(--ifox-success)/.3)]"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  data-testid="badge-ai-status"
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
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-[10px] sm:text-xs font-medium text-[hsl(var(--ifox-success))] hidden sm:inline">AI Analytics</span>
                  <Brain className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[hsl(var(--ifox-success))]" />
                </motion.div>
              </div>
            </motion.div>

            {/* Key Metrics */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
              data-testid="container-metrics-grid"
            >
              <MetricCard
                title="إجمالي المشاهدات"
                value={overview?.totalViews || 0}
                growth={overview?.viewsGrowth || 0}
                icon={Eye}
                color="from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]"
              />
              <MetricCard
                title="التفاعل"
                value={overview?.totalEngagement || 0}
                growth={overview?.engagementGrowth || 0}
                icon={Heart}
                color="from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]"
              />
              <MetricCard
                title="المقالات"
                value={overview?.totalArticles || 0}
                growth={overview?.articlesGrowth || 0}
                icon={FileText}
                color="from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]"
              />
              <MetricCard
                title="AI Score"
                value={overview?.averageAIScore || 0}
                growth={overview?.aiScoreGrowth || 0}
                icon={Cpu}
                color="from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]"
              />
              <MetricCard
                title="وقت القراءة"
                value={overview?.readTime || "0:00"}
                growth={overview?.readTimeGrowth || 0}
                icon={Clock}
                color="from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]"
              />
              <MetricCard
                title="المستخدمون"
                value={overview?.activeUsers || 0}
                growth={overview?.usersGrowth || 0}
                icon={Users}
                color="from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]"
              />
            </motion.div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
              {/* Performance Over Time */}
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid="card-performance-chart">
                  <CardHeader className="p-4 sm:p-5 md:p-6">
                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))]">
                      <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-accent-primary))]" />
                      <span className="truncate">الأداء عبر الزمن</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))] truncate">
                      المشاهدات والتفاعل خلال الفترة المحددة
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4 md:p-6">
                    <div className="w-full h-[200px] sm:h-[250px] md:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timeSeriesData}>
                          <defs>
                            <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS.purple} stopOpacity={0.8}/>
                              <stop offset="95%" stopColor={COLORS.purple} stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorEngagement" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor={COLORS.secondary} stopOpacity={0.8}/>
                              <stop offset="95%" stopColor={COLORS.secondary} stopOpacity={0}/>
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
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                            labelStyle={{ color: 'white', fontSize: '11px' }}
                          />
                          <Legend 
                            wrapperStyle={{ fontSize: '11px' }}
                            iconSize={12}
                            verticalAlign="top"
                            height={36}
                          />
                          <Area
                            type="monotone"
                            dataKey="views"
                            stroke={COLORS.purple}
                            fillOpacity={1}
                            fill="url(#colorViews)"
                            name="المشاهدات"
                          />
                          <Area
                            type="monotone"
                            dataKey="engagement"
                            stroke={COLORS.secondary}
                            fillOpacity={1}
                            fill="url(#colorEngagement)"
                            name="التفاعل"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* AI Score Trend */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid="card-ai-score-chart">
                  <CardHeader className="p-4 sm:p-5 md:p-6">
                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))]">
                      <Brain className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-success))]" />
                      <span className="truncate">تطور AI Score</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))] truncate">
                      جودة المحتوى المدعوم بالذكاء الاصطناعي
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4 md:p-6">
                    <div className="w-full h-[200px] sm:h-[250px] md:h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeSeriesData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ifox-neutral) / 0.1)" />
                          <XAxis 
                            dataKey="date" 
                            stroke="hsl(var(--ifox-text-secondary))"
                            style={{ fontSize: '10px' }}
                            className="sm:text-xs"
                          />
                          <YAxis 
                            stroke="hsl(var(--ifox-text-secondary))"
                            domain={[0, 100]}
                            style={{ fontSize: '10px' }}
                            className="sm:text-xs"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: 'hsl(var(--ifox-surface-muted) / 0.9)',
                              border: '1px solid hsl(var(--ifox-surface-overlay))',
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                            labelStyle={{ color: 'white', fontSize: '11px' }}
                          />
                          <Legend 
                            wrapperStyle={{ fontSize: '11px' }}
                            iconSize={12}
                            verticalAlign="top"
                            height={36}
                          />
                          <Line
                            type="monotone"
                            dataKey="aiScore"
                            stroke={COLORS.green}
                            strokeWidth={2}
                            dot={{ fill: COLORS.green, r: 3 }}
                            name="AI Score"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Category Performance & Top Articles */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
              {/* Category Performance */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid="card-category-performance">
                  <CardHeader className="p-4 sm:p-5 md:p-6">
                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))]">
                      <Layers className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-info))]" />
                      <span className="truncate">أداء الفئات</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))] truncate">
                      مقارنة أداء فئات المحتوى المختلفة
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4 md:p-6">
                    <div className="w-full h-[200px] sm:h-[250px] md:h-[300px] overflow-x-auto">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={categoryPerformance}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ifox-neutral) / 0.1)" />
                          <XAxis 
                            dataKey="categoryAr" 
                            stroke="hsl(var(--ifox-text-secondary))"
                            style={{ fontSize: '9px' }}
                            className="sm:text-[10px]"
                            angle={-45}
                            textAnchor="end"
                            height={60}
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
                              borderRadius: '8px',
                              fontSize: '12px'
                            }}
                            labelStyle={{ color: 'white', fontSize: '11px' }}
                          />
                          <Legend 
                            wrapperStyle={{ fontSize: '11px' }}
                            iconSize={12}
                            verticalAlign="top"
                            height={36}
                          />
                          <Bar dataKey="views" fill={COLORS.purple} name="المشاهدات" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="engagement" fill={COLORS.secondary} name="التفاعل" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Top Articles */}
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid="card-top-articles">
                  <CardHeader className="p-4 sm:p-5 md:p-6">
                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))]">
                      <Award className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-warning))]" />
                      <span className="truncate">أفضل المقالات</span>
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))] truncate">
                      المقالات الأكثر أداءً خلال الفترة
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4 md:p-6">
                    <div className="space-y-2 sm:space-y-3">
                      {topArticles.slice(0, 5).map((article, index) => (
                        <motion.div
                          key={article.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.4 + index * 0.05 }}
                          className="p-2 sm:p-3 rounded-lg bg-[hsl(var(--ifox-surface-muted)/.7)] hover:bg-[hsl(var(--ifox-surface-overlay)/.6)] transition-all cursor-pointer border border-[hsl(var(--ifox-surface-overlay))]"
                          data-testid={`top-article-${article.id}`}
                        >
                          <div className="flex items-start gap-2 sm:gap-3">
                            <div className={`flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold ${
                              index === 0 ? 'bg-gradient-to-br from-[hsl(var(--ifox-warning))] to-[hsl(var(--ifox-warning-muted))] text-slate-900' :
                              index === 1 ? 'bg-gradient-to-br from-[hsl(var(--ifox-neutral))] to-[hsl(var(--ifox-neutral-muted))] text-slate-900' :
                              index === 2 ? 'bg-gradient-to-br from-[hsl(var(--ifox-warning))] to-[hsl(var(--ifox-warning-muted))] text-[hsl(var(--ifox-text-primary))]' :
                              'bg-[hsl(var(--ifox-surface-overlay)/.5)] text-[hsl(var(--ifox-text-primary))]'
                            }`}>
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] mb-0.5 sm:mb-1 line-clamp-1">
                                {article.title}
                              </h4>
                              <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-[hsl(var(--ifox-text-primary))]">
                                <Badge variant="outline" className="text-[9px] sm:text-xs text-[hsl(var(--ifox-accent-primary))] border-[hsl(var(--ifox-accent-primary)/.4)] px-1 py-0 sm:px-1.5 sm:py-0.5 hidden sm:inline-flex">
                                  {article.category}
                                </Badge>
                                <span className="flex items-center gap-0.5 sm:gap-1">
                                  <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  <span className="hidden sm:inline">{article.views.toLocaleString('ar-SA')}</span>
                                  <span className="sm:hidden">{(article.views / 1000).toFixed(1)}K</span>
                                </span>
                                <span className="flex items-center gap-0.5 sm:gap-1">
                                  <Heart className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                  {article.engagement}%
                                </span>
                              </div>
                            </div>
                            <Badge 
                              className={`
                                flex-shrink-0 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs
                                ${article.aiScore >= 90 ? 'bg-gradient-to-r from-[hsl(var(--ifox-success))] to-[hsl(var(--ifox-success-muted))]' : 
                                  article.aiScore >= 80 ? 'bg-gradient-to-r from-[hsl(var(--ifox-info))] to-[hsl(var(--ifox-info-muted))]' :
                                  'bg-gradient-to-r from-[hsl(var(--ifox-warning))] to-[hsl(var(--ifox-warning-muted))]'}
                                text-[hsl(var(--ifox-text-primary))] border-0
                              `}
                              data-testid={`badge-ai-score-${article.id}`}
                            >
                              {article.aiScore}
                            </Badge>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Engagement Breakdown */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid="card-engagement-breakdown">
                <CardHeader className="p-4 sm:p-5 md:p-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))]">
                    <Target className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-error))]" />
                    <span className="truncate">تفصيل التفاعل</span>
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))] truncate">
                    توزيع أنواع التفاعل مع المحتوى
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 md:p-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-[hsl(var(--ifox-error)/.2)] to-[hsl(var(--ifox-error)/.2)] border border-[hsl(var(--ifox-error)/.3)]" data-testid="metric-likes">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-[hsl(var(--ifox-error)/.3)]">
                          <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-error))]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-xs text-[hsl(var(--ifox-text-primary))] truncate">الإعجابات</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))] truncate">
                            {engagementMetrics?.likes.toLocaleString('ar-SA') || '0'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-[hsl(var(--ifox-info)/.2)] to-[hsl(var(--ifox-info)/.2)] border border-[hsl(var(--ifox-info)/.3)]" data-testid="metric-comments">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-[hsl(var(--ifox-info)/.3)]">
                          <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-info))]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-xs text-[hsl(var(--ifox-text-primary))] truncate">التعليقات</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))] truncate">
                            {engagementMetrics?.comments.toLocaleString('ar-SA') || '0'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-[hsl(var(--ifox-success)/.2)] to-[hsl(var(--ifox-success)/.2)] border border-[hsl(var(--ifox-success)/.3)]" data-testid="metric-shares">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-[hsl(var(--ifox-success)/.3)]">
                          <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-success))]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-xs text-[hsl(var(--ifox-text-primary))] truncate">المشاركات</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))] truncate">
                            {engagementMetrics?.shares.toLocaleString('ar-SA') || '0'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-lg bg-gradient-to-br from-[hsl(var(--ifox-warning)/.2)] to-[hsl(var(--ifox-warning)/.2)] border border-[hsl(var(--ifox-warning)/.3)]" data-testid="metric-bookmarks">
                      <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-[hsl(var(--ifox-warning)/.3)]">
                          <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-warning))]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] sm:text-xs text-[hsl(var(--ifox-text-primary))] truncate">الحفظ</p>
                          <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))] truncate">
                            {engagementMetrics?.bookmarks.toLocaleString('ar-SA') || '0'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Footer */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 md:gap-8 py-4 sm:py-5 md:py-6"
              data-testid="container-footer"
            >
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-warning))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))]">Real-time Analytics</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-accent-primary))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))]">AI-Powered Insights</span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-[hsl(var(--ifox-info))]" />
                <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))]">Advanced Metrics</span>
              </div>
            </motion.div>
        </div>
      </ScrollArea>
    </IFoxLayout>
  );
}
