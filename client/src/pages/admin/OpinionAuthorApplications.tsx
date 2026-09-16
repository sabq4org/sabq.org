import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Check, 
  X,
  Loader2,
  RefreshCw,
  Copy,
  ChevronRight,
  ChevronLeft,
  PenTool,
  ExternalLink,
  Mail,
  BadgeCheck,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { OpinionAuthorApplicationWithDetails } from "@shared/schema";

type ApplicationStatus = "all" | "pending" | "approved" | "rejected";

interface ApplicationsResponse {
  applications: OpinionAuthorApplicationWithDetails[];
  total: number;
}

export default function OpinionAuthorApplications() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus>("all");
  const [page, setPage] = useState(1);
  const [selectedApplication, setSelectedApplication] = useState<OpinionAuthorApplicationWithDetails | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approvalResult, setApprovalResult] = useState<{
    temporaryPassword: string;
    email: string;
    isExistingUser?: boolean;
  } | null>(null);
  const [showApprovalResultDialog, setShowApprovalResultDialog] = useState(false);
  const [credentialsDialogTitle, setCredentialsDialogTitle] = useState("تمت الموافقة بنجاح");

  const { data, isLoading, refetch } = useQuery<ApplicationsResponse>({
    queryKey: ["/api/admin/opinion-author-applications", statusFilter, page],
    queryFn: () =>
      fetch(apiUrl(`/api/admin/opinion-author-applications?status=${statusFilter}&page=${page}&limit=10`))
        .then((res) => res.json()),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/admin/opinion-author-applications/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ notes: "" }),
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.emailSent === false) {
        toast({
          variant: "destructive",
          title: "تمت الموافقة لكن البريد لم يُرسَل",
          description: data.emailError || data.message || "استخدم «إعادة إرسال الدخول» من قائمة الطلبات",
        });
      } else {
        toast({
          title: "تمت الموافقة",
          description: data.message || (data.isExistingUser
            ? "تم قبول الطلب وإرسال بريد الدخول"
            : "تم قبول الطلب وإنشاء حساب كاتب الرأي"),
        });
      }
      setCredentialsDialogTitle("تمت الموافقة بنجاح");
      setApprovalResult({
        temporaryPassword: data.temporaryPassword || "",
        email: data.user.email,
        isExistingUser: data.isExistingUser,
      });
      setShowApprovalResultDialog(true);
      setShowDetailsDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/opinion-author-applications"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الموافقة",
        description: error.message || "حدث خطأ أثناء الموافقة على الطلب",
      });
    },
  });

  const resendCredentialsMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/opinion-author-applications/${id}/resend-credentials`, {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      if (data?.temporaryPassword) {
        setCredentialsDialogTitle(
          data.emailSent === false ? "كلمة مرور جديدة — أرسلها يدوياً" : "بيانات الدخول الجديدة",
        );
        setApprovalResult({
          temporaryPassword: data.temporaryPassword,
          email: data.email || "",
          isExistingUser: false,
        });
        setShowApprovalResultDialog(true);
      }
      toast({
        variant: data?.emailSent === false ? "destructive" : "default",
        title: data?.emailSent === false ? "تم التعيين — البريد لم يُرسَل" : "تم إرسال بيانات الدخول",
        description: data?.message || "أُرسل بريد جديد بكلمة مرور مؤقتة",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل إعادة الإرسال",
        description: error.message || "تعذر إعادة إرسال بيانات الدخول",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return apiRequest(`/api/admin/opinion-author-applications/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الرفض",
        description: "تم رفض الطلب",
      });
      setShowRejectDialog(false);
      setShowDetailsDialog(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/opinion-author-applications"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الرفض",
        description: error.message || "حدث خطأ أثناء رفض الطلب",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" data-testid="badge-status-pending"><Clock className="w-3 h-3 ml-1" />قيد المراجعة</Badge>;
      case "approved":
        return <Badge className="bg-green-500" data-testid="badge-status-approved"><CheckCircle className="w-3 h-3 ml-1" />مقبول</Badge>;
      case "rejected":
        return <Badge variant="destructive" data-testid="badge-status-rejected"><XCircle className="w-3 h-3 ml-1" />مرفوض</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCount = data?.applications?.filter(a => a.status === "pending").length || 0;
  const approvedCount = data?.applications?.filter(a => a.status === "approved").length || 0;
  const rejectedCount = data?.applications?.filter(a => a.status === "rejected").length || 0;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "تم النسخ",
      description: "تم نسخ النص للحافظة",
    });
  };

  const limit = 10;
  const totalPages = Math.ceil((data?.total || 0) / limit);

  return (
    <DashboardLayout>
    <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="px-4 pb-10 sm:px-6">
      <DashboardPageHeader
        icon={PenTool}
        title="طلبات كتّاب الرأي"
        description={<span data-testid="text-page-description">إدارة طلبات التسجيل ككاتب رأي</span>}
        titleTestId="text-page-title"
        actions={<Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 ml-2" />
          تحديث
        </Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/50 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-100/80 p-2 dark:bg-sky-950/40">
                <Users className="w-5 h-5 text-sky-700 dark:text-sky-300" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الطلبات</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-total-count">{(data?.total || 0).toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-amber-200/55 bg-gradient-to-br from-amber-50/45 via-card to-card shadow-sm dark:border-amber-900/35 dark:from-amber-950/15">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100/80 p-2 dark:bg-amber-950/40">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">قيد المراجعة</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-pending-count">{pendingCount.toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-emerald-200/55 bg-gradient-to-br from-emerald-50/50 via-card to-card shadow-sm dark:border-emerald-900/35 dark:from-emerald-950/15">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100/80 p-2 dark:bg-emerald-950/40">
                <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">مقبولة</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-approved-count">{approvedCount.toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-rose-200/55 bg-gradient-to-br from-rose-50/45 via-card to-card shadow-sm dark:border-rose-900/35 dark:from-rose-950/15">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-rose-100/80 p-2 dark:bg-rose-950/40">
                <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">مرفوضة</p>
                <p className="text-2xl font-bold tabular-nums" data-testid="text-rejected-count">{rejectedCount.toLocaleString("en-US")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
        <CardHeader className="flex flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-center">
          <CardTitle>قائمة الطلبات</CardTitle>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ApplicationStatus)}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue placeholder="تصفية حسب الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الطلبات</SelectItem>
              <SelectItem value="pending">قيد المراجعة</SelectItem>
              <SelectItem value="approved">مقبولة</SelectItem>
              <SelectItem value="rejected">مرفوضة</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : data?.applications?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-applications">
              لا توجد طلبات
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المتقدم</TableHead>
                  <TableHead className="text-right">البريد الإلكتروني</TableHead>
                  <TableHead className="text-right">التخصصات</TableHead>
                  <TableHead className="text-right">تاريخ التقديم</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.applications?.map((app) => (
                  <TableRow key={app.id} data-testid={`row-application-${app.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={app.profilePhotoUrl} alt={app.arabicName} />
                          <AvatarFallback>{app.arabicName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium" data-testid={`text-name-${app.id}`}>{app.arabicName}</p>
                          <p className="text-sm text-muted-foreground">{app.englishName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`text-email-${app.id}`}>{app.email}</TableCell>
                    <TableCell data-testid={`text-specializations-${app.id}`}>
                      {app.specializations || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {new Date(app.createdAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}
                    </TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setSelectedApplication(app);
                            setShowDetailsDialog(true);
                          }}
                          data-testid={`button-view-${app.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {app.status === "pending" && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => {
                                setSelectedApplication(app);
                                approveMutation.mutate(app.id);
                              }}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${app.id}`}
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => {
                                setSelectedApplication(app);
                                setShowRejectDialog(true);
                              }}
                              data-testid={`button-reject-${app.id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {app.status === "approved" && app.createdUserId && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => resendCredentialsMutation.mutate(app.id)}
                            disabled={resendCredentialsMutation.isPending}
                            data-testid={`button-resend-credentials-${app.id}`}
                          >
                            {resendCredentialsMutation.isPending ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Mail className="w-3 h-3" />
                            )}
                            إعادة إرسال الدخول
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t flex-wrap gap-2">
              <div className="text-sm text-muted-foreground tabular-nums">
                الصفحة {page.toLocaleString("en-US")} من {totalPages.toLocaleString("en-US")} (إجمالي {(data?.total || 0).toLocaleString("en-US")} طلب)
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronRight className="w-4 h-4" />
                  السابق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  data-testid="button-next-page"
                >
                  التالي
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل الطلب</DialogTitle>
          </DialogHeader>
          {selectedApplication && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-20 h-20">
                  <AvatarImage src={selectedApplication.profilePhotoUrl} alt={selectedApplication.arabicName} />
                  <AvatarFallback className="text-2xl">{selectedApplication.arabicName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold" data-testid="text-detail-name">{selectedApplication.arabicName}</h3>
                  <p className="text-muted-foreground">{selectedApplication.englishName}</p>
                  {getStatusBadge(selectedApplication.status)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                  <p className="font-medium" data-testid="text-detail-email">{selectedApplication.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                  <p className="font-medium" data-testid="text-detail-phone">{selectedApplication.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المدينة</p>
                  <p className="font-medium" data-testid="text-detail-city">{selectedApplication.city}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">المسمى الوظيفي</p>
                  <p className="font-medium" data-testid="text-detail-job">{selectedApplication.jobTitle}</p>
                </div>
                {selectedApplication.licenseNumber && (
                  <div>
                    <p className="text-sm text-muted-foreground">رقم الترخيص المهني</p>
                    <p className="font-medium" data-testid="text-detail-license-number">
                      {selectedApplication.licenseNumber}
                      {selectedApplication.licenseExpiresAt && (
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {" "}(ينتهي {new Date(selectedApplication.licenseExpiresAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")})
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {selectedApplication.licenseFileKey && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() =>
                      window.open(
                        apiUrl(`/api/admin/opinion-author-applications/${selectedApplication.id}/file/license`),
                        "_blank",
                        "noopener",
                      )
                    }
                    data-testid="button-download-license"
                  >
                    <BadgeCheck className="w-4 h-4" />
                    عرض الترخيص المهني
                  </Button>
                </div>
              )}

              {selectedApplication.specializations && (
                <div>
                  <p className="text-sm text-muted-foreground">التخصصات الكتابية</p>
                  <p className="font-medium" data-testid="text-detail-specializations">{selectedApplication.specializations}</p>
                </div>
              )}

              {selectedApplication.writingSamples && (
                <div>
                  <p className="text-sm text-muted-foreground">عينات الكتابة</p>
                  <div className="space-y-1" data-testid="text-detail-writing-samples">
                    {selectedApplication.writingSamples.split('\n').map((link, idx) => (
                      link.trim() && (
                        <a 
                          key={idx}
                          href={link.trim()} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {link.trim()}
                        </a>
                      )
                    ))}
                  </div>
                </div>
              )}

              {selectedApplication.bio && (
                <div>
                  <p className="text-sm text-muted-foreground">نبذة عنه</p>
                  <p className="font-medium" data-testid="text-detail-bio">{selectedApplication.bio}</p>
                </div>
              )}

              {selectedApplication.reviewNotes && (
                <div>
                  <p className="text-sm text-muted-foreground">ملاحظات المراجعة</p>
                  <p className="font-medium text-red-600" data-testid="text-detail-review-notes">{selectedApplication.reviewNotes}</p>
                </div>
              )}

              <div className="text-sm text-muted-foreground tabular-nums">
                تاريخ التقديم: {new Date(selectedApplication.createdAt).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            {selectedApplication?.status === "pending" && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  data-testid="button-dialog-reject"
                >
                  رفض الطلب
                </Button>
                <Button
                  onClick={() => selectedApplication && approveMutation.mutate(selectedApplication.id)}
                  disabled={approveMutation.isPending}
                  data-testid="button-dialog-approve"
                >
                  {approveMutation.isPending ? (
                    <>
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                      جاري الموافقة...
                    </>
                  ) : (
                    "قبول الطلب"
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رفض الطلب</DialogTitle>
            <DialogDescription>
              يرجى إدخال سبب رفض الطلب
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="سبب الرفض..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[100px]"
            data-testid="input-reject-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} data-testid="button-cancel-reject">
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedApplication && rejectReason) {
                  rejectMutation.mutate({ id: selectedApplication.id, reason: rejectReason });
                }
              }}
              disabled={!rejectReason || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الرفض...
                </>
              ) : (
                "تأكيد الرفض"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showApprovalResultDialog} onOpenChange={setShowApprovalResultDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              {credentialsDialogTitle}
            </DialogTitle>
          </DialogHeader>
          <Alert>
            <AlertTitle>
              {approvalResult?.isExistingUser ? "معلومات المستخدم" : "بيانات الدخول المؤقتة"}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-muted-foreground">البريد الإلكتروني:</span>
                <div className="flex items-center gap-2">
                  <code className="bg-muted px-2 py-1 rounded" data-testid="text-result-email">{approvalResult?.email}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(approvalResult?.email || "")}
                    data-testid="button-copy-email"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {approvalResult?.temporaryPassword && (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-muted-foreground">كلمة المرور المؤقتة:</span>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded" data-testid="text-result-password">{approvalResult?.temporaryPassword}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copyToClipboard(approvalResult?.temporaryPassword || "")}
                      data-testid="button-copy-password"
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            {approvalResult?.temporaryPassword
              ? "انسخ كلمة المرور وأرسلها للكاتب (واتساب إذا لم يصل البريد — شائع مع Yahoo). عند أول دخول سيُطلب تغيير كلمة المرور. صفحة الدخول: sabq.org/login"
              : approvalResult?.isExistingUser
                ? "المستخدم موجود بالفعل في النظام. استخدم «إعادة إرسال الدخول» لتعيين كلمة مرور مؤقتة جديدة."
                : "يرجى إرسال بيانات الدخول هذه للكاتب."}
          </p>
          <DialogFooter>
            <Button onClick={() => setShowApprovalResultDialog(false)} data-testid="button-close-approval">
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
    </DashboardLayout>
  );
}
