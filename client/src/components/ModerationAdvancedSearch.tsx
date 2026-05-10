import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  Filter,
  X,
  MessageCircle,
  FileText,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Loader2,
  ExternalLink,
  Eye,
  TrendingUp,
  SortAsc,
  SortDesc,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { arSA } from "date-fns/locale";

interface SearchComment {
  id: string;
  content: string;
  status: string;
  createdAt: string;
  aiModerationScore: number | null;
  aiClassification: string | null;
  aiDetectedIssues: string[] | null;
  highlightedContent?: string;
  relevanceScore?: number;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    profileImage: string | null;
  };
  article: {
    id: string;
    title: string;
    slug: string;
    categoryId: string | null;
    categoryName: string | null;
  };
}

interface SearchArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  views: number;
  categoryId: string | null;
  categoryName: string | null;
  highlightedTitle?: string;
  relevanceScore?: number;
  commentStats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    flagged: number;
  };
  latestComments?: Array<{
    id: string;
    content: string;
    status: string;
    aiClassification: string | null;
    aiModerationScore: number | null;
    createdAt: string;
    userName: string;
  }>;
}

interface CommentsSearchResult {
  comments: SearchComment[];
  total: number;
  page: number;
  totalPages: number;
}

interface ArticlesSearchResult {
  articles: SearchArticle[];
  total: number;
  page: number;
  totalPages: number;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

const searchFormSchema = z.object({
  query: z.string().optional(),
  status: z.string().optional(),
  aiClassification: z.string().optional(),
  categoryId: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type SearchFormData = z.infer<typeof searchFormSchema>;

const classificationConfig: Record<string, { bg: string; text: string; icon: typeof Shield; label: string }> = {
  safe: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", icon: ShieldCheck, label: "آمن" },
  flagged: { bg: "bg-yellow-500/10", text: "text-yellow-600 dark:text-yellow-400", icon: ShieldAlert, label: "مشكوك فيه" },
  spam: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", icon: Shield, label: "سبام" },
  harmful: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400", icon: ShieldX, label: "ضار" },
};

const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: "bg-yellow-500/10", text: "text-yellow-600", label: "قيد المراجعة" },
  approved: { bg: "bg-green-500/10", text: "text-green-600", label: "معتمد" },
  rejected: { bg: "bg-red-500/10", text: "text-red-600", label: "مرفوض" },
  flagged: { bg: "bg-orange-500/10", text: "text-orange-600", label: "مُبلغ عنه" },
};

interface ModerationAdvancedSearchProps {
  onSelectComment?: (commentId: string) => void;
  onSelectArticle?: (articleId: string) => void;
}

export function ModerationAdvancedSearch({ onSelectComment, onSelectArticle }: ModerationAdvancedSearchProps) {
  const [activeSearchTab, setActiveSearchTab] = useState<"comments" | "articles">("comments");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [articlesPage, setArticlesPage] = useState(1);
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useState<SearchFormData>({});
  const [isSearching, setIsSearching] = useState(false);

  // Handle tab switching - reset sortBy to compatible value
  const handleTabChange = (tab: "comments" | "articles") => {
    setActiveSearchTab(tab);
    const currentSortBy = form.getValues("sortBy");
    
    // Reset sortBy if it's not compatible with the new tab
    if (tab === "comments" && (currentSortBy === "comments" || currentSortBy === "engagement")) {
      form.setValue("sortBy", "date");
    } else if (tab === "articles" && currentSortBy === "score") {
      form.setValue("sortBy", "date");
    }
  };

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      query: "",
      status: "",
      aiClassification: "",
      categoryId: "",
      sortBy: "date",
      sortOrder: "desc",
      dateFrom: "",
      dateTo: "",
    },
  });

  // Fetch categories for filter
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/moderation/search/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Comments search query
  const { 
    data: commentsResult, 
    isLoading: commentsLoading,
    refetch: refetchComments,
  } = useQuery<CommentsSearchResult>({
    queryKey: ["/api/moderation/search/comments", searchParams, commentsPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchParams.query) params.append("query", searchParams.query);
      if (searchParams.status) params.append("status", searchParams.status);
      if (searchParams.aiClassification) params.append("aiClassification", searchParams.aiClassification);
      if (searchParams.dateFrom) params.append("dateFrom", searchParams.dateFrom);
      if (searchParams.dateTo) params.append("dateTo", searchParams.dateTo);
      if (searchParams.sortBy) params.append("sortBy", searchParams.sortBy);
      if (searchParams.sortOrder) params.append("sortOrder", searchParams.sortOrder);
      params.append("page", commentsPage.toString());
      params.append("limit", "15");

      const response = await fetch(`/api/moderation/search/comments?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to search comments");
      return response.json();
    },
    enabled: isSearching && activeSearchTab === "comments",
  });

  // Articles search query
  const { 
    data: articlesResult, 
    isLoading: articlesLoading,
    refetch: refetchArticles,
  } = useQuery<ArticlesSearchResult>({
    queryKey: ["/api/moderation/search/articles", searchParams, articlesPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchParams.query) params.append("query", searchParams.query);
      if (searchParams.categoryId) params.append("categoryId", searchParams.categoryId);
      if (searchParams.dateFrom) params.append("publishFrom", searchParams.dateFrom);
      if (searchParams.dateTo) params.append("publishTo", searchParams.dateTo);
      if (searchParams.sortBy) params.append("sortBy", searchParams.sortBy);
      if (searchParams.sortOrder) params.append("sortOrder", searchParams.sortOrder);
      params.append("includeComments", "true");
      params.append("page", articlesPage.toString());
      params.append("limit", "10");

      const response = await fetch(`/api/moderation/search/articles?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to search articles");
      return response.json();
    },
    enabled: isSearching && activeSearchTab === "articles",
  });

  const onSubmit = (data: SearchFormData) => {
    setSearchParams(data);
    setIsSearching(true);
    setCommentsPage(1);
    setArticlesPage(1);
  };

  const resetSearch = () => {
    form.reset();
    setSearchParams({});
    setIsSearching(false);
    setCommentsPage(1);
    setArticlesPage(1);
  };

  const toggleArticleExpanded = (articleId: string) => {
    setExpandedArticles(prev => {
      const next = new Set(prev);
      if (next.has(articleId)) {
        next.delete(articleId);
      } else {
        next.add(articleId);
      }
      return next;
    });
  };

  const renderHighlightedText = (text: string, highlighted?: string) => {
    if (!highlighted || highlighted === text) {
      return <span>{text}</span>;
    }
    return <span dangerouslySetInnerHTML={{ __html: highlighted }} />;
  };

  const getClassificationBadge = (classification: string | null) => {
    if (!classification) return null;
    const config = classificationConfig[classification];
    if (!config) return null;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`${config.bg} ${config.text} gap-1`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status];
    if (!config) return <Badge variant="outline">{status}</Badge>;
    return (
      <Badge variant="outline" className={`${config.bg} ${config.text}`}>
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className="border-0 shadow-none bg-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10">
              <Search className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-lg">البحث الذكي</CardTitle>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="gap-2"
            data-testid="button-toggle-filters"
          >
            <Filter className="h-4 w-4" />
            <span>الفلاتر</span>
            {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Main Search Input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="ابحث عن تعليق أو خبر..."
                          className="pr-10"
                          data-testid="input-search-query"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" data-testid="button-search-submit">
                <Search className="h-4 w-4 ml-2" />
                بحث
              </Button>
              {isSearching && (
                <Button type="button" variant="outline" onClick={resetSearch} data-testid="button-search-reset">
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Filters Panel */}
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <CollapsibleContent>
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 rounded-lg"
                >
                  {/* Status Filter - Comments only */}
                  {activeSearchTab === "comments" && (
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">الحالة</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-status">
                                <SelectValue placeholder="جميع الحالات" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">جميع الحالات</SelectItem>
                              <SelectItem value="pending">قيد المراجعة</SelectItem>
                              <SelectItem value="approved">معتمد</SelectItem>
                              <SelectItem value="rejected">مرفوض</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  )}

                  {/* AI Classification Filter - Comments only */}
                  {activeSearchTab === "comments" && (
                    <FormField
                      control={form.control}
                      name="aiClassification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">تصنيف الذكاء الاصطناعي</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-ai-classification">
                                <SelectValue placeholder="جميع التصنيفات" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">جميع التصنيفات</SelectItem>
                              <SelectItem value="safe">آمن</SelectItem>
                              <SelectItem value="flagged">مشكوك فيه</SelectItem>
                              <SelectItem value="spam">سبام</SelectItem>
                              <SelectItem value="harmful">ضار</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Category Filter - Articles only */}
                  {activeSearchTab === "articles" && (
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">القسم</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger data-testid="select-category">
                                <SelectValue placeholder="جميع الأقسام" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">جميع الأقسام</SelectItem>
                              {categories?.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Sort By */}
                  <FormField
                    control={form.control}
                    name="sortBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">الترتيب حسب</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sort-by">
                              <SelectValue placeholder="التاريخ" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="date">التاريخ</SelectItem>
                            <SelectItem value="relevance">الصلة</SelectItem>
                            {activeSearchTab === "comments" && <SelectItem value="score">درجة الرقابة</SelectItem>}
                            {activeSearchTab === "articles" && (
                              <>
                                <SelectItem value="comments">عدد التعليقات</SelectItem>
                                <SelectItem value="engagement">التفاعل</SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Sort Order */}
                  <FormField
                    control={form.control}
                    name="sortOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">اتجاه الترتيب</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-sort-order">
                              <SelectValue placeholder="تنازلي" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="desc">تنازلي</SelectItem>
                            <SelectItem value="asc">تصاعدي</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />

                  {/* Date From */}
                  <FormField
                    control={form.control}
                    name="dateFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">من تاريخ</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-date-from"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Date To */}
                  <FormField
                    control={form.control}
                    name="dateTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs text-muted-foreground">إلى تاريخ</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            data-testid="input-date-to"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </motion.div>
              </CollapsibleContent>
            </Collapsible>
          </form>
        </Form>

        {/* Search Results */}
        {isSearching && (
          <div className="space-y-4">
            {/* Tabs for switching between comments and articles */}
            <Tabs value={activeSearchTab} onValueChange={(v) => handleTabChange(v as "comments" | "articles")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="comments" className="gap-2" data-testid="tab-comments">
                  <MessageCircle className="h-4 w-4" />
                  تعليقات
                  {commentsResult && (
                    <Badge variant="secondary" className="mr-1 text-xs">
                      {commentsResult.total}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="articles" className="gap-2" data-testid="tab-articles">
                  <FileText className="h-4 w-4" />
                  أخبار
                  {articlesResult && (
                    <Badge variant="secondary" className="mr-1 text-xs">
                      {articlesResult.total}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Comments Results */}
              <TabsContent value="comments" className="mt-4">
                {commentsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                  </div>
                ) : commentsResult?.comments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>لم يتم العثور على تعليقات مطابقة</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 pl-4">
                      <AnimatePresence>
                        {commentsResult?.comments.map((comment, index) => (
                          <motion.div
                            key={comment.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Card 
                              className="hover-elevate cursor-pointer transition-all"
                              onClick={() => onSelectComment?.(comment.id)}
                              data-testid={`card-comment-${comment.id}`}
                            >
                              <CardContent className="p-4">
                                <div className="flex gap-3">
                                  <Avatar className="h-10 w-10 flex-shrink-0">
                                    <AvatarImage src={comment.user.profileImage || undefined} />
                                    <AvatarFallback>
                                      {comment.user.firstName?.[0] || comment?.user?.email?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0 space-y-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-medium text-sm">
                                        {comment.user.firstName && comment.user.lastName 
                                          ? `${comment.user.firstName} ${comment.user.lastName}`
                                          : comment.user.email}
                                      </span>
                                      {getStatusBadge(comment.status)}
                                      {getClassificationBadge(comment.aiClassification)}
                                      {comment.aiModerationScore !== null && (
                                        <Badge variant="outline" className="text-xs">
                                          <TrendingUp className="h-3 w-3 ml-1" />
                                          {comment.aiModerationScore}%
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800 [&_mark]:px-0.5 [&_mark]:rounded">
                                      {renderHighlightedText(comment.content, comment.highlightedContent)}
                                    </p>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        {formatDistanceToNow(new Date(comment.createdAt), { 
                                          locale: arSA, 
                                          addSuffix: true 
                                        })}
                                      </span>
                                      <Separator orientation="vertical" className="h-3" />
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="flex items-center gap-1 hover:text-foreground transition-colors">
                                            <FileText className="h-3 w-3" />
                                            {comment.article.title.substring(0, 30)}...
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="bottom">
                                          <p>{comment.article.title}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>
                )}

                {/* Comments Pagination */}
                {commentsResult && commentsResult.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <span className="text-sm text-muted-foreground">
                      صفحة {commentsResult.page} من {commentsResult.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCommentsPage(p => Math.max(1, p - 1))}
                        disabled={commentsPage === 1}
                        data-testid="button-comments-prev"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCommentsPage(p => Math.min(commentsResult.totalPages, p + 1))}
                        disabled={commentsPage === commentsResult.totalPages}
                        data-testid="button-comments-next"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Articles Results */}
              <TabsContent value="articles" className="mt-4">
                {articlesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32 w-full rounded-lg" />
                    ))}
                  </div>
                ) : articlesResult?.articles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p>لم يتم العثور على أخبار مطابقة</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 pl-4">
                      <AnimatePresence>
                        {articlesResult?.articles.map((article, index) => (
                          <motion.div
                            key={article.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                          >
                            <Card className="overflow-hidden" data-testid={`card-article-${article.id}`}>
                              <CardContent className="p-0">
                                <div className="flex gap-4 p-4">
                                  {article.imageUrl && (
                                    <div className="w-24 h-20 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                                      <img 
                                        src={article.imageUrl} 
                                        alt={article.title}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 space-y-2">
                                    <div 
                                      className="flex items-start justify-between gap-2 cursor-pointer"
                                      onClick={() => onSelectArticle?.(article.id)}
                                    >
                                      <h3 className="font-medium text-sm line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:dark:bg-yellow-800 [&_mark]:px-0.5 [&_mark]:rounded">
                                        {renderHighlightedText(article.title, article.highlightedTitle)}
                                      </h3>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0">
                                        <ExternalLink className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {article.categoryName && (
                                        <Badge variant="secondary" className="text-xs">
                                          {article.categoryName}
                                        </Badge>
                                      )}
                                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Eye className="h-3 w-3" />
                                        {article.views.toLocaleString()}
                                      </span>
                                      {article.publishedAt && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {format(new Date(article.publishedAt), "d MMM yyyy", { locale: arSA })}
                                        </span>
                                      )}
                                    </div>
                                    
                                    {/* Comment Stats */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="text-xs gap-1">
                                        <MessageCircle className="h-3 w-3" />
                                        {article.commentStats.total} تعليق
                                      </Badge>
                                      {article.commentStats.pending > 0 && (
                                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600">
                                          {article.commentStats.pending} قيد المراجعة
                                        </Badge>
                                      )}
                                      {article.commentStats.flagged > 0 && (
                                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600">
                                          {article.commentStats.flagged} مُبلغ عنه
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Expandable Comments Section */}
                                {article.latestComments && article.latestComments.length > 0 && (
                                  <Collapsible 
                                    open={expandedArticles.has(article.id)}
                                    onOpenChange={() => toggleArticleExpanded(article.id)}
                                  >
                                    <div className="px-4 pb-2">
                                      <CollapsibleTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-between gap-2 text-xs"
                                          data-testid={`button-expand-comments-${article.id}`}
                                        >
                                          <span>عرض آخر {article.latestComments.length} تعليقات</span>
                                          {expandedArticles.has(article.id) ? (
                                            <ChevronUp className="h-4 w-4" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </CollapsibleTrigger>
                                    </div>
                                    <CollapsibleContent>
                                      <div className="border-t bg-muted/30 px-4 py-3 space-y-2">
                                        {article.latestComments.map((comment) => (
                                          <div 
                                            key={comment.id}
                                            className="flex gap-2 p-2 rounded-md bg-background hover-elevate cursor-pointer"
                                            onClick={() => onSelectComment?.(comment.id)}
                                            data-testid={`article-comment-${comment.id}`}
                                          >
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-medium">{comment.userName}</span>
                                                {getStatusBadge(comment.status)}
                                                {getClassificationBadge(comment.aiClassification)}
                                              </div>
                                              <p className="text-xs text-muted-foreground line-clamp-2">
                                                {comment.content}
                                              </p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                )}
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>
                )}

                {/* Articles Pagination */}
                {articlesResult && articlesResult.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <span className="text-sm text-muted-foreground">
                      صفحة {articlesResult.page} من {articlesResult.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArticlesPage(p => Math.max(1, p - 1))}
                        disabled={articlesPage === 1}
                        data-testid="button-articles-prev"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setArticlesPage(p => Math.min(articlesResult.totalPages, p + 1))}
                        disabled={articlesPage === articlesResult.totalPages}
                        data-testid="button-articles-next"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Initial State */}
        {!isSearching && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium mb-1">ابحث في التعليقات والأخبار</p>
            <p className="text-sm">أدخل كلمات البحث أو استخدم الفلاتر للعثور على المحتوى</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
