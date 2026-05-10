import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  MoreHorizontal,
  Edit,
  Archive,
  Trash2,
  Eye,
  Clock,
  Calendar,
  TrendingUp,
  Sparkles,
  Brain,
  Globe,
  BookOpen,
  Gamepad2,
  Heart,
  DollarSign,
  Laptop
} from "lucide-react";

// iFox Category Icons and Colors
const categoryConfig: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
  technology: {
    icon: Laptop,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950",
    label: "التقنية"
  },
  ai: {
    icon: Brain,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-950",
    label: "الذكاء الاصطناعي"
  },
  web: {
    icon: Globe,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950",
    label: "الويب"
  },
  education: {
    icon: BookOpen,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950",
    label: "التعليم"
  },
  gaming: {
    icon: Gamepad2,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950",
    label: "الألعاب"
  },
  health: {
    icon: Heart,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-50 dark:bg-red-950",
    label: "الصحة"
  },
  business: {
    icon: DollarSign,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950",
    label: "الأعمال"
  }
};

interface IFoxArticle {
  id: string;
  title: string;
  titleEn?: string;
  slug: string;
  category: string;
  status: "published" | "draft" | "scheduled" | "archived";
  publishDate: string;
  aiScore: number;
  sentimentScore?: number;
  author: string;
  views: number;
  engagementRate: number;
}

interface IFoxArticlesTableProps {
  articles: IFoxArticle[];
  selectedArticles: string[];
  onSelectArticle: (id: string) => void;
  onSelectAll: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function IFoxArticlesTable({
  articles,
  selectedArticles,
  onSelectArticle,
  onSelectAll,
  onRefresh,
  isLoading = false
}: IFoxArticlesTableProps) {
  const { toast } = useToast();
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; article: IFoxArticle | null }>({
    open: false,
    article: null
  });

