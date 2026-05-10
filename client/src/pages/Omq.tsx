import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Brain, 
  Eye, 
  Share2, 
  Download, 
  Search, 
  Filter, 
  TrendingUp, 
  FileText, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  Layers,
  Zap,
  BarChart3,
  Bot
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import OmqHeader from "@/components/omq/OmqHeader";
import OmqAnimatedLogo from "@/components/omq/OmqAnimatedLogo";
import OmqAnalysisCard from "@/components/omq/OmqAnalysisCard";

interface DeepAnalysis {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  status: string;
  createdAt: string;
  category?: string;
  viewsCount?: number;
  sharesCount?: number;
  downloadsCount?: number;
  generationTime?: number;
}

interface AnalysesResponse {
  analyses: DeepAnalysis[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface StatsResponse {
  totalAnalyses: number;
  totalViews: number;
  totalShares: number;
  totalDownloads: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const aiModels = [
  { name: "GPT-5.1", color: "#22C55E", icon: Bot },
  { name: "Gemini 3", color: "#8B5CF6", icon: Sparkles },
  { name: "Claude", color: "#F59E0B", icon: Brain },
];

export default function Omq() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [filters, setFilters] = useState({
    keyword: "",
    status: "",
    category: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    limit: 9
  });
  const [showFilters, setShowFilters] = useState(false);

  // Fetch stats (public endpoint - no auth required)
  const { data: stats, isLoading: isLoadingStats } = useQuery<StatsResponse>({
    queryKey: ['/api/omq/public-stats'],
  });

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch analyses with separate query key for list
  const { data: analysesData, isLoading: isLoadingAnalyses, error, isFetching } = useQuery<AnalysesResponse>({
    queryKey: ['/api/omq/list', filters.keyword, filters.status, filters.category, filters.dateFrom, filters.dateTo, filters.page, filters.limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          params.append(key, String(value));
        }
      });
      const response = await fetch(`/api/omq?${params}`);
      if (!response.ok) {
        throw new Error('فشل في تحميل التحليلات');
      }
      return response.json();
    }
  });

  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString('en-US');
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleResetFilters = () => {
    setFilters({
      keyword: "",
      status: "",
      category: "",
      dateFrom: "",
      dateTo: "",
      page: 1,
      limit: 9
    });
  };

  const handlePageChange = (newPage: number) => {
    if (isFetching) return;
    const maxPage = analysesData?.totalPages || 1;
    if (newPage < 1 || newPage > maxPage) return;
    setFilters(prev => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = (query: string) => {
    handleFilterChange('keyword', query);
  };

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل التحليلات",
      });
    }
  }, [error, toast]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" dir="rtl" lang="ar">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-3xl"
          animate={{
            x: [0, 60, 0],
            y: [0, -40, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-3xl"
          animate={{
            x: [0, -60, 0],
            y: [0, 40, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-violet-600/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* Header */}
      <OmqHeader onSearch={handleSearch} />

      {/* Hero Section */}
      <section className="relative px-4 py-12 md:py-16">
        <div className="container mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            {/* Animated Logo */}
            <div className="flex justify-center mb-8">
              <OmqAnimatedLogo />
            </div>
            
            {/* Title */}
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4" data-testid="text-page-title">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-500 to-violet-500">
                عُمق
              </span>
              {" "}
              <span className="text-gray-400 text-2xl md:text-4xl">|</span>
              {" "}
              <span className="text-xl md:text-3xl text-gray-400">Deep Analysis</span>
            </h1>
            
            <p className="text-lg md:text-xl text-gray-400 max-w-3xl mx-auto mb-6" data-testid="text-page-description">
              تحليلات استراتيجية عميقة مدعومة بثلاثة نماذج ذكاء اصطناعي متقدمة
            </p>

            {/* AI Models Badge */}
            <div className="flex justify-center gap-3 mb-8">
              {aiModels.map((model, index) => (
                <motion.div
                  key={model.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border"
                  style={{ 
                    backgroundColor: `${model.color}15`,
                    borderColor: `${model.color}40`
                  }}
                >
                  <model.icon className="w-4 h-4" style={{ color: model.color }} />
                  <span className="text-sm font-medium" style={{ color: model.color }}>
                    {model.name}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* KPI Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12"
          >
            {isLoadingStats ? (
              <>
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} className="bg-slate-900/50 border-slate-800">
                    <CardContent className="p-5">
                      <Skeleton className="h-4 w-20 mb-3 bg-slate-800" />
                      <Skeleton className="h-8 w-16 bg-slate-800" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <motion.div whileHover={{ scale: 1.02, y: -2 }}>
                  <Card className="bg-slate-900/50 border-slate-800 hover:border-indigo-500/30 transition-colors" data-testid="card-kpi-analyses">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">إجمالي التحليلات</p>
                          <p className="text-3xl font-bold text-white" data-testid="text-total-analyses">
                            {formatNumber(stats?.totalAnalyses || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                          <FileText className="w-6 h-6 text-indigo-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02, y: -2 }}>
                  <Card className="bg-slate-900/50 border-slate-800 hover:border-purple-500/30 transition-colors" data-testid="card-kpi-views">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">المشاهدات</p>
                          <p className="text-3xl font-bold text-white" data-testid="text-total-views">
                            {formatNumber(stats?.totalViews || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                          <Eye className="w-6 h-6 text-purple-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02, y: -2 }}>
                  <Card className="bg-slate-900/50 border-slate-800 hover:border-emerald-500/30 transition-colors" data-testid="card-kpi-shares">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">المشاركات</p>
                          <p className="text-3xl font-bold text-white" data-testid="text-total-shares">
                            {formatNumber(stats?.totalShares || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                          <Share2 className="w-6 h-6 text-emerald-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div whileHover={{ scale: 1.02, y: -2 }}>
                  <Card className="bg-slate-900/50 border-slate-800 hover:border-amber-500/30 transition-colors" data-testid="card-kpi-downloads">
                    <CardContent className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500 mb-1">التنزيلات</p>
                          <p className="text-3xl font-bold text-white" data-testid="text-total-downloads">
                            {formatNumber(stats?.totalDownloads || 0)}
                          </p>
                        </div>
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <Download className="w-6 h-6 text-amber-400" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </>
            )}
          </motion.div>

          {/* Search & Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-8"
          >
            {/* Search Bar */}
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  data-testid="input-search"
                  placeholder="ابحث في التحليلات..."
                  value={filters.keyword}
                  onChange={(e) => handleFilterChange('keyword', e.target.value)}
                  className="pr-10 bg-slate-900/50 border-slate-800 text-white placeholder:text-gray-500 focus:border-indigo-500 h-11"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className={`border-slate-800 text-gray-300 hover:bg-slate-800 gap-2 h-11 ${
                  showFilters ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-300' : ''
                }`}
                data-testid="button-toggle-filters"
              >
                <Filter className="w-4 h-4" />
                الفلاتر
              </Button>
            </div>

            {/* Expandable Filters */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="bg-slate-900/50 border-slate-800" data-testid="card-filters">
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Status Filter */}
                        <Select
                          value={filters.status}
                          onValueChange={(value) => handleFilterChange('status', value)}
                        >
                          <SelectTrigger 
                            className="bg-slate-900/50 border-slate-700 text-gray-300"
                            data-testid="select-status"
                          >
                            <SelectValue placeholder="الحالة" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="all">جميع الحالات</SelectItem>
                            <SelectItem value="draft">مسودة</SelectItem>
                            <SelectItem value="completed">مكتمل</SelectItem>
                            <SelectItem value="published">منشور</SelectItem>
                            <SelectItem value="archived">مؤرشف</SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Category Filter */}
                        <Select
                          value={filters.category}
                          onValueChange={(value) => handleFilterChange('category', value)}
                        >
                          <SelectTrigger 
                            className="bg-slate-900/50 border-slate-700 text-gray-300"
                            data-testid="select-category"
                          >
                            <SelectValue placeholder="التصنيف" />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-900 border-slate-800">
                            <SelectItem value="all">جميع التصنيفات</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.slug}>
                                {cat.nameAr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Date From */}
                        <Input
                          data-testid="input-date-from"
                          type="date"
                          value={filters.dateFrom}
                          onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                          className="bg-slate-900/50 border-slate-700 text-gray-300"
                        />

                        {/* Date To */}
                        <Input
                          data-testid="input-date-to"
                          type="date"
                          value={filters.dateTo}
                          onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                          className="bg-slate-900/50 border-slate-700 text-gray-300"
                        />
                      </div>

                      <div className="flex justify-end mt-4">
                        <Button
                          variant="ghost"
                          onClick={handleResetFilters}
                          className="text-gray-400 hover:text-white hover:bg-slate-800 gap-2"
                          data-testid="button-reset-filters"
                        >
                          <RotateCcw className="w-4 h-4" />
                          إعادة تعيين
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Analysis Grid */}
          {isLoadingAnalyses ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Card key={i} className="bg-slate-900/50 border-slate-800">
                  <CardContent className="p-5">
                    <Skeleton className="h-5 w-24 mb-4 bg-slate-800" />
                    <Skeleton className="h-6 w-full mb-2 bg-slate-800" />
                    <Skeleton className="h-4 w-3/4 mb-4 bg-slate-800" />
                    <div className="flex gap-2 mb-4">
                      <Skeleton className="h-6 w-16 bg-slate-800 rounded-full" />
                      <Skeleton className="h-6 w-16 bg-slate-800 rounded-full" />
                    </div>
                    <Skeleton className="h-4 w-1/2 bg-slate-800" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : analysesData && analysesData.analyses && analysesData.analyses.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {analysesData.analyses.map((analysis, index) => (
                  <OmqAnalysisCard key={analysis.id} analysis={analysis} index={index} />
                ))}
              </div>

              {/* Pagination */}
              {analysesData.totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4"
                >
                  <p className="text-sm text-gray-500" data-testid="text-pagination-info">
                    عرض {((filters.page - 1) * filters.limit) + 1} إلى {Math.min(filters.page * filters.limit, analysesData.total)} من {formatNumber(analysesData.total)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      data-testid="button-previous-page"
                      variant="outline"
                      size="icon"
                      onClick={() => handlePageChange(filters.page - 1)}
                      disabled={filters.page === 1}
                      className="border-slate-700 text-gray-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, analysesData.totalPages) }, (_, i) => {
                        let pageNum;
                        if (analysesData.totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (filters.page <= 3) {
                          pageNum = i + 1;
                        } else if (filters.page >= analysesData.totalPages - 2) {
                          pageNum = analysesData.totalPages - 4 + i;
                        } else {
                          pageNum = filters.page - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            data-testid={`button-page-${pageNum}`}
                            variant={filters.page === pageNum ? "default" : "outline"}
                            size="icon"
                            onClick={() => handlePageChange(pageNum)}
                            className={filters.page === pageNum 
                              ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                              : "border-slate-700 text-gray-300 hover:bg-slate-800"
                            }
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>

                    <Button
                      data-testid="button-next-page"
                      variant="outline"
                      size="icon"
                      onClick={() => handlePageChange(filters.page + 1)}
                      disabled={filters.page === analysesData.totalPages}
                      className="border-slate-700 text-gray-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            /* Empty State */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-slate-900/50 border-slate-800" data-testid="card-empty-state">
                <CardContent className="py-20">
                  <div className="flex flex-col items-center justify-center text-center">
                    <motion.div
                      animate={{
                        y: [0, -10, 0],
                        rotate: [0, 5, -5, 0],
                      }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className="w-24 h-24 mb-6 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-2xl flex items-center justify-center"
                    >
                      <Brain className="w-12 h-12 text-indigo-400" data-testid="icon-empty-state" />
                    </motion.div>
                    <h3 className="text-2xl font-bold text-white mb-3" data-testid="text-empty-title">
                      لا توجد تحليلات متاحة حالياً
                    </h3>
                    <p className="text-gray-400 mb-8 max-w-md" data-testid="text-empty-description">
                      ابدأ بإنشاء تحليل عميق جديد لرؤية النتائج هنا. التحليلات تتم بواسطة 3 نماذج AI متقدمة.
                    </p>
                    <Button
                      data-testid="button-create-analysis"
                      onClick={() => navigate('/dashboard/deep-analysis')}
                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white gap-2"
                      size="lg"
                    >
                      <TrendingUp className="w-5 h-5" />
                      ابدأ تحليل جديد
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      </section>
    </div>
  );
}
