// صفحة «النشر الاجتماعي» — تصميم تفاعلي عصري لبطاقات التغريدات وسجل المنشورات:
// بطاقات اجتماعية بهوية X أنيقة، إبراز الهاشتاقات والروابط، نسخ فوري، معاينة صور احترافية، وبحث حي وسريع.
// المنطق والصلاحيات والـ APIs كما هي. البوابة: social_publish.view.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  ListTree,
  Loader2,
  Newspaper,
  PenSquare,
  RefreshCcw,
  Search,
  Send,
  Share2,
  Sparkles,
  Unlink,
  User,
  Video,
  X as XIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { fmtRelativeToNow, fmtSocialDateTime } from "@/components/social/socialFormat";
import { ComposeTweetDialog } from "@/components/social/ComposeTweetDialog";
import { validateXPostText, X_MAX_WEIGHTED_LENGTH, xWeightedLength } from "@shared/socialPostText";
import { cn } from "@/lib/utils";

interface SafeAccount {
  id: string;
  platform: string;
  handle: string | null;
  displayName: string | null;
  status: string;
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
}

interface SocialPostRow {
  id: string;
  articleId: string | null;
  articleTitle?: string | null;
  articleImageUrl?: string | null;
  createdByName?: string | null;
  publishedByName?: string | null;
  isAuthorProposal?: boolean;
  /** اسم الوكالة لتغريدة طلبتها وكالة لخبرها */
  agencyName?: string | null;
  /** الموعد الذي تقترحه الوكالة وهي تنتظر الموافقة */
  requestedAt?: string | null;
  status: string;
  text: string;
  imageUrl: string | null;
  mediaKind?: "none" | "image" | "video" | string | null;
  mediaUrls?: string[] | null;
  linkUrl?: string | null;
  attempts: number;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  externalPostUrl: string | null;
  lastError: string | null;
}

interface PublishStats {
  total: number;
  publishedToday: number;
  scheduledUpcoming: number;
  failed: number;
  pendingDrafts: number;
  pendingAuthorProposals: number;
  pendingAgencyProposals?: number;
}