  // Delete article mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/ifox/articles/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف المقال بنجاح",
      });
      onRefresh();
      setDeleteDialog({ open: false, article: null });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حذف المقال",
        variant: "destructive",
      });
    },
  });

  // Archive article mutation
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/ifox/articles/${id}/archive`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: "تمت الأرشفة",
        description: "تم أرشفة المقال بنجاح",
      });
      onRefresh();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل أرشفة المقال",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: IFoxArticle["status"]) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1 text-xs">
            <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">منشور</span>
          </Badge>
        );
      case "scheduled":
        return (
          <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 gap-1 text-xs">
            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">مجدول</span>
          </Badge>
        );
      case "draft":
        return (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Edit className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">مسودة</span>
          </Badge>
        );
      case "archived":
        return (
          <Badge variant="outline" className="gap-1 text-xs">
            <Archive className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            <span className="hidden sm:inline">مؤرشف</span>
          </Badge>
        );
    }
  };

  const getAIScoreColor = (score: number) => {
    if (score >= 80) return "bg-green-500 dark:bg-green-400";
    if (score >= 60) return "bg-yellow-500 dark:bg-yellow-400";
    if (score >= 40) return "bg-orange-500 dark:bg-orange-400";
    return "bg-red-500 dark:bg-red-400";
  };

  const getCategoryIcon = (category: string) => {
    const config = categoryConfig[category] || categoryConfig.technology;
    const Icon = config.icon;
    return (
      <div className={`flex items-center gap-1.5 sm:gap-2 ${config.color} min-w-0`}>
        <div className={`p-1 sm:p-1.5 rounded-lg ${config.bgColor} flex-shrink-0`}>
          <Icon className="w-3 h-3 sm:w-4 sm:h-4" />
        </div>
        <span className="text-xs sm:text-sm font-medium truncate hidden sm:inline">{config.label}</span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8 sm:w-12">
                <Checkbox
                  checked={selectedArticles.length === articles.length && articles.length > 0}
                  onCheckedChange={onSelectAll}
                  aria-label="تحديد الكل"
                  data-testid="checkbox-select-all"
                />
              </TableHead>
              <TableHead className="text-right min-w-[150px] sm:min-w-[200px]">
                <span className="text-xs sm:text-sm">العنوان</span>
              </TableHead>
              <TableHead className="text-right hidden md:table-cell">
                <span className="text-xs sm:text-sm">التصنيف</span>
              </TableHead>
              <TableHead className="text-right">
                <span className="text-xs sm:text-sm">الحالة</span>
              </TableHead>
              <TableHead className="text-right hidden lg:table-cell">
                <span className="text-xs sm:text-sm">تاريخ النشر</span>
              </TableHead>
              <TableHead className="text-right hidden xl:table-cell">
                <span className="text-xs sm:text-sm">تقييم AI</span>
              </TableHead>
              <TableHead className="text-right hidden lg:table-cell">
                <span className="text-xs sm:text-sm">المشاهدات</span>
              </TableHead>
              <TableHead className="text-right hidden xl:table-cell">
                <span className="text-xs sm:text-sm">معدل التفاعل</span>
              </TableHead>
              <TableHead className="text-center">
                <span className="text-xs sm:text-sm">الإجراءات</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-xs sm:text-sm text-muted-foreground">
                  لا توجد مقالات
                </TableCell>
              </TableRow>
            ) : (
              articles.map((article) => (
                <TableRow key={article.id} data-testid={`row-article-${article.id}`}>
                  <TableCell>
                    <Checkbox
                      checked={selectedArticles.includes(article.id)}
                      onCheckedChange={() => onSelectArticle(article.id)}
                      aria-label={`تحديد ${article.title}`}
                      data-testid={`checkbox-article-${article.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="space-y-0.5 sm:space-y-1 min-w-0">
                      <p className="line-clamp-1 text-xs sm:text-sm truncate">{article.title}</p>
                      {article.titleEn && (
                        <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-1 truncate hidden sm:block">{article.titleEn}</p>
                      )}
                      <p className="text-[10px] sm:text-xs text-muted-foreground truncate">بواسطة: {article.author}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{getCategoryIcon(article.category)}</TableCell>
                  <TableCell>{getStatusBadge(article.status)}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                      <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0" />
                      <span className="truncate">{format(new Date(article.publishDate), "dd/MM/yyyy", { locale: ar })}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="space-y-0.5 sm:space-y-1">
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={article.aiScore} 
                          className="h-1.5 sm:h-2 w-16 sm:w-20"
                          indicatorClassName={getAIScoreColor(article.aiScore)}
                        />
                        <span className="text-xs sm:text-sm font-medium">{article.aiScore}%</span>
                      </div>
                      <div className="flex items-center gap-1 hidden sm:flex">
                        <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-500" />
                        <span className="text-[10px] sm:text-xs text-muted-foreground">جودة عالية</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-1">
                      <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-muted-foreground" />
                      <span className="text-xs sm:text-sm">{article.views.toLocaleString("ar-SA")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-500" />
                      <span className="text-xs sm:text-sm font-medium">{article.engagementRate}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          data-testid={`button-actions-${article.id}`}
                          className="w-7 h-7 sm:w-8 sm:h-8"
                        >
                          <MoreHorizontal className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="text-xs sm:text-sm">الإجراءات</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <Link href={`/dashboard/admin/ifox/articles/${article.id}`}>
                          <DropdownMenuItem className="text-xs sm:text-sm">
                            <Eye className="ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                            عرض
                          </DropdownMenuItem>
                        </Link>
                        <Link href={`/dashboard/admin/ifox/articles/edit/${article.id}`}>
                          <DropdownMenuItem className="text-xs sm:text-sm">
                            <Edit className="ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                            تحرير
                          </DropdownMenuItem>
                        </Link>
                        {article.status !== "archived" && (
                          <DropdownMenuItem
                            onClick={() => archiveMutation.mutate(article.id)}
                            disabled={archiveMutation.isPending}
                            className="text-xs sm:text-sm"
                          >
                            <Archive className="ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                            أرشفة
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive text-xs sm:text-sm"
                          onClick={() => setDeleteDialog({ open: true, article })}
                        >
                          <Trash2 className="ml-2 w-3 h-3 sm:w-4 sm:h-4" />
                          حذف
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => {
        if (!open) setDeleteDialog({ open: false, article: null });
      }}>
        <AlertDialogContent data-testid="dialog-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base sm:text-lg">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm">
              هل أنت متأكد من حذف المقال "{deleteDialog.article?.title}"؟ 
              هذه العملية لا يمكن التراجع عنها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs sm:text-sm">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog.article && deleteMutation.mutate(deleteDialog.article.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90 text-xs sm:text-sm"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
