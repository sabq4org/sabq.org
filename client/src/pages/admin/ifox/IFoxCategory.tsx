import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";
import {
  Layers,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Search,
  Filter,
  TrendingUp,
  BarChart3,
  FileText,
  Clock,
  Sparkles,
  Brain,
  MessageSquare,
  Cpu,
  GraduationCap,
  Users,
  Lightbulb,
  ArrowUpRight,
  Activity
} from "lucide-react";
import { formatNumber } from "@/lib/format";

interface IFoxCategory {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  description?: string;
  icon: string;
  color: string;
  articlesCount: number;
  publishedCount: number;
  draftCount: number;
  totalViews: number;
  avgAIScore: number;
  status: "active" | "inactive";
  createdAt: string;
}

const categoryIcons: Record<string, any> = {
  "sparkles": Sparkles,
  "brain": Brain,
  "message-square": MessageSquare,
  "cpu": Cpu,
  "graduation-cap": GraduationCap,
  "users": Users,
  "lightbulb": Lightbulb,
};

const categoryColors: Record<string, string> = {
  "ifox-ai": "from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]",
  "ai-news": "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
  "ai-voice": "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]",
  "ai-tools": "from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]",
  "ai-academy": "from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]",
  "ai-community": "from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]",
  "ai-insights": "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
  "ai-opinions": "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]",
};

