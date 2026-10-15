import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { cn } from "@/lib/utils";
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
  Search,
  MapPin,
  Phone,
  Briefcase,
  ShieldAlert,
  AlertTriangle,
  Calendar,
  FileText,
  Link2,
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
type LicenseStatusFilter = "all" | "valid" | "expired" | "missing";

interface ApplicationsResponse {
  applications: OpinionAuthorApplicationWithDetails[];
  total: number;
  counts?: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
}

type ApplicationLicenseInfo = {
  state: "valid" | "expired" | "expiring_soon" | "missing";
  hasLicenseData: boolean;
  hasFile: boolean;
  number: string | null;
  expiresAt: string | null;
  formattedExpiry: string | null;
};

function getApplicationLicenseInfo(
  app: Pick<
    OpinionAuthorApplicationWithDetails,
    "licenseNumber" | "licenseExpiresAt" | "licenseFileKey"
  >,
): ApplicationLicenseInfo {
  const number = app.licenseNumber?.trim() || null;
  const hasFile = Boolean(app.licenseFileKey);
  const hasLicenseData = Boolean(number || hasFile);
  const rawExpiry = app.licenseExpiresAt ? String(app.licenseExpiresAt) : null;

  if (!hasLicenseData && !rawExpiry) {
    return {
      state: "missing",
      hasLicenseData: false,
      hasFile: false,
      number: null,
      expiresAt: null,
      formattedExpiry: null,
    };
  }

  if (rawExpiry) {
    const expiryDate = new Date(rawExpiry);
    const expiryMs = expiryDate.getTime();
    if (!Number.isNaN(expiryMs)) {
      const formattedExpiry = expiryDate.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn");
      const now = Date.now();
      if (expiryMs < now) {
        return {
          state: "expired",
          hasLicenseData: true,
          hasFile,
          number,
          expiresAt: rawExpiry,
          formattedExpiry,
        };
      }
      const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
      if (expiryMs - now <= sixtyDaysMs) {
        return {
          state: "expiring_soon",
          hasLicenseData: true,
          hasFile,
          number,
          expiresAt: rawExpiry,
          formattedExpiry,
        };
      }
      return {
        state: "valid",
        hasLicenseData: true,
        hasFile,
        number,
        expiresAt: rawExpiry,
        formattedExpiry,
      };
    }
  }

  // Per docs/systems/editorial/SYSTEM.md: missing or invalid expiry date is not valid ("expired")
  return {
    state: "expired",
    hasLicenseData: true,
    hasFile,
    number,
    expiresAt: null,
    formattedExpiry: null,
  };
}

function ApplicationLicenseBadge({
  app,
  onOpenLicenseFile,
}: {
  app: OpinionAuthorApplicationWithDetails;
  onOpenLicenseFile?: () => void;
}) {
  const info = getApplicationLicenseInfo(app);

  if (info.state === "missing") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs"
      >
        <AlertTriangle className="h-3 w-3" />
        بلا ترخيص
      </Badge>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1">
        {info.state === "expired" ? (
          <Badge
            variant="outline"
            className="gap-1 border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300 text-xs"
          >
            <ShieldAlert className="h-3 w-3" />
            {info.formattedExpiry ? "ترخيص منتهٍ" : "ترخيص غير سارٍ"}
          </Badge>
        ) : info.state === "expiring_soon" ? (
          <Badge
            variant="outline"
            className="gap-1 border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs"
          >
            <Clock className="h-3 w-3" />
            ينتهي قريباً
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 text-xs"
          >
            <BadgeCheck className="h-3 w-3" />
            ترخيص مرفق
          </Badge>
        )}

        {info.hasFile && onOpenLicenseFile && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="no-min-touch-size h-6 w-6 rounded-lg text-muted-foreground hover:text-foreground"
            title="عرض ملف الترخيص المهني"
            onClick={(e) => {
              e.stopPropagation();
              onOpenLicenseFile();
            }}
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
        {info.number && (
          <span dir="ltr" className="font-medium text-foreground/80">
            #{info.number}
          </span>
        )}
        {info.formattedExpiry ? (
          <span
            className={cn(
              info.state === "expired" && "font-semibold text-rose-600 dark:text-rose-400",
            )}
          >
            حتى {info.formattedExpiry}
          </span>
        ) : (
          <span className="font-semibold text-rose-600 dark:text-rose-400">
            بلا تاريخ انتهاء (غير سارٍ)
          </span>
        )}
      </div>
    </div>
  );
}

