import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  X,
  MessageCircle,
  User,
  Calendar,
  AlertCircle,
  RotateCcw,
  Trash2,
  Edit3,
  ExternalLink,
  Search,
  ShieldAlert,
  AlertTriangle,
  FileWarning,
  Eye,
  Link2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Comment {
  id: string;
  articleId: string;
  userId: string;
  content: string;
  status: string;
  parentId?: string;
  moderatedBy?: string;
  moderatedAt?: string;
  moderationReason?: string;
  currentSentiment?: string;
  aiClassification?: string;
  aiDetectedIssues?: string[];
  aiModerationReason?: string;
  createdAt: string;
  articleTitle?: string;
  articleSlug?: string;
  userName?: string;
  userLastName?: string;
  userEmail?: string;
}

interface CommentsResponse {
  comments: Comment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Stats {
  comments: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    flagged: number;
  };
  suspiciousWords: {
    active: number;
  };
}

export default function CommentsModeration() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [editedContent, setEditedContent] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/admin/comments/stats"],
  });

  const { data: commentsData, isLoading } = useQuery<CommentsResponse>({
    queryKey: ["/api/admin/comments", activeTab, page, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: activeTab,
        page: page.toString(),
        limit: "20",
      });
      if (searchQuery) params.append("search", searchQuery);
      const res = await fetch(`/api/admin/comments?${params}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest(`/api/admin/comments/${commentId}/approve`, {
        method: "PATCH",
      });
    },
    onSuccess: () => {
      toast({ title: "تمت الموافقة على التعليق", description: "تم نشر التعليق بنجاح" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments/stats"] });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في الموافقة على التعليق", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason?: string }) => {
      return await apiRequest(`/api/admin/comments/${commentId}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({ title: "تم رفض التعليق", description: "تم رفض التعليق بنجاح" });
      setRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedComment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments/stats"] });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في رفض التعليق", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      return await apiRequest(`/api/admin/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
    },
    onSuccess: () => {
      toast({ title: "تم تعديل التعليق", description: "تم حفظ التغييرات بنجاح" });
      setEditDialogOpen(false);
      setEditedContent("");
      setSelectedComment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في تعديل التعليق", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      return await apiRequest(`/api/admin/comments/${commentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({ title: "تم حذف التعليق", description: "تم حذف التعليق نهائياً" });
      setDeleteDialogOpen(false);
      setSelectedComment(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comments/stats"] });
    },
    onError: () => {
      toast({ title: "خطأ", description: "فشل في حذف التعليق", variant: "destructive" });
    },
  });

  const handleApprove = (comment: Comment) => {
    approveMutation.mutate(comment.id);
  };

  const handleRejectClick = (comment: Comment) => {
    setSelectedComment(comment);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = () => {
    if (selectedComment) {
      rejectMutation.mutate({
        commentId: selectedComment.id,
        reason: rejectionReason || undefined,
      });
    }
  };

  const handleEditClick = (comment: Comment) => {
    setSelectedComment(comment);
    setEditedContent(comment.content);
    setEditDialogOpen(true);
  };

  const handleEditConfirm = () => {
    if (selectedComment && editedContent.trim()) {
      editMutation.mutate({
        commentId: selectedComment.id,
        content: editedContent.trim(),
      });
    }
  };

  const handleDeleteClick = (comment: Comment) => {
    setSelectedComment(comment);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedComment) {
      deleteMutation.mutate(selectedComment.id);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500 hover:bg-green-600">موافق عليه</Badge>;
      case "pending":
        return <Badge variant="secondary">قيد المراجعة</Badge>;
      case "rejected":
        return <Badge variant="destructive">مرفوض</Badge>;
      case "flagged":
        return <Badge className="bg-orange-500 hover:bg-orange-600">مُبلَّغ عنه</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAIClassificationBadge = (classification?: string) => {
    if (!classification) return null;
    switch (classification) {
      case "safe":
        return <Badge variant="outline" className="text-green-600 border-green-600">آمن</Badge>;
      case "review":
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600">يحتاج مراجعة</Badge>;
      case "reject":
        return <Badge variant="outline" className="text-red-600 border-red-600">يجب رفضه</Badge>;
      default:
        return null;
    }
  };

  const getUserName = (comment: Comment) => {
    if (comment.userName && comment.userLastName) {
      return `${comment.userName} ${comment.userLastName}`;
    }
    if (comment.userName) return comment.userName;
    if (comment.userEmail) return comment.userEmail.split("@")[0];
    return "مستخدم مجهول";
  };

  if (isLoading && !commentsData) {
    return (
      <div className="space-y-4 p-6" dir="rtl">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const comments = commentsData?.comments || [];

  return (
    <div className="space-y-6 p-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="heading-comments-moderation">
            إدارة التعليقات
          </h1>
          <p className="text-muted-foreground">مراجعة التعليقات والموافقة عليها أو رفضها</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/comments/suspicious-words">
            <Button variant="outline" className="gap-2" data-testid="link-suspicious-words">
              <ShieldAlert className="h-4 w-4" />
              الكلمات المشبوهة
            </Button>
          </Link>
          <MessageCircle className="h-8 w-8 text-primary" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">الإجمالي</p>
                <p className="text-2xl font-bold" data-testid="stat-total">
                  {statsLoading ? "-" : stats?.comments.total || 0}
                </p>
              </div>
              <MessageCircle className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">قيد المراجعة</p>
                <p className="text-2xl font-bold text-yellow-600" data-testid="stat-pending">
                  {statsLoading ? "-" : stats?.comments.pending || 0}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">موافق عليها</p>
                <p className="text-2xl font-bold text-green-600" data-testid="stat-approved">
                  {statsLoading ? "-" : stats?.comments.approved || 0}
                </p>
              </div>
              <Check className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">مرفوضة</p>
                <p className="text-2xl font-bold text-red-600" data-testid="stat-rejected">
                  {statsLoading ? "-" : stats?.comments.rejected || 0}
                </p>
              </div>
              <X className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">الكلمات المراقبة</p>
                <p className="text-2xl font-bold text-orange-600" data-testid="stat-words">
                  {statsLoading ? "-" : stats?.suspiciousWords.active || 0}
                </p>
              </div>
              <ShieldAlert className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث في التعليقات..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="pr-10"
            data-testid="input-search"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setPage(1); }}>
        <TabsList className="grid w-full md:w-auto grid-cols-5 gap-2">
          <TabsTrigger value="all" data-testid="tab-all">
            الكل ({stats?.comments.total || 0})
          </TabsTrigger>
          <TabsTrigger value="pending" data-testid="tab-pending">
            قيد المراجعة ({stats?.comments.pending || 0})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            موافق عليها ({stats?.comments.approved || 0})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            مرفوضة ({stats?.comments.rejected || 0})
          </TabsTrigger>
          <TabsTrigger value="flagged" data-testid="tab-flagged">
            مُبلَّغ عنها ({stats?.comments.flagged || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {comments.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground" data-testid="text-no-comments">لا توجد تعليقات</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <Card key={comment.id} data-testid={`comment-card-${comment.id}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium" data-testid={`user-name-${comment.id}`}>
                            {getUserName(comment)}
                          </span>
                          {getStatusBadge(comment.status)}
                          {getAIClassificationBadge(comment.aiClassification)}
                        </div>

                        {comment.articleTitle && (
                          <Link href={`/article/${comment.articleSlug}`}>
                            <div className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer" data-testid={`article-link-${comment.id}`}>
                              <Link2 className="h-4 w-4" />
                              <span>{comment.articleTitle}</span>
                              <ExternalLink className="h-3 w-3" />
                            </div>
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        <span data-testid={`date-${comment.id}`}>
                          {formatDistanceToNow(new Date(comment.createdAt), {
                            addSuffix: true,
                            locale: ar,
                          })}
                        </span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" data-testid={`content-${comment.id}`}>
                      {comment.content}
                    </p>

                    {comment.aiDetectedIssues && comment.aiDetectedIssues.length > 0 && (
                      <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded-md border border-orange-200 dark:border-orange-800">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                          <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
                            مشاكل مكتشفة بواسطة الذكاء الاصطناعي
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {comment.aiDetectedIssues.map((issue, idx) => (
                            <Badge key={idx} variant="outline" className="text-orange-600 border-orange-400">
                              {issue}
                            </Badge>
                          ))}
                        </div>
                        {comment.aiModerationReason && (
                          <p className="text-xs text-orange-600 mt-2">{comment.aiModerationReason}</p>
                        )}
                      </div>
                    )}

                    {comment.moderationReason && (
                      <div className="bg-muted p-3 rounded-md">
                        <p className="text-xs text-muted-foreground mb-1">سبب الرفض:</p>
                        <p className="text-sm" data-testid={`rejection-reason-${comment.id}`}>
                          {comment.moderationReason}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-3 border-t flex-wrap">
                      {comment.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleApprove(comment)}
                            disabled={approveMutation.isPending}
                            className="gap-2"
                            data-testid={`btn-approve-${comment.id}`}
                          >
                            <Check className="h-4 w-4" />
                            موافقة
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRejectClick(comment)}
                            disabled={rejectMutation.isPending}
                            className="gap-2"
                            data-testid={`btn-reject-${comment.id}`}
                          >
                            <X className="h-4 w-4" />
                            رفض
                          </Button>
                        </>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditClick(comment)}
                            className="gap-2"
                            data-testid={`btn-edit-${comment.id}`}
                          >
                            <Edit3 className="h-4 w-4" />
                            تعديل
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>تعديل محتوى التعليق</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteClick(comment)}
                            data-testid={`btn-delete-${comment.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                            حذف
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>حذف التعليق نهائياً</TooltipContent>
                      </Tooltip>

                      {comment.articleSlug && (
                        <Link href={`/article/${comment.articleSlug}`}>
                          <Button size="sm" variant="ghost" className="gap-2" data-testid={`btn-view-article-${comment.id}`}>
                            <Eye className="h-4 w-4" />
                            عرض المقال
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {commentsData && commentsData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                السابق
              </Button>
              <span className="text-sm text-muted-foreground">
                صفحة {page} من {commentsData.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(commentsData.totalPages, p + 1))}
                disabled={page === commentsData.totalPages}
              >
                التالي
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض التعليق</DialogTitle>
            <DialogDescription>
              أدخل سبب الرفض (اختياري). سيظهر هذا للمستخدم.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="سبب الرفض..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            className="min-h-[100px]"
            data-testid="input-rejection-reason"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={rejectMutation.isPending}
              data-testid="btn-confirm-reject"
            >
              {rejectMutation.isPending ? "جاري الرفض..." : "رفض التعليق"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل التعليق</DialogTitle>
            <DialogDescription>
              قم بتعديل محتوى التعليق. التغييرات ستُحفظ فوراً.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="محتوى التعليق..."
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="min-h-[150px]"
            data-testid="input-edit-content"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleEditConfirm}
              disabled={editMutation.isPending || !editedContent.trim()}
              data-testid="btn-confirm-edit"
            >
              {editMutation.isPending ? "جاري الحفظ..." : "حفظ التغييرات"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد من حذف هذا التعليق؟</AlertDialogTitle>
            <AlertDialogDescription>
              هذا الإجراء لا يمكن التراجع عنه. سيتم حذف التعليق نهائياً من قاعدة البيانات.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
              data-testid="btn-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف نهائياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