function CategoryCard({ category, onToggleStatus }: { category: IFoxCategory; onToggleStatus: (c: IFoxCategory) => void }) {
  const IconComponent = categoryIcons[category.icon] || Layers;
  const colorGradient = categoryColors[category.slug] || "from-[hsl(var(--ifox-neutral)/1)] to-[hsl(var(--ifox-neutral-muted)/1)]";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      className="group"
      data-testid={`card-category-${category.id}`}
    >
      <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg hover:border-[hsl(var(--ifox-surface-overlay))] transition-all cursor-pointer">
        <CardContent className="p-4 sm:p-5 md:p-6">
          <div className="flex items-start justify-between mb-3 sm:mb-4 gap-2">
            <div className={`p-2 sm:p-2.5 md:p-3 rounded-xl bg-gradient-to-br ${colorGradient} shadow-[0_10px_15px_hsl(var(--ifox-surface-overlay)/.1)] flex-shrink-0`}>
              <IconComponent className="w-5 h-5 sm:w-5 sm:h-5 md:w-6 md:h-6 text-[hsl(var(--ifox-text-primary))]" />
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <Badge
                variant={category.status === "active" ? "default" : "secondary"}
                className={`text-xs ${category.status === "active" ? "bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))] border-[hsl(var(--ifox-success)/.3)]" : ""}`}
                data-testid={`badge-status-${category.id}`}
              >
                {category.status === "active" ? "نشط" : "معطل"}
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => onToggleStatus(category)}
                className="hover:bg-[hsl(var(--ifox-surface-overlay)/.6)] h-8 w-8 sm:h-9 sm:w-9"
                data-testid={`button-toggle-${category.id}`}
              >
                {category.status === "active" ? (
                  <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[hsl(var(--ifox-success))]" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[hsl(var(--ifox-text-secondary))]" />
                )}
              </Button>
            </div>
          </div>

          <div className="mb-3 sm:mb-4 min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-[hsl(var(--ifox-text-primary))] mb-1 truncate">{category.nameAr}</h3>
            <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] truncate">{category.nameEn}</p>
            {category.description && (
              <p className="text-xs text-[hsl(var(--ifox-text-secondary))] mt-2 line-clamp-2">{category.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-[hsl(var(--ifox-surface-muted)/.7)]">
              <p className="text-xs text-[hsl(var(--ifox-text-secondary))] mb-1 truncate">المقالات</p>
              <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{formatNumber(category.articlesCount)}</p>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span className="text-xs text-[hsl(var(--ifox-success))] whitespace-nowrap">{category.publishedCount} منشور</span>
                <span className="text-xs text-[hsl(var(--ifox-text-secondary))]">•</span>
                <span className="text-xs text-[hsl(var(--ifox-text-secondary))] whitespace-nowrap">{category.draftCount} مسودة</span>
              </div>
            </div>

            <div className="p-2 sm:p-2.5 md:p-3 rounded-lg bg-[hsl(var(--ifox-surface-muted)/.7)]">
              <p className="text-xs text-[hsl(var(--ifox-text-secondary))] mb-1 truncate">المشاهدات</p>
              <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{formatNumber(category.totalViews)}</p>
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className="w-3 h-3 text-[hsl(var(--ifox-success))]" />
                <span className="text-xs text-[hsl(var(--ifox-success))]">+12.5%</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-3 border-t border-[hsl(var(--ifox-surface-overlay))]">
            <div className="flex items-center gap-2">
              <Badge
                className={`
                  px-2 py-0.5 text-xs
                  ${category.avgAIScore >= 90 ? 'bg-gradient-to-r from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]' :
                    category.avgAIScore >= 80 ? 'bg-gradient-to-r from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]' :
                    'bg-gradient-to-r from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]'}
                  text-[hsl(var(--ifox-text-primary))] border-0
                `}
                data-testid={`badge-ai-score-${category.id}`}
              >
                AI {category.avgAIScore}
              </Badge>
            </div>
            <Link href={`/dashboard/admin/ifox/articles?category=${category.slug}`}>
              <Button
                variant="ghost"
                size="sm"
                className="text-[hsl(var(--ifox-accent-primary))] hover:text-[hsl(var(--ifox-accent-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.6)] text-xs sm:text-sm w-full sm:w-auto"
                data-testid={`button-view-articles-${category.id}`}
              >
                عرض المقالات
                <ArrowUpRight className="w-3 h-3 mr-1" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function IFoxCategory() {
  useRoleProtection('admin');
  const { toast } = useToast();
  const params = useParams();
  const categorySlug = params.slug;
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"name" | "articles" | "views" | "aiScore">("articles");

  // Fetch all iFox categories
  const { data: categoriesRaw, isLoading } = useQuery<IFoxCategory[]>({
    queryKey: ["/api/admin/ifox/categories"]
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Filter and sort categories
  const filteredCategories = categories
    .filter(cat => {
      if (statusFilter !== "all" && cat.status !== statusFilter) return false;
      if (searchQuery && !cat.nameAr.includes(searchQuery) && !cat.nameEn.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.nameAr.localeCompare(b.nameAr, 'ar');
        case "articles":
          return b.articlesCount - a.articlesCount;
        case "views":
          return b.totalViews - a.totalViews;
        case "aiScore":
          return b.avgAIScore - a.avgAIScore;
        default:
          return 0;
      }
    });

  // Toggle category status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "inactive" }) => {
      return await apiRequest(`/api/admin/ifox/categories/${id}/toggle-status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/categories"] });
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة الفئة بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل تحديث حالة الفئة",
        variant: "destructive"
      });
    }
  });

  const handleToggleStatus = (category: IFoxCategory) => {
    const newStatus = category.status === "active" ? "inactive" : "active";
    toggleStatusMutation.mutate({ id: category.id, status: newStatus });
  };

  // Calculate total stats
  const totalStats = {
    categories: categories.length,
    activeCategories: categories.filter(c => c.status === "active").length,
    totalArticles: categories.reduce((sum, c) => sum + c.articlesCount, 0),
    totalViews: categories.reduce((sum, c) => sum + c.totalViews, 0),
    avgAIScore: categories.length > 0 
      ? Math.round(categories.reduce((sum, c) => sum + c.avgAIScore, 0) / categories.length)
      : 0,
  };

  return (
    <IFoxLayout>
      <ScrollArea className="h-screen w-full">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-4"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
                      className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 relative z-10"
                      style={{ filter: 'drop-shadow(0 25px 50px hsl(var(--ifox-surface-overlay) / 0.2))' }}
                      data-testid="img-mascot"
                    />
                  </motion.div>
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent truncate" data-testid="text-page-title">
                      فئات آي فوكس
                    </h1>
                    <p className="text-[hsl(var(--ifox-text-primary))] text-sm sm:text-base md:text-lg truncate" data-testid="text-page-description">
                      إدارة فئات المحتوى الذكي
                    </p>
                  </div>
                </div>

                {/* AI Status */}
                <motion.div
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-[hsl(var(--ifox-success)/.2)] to-[hsl(var(--ifox-success)/.2)] border border-[hsl(var(--ifox-success)/.3)]"
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
                  <span className="text-xs font-medium text-[hsl(var(--ifox-success))] whitespace-nowrap">{totalStats.activeCategories} فئة نشطة</span>
                  <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[hsl(var(--ifox-success))]" />
                </motion.div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/.4)] to-[hsl(var(--ifox-accent-secondary)/.3)] border-[hsl(var(--ifox-accent-primary)/.3)] backdrop-blur-sm" data-testid="card-stat-categories">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] truncate">إجمالي الفئات</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{totalStats.categories}</p>
                      </div>
                      <Layers className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-accent-primary))] flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-info)/.4)] to-[hsl(var(--ifox-info)/.3)] border-[hsl(var(--ifox-info)/.3)] backdrop-blur-sm" data-testid="card-stat-articles">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] truncate">المقالات الكلية</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{formatNumber(totalStats.totalArticles)}</p>
                      </div>
                      <FileText className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-info))] flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-warning)/.4)] to-[hsl(var(--ifox-warning)/.3)] border-[hsl(var(--ifox-warning)/.3)] backdrop-blur-sm" data-testid="card-stat-views">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] truncate">إجمالي المشاهدات</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{formatNumber(totalStats.totalViews)}</p>
                      </div>
                      <Eye className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-warning))] flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-success)/.4)] to-[hsl(var(--ifox-success)/.3)] border-[hsl(var(--ifox-success)/.3)] backdrop-blur-sm" data-testid="card-stat-ai-score">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] truncate">متوسط AI Score</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{totalStats.avgAIScore}</p>
                      </div>
                      <Brain className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-success))] flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-error)/.4)] to-[hsl(var(--ifox-error)/.3)] border-[hsl(var(--ifox-error)/.3)] backdrop-blur-sm" data-testid="card-stat-active">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-[hsl(var(--ifox-text-primary))] truncate">الفئات النشطة</p>
                        <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{totalStats.activeCategories}</p>
                      </div>
                      <Activity className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-error))] flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Filters */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg" data-testid="card-filters">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                    <div className="flex-1 relative min-w-0">
                      <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-4 sm:h-4 text-[hsl(var(--ifox-text-secondary))]" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="بحث في الفئات..."
                        className="pr-10 bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))] text-sm"
                        data-testid="input-search"
                      />
                    </div>

                    <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                      <SelectTrigger className="w-full sm:w-[160px] md:w-[180px] bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))] text-sm" data-testid="select-status-filter">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع الحالات</SelectItem>
                        <SelectItem value="active">نشط</SelectItem>
                        <SelectItem value="inactive">معطل</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                      <SelectTrigger className="w-full sm:w-[160px] md:w-[180px] bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))] text-sm" data-testid="select-sort-by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="articles">الأكثر مقالات</SelectItem>
                        <SelectItem value="views">الأكثر مشاهدة</SelectItem>
                        <SelectItem value="aiScore">الأعلى AI Score</SelectItem>
                        <SelectItem value="name">الاسم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Categories Grid */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-sm sm:text-base text-[hsl(var(--ifox-text-primary))]">جاري التحميل...</p>
                </div>
              ) : filteredCategories.length === 0 ? (
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                  <CardContent className="p-8 sm:p-12 text-center">
                    <Layers className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 text-[hsl(var(--ifox-text-secondary))] mx-auto mb-4" />
                    <h3 className="text-lg sm:text-xl font-bold text-[hsl(var(--ifox-text-primary))] mb-2">لا توجد فئات</h3>
                    <p className="text-sm sm:text-base text-[hsl(var(--ifox-text-secondary))]">لم يتم العثور على فئات مطابقة للبحث</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6">
                  {filteredCategories.map((category, index) => (
                    <motion.div
                      key={category.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <CategoryCard category={category} onToggleStatus={handleToggleStatus} />
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
        </div>
      </ScrollArea>
    </IFoxLayout>
  );
}