interface AttemptRow {
  id: string;
  phase: string;
  outcome: string;
  httpStatus: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

type StatusFilter = "all" | "agency" | "draft" | "scheduled" | "published" | "failed";

/** datetime-local بالتوقيت المحلي للمتصفح */
function localInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_META: Record<
  string,
  { label: string; pill: string; strip: string; icon: typeof CheckCircle2 }
> = {
  draft: {
    label: "مسودة",
    pill: "bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25",
    strip: "bg-slate-400",
    icon: Edit3,
  },
  scheduled: {
    label: "مجدول",
    pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    strip: "bg-amber-500",
    icon: CalendarClock,
  },
  processing: {
    label: "جارٍ النشر",
    pill: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
    strip: "bg-blue-500",
    icon: Loader2,
  },
  published: {
    label: "منشور",
    pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    strip: "bg-emerald-500",
    icon: CheckCircle2,
  },
  failed: {
    label: "فشل",
    pill: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    strip: "bg-red-500",
    icon: AlertTriangle,
  },
  canceled: {
    label: "ملغي",
    pill: "bg-muted/80 text-muted-foreground border-border/50",
    strip: "bg-muted-foreground/30",
    icon: XIcon,
  },
};

const ATTEMPT_PHASES: Record<string, string> = {
  media_upload: "رفع الصورة",
  create_post: "إنشاء المنشور",
  token_refresh: "تجديد الاعتماد",
};

const OAUTH_RESULT_MESSAGES: Record<string, { title: string; destructive: boolean }> = {
  connected: { title: "تم ربط حساب X بنجاح", destructive: false },
  denied: { title: "رُفض التفويض من X", destructive: true },
  state_mismatch: { title: "فشل التحقق من جلسة الربط — حاول مجدداً", destructive: true },
  expired: { title: "انتهت مهلة الربط — حاول مجدداً", destructive: true },
  error: { title: "تعذر إتمام ربط الحساب", destructive: true },
};

const latn = "tabular-nums" as const;

/** شعار منصة X الأنيق */
function XBrandIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** تلوين الهاشتاقات والإشارات والروابط في نص التغريدة */
function renderHighlightedSocialText(text: string) {
  if (!text) return null;
  const regex = /(https?:\/\/[^\s]+|#[\w\u0600-\u06FF_]+|@[\w_]+)/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="no-min-touch-size text-primary hover:underline font-medium inline-flex items-center gap-0.5 mx-0.5 transition-colors"
          dir="ltr"
          onClick={(e) => e.stopPropagation()}
        >
          {part.length > 32 ? `${part.slice(0, 32)}…` : part}
        </a>
      );
    }
    if (/^#[\w\u0600-\u06FF_]+/.test(part)) {
      return (
        <span
          key={i}
          className="text-sky-600 dark:text-sky-400 font-semibold hover:underline cursor-pointer"
        >
          {part}
        </span>
      );
    }
    if (/^@[\w_]+/.test(part)) {
      return (
        <span
          key={i}
          className="text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
          dir="ltr"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function SocialPublishingPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const canManageAccounts = hasPermission(user, "social_publish.manage_accounts");
  const canManageScheduled = hasPermission(user, "social_publish.manage_scheduled");
  const canPublishNow = hasPermission(user, "social_publish.publish_now");
  const canCreate = hasPermission(user, "social_publish.create");

  const [disconnectTarget, setDisconnectTarget] = useState<SafeAccount | null>(null);
  const initialFilter = useMemo<StatusFilter>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("filter");
      if (p === "agency" || p === "draft" || p === "published" || p === "scheduled" || p === "failed") {
        return p;
      }
    } catch {}
    return "all";
  }, []);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialFilter);
  const [onlyOpinionProposals, setOnlyOpinionProposals] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attemptsFor, setAttemptsFor] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPostRow | null>(null);
  const [editText, setEditText] = useState("");
  const [schedulingPost, setSchedulingPost] = useState<SocialPostRow | null>(null);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [rejectingPost, setRejectingPost] = useState<SocialPostRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // نتيجة ربط OAuth تصل عبر ?x=connected|denied|…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get("x");
    if (result && OAUTH_RESULT_MESSAGES[result]) {
      const msg = OAUTH_RESULT_MESSAGES[result];
      toast({ title: msg.title, variant: msg.destructive ? "destructive" : undefined });
      params.delete("x");
      const qs = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/accounts"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: accountsRaw, isLoading: accountsLoading } = useQuery<{
    accounts: SafeAccount[];
    oauthConfigured: boolean;
    transport?: "x_api" | "publer";
    publerConfigured?: boolean;
  }>({
    queryKey: ["/api/social-publishing/accounts"],
  });
  const accounts = Array.isArray(accountsRaw?.accounts)
    ? accountsRaw.accounts
    : Array.isArray(accountsRaw)
      ? (accountsRaw as unknown as SafeAccount[])
      : [];
  const oauthConfigured = Boolean(accountsRaw?.oauthConfigured);
  const transport = accountsRaw?.transport ?? "x_api";
  const isPubler = transport === "publer";
  const xAccount = accounts.find((a) => a.platform === "x") ?? null;

  const { data: postsRaw, isLoading: postsLoading, isFetching: postsFetching } = useQuery<{
    posts: SocialPostRow[];
  }>({
    queryKey: ["/api/social-publishing/posts"],
  });
  const posts = Array.isArray(postsRaw?.posts)
    ? postsRaw.posts
    : Array.isArray(postsRaw)
      ? (postsRaw as unknown as SocialPostRow[])
      : [];

  const { data: statsRaw } = useQuery<PublishStats>({
    queryKey: ["/api/social-publishing/stats"],
  });
  const stats = statsRaw ?? null;

  const { data: attemptsRaw, isLoading: attemptsLoading } = useQuery<{
    post: SocialPostRow;
    attempts: AttemptRow[];
  }>({
    queryKey: [`/api/social-publishing/posts/${attemptsFor}`],
    enabled: Boolean(attemptsFor),
  });
  const attempts = Array.isArray(attemptsRaw?.attempts)
    ? attemptsRaw.attempts
    : Array.isArray(attemptsRaw)
      ? (attemptsRaw as unknown as AttemptRow[])
      : [];

  const handleCopyPost = (postId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(postId);
    toast({ title: "تم نسخ نص التغريدة إلى الحافظة" });
    setTimeout(() => {
      setCopiedId((prev) => (prev === postId ? null : prev));
    }, 2000);
  };

  const filteredPosts = useMemo(() => {
    let list = posts;
    if (statusFilter === "agency") {
      list = list.filter((p) => p.status === "draft" && p.agencyName);
    } else if (statusFilter !== "all") {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (onlyOpinionProposals) {
      list = list.filter((p) => Boolean(p.isAuthorProposal));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          (p.text || "").toLowerCase().includes(q) ||
          p.articleTitle?.toLowerCase().includes(q) ||
          p.createdByName?.toLowerCase().includes(q) ||
          p.agencyName?.toLowerCase().includes(q) ||
          p.publishedByName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [posts, statusFilter, onlyOpinionProposals, searchQuery]);

  const filterCounts = useMemo(
    () => ({
      all: posts.length,
      agency: posts.filter((p) => p.status === "draft" && p.agencyName).length,
      draft: posts.filter((p) => p.status === "draft").length,
      published: posts.filter((p) => p.status === "published").length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      failed: posts.filter((p) => p.status === "failed").length,
      opinionProposals: posts.filter((p) => p.status === "draft" && p.isAuthorProposal).length,
    }),
    [posts]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/stats"] });
    if (attemptsFor) {
      queryClient.invalidateQueries({
        queryKey: [`/api/social-publishing/posts/${attemptsFor}`],
      });
    }
  };

  const connectMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ authorizeUrl: string }>(`/api/social-publishing/x/oauth/start`, {
        method: "GET",
      }),
    onSuccess: (data) => {
      if (data?.authorizeUrl) {
        window.location.href = data.authorizeUrl;
      } else {
        toast({ title: "تعذر بدء الربط", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "تعذر بدء الربط", description: error.message, variant: "destructive" });
    },
  });

  // وسيلة نقل Publer: الربط يتم في لوحة Publer، وهنا مزامنة فقط
  const publerSyncMutation = useMutation({
    mutationFn: async () =>
      apiRequest(`/api/social-publishing/publer/sync`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/accounts"] });
      toast({ title: "تمت مزامنة حساب X من Publer" });
    },
    onError: (error: any) => {
      toast({ title: "تعذرت المزامنة", description: error.message, variant: "destructive" });
    },
  });

  const connectPending = connectMutation.isPending || publerSyncMutation.isPending;
  const connectDisabled =
    connectPending || (isPubler ? !accountsRaw?.publerConfigured : !oauthConfigured);

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) =>
      apiRequest(`/api/social-publishing/accounts/${accountId}`, { method: "DELETE" }),
    onSuccess: () => {
      setDisconnectTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/accounts"] });
      toast({ title: "فُك ربط الحساب" });
    },
    onError: (error: any) => {
      toast({ title: "تعذر فك الربط", description: error.message, variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (arg: string | { postId: string; reason?: string }) => {
      const postId = typeof arg === "string" ? arg : arg.postId;
      const reason = typeof arg === "object" ? arg.reason : undefined;
      return apiRequest(`/api/social-publishing/posts/${postId}/cancel`, {
        method: "POST",
        headers: reason ? { "Content-Type": "application/json" } : undefined,
        body: reason ? JSON.stringify({ reason }) : undefined,
      });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "تم إلغاء / رفض المنشور" });
    },
    onError: (error: any) => {
      toast({ title: "تعذر الإلغاء", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (postId: string) =>
      apiRequest<{ post: SocialPostRow }>(`/api/social-publishing/posts/${postId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidate();
      toast({ title: "نُشر على X بنجاح" });
    },
    onError: (error: any) => {
      invalidate();
      toast({ title: "فشل النشر", description: error.message, variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ postId, text }: { postId: string; text: string }) =>
      apiRequest(`/api/social-publishing/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      setEditingPost(null);
      invalidate();
      toast({ title: "تم تعديل نص المنشور بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "تعذر تعديل المنشور", description: error.message, variant: "destructive" });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async ({ postId, scheduledAt }: { postId: string; scheduledAt: string }) =>
      apiRequest(`/api/social-publishing/posts/${postId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: new Date(scheduledAt).toISOString() }),
      }),
    onSuccess: () => {
      setSchedulingPost(null);
      invalidate();
      toast({ title: "تمت جدولة المنشور بنجاح" });
    },
    onError: (error: any) => {
      toast({ title: "تعذرت الجدولة", description: error.message, variant: "destructive" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (postId: string) =>
      apiRequest(`/api/social-publishing/posts/${postId}/publish`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تمت إعادة محاولة النشر" });
    },
    onError: (error: any) => {
      invalidate();
      toast({ title: "فشلت المحاولة", description: error.message, variant: "destructive" });
    },
  });

  const accountStatusPill = (status: string) => {
    switch (status) {
      case "connected":
      case "active":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-semibold px-2.5 py-0.5 flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            متصل ونشط
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-semibold px-2.5 py-0.5">
            انتهى الاعتماد
          </Badge>
        );
      case "revoked":
        return (
          <Badge className="bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30 text-xs font-semibold px-2.5 py-0.5">
            مسحوب
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs font-medium px-2.5 py-0.5">
            غير متصل
          </Badge>
        );
    }
  };

  // مقترحات كتّاب الرأي وطلبات الوكالات معًا
  const pendingAuthorCount = stats?.pendingAuthorProposals ?? filterCounts.opinionProposals;
  const pendingAgencyCount = stats?.pendingAgencyProposals ?? filterCounts.agency;
  const pendingProposals = (stats?.pendingAuthorProposals ?? 0) + (stats?.pendingAgencyProposals ?? 0);

  const filterButtons: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "الكل" },
    { key: "agency", label: "طلبات الوكالات" },
    { key: "draft", label: "مسودات ومقترحات" },
    { key: "scheduled", label: "مجدول" },
    { key: "published", label: "منشور" },
    { key: "failed", label: "فشل" },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-12 sm:px-6 space-y-6"
      >
        <DashboardPageHeader
          icon={Share2}
          title="النشر الاجتماعي"
          description="نشر وإدارة محتوى سبق على منصة X — فورياً أو بجدولة ذكية مع معاينة تفاعلية وسجل كامل للمحاولات"
          titleTestId="heading-social-publishing"
          className="p-4 sm:p-5"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={invalidate}
                disabled={postsFetching}
                className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                title="تحديث السجل والمؤشرات"
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", postsFetching && "animate-spin")} />
                <span className="hidden sm:inline">تحديث</span>
              </Button>
              {canCreate && (
                <Button
                  onClick={() => setComposeOpen(true)}
                  disabled={!xAccount}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white shadow-md shadow-primary/20 font-semibold rounded-xl"
                  data-testid="button-new-tweet"
                >
                  <PenSquare className="w-4 h-4 ml-1" />
                  تغريدة جديدة
                </Button>
              )}
            </div>
          }
        />

        {/* الحساب المتصل — شريط حالة حساب X التشغيلي */}
        <Card className="rounded-2xl border-border/80 bg-gradient-to-br from-card via-card to-muted/20 shadow-sm overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            {accountsLoading ? (
              <div className="flex items-center gap-3 text-muted-foreground py-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm font-medium">جاري تحميل حالة حساب X المتصل…</span>
              </div>
            ) : xAccount ? (
              <div className="space-y-3">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
                    <div className="relative shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-xl font-bold text-white shadow-inner border border-zinc-700/50 sm:h-14 sm:w-14">
                        <XBrandIcon className="w-6 h-6 text-white sm:w-7 sm:h-7" />
                      </div>
                      <span className="absolute -bottom-1 -left-1 flex h-4 w-4 items-center justify-center rounded-full bg-background ring-2 ring-background">
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            xAccount.status === "expired"
                              ? "bg-amber-500"
                              : xAccount.status === "revoked"
                                ? "bg-red-500"
                                : "bg-emerald-500"
                          )}
                        />
                      </span>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">
                          {xAccount.displayName || "صحيفة سبق الإلكترونية"}
                        </h2>
                        {accountStatusPill(xAccount.status)}
                        <Badge className="border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                          {isPubler ? "عبر Publer" : "ربط مباشر X API"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground">
                        <span
                          className="font-semibold text-foreground/90 inline-flex items-center gap-1"
                          dir="ltr"
                        >
                          @{xAccount.handle || "sabqorg"}
                        </span>
                        {xAccount.lastVerifiedAt && (
                          <span
                            style={{ fontVariantNumeric: latn }}
                            className="text-xs flex items-center gap-1"
                          >
                            <Clock className="w-3.5 h-3.5 opacity-70" />
                            آخر تحقق: {fmtSocialDateTime(xAccount.lastVerifiedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 lg:pt-0">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="no-min-touch-size h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium hover:bg-muted"
                    >
                      <a
                        href={`https://x.com/${xAccount.handle || "sabqorg"}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-min-touch-size"
                      >
                        <XBrandIcon className="w-3.5 h-3.5" />
                        <span>زيارة الحساب على X</span>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground mr-0.5" />
                      </a>
                    </Button>

                    {canManageAccounts &&
                      (xAccount.status === "expired" || xAccount.status === "revoked") && (
                        <Button
                          size="sm"
                          onClick={() =>
                            isPubler ? publerSyncMutation.mutate() : connectMutation.mutate()
                          }
                          disabled={connectDisabled}
                          className="no-min-touch-size h-9 gap-1.5 rounded-xl bg-amber-600 text-white hover:bg-amber-700 text-xs font-semibold"
                        >
                          <RefreshCcw className="w-3.5 h-3.5 ml-1" />
                          إعادة ربط الحساب
                        </Button>
                      )}

                    {canManageAccounts && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="no-min-touch-size h-9 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl"
                        disabled={disconnectMutation.isPending}
                        onClick={() => setDisconnectTarget(xAccount)}
                        data-testid="button-disconnect-x"
                      >
                        <Unlink className="w-3.5 h-3.5 ml-1.5" />
                        فك الربط
                      </Button>
                    )}
                  </div>
                </div>

                {(xAccount.status === "expired" || xAccount.status === "revoked") && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>
                      انتهت صلاحية تفويض حساب X أو سُحب الاعتماد. يرجى إعادة الربط لضمان استمرار النشر الفوري والمجدول دون توقف.
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground border border-border/60">
                    <XBrandIcon className="w-5 h-5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-base">لم يتم ربط حساب X بعد</h3>
                      {accountStatusPill("disconnected")}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      اربط حساب الصحيفة الرسمي لتفعيل النشر الفوري والمجدول مباشرة من لوحة التحكم.
                    </p>
                  </div>
                </div>

                {canManageAccounts && (
                  <Button
                    onClick={() =>
                      isPubler ? publerSyncMutation.mutate() : connectMutation.mutate()
                    }
                    disabled={connectDisabled}
                    className="gap-2 bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 rounded-xl font-semibold shadow-sm"
                    data-testid="button-connect-x"
                  >
                    {connectPending ? (
                      <Loader2 className="w-4 h-4 animate-spin ml-1" />
                    ) : (
                      <XBrandIcon className="w-4 h-4 ml-1" />
                    )}
                    {isPubler ? "مزامنة حساب X من Publer" : "ربط حساب X الآن"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* شريط المؤشرات الرئيسية (4 بطاقات KPI واضحة) */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {/* 1. نُشر اليوم + إجمالي المنشورات */}
          <div
            onClick={() => {
              setStatusFilter("published");
              setOnlyOpinionProposals(false);
            }}
            className="cursor-pointer rounded-2xl border border-emerald-500/25 bg-card/95 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">نُشر اليوم</p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 transition-transform group-hover:scale-105">
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <p
              className="mt-2 text-2xl sm:text-3xl font-black tracking-tight leading-none text-emerald-600 dark:text-emerald-400"
              dir="ltr"
              style={{ fontVariantNumeric: latn }}
              data-testid="stat-today"
            >
              {stats?.publishedToday ?? "—"}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <BarChart3 className="h-3 w-3 opacity-70" />
                إجمالي المنشورات:
              </span>
              <span
                className="font-bold text-foreground"
                dir="ltr"
                style={{ fontVariantNumeric: latn }}
                data-testid="stat-total"
              >
                {stats?.total ?? "—"}
              </span>
            </div>
          </div>

          {/* 2. مقترحات معلقة (كتّاب رأي + وكالات) */}
          <div
            onClick={() => {
              setStatusFilter("draft");
              setOnlyOpinionProposals(false);
            }}
            className="cursor-pointer rounded-2xl border border-purple-500/25 bg-card/95 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">مقترحات معلقة</p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20 transition-transform group-hover:scale-105">
                <Sparkles className="h-4 w-4" />
              </span>
            </div>
            <p
              className={cn(
                "mt-2 text-2xl sm:text-3xl font-black tracking-tight leading-none",
                pendingProposals > 0
                  ? "text-purple-600 dark:text-purple-400"
                  : "text-foreground"
              )}
              dir="ltr"
              style={{ fontVariantNumeric: latn }}
              data-testid="stat-proposals"
            >
              {pendingProposals}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>رأي: <b className="text-foreground tabular-nums">{pendingAuthorCount}</b></span>
              <span>·</span>
              <span>وكالات: <b className="text-foreground tabular-nums">{pendingAgencyCount}</b></span>
            </div>
          </div>

          {/* 3. مجدولة قادمة */}
          <div
            onClick={() => {
              setStatusFilter("scheduled");
              setOnlyOpinionProposals(false);
            }}
            className="cursor-pointer rounded-2xl border border-amber-500/25 bg-card/95 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">مجدولة قادمة</p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 transition-transform group-hover:scale-105">
                <CalendarClock className="h-4 w-4" />
              </span>
            </div>
            <p
              className="mt-2 text-2xl sm:text-3xl font-black tracking-tight leading-none text-amber-600 dark:text-amber-400"
              dir="ltr"
              style={{ fontVariantNumeric: latn }}
              data-testid="stat-scheduled"
            >
              {stats?.scheduledUpcoming ?? "—"}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>في طابور الجدولة الآلي</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">عرض</span>
            </div>
          </div>

          {/* 4. تحتاج انتباهك (فشل) */}
          <div
            onClick={() => {
              setStatusFilter("failed");
              setOnlyOpinionProposals(false);
            }}
            className="cursor-pointer rounded-2xl border border-red-500/25 bg-card/95 p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 group"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs sm:text-sm font-semibold text-muted-foreground">تحتاج انتباهك</p>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20 transition-transform group-hover:scale-105">
                <AlertTriangle className="h-4 w-4" />
              </span>
            </div>
            <p
              className="mt-2 text-2xl sm:text-3xl font-black tracking-tight leading-none text-red-600 dark:text-red-400"
              dir="ltr"
              style={{ fontVariantNumeric: latn }}
              data-testid="stat-failed"
            >
              {stats?.failed ?? "—"}
            </p>
            <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
              <span>منشورات تعذّر إرسالها</span>
              <span className="font-semibold text-red-600 dark:text-red-400">مراجعة</span>
            </div>
          </div>
        </div>

        {/* سجل المنشورات — التصميم العصري الشبيه بـ X */}
        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-3.5 sm:p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                  <span>سجل التغريدات والمنشورات</span>
                  <Badge variant="outline" className="font-mono text-xs font-bold text-muted-foreground py-0.5">
                    {filteredPosts.length}
                  </Badge>
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  إدارة وجدولة ومراجعة التغريدات ومقترحات الكتّاب والوكالات مع فحص الحالة
                </p>
              </div>

              {/* حقل البحث السريع + فلتر مقترحات الرأي */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:flex-initial min-w-[220px] sm:w-64">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="بحث في التغريدات، العناوين، أو الكتّاب..."
                    className="pr-9 pl-8 h-9 text-xs rounded-xl bg-background border-border/80 focus:bg-background transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      title="مسح البحث"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setOnlyOpinionProposals((prev) => !prev)}
                  className={cn(
                    "no-min-touch-size inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
                    onlyOpinionProposals
                      ? "border-purple-500/40 bg-purple-500/15 text-purple-700 dark:text-purple-300 shadow-xs"
                      : "border-border/70 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                  <span>مقترحات الرأي</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      onlyOpinionProposals
                        ? "bg-purple-600 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                    dir="ltr"
                  >
                    {filterCounts.opinionProposals}
                  </span>
                </button>
              </div>
            </div>

            {/* أزرار التبويبات السريعة */}
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              className="w-full overflow-x-auto"
            >
              <TabsList className="h-auto w-full sm:w-auto flex-wrap justify-start gap-1 p-1 rounded-xl bg-muted/60 border border-border/60">
                {filterButtons.map((f) => {
                  const active = statusFilter === f.key;
                  return (
                    <TabsTrigger
                      key={f.key}
                      value={f.key}
                      className="no-min-touch-size gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all"
                      data-testid={`filter-${f.key}`}
                    >
                      {f.label}
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-background/80 text-muted-foreground"
                        )}
                        dir="ltr"
                        style={{ fontVariantNumeric: latn }}
                      >
                        {filterCounts[f.key]}
                      </span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>

          {/* قائمة التغريدات بصيغة بطاقات عصرية Social Cards */}
          {postsLoading ? (
            <div className="flex flex-col items-center justify-center p-16 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">جاري تحميل سجل المنشورات…</p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card/40 space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground mx-auto">
                <Share2 className="h-6 w-6" />
              </div>
              <h3 className="font-bold text-base text-foreground">لا توجد منشورات</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {searchQuery
                  ? `لم يتم العثور على أي تغريدة مطابقة لبحثك «${searchQuery}».`
                  : posts.length === 0
                  ? "لا منشورات بعد — افتح خبراً منشوراً من «إدارة الأخبار» واختر «النشر على X» أو انقر على «تغريدة جديدة» أعلاه."
                  : "لا توجد منشورات تطابق هذه الحالة المحددة."}
              </p>
              {(searchQuery || onlyOpinionProposals || statusFilter !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery("");
                    setOnlyOpinionProposals(false);
                    setStatusFilter("all");
                  }}
                  className="no-min-touch-size rounded-xl text-xs mt-2"
                >
                  إعادة ضبط الفلاتر والبحث
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPosts.map((p) => {
                const meta = STATUS_META[p.status] ?? STATUS_META.draft;
                const StatusIcon = meta.icon;
                const mediaList = Array.isArray(p.mediaUrls) ? p.mediaUrls : [];
                const thumb = p.imageUrl || mediaList[0] || p.articleImageUrl || null;
                const isVideo = p.mediaKind === "video";
                const mediaCount = mediaList.length > 0 ? mediaList.length : thumb ? 1 : 0;
                const charCount = xWeightedLength(p.text || "");
                const isOverStandard = charCount > X_MAX_WEIGHTED_LENGTH;
                const isCopied = copiedId === p.id;

                return (
                  <article
                    key={p.id}
                    className="relative rounded-2xl border border-border/80 bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 p-4 sm:p-5 space-y-4 group overflow-hidden"
                    data-testid={`social-log-row-${p.id}`}
                  >
                    {/* شريط تمييز الحالة اللوني في الجانب الأيمن */}
                    <span
                      className={cn("absolute inset-y-0 right-0 w-1.5", meta.strip)}
                      aria-hidden
                    />

                    {/* ترويسة البطاقة: الكاتب/المصدر + وقت النشر + شارات الحالة */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* أيقونة الحساب / الكاتب */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 dark:bg-zinc-800 text-white shadow-xs">
                          <XBrandIcon className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 leading-tight">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm text-foreground truncate">
                              {xAccount?.displayName || "صحيفة سبق"}
                            </span>
                            <span className="text-xs text-muted-foreground" dir="ltr">
                              @{xAccount?.handle || "sabqorg"}
                            </span>
                            {!p.articleId && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-medium">
                                تغريدة مستقلة
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1 mt-0.5">
                            {p.createdByName && (
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3 opacity-60" />
                                {p.isAuthorProposal || p.agencyName ? "مقترح من: " : "بواسطة: "}
                                <strong className="font-semibold text-foreground/80">
                                  {p.createdByName}
                                </strong>
                              </span>
                            )}
                            {p.publishedByName && p.status === "published" && p.publishedByName !== p.createdByName && (
                              <span>
                                · نشره <strong className="font-semibold text-foreground/80">{p.publishedByName}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* شارات الحالة ونوع المنشور */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {p.agencyName && (
                          <Badge
                            className="border border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300 px-2.5 py-0.5 text-xs font-semibold gap-1 shadow-xs"
                            data-testid={`badge-agency-${p.id}`}
                          >
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span>طلب وكالة: {p.agencyName}</span>
                            {p.status === "draft" && (
                              <span className="font-normal opacity-90">
                                · {p.requestedAt ? `تطلب ${fmtSocialDateTime(p.requestedAt)}` : "تطلب بعد الموافقة"}
                              </span>
                            )}
                          </Badge>
                        )}
                        {p.isAuthorProposal && (
                          <Badge className="border border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300 px-2.5 py-0.5 text-xs font-semibold gap-1 shadow-xs">
                            <Sparkles className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            مقترح كاتب رأي
                          </Badge>
                        )}

                        <Badge
                          className={cn(
                            meta.pill,
                            "border px-2.5 py-0.5 text-xs font-semibold gap-1 shadow-xs"
                          )}
                        >
                          <StatusIcon className={cn("h-3 w-3", p.status === "processing" && "animate-spin")} />
                          <span>{meta.label}</span>
                          {p.status === "scheduled" && p.scheduledAt && (
                            <span className="font-normal opacity-90">
                              (خلال {fmtRelativeToNow(p.scheduledAt)})
                            </span>
                          )}
                        </Badge>

                        {p.status === "failed" && (
                          <Badge
                            className="border border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400 px-2 py-0.5 text-xs font-bold"
                            dir="ltr"
                            style={{ fontVariantNumeric: latn }}
                          >
                            {p.attempts}/3 محاولات
                          </Badge>
                        )}

                        <span
                          className="text-xs text-muted-foreground flex items-center gap-1 mr-0.5"
                          style={{ fontVariantNumeric: latn }}
                        >
                          <Clock className="h-3.5 w-3.5 opacity-60" />
                          {p.status === "scheduled" && p.scheduledAt
                            ? fmtSocialDateTime(p.scheduledAt)
                            : fmtSocialDateTime(p.publishedAt || p.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* الخبر المرتبط (إن وُجد) */}
                    {p.articleTitle && (
                      <div className="flex items-center justify-between gap-2 bg-muted/40 hover:bg-muted/70 rounded-xl px-3.5 py-2 border border-border/60 transition-colors text-xs sm:text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <Newspaper className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-muted-foreground shrink-0">مرتبط بخبر:</span>
                          <span className="font-bold text-foreground truncate">{p.articleTitle}</span>
                        </div>
                      </div>
                    )}

                    {/* صندوق متن التغريدة الاجتماعي مع المعاينة والوسائط */}
                    <div className="flex flex-col md:flex-row items-start gap-4 bg-background/80 dark:bg-muted/15 border border-border/70 rounded-2xl p-4 sm:p-5 relative group/box">
                      {/* محتوى النص */}
                      <div className="flex-1 min-w-0 space-y-3 w-full">
                        <p className="m-0 text-[15px] sm:text-base leading-relaxed sm:leading-8 text-foreground font-normal whitespace-pre-line break-words select-text">
                          {renderHighlightedSocialText(p.text)}
                        </p>

                        {/* شريط شارات عدد الأحرف ومعاينة الوسائط ونسخ النص */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {/* شارة عدد الأحرف الموزون */}
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-2 py-0.5 text-[11px] font-mono gap-1",
                                isOverStandard
                                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold"
                                  : "border-border/70 bg-muted/40 text-muted-foreground"
                              )}
                              dir="ltr"
                            >
                              <span>{charCount}</span>
                              <span>/ {X_MAX_WEIGHTED_LENGTH}</span>
                            </Badge>

                            {isOverStandard && (
                              <Badge className="border border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                                منشور طويل Long Post
                              </Badge>
                            )}

                            {/* شارة الوسائط المرفقة */}
                            {isVideo ? (
                              <Badge className="border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-medium gap-1">
                                <Video className="h-3 w-3" />
                                فيديو مرفق
                              </Badge>
                            ) : mediaCount > 0 ? (
                              <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-medium gap-1">
                                <ImageIcon className="h-3 w-3" />
                                {mediaCount > 1 ? `${mediaCount} صور مرفقة` : "صورة مرفقة"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="px-2 py-0.5 text-[11px] text-muted-foreground gap-1">
                                <FileText className="h-3 w-3 opacity-70" />
                                نص فقط
                              </Badge>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyPost(p.id, p.text)}
                            className={cn(
                              "no-min-touch-size h-7 px-2.5 text-xs gap-1 rounded-lg transition-all",
                              isCopied
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                            title="نسخ نص التغريدة"
                          >
                            {isCopied ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                <span>تم النسخ!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>نسخ النص</span>
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* الصورة المرفقة إن وُجدت */}
                      {thumb && (
                        <div className="relative shrink-0 w-full md:w-36 lg:w-44 aspect-video md:aspect-auto md:h-36 rounded-xl overflow-hidden border border-border bg-muted group/thumb shadow-xs">
                          <img
                            src={thumb}
                            alt="صورة التغريدة"
                            loading="lazy"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                          {mediaCount > 1 && (
                            <span
                              className="absolute top-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums"
                              dir="ltr"
                            >
                              +{mediaCount - 1}
                            </span>
                          )}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <span className="text-[10px] bg-background/90 text-foreground px-2 py-0.5 rounded-full font-semibold shadow-xs">
                              معاينة الوسائط
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* تنبيه الخطأ عند الفشل */}
                    {p.status === "failed" && p.lastError && (
                      <div className="flex items-start gap-2.5 rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 text-xs sm:text-sm leading-relaxed text-red-700 dark:text-red-400 break-words">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
                        <div>
                          <strong className="font-bold block mb-0.5">سبب فشل المحاولة:</strong>
                          <span>{p.lastError}</span>
                        </div>
                      </div>
                    )}

                    {/* شريط الإجراءات والتحكم أسفل البطاقة — متجاوب للجوال والديسكتوب */}
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-border/40">
                      {/* الإجراءات الخارجية والمحاولات */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {p.externalPostUrl && (
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="no-min-touch-size h-8 gap-1.5 text-xs font-semibold rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 border-0 shadow-xs"
                          >
                            <a
                              href={p.externalPostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="no-min-touch-size"
                            >
                              <XBrandIcon className="h-3 w-3" />
                              <span>مشاهدة التغريدة على X</span>
                              <ExternalLink className="h-3 w-3 mr-0.5 opacity-70" />
                            </a>
                          </Button>
                        )}

                        {(p.status === "failed" || p.attempts > 1) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="no-min-touch-size h-8 text-xs text-muted-foreground hover:text-foreground rounded-xl gap-1"
                            onClick={() =>
                              setAttemptsFor(attemptsFor === p.id ? null : p.id)
                            }
                            data-testid={`button-attempts-${p.id}`}
                          >
                            <ListTree className="h-3.5 w-3.5" />
                            <span>{attemptsFor === p.id ? "إخفاء سجل المحاولات" : `سجل المحاولات (${p.attempts})`}</span>
                          </Button>
                        )}
                      </div>

                      {/* أزرار الإجراءات الإدارية (نشر، جدولة، تعديل، إلغاء) */}
                      <div className="flex flex-wrap items-center gap-1.5 sm:mr-auto">
                        {p.status === "draft" && (
                          <>
                            {canPublishNow && (
                              <Button
                                size="sm"
                                className="no-min-touch-size h-8 gap-1 text-xs font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-xs"
                                disabled={publishMutation.isPending}
                                onClick={() => publishMutation.mutate(p.id)}
                                data-testid={`button-log-publish-${p.id}`}
                              >
                                <Send className="h-3.5 w-3.5 ml-0.5" />
                                اعتماد ونشر فوري
                              </Button>
                            )}
                            {canManageScheduled && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="no-min-touch-size h-8 gap-1 text-xs rounded-xl"
                                onClick={() => {
                                  setSchedulingPost(p);
                                  // طلب الوكالة: الموعد المقترح جاهز في الحقل إن لم يمض
                                  setScheduledAtLocal(
                                    p.requestedAt && new Date(p.requestedAt).getTime() > Date.now() + 60_000
                                      ? localInputValue(p.requestedAt)
                                      : "",
                                  );
                                }}
                                data-testid={`button-log-schedule-${p.id}`}
                              >
                                <CalendarClock className="h-3.5 w-3.5 ml-0.5" />
                                جدولة
                              </Button>
                            )}
                            {(canCreate || canManageScheduled) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="no-min-touch-size h-8 gap-1 text-xs rounded-xl hover:bg-muted"
                                onClick={() => {
                                  setEditingPost(p);
                                  setEditText(p.text);
                                }}
                                data-testid={`button-log-edit-${p.id}`}
                              >
                                <Edit3 className="h-3.5 w-3.5 ml-0.5" />
                                تعديل النص
                              </Button>
                            )}
                            {(canCreate || canManageScheduled) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="no-min-touch-size h-8 text-xs text-red-600 hover:bg-red-500/10 rounded-xl"
                                disabled={cancelMutation.isPending}
                                onClick={() => {
                                  if (p.agencyName) {
                                    // الوكالة ترى الملاحظة في لوحتها وبريدها
                                    setRejectingPost(p);
                                    setRejectReason("");
                                  } else cancelMutation.mutate(p.id);
                                }}
                                data-testid={`button-log-cancel-${p.id}`}
                              >
                                رفض المقترح
                              </Button>
                            )}
                          </>
                        )}

                        {p.status === "scheduled" && canManageScheduled && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="no-min-touch-size h-8 text-xs text-red-600 border-red-500/30 hover:bg-red-500/10 rounded-xl"
                            disabled={cancelMutation.isPending}
                            onClick={() => cancelMutation.mutate(p.id)}
                            data-testid={`button-log-cancel-${p.id}`}
                          >
                            إلغاء الجدولة
                          </Button>
                        )}

                        {p.status === "failed" && canPublishNow && (
                          <Button
                            size="sm"
                            className="no-min-touch-size h-8 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-1"
                            disabled={retryMutation.isPending}
                            onClick={() => retryMutation.mutate(p.id)}
                            data-testid={`button-log-retry-${p.id}`}
                          >
                            <RefreshCcw className="h-3.5 w-3.5 ml-0.5" />
                            إعادة المحاولة الآن
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* صندوق تفاصيل المحاولات القابل للتوسيع */}
                    {attemptsFor === p.id && (
                      <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-4 animate-in fade-in duration-200">
                        <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground border-b border-border/50 pb-2 mb-2">
                          <ListTree className="h-3.5 w-3.5 text-primary" />
                          <span>سجل المحاولات والردود التقنية:</span>
                        </div>
                        {attemptsLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                            <span>جاري جلب المحاولات…</span>
                          </div>
                        ) : attempts.length === 0 ? (
                          <p className="text-xs text-muted-foreground">لا محاولات مسجلة.</p>
                        ) : (
                          attempts.map((a) => (
                            <div
                              key={a.id}
                              className="flex flex-wrap items-center gap-2.5 text-xs py-1 border-b border-border/30 last:border-0"
                              style={{ fontVariantNumeric: latn }}
                            >
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  a.outcome === "success" ? "bg-emerald-500" : "bg-red-500"
                                )}
                              />
                              <span className="font-bold text-foreground">
                                {ATTEMPT_PHASES[a.phase] ?? a.phase}
                              </span>
                              {a.httpStatus && (
                                <Badge variant="outline" className="text-[10px] font-mono py-0.5" dir="ltr">
                                  HTTP {a.httpStatus}
                                </Badge>
                              )}
                              {a.durationMs != null && (
                                <span className="text-muted-foreground text-[11px]" dir="ltr">
                                  {a.durationMs}ms
                                </span>
                              )}
                              <span className="text-muted-foreground text-[11px] mr-auto">
                                {fmtSocialDateTime(a.createdAt)}
                              </span>
                              {a.errorMessage && (
                                <div className="w-full break-words text-red-600 dark:text-red-400 bg-red-500/10 p-2 rounded-lg font-mono text-[11px] mt-1">
                                  {a.errorMessage}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </DashboardPageShell>

      {/* تأليف تغريدة مستقلة */}
      <ComposeTweetDialog open={composeOpen} onOpenChange={setComposeOpen} />

      {/* تأكيد فك الربط */}
      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
      >
        <AlertDialogContent className="w-[calc(100vw-1.25rem)] max-w-md rounded-2xl" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>فك ربط حساب X</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتوقف النشر الفوري والمجدول حتى يُعاد ربط الحساب، وستفشل المنشورات
              المجدولة القادمة. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={disconnectMutation.isPending} className="rounded-xl">
              تراجع
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget) disconnectMutation.mutate(disconnectTarget.id);
              }}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl"
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="ml-2 h-4 w-4" />
              )}
              فك الربط
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تعديل مسودة / مقترح منشور */}
      <Dialog
        open={Boolean(editingPost)}
        onOpenChange={(open) => !open && setEditingPost(null)}
      >
        <DialogContent
          className="w-[calc(100vw-1.25rem)] max-w-lg rounded-2xl p-4 sm:p-6"
          dir="rtl"
        >
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-primary" />
              تعديل نص المنشور
            </DialogTitle>
            <DialogDescription>
              {editingPost?.articleTitle ? `من خبر: ${editingPost.articleTitle}` : "تعديل نص المسودة"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={4}
              placeholder="اكتب نص المنشور..."
              className="min-h-28 resize-none text-sm leading-relaxed rounded-xl"
              data-testid="textarea-edit-post-text"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground" dir="ltr">
              <span>{validateXPostText(editText, null).weightedLength} / {X_MAX_WEIGHTED_LENGTH}</span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={editMutation.isPending}
              onClick={() => setEditingPost(null)}
              className="rounded-xl"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={editMutation.isPending || !editText.trim()}
              onClick={() => {
                if (editingPost) {
                  editMutation.mutate({ postId: editingPost.id, text: editText });
                }
              }}
              className="rounded-xl font-semibold"
              data-testid="button-save-post-edit"
            >
              {editMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : null}
              حفظ التعديل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* جدولة منشور مسودة */}
      <Dialog open={Boolean(rejectingPost)} onOpenChange={(open) => !open && setRejectingPost(null)}>
        <DialogContent className="w-[calc(100vw-1.25rem)] max-w-md rounded-2xl p-4 sm:p-6" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>رفض طلب {rejectingPost?.agencyName}</DialogTitle>
            <DialogDescription>تصل الملاحظة للوكالة في لوحتها وبريدها، ويمكنها التعديل وإعادة الإرسال.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            placeholder="مثال: نقترح صياغة خبرية بدل العبارة التسويقية."
            data-testid="input-reject-reason"
          />
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRejectingPost(null)}>
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => {
                if (!rejectingPost) return;
                cancelMutation.mutate({ postId: rejectingPost.id, reason: rejectReason.trim() || undefined });
                setRejectingPost(null);
              }}
              data-testid="button-confirm-reject"
            >
              رفض الطلب
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(schedulingPost)}
        onOpenChange={(open) => !open && setSchedulingPost(null)}
      >
        <DialogContent
          className="w-[calc(100vw-1.25rem)] max-w-md rounded-2xl p-4 sm:p-6"
          dir="rtl"
        >
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-500" />
              جدولة نشر التغريدة
            </DialogTitle>
            <DialogDescription>
              اختر تاريخ ووقت النشر بتوقيتك المحلي — سيتولى النظام النشر تلقائياً.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Input
              type="datetime-local"
              value={scheduledAtLocal}
              onChange={(e) => setScheduledAtLocal(e.target.value)}
              min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
              className="rounded-xl"
              data-testid="input-schedule-time"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={scheduleMutation.isPending}
              onClick={() => setSchedulingPost(null)}
              className="rounded-xl"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={scheduleMutation.isPending || !scheduledAtLocal}
              onClick={() => {
                if (schedulingPost && scheduledAtLocal) {
                  scheduleMutation.mutate({
                    postId: schedulingPost.id,
                    scheduledAt: scheduledAtLocal,
                  });
                }
              }}
              className="rounded-xl font-semibold bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-schedule"
            >
              {scheduleMutation.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : null}
              تأكيد الجدولة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