export default function OpinionAuthorApplications() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus>("all");
  const [licenseFilter, setLicenseFilter] = useState<LicenseStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedApplication, setSelectedApplication] =
    useState<OpinionAuthorApplicationWithDetails | null>(null);
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

  const { data, isLoading, isFetching, refetch } = useQuery<ApplicationsResponse>({
    queryKey: ["/api/admin/opinion-author-applications", statusFilter, page],
    queryFn: () =>
      fetch(
        apiUrl(
          `/api/admin/opinion-author-applications?status=${statusFilter}&page=${page}&limit=10`,
        ),
      ).then((res) => res.json()),
  });

  const applications = useMemo(
    () => (Array.isArray(data?.applications) ? data.applications : []),
    [data?.applications],
  );

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/admin/opinion-author-applications/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ notes: "" }),
      });
      return response;
    },
    onSuccess: (resData) => {
      if (resData.emailSent === false) {
        toast({
          variant: "destructive",
          title: "تمت الموافقة لكن البريد لم يُرسَل",
          description:
            resData.emailError ||
            resData.message ||
            "استخدم «إعادة إرسال الدخول» من قائمة الطلبات",
        });
      } else {
        toast({
          title: "تمت الموافقة",
          description:
            resData.message ||
            (resData.isExistingUser
              ? "تم قبول الطلب وإرسال بريد الدخول"
              : "تم قبول الطلب وإنشاء حساب كاتب الرأي"),
        });
      }
      setCredentialsDialogTitle("تمت الموافقة بنجاح");
      setApprovalResult({
        temporaryPassword: resData.temporaryPassword || "",
        email: resData.user?.email || "",
        isExistingUser: resData.isExistingUser,
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
    onSuccess: (resData: any) => {
      if (resData?.temporaryPassword) {
        setCredentialsDialogTitle(
          resData.emailSent === false
            ? "كلمة مرور جديدة — أرسلها يدوياً"
            : "بيانات الدخول الجديدة",
        );
        setApprovalResult({
          temporaryPassword: resData.temporaryPassword,
          email: resData.email || "",
          isExistingUser: false,
        });
        setShowApprovalResultDialog(true);
      }
      toast({
        variant: resData?.emailSent === false ? "destructive" : "default",
        title:
          resData?.emailSent === false
            ? "تم التعيين — البريد لم يُرسَل"
            : "تم إرسال بيانات الدخول",
        description: resData?.message || "أُرسل بريد جديد بكلمة مرور مؤقتة",
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

  const getStatusBadge = (status: string, testIdSuffix?: string) => {
    const suffix = testIdSuffix ? `-${testIdSuffix}` : "";
    switch (status) {
      case "pending":
        return (
          <Badge
            variant="secondary"
            className="gap-1 border border-amber-500/25 bg-amber-500/15 text-amber-800 dark:text-amber-300"
            data-testid={`badge-status-pending${suffix}`}
          >
            <Clock className="w-3 h-3" />
            قيد المراجعة
          </Badge>
        );
      case "approved":
        return (
          <Badge
            variant="outline"
            className="gap-1 border-emerald-500/25 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
            data-testid={`badge-status-approved${suffix}`}
          >
            <CheckCircle className="w-3 h-3" />
            مقبول
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="destructive"
            className="gap-1"
            data-testid={`badge-status-rejected${suffix}`}
          >
            <XCircle className="w-3 h-3" />
            مرفوض
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingCount =
    data?.counts?.pending ?? applications.filter((a) => a.status === "pending").length;
  const approvedCount =
    data?.counts?.approved ?? applications.filter((a) => a.status === "approved").length;
  const rejectedCount =
    data?.counts?.rejected ?? applications.filter((a) => a.status === "rejected").length;
  const totalCount =
    data?.counts?.total ??
    data?.total ??
    (pendingCount + approvedCount + rejectedCount || applications.length);

  const licenseCounts = useMemo(() => {
    let valid = 0;
    let expired = 0;
    let missing = 0;
    for (const app of applications) {
      const info = getApplicationLicenseInfo(app);
      if (info.state === "missing") missing += 1;
      else if (info.state === "expired") expired += 1;
      else valid += 1;
    }
    return { valid, expired, missing };
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return applications.filter((app) => {
      if (licenseFilter !== "all") {
        const info = getApplicationLicenseInfo(app);
        if (licenseFilter === "valid" && info.state !== "valid" && info.state !== "expiring_soon") {
          return false;
        }
        if (licenseFilter === "expired" && info.state !== "expired") {
          return false;
        }
        if (licenseFilter === "missing" && info.state !== "missing") {
          return false;
        }
      }

      if (!q) return true;
      return (
        (app.arabicName?.toLowerCase().includes(q) ?? false) ||
        (app.englishName?.toLowerCase().includes(q) ?? false) ||
        (app.email?.toLowerCase().includes(q) ?? false) ||
        (app.phone?.toLowerCase().includes(q) ?? false) ||
        (app.city?.toLowerCase().includes(q) ?? false) ||
        (app.specializations?.toLowerCase().includes(q) ?? false) ||
        (app.licenseNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [applications, licenseFilter, searchQuery]);

  const hasActiveFilters =
    statusFilter !== "all" || licenseFilter !== "all" || Boolean(searchQuery.trim());

  const handleStatusChange = (nextStatus: ApplicationStatus) => {
    setStatusFilter(nextStatus);
    setPage(1);
  };

  const resetAllFilters = () => {
    setStatusFilter("all");
    setLicenseFilter("all");
    setSearchQuery("");
    setPage(1);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "تم النسخ",
      description: "تم نسخ النص للحافظة",
    });
  };

  const registerUrl = `${window.location.origin}/opinion-author/register`;

  const copyRegisterLink = () => {
    navigator.clipboard.writeText(registerUrl);
    toast({
      title: "تم نسخ رابط التقديم",
      description: "أرسل الرابط لمن يرغب بالتقدم ككاتب رأي — يفتح نموذج التقديم مباشرة",
    });
  };

  const openLicenseFile = (id: string) => {
    window.open(
      apiUrl(`/api/admin/opinion-author-applications/${id}/file/license`),
      "_blank",
      "noopener",
    );
  };

  const limit = 10;
  const totalPages = Math.ceil((data?.total || 0) / limit);

  const selectedLicenseInfo = selectedApplication
    ? getApplicationLicenseInfo(selectedApplication)
    : null;

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        <div dir="rtl" className="space-y-6">
          <DashboardPageHeader
            icon={PenTool}
            title="طلبات كتّاب الرأي"
            description={
              <span data-testid="text-page-description">
                إدارة ومراجعة طلبات التسجيل ككاتب رأي والتحقق من التراخيص الإعلامية وعينات الكتابة
              </span>
            }
            titleTestId="text-page-title"
            actions={
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Badge
                  variant="outline"
                  className="rounded-xl border-primary/25 bg-primary/5 px-3 py-1 text-xs font-semibold tabular-nums text-foreground"
                >
                  {totalCount.toLocaleString("en-US")} طلب ·{" "}
                  <span className="text-amber-600 dark:text-amber-400">
                    {pendingCount.toLocaleString("en-US")} قيد المراجعة
                  </span>
                </Badge>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={resetAllFilters}
                    className="no-min-touch-size h-9 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                    data-testid="button-reset-filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>مسح الفلاتر</span>
                  </Button>
                )}
                <Button
                  size="sm"
                  className="no-min-touch-size h-9 gap-1.5 rounded-xl text-xs font-semibold"
                  onClick={copyRegisterLink}
                  data-testid="button-copy-register-link"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span>نسخ رابط التقديم</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                  onClick={() => window.open(registerUrl, "_blank", "noopener")}
                  data-testid="button-open-register-link"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>فتح النموذج</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                  onClick={() => void refetch()}
                  disabled={isFetching}
                  data-testid="button-refresh"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                  <span>تحديث</span>
                </Button>
              </div>
            }
          />

          {/* Interactive KPI Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {/* 1. إجمالي الطلبات */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-border/80 bg-gradient-to-br from-primary/[0.06] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                statusFilter === "all" && licenseFilter === "all" && "ring-2 ring-primary/40",
              )}
              onClick={() => {
                handleStatusChange("all");
                setLicenseFilter("all");
              }}
              data-testid="kpi-total"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    إجمالي الطلبات
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 transition-transform group-hover:scale-105">
                    <Users className="h-4 w-4" />
                  </span>
                </div>
                <div
                  className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-foreground"
                  data-testid="text-total-count"
                >
                  {totalCount.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>في هذه الصفحة</span>
                  <span className="font-bold tabular-nums text-foreground">
                    {applications.length.toLocaleString("en-US")}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 2. قيد المراجعة */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                statusFilter === "pending" && "ring-2 ring-amber-500/50",
              )}
              onClick={() => handleStatusChange("pending")}
              data-testid="kpi-pending"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    قيد المراجعة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 transition-transform group-hover:scale-105">
                    <Clock className="h-4 w-4" />
                  </span>
                </div>
                <div
                  className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-amber-700 dark:text-amber-300"
                  data-testid="text-pending-count"
                >
                  {pendingCount.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>بانتظار قرار الاعتماد</span>
                  <span className="font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    {totalCount > 0 ? `${Math.round((pendingCount / totalCount) * 100)}%` : "0%"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 3. مقبولة */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                statusFilter === "approved" && "ring-2 ring-emerald-500/50",
              )}
              onClick={() => handleStatusChange("approved")}
              data-testid="kpi-approved"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    مقبولة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-transform group-hover:scale-105">
                    <CheckCircle className="h-4 w-4" />
                  </span>
                </div>
                <div
                  className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300"
                  data-testid="text-approved-count"
                >
                  {approvedCount.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>تم تفعيل حساباتهم</span>
                  <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {totalCount > 0 ? `${Math.round((approvedCount / totalCount) * 100)}%` : "0%"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 4. مرفوضة */}
            <Card
              className={cn(
                "cursor-pointer rounded-2xl border-rose-500/25 bg-gradient-to-br from-rose-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                statusFilter === "rejected" && "ring-2 ring-rose-500/50",
              )}
              onClick={() => handleStatusChange("rejected")}
              data-testid="kpi-rejected"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    مرفوضة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-transform group-hover:scale-105">
                    <XCircle className="h-4 w-4" />
                  </span>
                </div>
                <div
                  className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-rose-600 dark:text-rose-400"
                  data-testid="text-rejected-count"
                >
                  {rejectedCount.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <span>نسبة الرفض</span>
                  <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                    {totalCount > 0 ? `${Math.round((rejectedCount / totalCount) * 100)}%` : "0%"}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* 5. التراخيص المهنية في الصفحة */}
            <Card
              className={cn(
                "col-span-2 sm:col-span-1 cursor-pointer rounded-2xl border-sky-500/25 bg-gradient-to-br from-sky-500/[0.07] via-card to-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md group",
                licenseFilter !== "all" && "ring-2 ring-sky-500/50",
              )}
              onClick={() =>
                setLicenseFilter((prev) => (prev === "valid" ? "all" : "valid"))
              }
              data-testid="kpi-licensed"
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
                    تراخيص مرفقة سارية
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/20 transition-transform group-hover:scale-105">
                    <BadgeCheck className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl sm:text-3xl font-black tabular-nums tracking-tight text-sky-700 dark:text-sky-300">
                  {licenseCounts.valid.toLocaleString("en-US")}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("expired");
                    }}
                    className="no-min-touch-size font-medium text-rose-600 hover:underline dark:text-rose-400"
                  >
                    منتهٍ: <b className="tabular-nums">{licenseCounts.expired}</b>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLicenseFilter("missing");
                    }}
                    className="no-min-touch-size font-medium text-amber-600 hover:underline dark:text-amber-400"
                  >
                    بلا ترخيص: <b className="tabular-nums">{licenseCounts.missing}</b>
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Applications Directory Card */}
          <Card className="rounded-2xl border-border/80 shadow-xs overflow-hidden">
            <CardHeader className="space-y-3.5 border-b border-border/60 bg-card pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold sm:text-lg">
                    <span>قائمة الطلبات</span>
                    <Badge
                      variant="outline"
                      className="py-0.5 text-xs font-bold tabular-nums text-muted-foreground"
                      data-testid="badge-filtered-count"
                    >
                      {filteredApplications.length.toLocaleString("en-US")}
                    </Badge>
                  </CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    استعراض طلبات كتّاب الرأي، التخصصات الكتابية، والترخيص المهني
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="بحث بالاسم أو البريد أو التخصص أو المدينة أو الترخيص..."
                      className="h-9 rounded-xl pr-9 pl-8 text-xs"
                      data-testid="input-applications-search"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        title="مسح البحث"
                        data-testid="button-clear-search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Select status filter (kept for test compatibility) */}
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => handleStatusChange(v as ApplicationStatus)}
                  >
                    <SelectTrigger
                      className="h-9 w-full sm:w-[170px] rounded-xl text-xs"
                      data-testid="select-status-filter"
                    >
                      <SelectValue placeholder="تصفية حسب الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الطلبات</SelectItem>
                      <SelectItem value="pending">قيد المراجعة</SelectItem>
                      <SelectItem value="approved">مقبولة</SelectItem>
                      <SelectItem value="rejected">مرفوضة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quick Filter Pills: Status + Media License */}
              <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1 text-xs font-semibold text-muted-foreground">الحالة:</span>
                  {(
                    [
                      { id: "all" as const, label: `الكل (${totalCount})` },
                      { id: "pending" as const, label: `قيد المراجعة (${pendingCount})` },
                      { id: "approved" as const, label: `مقبول (${approvedCount})` },
                      { id: "rejected" as const, label: `مرفوض (${rejectedCount})` },
                    ] as const
                  ).map((pill) => (
                    <Button
                      key={pill.id}
                      type="button"
                      size="sm"
                      variant={statusFilter === pill.id ? "default" : "outline"}
                      onClick={() => handleStatusChange(pill.id)}
                      className="no-min-touch-size h-8 rounded-xl px-3 text-xs font-semibold"
                      data-testid={`filter-status-${pill.id}`}
                    >
                      {pill.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="ml-1 text-xs font-semibold text-muted-foreground">
                    الترخيص المهني:
                  </span>
                  {(
                    [
                      { id: "all" as const, label: "الكل" },
                      { id: "valid" as const, label: `مرفق ساري (${licenseCounts.valid})` },
                      { id: "expired" as const, label: `منتهٍ (${licenseCounts.expired})` },
                      { id: "missing" as const, label: `بلا ترخيص (${licenseCounts.missing})` },
                    ] as const
                  ).map((pill) => (
                    <Button
                      key={pill.id}
                      type="button"
                      size="sm"
                      variant={licenseFilter === pill.id ? "default" : "outline"}
                      onClick={() => setLicenseFilter(pill.id)}
                      className="no-min-touch-size h-8 rounded-xl px-3 text-xs font-semibold"
                      data-testid={`filter-license-${pill.id}`}
                    >
                      {pill.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
              ) : filteredApplications.length === 0 ? (
                <div
                  className="space-y-2 py-14 text-center text-muted-foreground"
                  data-testid="text-no-applications"
                >
                  <p className="text-sm">
                    {applications.length === 0
                      ? "لا توجد طلبات"
                      : "لا توجد طلبات مطابقة للبحث أو الفلتر المحدد"}
                  </p>
                  {hasActiveFilters && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size rounded-xl text-xs"
                      onClick={resetAllFilters}
                    >
                      إعادة ضبط الفلاتر
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 text-xs">
                          <TableHead className="text-right font-bold">المتقدم</TableHead>
                          <TableHead className="text-right font-bold">معلومات التواصل</TableHead>
                          <TableHead className="text-right font-bold">التخصصات والمدينة</TableHead>
                          <TableHead className="text-right font-bold">الترخيص المهني</TableHead>
                          <TableHead className="text-right font-bold">تاريخ التقديم</TableHead>
                          <TableHead className="text-right font-bold">الحالة</TableHead>
                          <TableHead className="text-right font-bold">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredApplications.map((app) => (
                          <TableRow
                            key={app.id}
                            className="hover:bg-muted/30 transition-colors"
                            data-testid={`row-application-${app.id}`}
                          >
                            <TableCell className="py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/60">
                                  <AvatarImage
                                    src={app.profilePhotoUrl}
                                    alt={app.arabicName}
                                  />
                                  <AvatarFallback className="bg-primary/10 font-bold text-primary">
                                    {app.arabicName?.charAt(0) || "ك"}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p
                                      className="font-bold text-foreground"
                                      data-testid={`text-name-${app.id}`}
                                    >
                                      {app.arabicName}
                                    </p>
                                    {app.jobTitle && (
                                      <Badge
                                        variant="secondary"
                                        className="gap-1 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                      >
                                        <Briefcase className="h-2.5 w-2.5 opacity-70" />
                                        {app.jobTitle}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {app.englishName}
                                  </p>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="py-3.5">
                              <div className="space-y-1 text-xs">
                                <div
                                  className="flex items-center gap-1.5 font-medium text-foreground"
                                  data-testid={`text-email-${app.id}`}
                                >
                                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  <span dir="ltr" className="truncate max-w-[200px]">
                                    {app.email}
                                  </span>
                                </div>
                                {app.phone && (
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Phone className="h-3 w-3 shrink-0 opacity-70" />
                                    <span dir="ltr" className="tabular-nums">
                                      {app.phone}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </TableCell>

                            <TableCell
                              className="py-3.5 max-w-[220px]"
                              data-testid={`text-specializations-${app.id}`}
                            >
                              <div className="space-y-1 text-xs">
                                <p className="font-medium text-foreground line-clamp-2">
                                  {app.specializations || (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </p>
                                {app.city && (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    {app.city}
                                  </span>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="py-3.5">
                              <ApplicationLicenseBadge
                                app={app}
                                onOpenLicenseFile={
                                  app.licenseFileKey ? () => openLicenseFile(app.id) : undefined
                                }
                              />
                            </TableCell>

                            <TableCell className="py-3.5 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 opacity-60" />
                                {new Date(app.createdAt).toLocaleDateString(
                                  "ar-SA-u-ca-gregory-nu-latn",
                                )}
                              </span>
                            </TableCell>

                            <TableCell className="py-3.5">{getStatusBadge(app.status)}</TableCell>

                            <TableCell className="py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="no-min-touch-size h-8 gap-1.5 rounded-xl px-2.5 text-xs"
                                  onClick={() => {
                                    setSelectedApplication(app);
                                    setShowDetailsDialog(true);
                                  }}
                                  data-testid={`button-view-${app.id}`}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>التفاصيل</span>
                                </Button>
                                {app.status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="no-min-touch-size h-8 gap-1 rounded-xl border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                                      onClick={() => {
                                        setSelectedApplication(app);
                                        approveMutation.mutate(app.id);
                                      }}
                                      disabled={approveMutation.isPending}
                                      data-testid={`button-approve-${app.id}`}
                                    >
                                      {approveMutation.isPending &&
                                      selectedApplication?.id === app.id ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5" />
                                      )}
                                      <span>قبول</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="no-min-touch-size h-8 gap-1 rounded-xl border-rose-500/30 bg-rose-500/10 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
                                      onClick={() => {
                                        setSelectedApplication(app);
                                        setShowRejectDialog(true);
                                      }}
                                      data-testid={`button-reject-${app.id}`}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                      <span>رفض</span>
                                    </Button>
                                  </>
                                )}
                                {app.status === "approved" && app.createdUserId && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="no-min-touch-size h-8 gap-1 rounded-xl px-2.5 text-xs"
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

                  {/* Mobile Stacked Cards */}
                  <div className="space-y-3 p-3 md:hidden">
                    {filteredApplications.map((app) => (
                      <div
                        key={app.id}
                        className="rounded-2xl border border-border/80 bg-card p-4 shadow-xs space-y-3"
                        data-testid={`row-application-mobile-${app.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar className="h-10 w-10 shrink-0 ring-2 ring-border/60">
                              <AvatarImage src={app.profilePhotoUrl} alt={app.arabicName} />
                              <AvatarFallback className="bg-primary/10 font-bold text-primary">
                                {app.arabicName?.charAt(0) || "ك"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p
                                className="truncate font-bold text-foreground"
                                data-testid={`text-name-mobile-${app.id}`}
                              >
                                {app.arabicName}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {app.englishName}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0">{getStatusBadge(app.status, `mobile-${app.id}`)}</div>
                        </div>

                        <div className="grid grid-cols-1 gap-1.5 border-y border-border/50 py-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">البريد:</span>
                            <span
                              dir="ltr"
                              className="truncate font-medium text-foreground max-w-[210px]"
                              data-testid={`text-email-mobile-${app.id}`}
                            >
                              {app.email}
                            </span>
                          </div>
                          {app.phone && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">الهاتف:</span>
                              <span dir="ltr" className="font-medium tabular-nums">
                                {app.phone}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">التخصصات:</span>
                            <span
                              className="truncate font-medium text-foreground max-w-[200px]"
                              data-testid={`text-specializations-mobile-${app.id}`}
                            >
                              {app.specializations || "—"}
                            </span>
                          </div>
                          {app.city && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">المدينة:</span>
                              <span className="font-medium text-foreground">{app.city}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">الترخيص المهني:</span>
                            <ApplicationLicenseBadge
                              app={app}
                              onOpenLicenseFile={
                                app.licenseFileKey ? () => openLicenseFile(app.id) : undefined
                              }
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-muted-foreground">تاريخ التقديم:</span>
                            <span className="tabular-nums text-muted-foreground">
                              {new Date(app.createdAt).toLocaleDateString(
                                "ar-SA-u-ca-gregory-nu-latn",
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="no-min-touch-size h-8 flex-1 gap-1.5 rounded-xl text-xs"
                            onClick={() => {
                              setSelectedApplication(app);
                              setShowDetailsDialog(true);
                            }}
                            data-testid={`button-view-mobile-${app.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>التفاصيل</span>
                          </Button>
                          {app.status === "pending" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="no-min-touch-size h-8 flex-1 gap-1 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                                onClick={() => {
                                  setSelectedApplication(app);
                                  approveMutation.mutate(app.id);
                                }}
                                disabled={approveMutation.isPending}
                                data-testid={`button-approve-mobile-${app.id}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>قبول</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="no-min-touch-size h-8 flex-1 gap-1 rounded-xl border-rose-500/30 bg-rose-500/10 text-xs font-semibold text-rose-700 dark:text-rose-300"
                                onClick={() => {
                                  setSelectedApplication(app);
                                  setShowRejectDialog(true);
                                }}
                                data-testid={`button-reject-mobile-${app.id}`}
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>رفض</span>
                              </Button>
                            </>
                          )}
                          {app.status === "approved" && app.createdUserId && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="no-min-touch-size h-8 w-full gap-1.5 rounded-xl text-xs"
                              onClick={() => resendCredentialsMutation.mutate(app.id)}
                              disabled={resendCredentialsMutation.isPending}
                              data-testid={`button-resend-credentials-mobile-${app.id}`}
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
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-3.5">
                  <div className="text-xs sm:text-sm text-muted-foreground tabular-nums">
                    الصفحة {page.toLocaleString("en-US")} من{" "}
                    {totalPages.toLocaleString("en-US")} (إجمالي{" "}
                    {(data?.total || 0).toLocaleString("en-US")} طلب)
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size h-8 rounded-xl text-xs"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronRight className="w-4 h-4" />
                      السابق
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size h-8 rounded-xl text-xs"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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

          {/* Application Details Dialog */}
          <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-lg font-bold">تفاصيل طلب كاتب الرأي</DialogTitle>
                <DialogDescription>
                  مراجعة البيانات الشخصية والترخيص المهني وعينات الكتابة قبل اتخاذ القرار
                </DialogDescription>
              </DialogHeader>
              {selectedApplication && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <Avatar className="w-16 h-16 sm:w-20 sm:h-20 ring-2 ring-border">
                      <AvatarImage
                        src={selectedApplication.profilePhotoUrl}
                        alt={selectedApplication.arabicName}
                      />
                      <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
                        {selectedApplication.arabicName?.charAt(0) || "ك"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-lg sm:text-xl font-bold" data-testid="text-detail-name">
                          {selectedApplication.arabicName}
                        </h3>
                        {getStatusBadge(selectedApplication.status, "detail")}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {selectedApplication.englishName}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid="text-detail-job">
                        {selectedApplication.jobTitle}
                      </p>
                    </div>
                  </div>

                  {selectedApplication.status === "pending" &&
                    selectedLicenseInfo?.state === "expired" && (
                      <Alert variant="destructive">
                        <ShieldAlert className="h-4 w-4" />
                        <AlertTitle>الترخيص المهني المرفق منتهي الصلاحية</AlertTitle>
                        <AlertDescription>
                          يرفض النظام قبول الطلب إذا كان الترخيص المهني منتهياً. يرجى التواصل مع
                          المتقدم لتجديد ترخيصه أو رفض الطلب مع توضيح السبب.
                        </AlertDescription>
                      </Alert>
                    )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-border/60 p-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">البريد الإلكتروني</p>
                      <p
                        className="font-medium break-all"
                        dir="ltr"
                        data-testid="text-detail-email"
                      >
                        {selectedApplication.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">رقم الهاتف</p>
                      <p
                        className="font-medium tabular-nums"
                        dir="ltr"
                        data-testid="text-detail-phone"
                      >
                        {selectedApplication.phone}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">المدينة</p>
                      <p className="font-medium" data-testid="text-detail-city">
                        {selectedApplication.city}
                      </p>
                    </div>
                    {selectedApplication.licenseNumber && (
                      <div>
                        <p className="text-xs text-muted-foreground">رقم الترخيص المهني</p>
                        <p className="font-medium" data-testid="text-detail-license-number">
                          {selectedApplication.licenseNumber}
                          {selectedApplication.licenseExpiresAt && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {" "}
                              (ينتهي{" "}
                              {new Date(
                                selectedApplication.licenseExpiresAt,
                              ).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}
                              )
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
                        className="gap-2 rounded-xl"
                        onClick={() => openLicenseFile(selectedApplication.id)}
                        data-testid="button-download-license"
                      >
                        <BadgeCheck className="w-4 h-4 text-primary" />
                        عرض الترخيص المهني
                      </Button>
                    </div>
                  )}

                  {selectedApplication.specializations && (
                    <div className="rounded-2xl border border-border/60 p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">
                        التخصصات الكتابية
                      </p>
                      <p
                        className="text-sm font-medium"
                        data-testid="text-detail-specializations"
                      >
                        {selectedApplication.specializations}
                      </p>
                    </div>
                  )}

                  {selectedApplication.writingSamples && (
                    <div className="rounded-2xl border border-border/60 p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        عينات الكتابة
                      </p>
                      <div className="space-y-1.5" data-testid="text-detail-writing-samples">
                        {selectedApplication.writingSamples.split("\n").map(
                          (link, idx) =>
                            link.trim() && (
                              <a
                                key={idx}
                                href={link.trim()}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate"
                                dir="ltr"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{link.trim()}</span>
                              </a>
                            ),
                        )}
                      </div>
                    </div>
                  )}

                  {selectedApplication.bio && (
                    <div className="rounded-2xl border border-border/60 p-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-1">نبذة عنه</p>
                      <p
                        className="text-sm leading-relaxed font-medium"
                        data-testid="text-detail-bio"
                      >
                        {selectedApplication.bio}
                      </p>
                    </div>
                  )}

                  {selectedApplication.reviewNotes && (
                    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
                      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">
                        ملاحظات المراجعة
                      </p>
                      <p
                        className="text-sm font-medium text-rose-700 dark:text-rose-300"
                        data-testid="text-detail-review-notes"
                      >
                        {selectedApplication.reviewNotes}
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground tabular-nums">
                    تاريخ التقديم:{" "}
                    {new Date(selectedApplication.createdAt).toLocaleDateString(
                      "ar-SA-u-ca-gregory-nu-latn",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    )}
                  </div>
                </div>
              )}
              <DialogFooter className="flex flex-wrap gap-2">
                {selectedApplication?.status === "pending" && (
                  <>
                    <Button
                      variant="destructive"
                      className="rounded-xl"
                      onClick={() => setShowRejectDialog(true)}
                      data-testid="button-dialog-reject"
                    >
                      رفض الطلب
                    </Button>
                    <Button
                      className="rounded-xl"
                      onClick={() =>
                        selectedApplication && approveMutation.mutate(selectedApplication.id)
                      }
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

          {/* Reject Confirmation Dialog */}
          <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
            <DialogContent className="rounded-2xl" dir="rtl">
              <DialogHeader>
                <DialogTitle>رفض الطلب</DialogTitle>
                <DialogDescription>
                  يرجى إدخال سبب رفض طلب {selectedApplication?.arabicName || "المتقدم"}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                placeholder="سبب الرفض..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="min-h-[100px] rounded-xl"
                data-testid="input-reject-reason"
              />
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setShowRejectDialog(false)}
                  data-testid="button-cancel-reject"
                >
                  إلغاء
                </Button>
                <Button
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => {
                    if (selectedApplication && rejectReason) {
                      rejectMutation.mutate({
                        id: selectedApplication.id,
                        reason: rejectReason,
                      });
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

          {/* Approval Result Dialog */}
          <Dialog open={showApprovalResultDialog} onOpenChange={setShowApprovalResultDialog}>
            <DialogContent className="rounded-2xl" dir="rtl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
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
                      <code
                        className="bg-muted px-2 py-1 rounded"
                        data-testid="text-result-email"
                      >
                        {approvalResult?.email}
                      </code>
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
                        <code
                          className="bg-muted px-2 py-1 rounded"
                          data-testid="text-result-password"
                        >
                          {approvalResult?.temporaryPassword}
                        </code>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            copyToClipboard(approvalResult?.temporaryPassword || "")
                          }
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
                <Button
                  className="rounded-xl"
                  onClick={() => setShowApprovalResultDialog(false)}
                  data-testid="button-close-approval"
                >
                  إغلاق
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

