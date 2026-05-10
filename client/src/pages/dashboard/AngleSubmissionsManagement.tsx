import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Loader2,
  User,
  Phone,
  Mail,
  MapPin,
  PenTool,
  Lightbulb,
  Briefcase,
  Link as LinkIcon,
  Calendar,
  MessageSquare,
  Filter,
  Search,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface AngleSubmission {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  city?: string;
  angleName: string;
  angleCategory: string;
  angleDescription: string;
  uniquePoints?: string;
  writingExperience?: string;
  previousArticlesUrl?: string;
  expectedArticlesPerMonth?: number;
  status: "pending" | "approved" | "rejected";
  reviewerNotes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAngleId?: string;
  createdAt: string;
}

const categoryLabels: Record<string, string> = {
  political: "سياسي",
  social: "اجتماعي",
  sports: "رياضي",
  tech: "تقني",
  cultural: "ثقافي",
  economic: "اقتصادي",
  health: "صحي",
  education: "تعليمي",
  entertainment: "ترفيهي",
  other: "أخرى",
};

const statusConfig = {
  pending: { label: "قيد المراجعة", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", icon: Clock },
  approved: { label: "تمت الموافقة", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", icon: XCircle },
};

export default function AngleSubmissionsManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<AngleSubmission | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAction, setReviewAction] = useState<"approved" | "rejected">("approved");

  const { data: submissions, isLoading } = useQuery<AngleSubmission[]>({
    queryKey: ["/api/angle-submissions", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all" 
        ? "/api/angle-submissions" 
        : `/api/angle-submissions?status=${statusFilter}`;
      return apiRequest(url);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes: string }) => {
      return apiRequest(`/api/angle-submissions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewerNotes: notes }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/angle-submissions"] });
      setReviewDialogOpen(false);
      setSelectedSubmission(null);
      setReviewNotes("");
      toast({
        title: reviewAction === "approved" ? "تمت الموافقة" : "تم الرفض",
        description: reviewAction === "approved" 
          ? "يمكنك الآن إنشاء الزاوية من زر 'إنشاء الزاوية'" 
          : "تم رفض الطلب بنجاح",
      });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: error instanceof Error ? error.message : "فشل في تحديث الطلب",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/angle-submissions/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/angle-submissions"] });
      setDeleteDialogOpen(false);
      setSelectedSubmission(null);
      toast({ title: "تم الحذف", description: "تم حذف الطلب بنجاح" });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: error instanceof Error ? error.message : "فشل في حذف الطلب",
        variant: "destructive",
      });
    },
  });

  const createAngleMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/angle-submissions/${id}/create-angle`, { method: "POST" });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/angle-submissions"] });
      toast({ 
        title: "تم إنشاء الزاوية", 
        description: data.isNewUser 
          ? "تم إنشاء الزاوية والحساب وإرسال بيانات الدخول بالبريد" 
          : "تم إنشاء الزاوية وربطها بالحساب الموجود",
      });
    },
    onError: (error) => {
      toast({
        title: "حدث خطأ",
        description: error instanceof Error ? error.message : "فشل في إنشاء الزاوية",
        variant: "destructive",
      });
    },
  });

  const filteredSubmissions = submissions?.filter((s) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      s.fullName.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query) ||
      s.angleName.toLowerCase().includes(query)
    );
  });

  const handleReview = (submission: AngleSubmission, action: "approved" | "rejected") => {
    setSelectedSubmission(submission);
    setReviewAction(action);
    setReviewNotes("");
    setReviewDialogOpen(true);
  };

  const handleDelete = (submission: AngleSubmission) => {
    setSelectedSubmission(submission);
    setDeleteDialogOpen(true);
  };

  const submitReview = () => {
    if (!selectedSubmission) return;
    reviewMutation.mutate({
      id: selectedSubmission.id,
      status: reviewAction,
      notes: reviewNotes,
    });
  };

  const stats = {
    total: submissions?.length || 0,
    pending: submissions?.filter((s) => s.status === "pending").length || 0,
    approved: submissions?.filter((s) => s.status === "approved").length || 0,
    rejected: submissions?.filter((s) => s.status === "rejected").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">طلبات الزوايا</h1>
            <p className="text-muted-foreground">إدارة طلبات كتابة الزوايا من المستخدمين</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">إجمالي الطلبات</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-sm text-muted-foreground">قيد المراجعة</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{stats.approved}</div>
              <div className="text-sm text-muted-foreground">تمت الموافقة</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-red-600">{stats.rejected}</div>
              <div className="text-sm text-muted-foreground">مرفوض</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو البريد أو اسم الزاوية..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-status-filter">
                  <Filter className="w-4 h-4 ml-2" />
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">تمت الموافقة</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Submissions Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSubmissions?.length === 0 ? (
              <div className="text-center p-12 text-muted-foreground">
                لا توجد طلبات
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">مقدم الطلب</TableHead>
                    <TableHead className="text-right">الزاوية المقترحة</TableHead>
                    <TableHead className="text-right">التصنيف</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions?.map((submission) => {
                    const StatusIcon = statusConfig[submission.status].icon;
                    return (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{submission.fullName}</span>
                            <span className="text-sm text-muted-foreground">{submission.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{submission.angleName}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {categoryLabels[submission.angleCategory] || submission.angleCategory}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusConfig[submission.status].color}>
                            <StatusIcon className="w-3 h-3 ml-1" />
                            {statusConfig[submission.status].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(submission.createdAt), { locale: ar, addSuffix: true })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Dialog>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setSelectedSubmission(submission)}
                                data-testid={`button-view-${submission.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </Dialog>
                            {submission.status === "pending" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => handleReview(submission, "approved")}
                                  data-testid={`button-approve-${submission.id}`}
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleReview(submission, "rejected")}
                                  data-testid={`button-reject-${submission.id}`}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {submission.status === "approved" && !submission.createdAngleId && (
                              <Button
                                size="sm"
                                variant="default"
                                className="gap-1"
                                onClick={() => createAngleMutation.mutate(submission.id)}
                                disabled={createAngleMutation.isPending}
                                data-testid={`button-create-angle-${submission.id}`}
                              >
                                {createAngleMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Rocket className="w-3 h-3" />
                                )}
                                إنشاء الزاوية
                              </Button>
                            )}
                            {submission.createdAngleId && (
                              <Badge variant="outline" className="text-green-600 border-green-300">
                                <CheckCircle2 className="w-3 h-3 ml-1" />
                                تم الإنشاء
                              </Badge>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(submission)}
                              data-testid={`button-delete-${submission.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* View Details Dialog */}
        <Dialog open={!!selectedSubmission && !reviewDialogOpen && !deleteDialogOpen} onOpenChange={() => setSelectedSubmission(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>تفاصيل الطلب</DialogTitle>
            </DialogHeader>
            {selectedSubmission && (
              <div className="space-y-6">
                {/* Status Badge */}
                <div className="flex justify-center">
                  <Badge className={`${statusConfig[selectedSubmission.status].color} text-base px-4 py-2`}>
                    {statusConfig[selectedSubmission.status].label}
                  </Badge>
                </div>

                {/* Personal Info */}
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <User className="w-4 h-4" />
                    المعلومات الشخصية
                  </h3>
                  <div className="grid grid-cols-2 gap-4 bg-muted/50 p-4 rounded-lg">
                    <div>
                      <span className="text-sm text-muted-foreground">الاسم:</span>
                      <p className="font-medium">{selectedSubmission.fullName}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">الجوال:</span>
                      <p className="font-medium" dir="ltr">{selectedSubmission.phone}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">البريد:</span>
                      <p className="font-medium" dir="ltr">{selectedSubmission.email}</p>
                    </div>
                    {selectedSubmission.city && (
                      <div>
                        <span className="text-sm text-muted-foreground">المدينة:</span>
                        <p className="font-medium">{selectedSubmission.city}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Angle Info */}
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <PenTool className="w-4 h-4" />
                    معلومات الزاوية
                  </h3>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <span className="text-sm text-muted-foreground">اسم الزاوية:</span>
                        <p className="font-medium text-lg">{selectedSubmission.angleName}</p>
                      </div>
                      <Badge variant="outline">
                        {categoryLabels[selectedSubmission.angleCategory] || selectedSubmission.angleCategory}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">وصف الفكرة:</span>
                      <p className="mt-1 whitespace-pre-wrap">{selectedSubmission.angleDescription}</p>
                    </div>
                    {selectedSubmission.uniquePoints && (
                      <div>
                        <span className="text-sm text-muted-foreground">ما يميز الزاوية:</span>
                        <p className="mt-1 whitespace-pre-wrap">{selectedSubmission.uniquePoints}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Experience */}
                {(selectedSubmission.writingExperience || selectedSubmission.previousArticlesUrl || selectedSubmission.expectedArticlesPerMonth) && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Briefcase className="w-4 h-4" />
                      الخبرة
                    </h3>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                      {selectedSubmission.writingExperience && (
                        <div>
                          <span className="text-sm text-muted-foreground">خبرة الكتابة:</span>
                          <p className="mt-1 whitespace-pre-wrap">{selectedSubmission.writingExperience}</p>
                        </div>
                      )}
                      {selectedSubmission.previousArticlesUrl && (
                        <div>
                          <span className="text-sm text-muted-foreground">مقالات سابقة:</span>
                          <a
                            href={selectedSubmission.previousArticlesUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-1 text-primary hover:underline"
                            dir="ltr"
                          >
                            {selectedSubmission.previousArticlesUrl}
                          </a>
                        </div>
                      )}
                      {selectedSubmission.expectedArticlesPerMonth && (
                        <div>
                          <span className="text-sm text-muted-foreground">المقالات المتوقعة شهرياً:</span>
                          <p className="font-medium">{selectedSubmission.expectedArticlesPerMonth} مقالات</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reviewer Notes */}
                {selectedSubmission.reviewerNotes && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      ملاحظات المراجع
                    </h3>
                    <div className="bg-muted/50 p-4 rounded-lg">
                      <p className="whitespace-pre-wrap">{selectedSubmission.reviewerNotes}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {selectedSubmission.status === "pending" && (
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => {
                        setReviewAction("rejected");
                        setReviewDialogOpen(true);
                      }}
                    >
                      <XCircle className="w-4 h-4 ml-2" />
                      رفض
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setReviewAction("approved");
                        setReviewDialogOpen(true);
                      }}
                    >
                      <CheckCircle2 className="w-4 h-4 ml-2" />
                      موافقة وإنشاء الزاوية
                    </Button>
                  </DialogFooter>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Review Dialog */}
        <AlertDialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {reviewAction === "approved" ? "تأكيد الموافقة" : "تأكيد الرفض"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {reviewAction === "approved"
                  ? "سيتم إنشاء زاوية جديدة باسم المقترح وربطها بهذا الطلب"
                  : "سيتم رفض هذا الطلب"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <label className="text-sm font-medium">ملاحظات (اختياري)</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="أضف ملاحظاتك هنا..."
                className="mt-2"
                data-testid="textarea-review-notes"
              />
            </div>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={submitReview}
                className={reviewAction === "approved" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                disabled={reviewMutation.isPending}
              >
                {reviewMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : reviewAction === "approved" ? (
                  "موافقة"
                ) : (
                  "رفض"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => selectedSubmission && deleteMutation.mutate(selectedSubmission.id)}
                className="bg-destructive hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  "حذف"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
