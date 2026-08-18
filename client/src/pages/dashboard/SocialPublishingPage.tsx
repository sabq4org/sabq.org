// صفحة «النشر الاجتماعي» — إعادة ضبط UI/UX 2026-08-07:
// رأس مضغوط + شريط حساب تشغيلي + مؤشرات compact + سجل بهرمية أوضح.
// المنطق والصلاحيات والـ APIs كما هي. البوابة: social_publish.view.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Link2,
  ListTree,
  Loader2,
  PenSquare,
  RefreshCcw,
  Send,
  Share2,
  Unlink,
  User,
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
import { validateXPostText, X_MAX_WEIGHTED_LENGTH } from "@shared/socialPostText";
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
  articleId: string;
  articleTitle?: string | null;
  articleImageUrl?: string | null;
  createdByName?: string | null;
  publishedByName?: string | null;
  isAuthorProposal?: boolean;
  status: string;
  text: string;
  imageUrl: string | null;
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

type StatusFilter = "all" | "draft" | "scheduled" | "published" | "failed";

const STATUS_META: Record<
  string,
  { label: string; pill: string; strip: string }
> = {
  draft: { label: "مسودة", pill: "bg-muted text-muted-foreground", strip: "bg-border" },
  scheduled: {
    label: "مجدول",
    pill: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    strip: "bg-amber-500",
  },
  processing: {
    label: "جارٍ النشر",
    pill: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    strip: "bg-blue-500",
  },
  published: {
    label: "منشور",
    pill: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    strip: "bg-emerald-500",
  },
  failed: {
    label: "فشل",
    pill: "bg-red-500/10 text-red-700 dark:text-red-400",
    strip: "bg-red-500",
  },
  canceled: { label: "ملغي", pill: "bg-muted text-muted-foreground", strip: "bg-border" },
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

export default function SocialPublishingPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const canManageAccounts = hasPermission(user, "social_publish.manage_accounts");
  const canManageScheduled = hasPermission(user, "social_publish.manage_scheduled");
  const canPublishNow = hasPermission(user, "social_publish.publish_now");

  const canCreate = hasPermission(user, "social_publish.create");

  const [disconnectTarget, setDisconnectTarget] = useState<SafeAccount | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attemptsFor, setAttemptsFor] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPostRow | null>(null);
  const [editText, setEditText] = useState("");
  const [schedulingPost, setSchedulingPost] = useState<SocialPostRow | null>(null);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");

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
  const accounts = Array.isArray(accountsRaw?.accounts) ? accountsRaw!.accounts : [];
  const oauthConfigured = Boolean(accountsRaw?.oauthConfigured);
  const transport = accountsRaw?.transport ?? "x_api";
  const isPubler = transport === "publer";
  const xAccount = accounts.find((a) => a.platform === "x") ?? null;

  const { data: postsRaw, isLoading: postsLoading } = useQuery<{ posts: SocialPostRow[] }>({
    queryKey: ["/api/social-publishing/posts"],
  });
  const posts = Array.isArray(postsRaw?.posts) ? postsRaw!.posts : [];

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
  const attempts = Array.isArray(attemptsRaw?.attempts) ? attemptsRaw!.attempts : [];

  const filteredPosts = useMemo(() => {
    if (statusFilter === "all") return posts;
    return posts.filter((p) => p.status === statusFilter);
  }, [posts, statusFilter]);

  const filterCounts = useMemo(
    () => ({
      all: posts.length,
      draft: posts.filter((p) => p.status === "draft").length,
      published: posts.filter((p) => p.status === "published").length,
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      failed: posts.filter((p) => p.status === "failed").length,
    }),
    [posts],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/stats"] });
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
    mutationFn: async (postId: string) =>
      apiRequest(`/api/social-publishing/posts/${postId}/cancel`, { method: "POST" }),
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
      toast({ title: "نُشر على X" });
    },
    onError: (error: any) => {
      invalidate();
      toast({ title: "فشلت إعادة المحاولة", description: error.message, variant: "destructive" });
    },
  });

  if (!authLoading && !hasPermission(user, "social_publish.view")) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          لا تملك صلاحية الوصول إلى هذه الصفحة
        </div>
      </DashboardLayout>
    );
  }

  const accountStatusPill = (status: string) => {
    switch (status) {
      case "connected":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5 border-0 text-sm font-medium px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            متصل
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0 text-sm font-medium px-2.5 py-0.5">
            انتهى الاعتماد
          </Badge>
        );
      case "revoked":
        return (
          <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border-0 text-sm font-medium px-2.5 py-0.5">
            مسحوب
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-sm font-medium px-2.5 py-0.5">
            غير متصل
          </Badge>
        );
    }
  };

  const statTiles = [
    {
      key: "today",
      label: "نُشر اليوم",
      value: stats?.publishedToday,
      icon: CheckCircle2,
      valueClass: "text-emerald-600 dark:text-emerald-400",
      chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "scheduled",
      label: "مجدولة قادمة",
      value: stats?.scheduledUpcoming,
      icon: CalendarClock,
      valueClass: "text-amber-600 dark:text-amber-400",
      chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      key: "failed",
      label: "تحتاج انتباهك",
      value: stats?.failed,
      icon: AlertTriangle,
      valueClass: "text-red-600 dark:text-red-400",
      chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
      key: "total",
      label: "إجمالي المنشورات",
      value: stats?.total,
      icon: BarChart3,
      valueClass: "text-foreground",
      chip: "bg-primary/10 text-primary",
    },
  ];

  const filterButtons: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "الكل" },
    { key: "draft", label: "مسودات ومقترحات" },
    { key: "scheduled", label: "مجدول" },
    { key: "published", label: "منشور" },
    { key: "failed", label: "فشل" },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1400px]"
        contentClassName="px-4 pb-10 sm:px-6 space-y-4"
      >
        <DashboardPageHeader
          icon={Share2}
          title="النشر الاجتماعي"
          description="نشر أخبار سبق على منصة X — فورياً أو بجدولة، مع سجل كامل للمحاولات"
          titleTestId="heading-social-publishing"
          className="p-4 sm:p-4"
          actions={
            canCreate ? (
              <Button
                onClick={() => setComposeOpen(true)}
                disabled={!xAccount}
                data-testid="button-new-tweet"
              >
                <PenSquare className="w-4 h-4 ml-2" />
                تغريدة جديدة
              </Button>
            ) : undefined
          }
        />

        {/* الحساب المتصل — شريط تشغيلي مضغوط */}
        <Card className="rounded-xl border-border/80 shadow-none">
          <CardContent className="p-4 sm:p-5">
            {accountsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">جاري تحميل الحساب…</span>
              </div>
            ) : xAccount ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3 sm:items-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-600 text-lg font-bold text-white sm:h-14 sm:w-14 sm:text-xl">
                    س
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-bold tracking-tight sm:text-xl">
                        {xAccount.displayName || "حساب X"}
                      </h2>
                      <Badge
                        variant="outline"
                        className="border-border/80 bg-muted/40 text-sm font-semibold"
                      >
                        X
                      </Badge>
                      {accountStatusPill(xAccount.status)}
                      {isPubler && (
                        <Badge className="border-0 bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">
                          عبر Publer
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground/80" dir="ltr">
                        @{xAccount.handle || "sabqorg"}
                      </span>
                      {xAccount.lastVerifiedAt && (
                        <span style={{ fontVariantNumeric: latn }}>
                          آخر تحقق: {fmtSocialDateTime(xAccount.lastVerifiedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canManageAccounts && (
                  <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
                    {isPubler ? (
                      <Button
                        size="default"
                        variant="outline"
                        onClick={() => publerSyncMutation.mutate()}
                        disabled={connectDisabled}
                        data-testid="button-publer-sync"
                      >
                        {publerSyncMutation.isPending && (
                          <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
                        )}
                        إعادة المزامنة
                      </Button>
                    ) : (
                      xAccount.status !== "connected" && (
                        <Button
                          size="default"
                          onClick={() => connectMutation.mutate()}
                          disabled={connectDisabled}
                          data-testid="button-reconnect-x"
                        >
                          {connectMutation.isPending && (
                            <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />
                          )}
                          إعادة الربط
                        </Button>
                      )
                    )}
                    <Button
                      size="default"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setDisconnectTarget(xAccount)}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-disconnect-x"
                    >
                      <Unlink className="ml-1.5 h-4 w-4" />
                      فك الربط
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Link2 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-base font-bold sm:text-lg">لا يوجد حساب X مرتبط</div>
                    <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                      {isPubler
                        ? "يُربط الحساب من لوحة Publer ثم يُزامَن هنا — لا تُخزن توكنات لدينا"
                        : "الربط عبر تفويض OAuth الرسمي من X — لا كلمات مرور هنا أبداً"}
                    </p>
                    {isPubler && !accountsRaw?.publerConfigured && (
                      <p className="text-sm text-amber-600">
                        التهيئة ناقصة: يلزم ضبط PUBLER_API_KEY وPUBLER_WORKSPACE_ID أولاً.
                      </p>
                    )}
                    {!isPubler && !oauthConfigured && (
                      <p className="text-sm text-amber-600">
                        التهيئة ناقصة: يلزم ضبط X_CLIENT_ID وX_CLIENT_SECRET أولاً.
                      </p>
                    )}
                  </div>
                </div>
                {canManageAccounts && (
                  <Button
                    onClick={() =>
                      isPubler ? publerSyncMutation.mutate() : connectMutation.mutate()
                    }
                    disabled={connectDisabled}
                    data-testid="button-connect-x"
                  >
                    {connectPending && <Loader2 className="ml-1.5 h-4 w-4 animate-spin" />}
                    {isPubler ? "مزامنة حساب X من Publer" : "ربط حساب X"}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* مؤشرات الأداء — compact، الرقم أولاً */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {statTiles.map((tile) => (
            <div
              key={tile.key}
              className="rounded-xl border border-border/80 bg-card px-3.5 py-3 sm:px-4 sm:py-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-muted-foreground">{tile.label}</p>
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg",
                    tile.chip,
                  )}
                >
                  <tile.icon className="h-3.5 w-3.5" />
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 text-3xl font-bold tracking-tight leading-none",
                  tile.valueClass,
                )}
                dir="ltr"
                style={{ fontVariantNumeric: latn }}
                data-testid={`stat-${tile.key}`}
              >
                {tile.value ?? "—"}
              </p>
            </div>
          ))}
        </div>

        {/* سجل المنشورات — العنصر البصري الرئيسي */}
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-tight">سجل المنشورات</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                التواريخ ميلادية بتوقيت الرياض
              </p>
            </div>

            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              className="w-full sm:w-auto"
            >
              <TabsList className="h-auto w-full flex-wrap justify-start gap-0.5 p-1 sm:w-auto">
                {filterButtons.map((f) => {
                  const active = statusFilter === f.key;
                  return (
                    <TabsTrigger
                      key={f.key}
                      value={f.key}
                      className="gap-1.5 px-3.5 py-2 text-sm font-semibold"
                      data-testid={`filter-${f.key}`}
                    >
                      {f.label}
                      <span
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums",
                          active
                            ? "bg-primary/10 text-primary"
                            : "bg-background/80 text-muted-foreground",
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

          <Card className="overflow-hidden rounded-xl border-border/80 shadow-none">
            <CardContent className="p-0">
              {postsLoading ? (
                <div className="flex justify-center p-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPosts.length === 0 ? (
                <p className="px-4 py-12 text-center text-base text-muted-foreground">
                  {posts.length === 0
                    ? "لا منشورات بعد — افتح خبراً منشوراً من «إدارة الأخبار» واختر «النشر على X»."
                    : "لا منشورات بهذه الحالة."}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {filteredPosts.map((p) => {
                    const meta = STATUS_META[p.status] ?? STATUS_META.draft;
                    const thumb = p.imageUrl || p.articleImageUrl || null;
                    return (
                      <article
                        key={p.id}
                        className="relative flex gap-3 p-4 sm:gap-4 sm:p-5"
                        data-testid={`social-log-row-${p.id}`}
                      >
                        <span
                          className={cn("absolute inset-y-0 right-0 w-1", meta.strip)}
                          aria-hidden
                        />

                        {/* الصورة أولاً في RTL = يمين الصف */}
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="h-[88px] w-[88px] shrink-0 rounded-xl border border-border object-cover bg-muted sm:h-24 sm:w-24"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 sm:h-24 sm:w-24">
                            <Share2 className="h-6 w-6 text-muted-foreground/50" />
                          </div>
                        )}

                        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {p.isAuthorProposal && p.status === "draft" ? (
                              <Badge className="border-0 bg-purple-500/15 text-purple-700 dark:text-purple-300 px-2.5 py-0.5 text-sm font-semibold">
                                مقترح كاتب رأي
                              </Badge>
                            ) : (
                              <Badge className={cn(meta.pill, "border-0 px-2.5 py-0.5 text-sm font-semibold")}>
                                {meta.label}
                                {p.status === "scheduled" && p.scheduledAt && (
                                  <> · {fmtRelativeToNow(p.scheduledAt)}</>
                                )}
                              </Badge>
                            )}
                            {p.status === "failed" && (
                              <Badge
                                className="border-0 bg-muted px-2.5 py-0.5 text-sm text-muted-foreground"
                                dir="ltr"
                                style={{ fontVariantNumeric: latn }}
                              >
                                {p.attempts}/3
                              </Badge>
                            )}
                          </div>

                          {p.articleTitle && (
                            <h3 className="text-base font-bold leading-snug tracking-tight text-foreground sm:text-[17px]">
                              <span className="font-medium text-muted-foreground">من خبر: </span>
                              {p.articleTitle}
                            </h3>
                          )}

                          <p className="m-0 line-clamp-3 text-[15px] leading-7 text-foreground/90 break-words sm:text-base sm:leading-7">
                            {p.text}
                          </p>

                          {p.status === "failed" && p.lastError && (
                            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm leading-relaxed text-red-700 break-words dark:text-red-400">
                              {p.lastError}
                            </div>
                          )}

                          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                            <div
                              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"
                              style={{ fontVariantNumeric: latn }}
                            >
                              {p.createdByName && (
                                <span className="inline-flex items-center gap-1.5">
                                  <User className="h-4 w-4 opacity-70" />
                                  {p.isAuthorProposal ? "اقترحه الكاتب " : "أنشأه "}
                                  <b className="font-semibold text-foreground/80">
                                    {p.createdByName}
                                  </b>
                                </span>
                              )}
                              {p.publishedByName &&
                                p.status === "published" &&
                                p.publishedByName !== p.createdByName && (
                                  <span>
                                    نشره{" "}
                                    <b className="font-semibold text-foreground/80">
                                      {p.publishedByName}
                                    </b>
                                  </span>
                                )}
                              {p.status === "scheduled" && p.scheduledAt ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <CalendarClock className="h-4 w-4 opacity-70" />
                                  موعد النشر: {fmtSocialDateTime(p.scheduledAt)}
                                </span>
                              ) : (
                                <span>{fmtSocialDateTime(p.publishedAt || p.createdAt)}</span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {p.externalPostUrl && (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                                >
                                  <a
                                    href={p.externalPostUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    فتح في X
                                  </a>
                                </Button>
                              )}
                              {p.status === "draft" && (
                                <>
                                  {(canCreate || canManageScheduled) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1 text-xs"
                                      onClick={() => {
                                        setEditingPost(p);
                                        setEditText(p.text);
                                      }}
                                      data-testid={`button-log-edit-${p.id}`}
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                      تعديل النص
                                    </Button>
                                  )}
                                  {canPublishNow && (
                                    <Button
                                      size="sm"
                                      className="h-8 gap-1 text-xs bg-primary hover:bg-primary/90"
                                      disabled={publishMutation.isPending}
                                      onClick={() => publishMutation.mutate(p.id)}
                                      data-testid={`button-log-publish-${p.id}`}
                                    >
                                      <Send className="h-3.5 w-3.5" />
                                      اعتماد ونشر
                                    </Button>
                                  )}
                                  {canManageScheduled && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 gap-1 text-xs"
                                      onClick={() => {
                                        setSchedulingPost(p);
                                        setScheduledAtLocal("");
                                      }}
                                      data-testid={`button-log-schedule-${p.id}`}
                                    >
                                      <CalendarClock className="h-3.5 w-3.5" />
                                      جدولة
                                    </Button>
                                  )}
                                  {(canCreate || canManageScheduled) && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-8 text-xs text-red-600 border-red-500/20 hover:bg-red-500/10"
                                      disabled={cancelMutation.isPending}
                                      onClick={() => cancelMutation.mutate(p.id)}
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
                                  className="h-8 text-sm text-red-600 border-red-500/20 hover:bg-red-500/10"
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
                                  className="h-8 text-sm"
                                  disabled={retryMutation.isPending}
                                  onClick={() => retryMutation.mutate(p.id)}
                                  data-testid={`button-log-retry-${p.id}`}
                                >
                                  <RefreshCcw className="ml-1 h-3.5 w-3.5" />
                                  إعادة المحاولة
                                </Button>
                              )}
                              {(p.status === "failed" || p.attempts > 1) && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 text-sm text-muted-foreground"
                                  onClick={() =>
                                    setAttemptsFor(attemptsFor === p.id ? null : p.id)
                                  }
                                  data-testid={`button-attempts-${p.id}`}
                                >
                                  <ListTree className="ml-1 h-3.5 w-3.5" />
                                  {attemptsFor === p.id ? "إخفاء المحاولات" : "عرض المحاولات"}
                                </Button>
                              )}
                            </div>
                          </div>

                          {attemptsFor === p.id && (
                            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
                              {attemptsLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              ) : attempts.length === 0 ? (
                                <p className="text-sm text-muted-foreground">لا محاولات مسجلة.</p>
                              ) : (
                                attempts.map((a) => (
                                  <div
                                    key={a.id}
                                    className="flex flex-wrap items-center gap-2 text-sm"
                                    style={{ fontVariantNumeric: latn }}
                                  >
                                    <span
                                      className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        a.outcome === "success" ? "bg-emerald-500" : "bg-red-500",
                                      )}
                                    />
                                    <span className="font-semibold">
                                      {ATTEMPT_PHASES[a.phase] ?? a.phase}
                                    </span>
                                    {a.httpStatus && <span dir="ltr">HTTP {a.httpStatus}</span>}
                                    {a.durationMs != null && <span dir="ltr">{a.durationMs}ms</span>}
                                    <span className="text-muted-foreground">
                                      {fmtSocialDateTime(a.createdAt)}
                                    </span>
                                    {a.errorMessage && (
                                      <span className="w-full break-words text-red-600 dark:text-red-400">
                                        {a.errorMessage}
                                      </span>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </DashboardPageShell>

      {/* تأليف تغريدة مستقلة */}
      <ComposeTweetDialog open={composeOpen} onOpenChange={setComposeOpen} />

      {/* تأكيد فك الربط */}
      <AlertDialog
        open={!!disconnectTarget}
        onOpenChange={(open) => !open && setDisconnectTarget(null)}
      >
        <AlertDialogContent className="w-[calc(100vw-1.25rem)] max-w-md rounded-lg" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>فك ربط حساب X</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتوقف النشر الفوري والمجدول حتى يُعاد ربط الحساب، وستفشل المنشورات
              المجدولة القادمة. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={disconnectMutation.isPending}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget) disconnectMutation.mutate(disconnectTarget.id);
              }}
              disabled={disconnectMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
          className="w-[calc(100vw-1.25rem)] max-w-lg rounded-xl p-4 sm:p-6"
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
              className="min-h-28 resize-none text-sm leading-relaxed"
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
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !editText.trim() ||
                !validateXPostText(editText, null).valid ||
                editMutation.isPending
              }
              onClick={() => {
                if (editingPost) {
                  editMutation.mutate({ postId: editingPost.id, text: editText.trim() });
                }
              }}
              data-testid="button-save-post-edit"
            >
              {editMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري الحفظ...
                </>
              ) : (
                "حفظ التعديل"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* جدولة منشور */}
      <Dialog
        open={Boolean(schedulingPost)}
        onOpenChange={(open) => !open && setSchedulingPost(null)}
      >
        <DialogContent
          className="w-[calc(100vw-1.25rem)] max-w-md rounded-xl p-4 sm:p-6"
          dir="rtl"
        >
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              تحديد موعد نشر التغريدة
            </DialogTitle>
            <DialogDescription>
              اختر الوقت والتاريخ لنشر التغريدة تلقائياً عبر منصة X.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Input
              type="datetime-local"
              value={scheduledAtLocal}
              onChange={(e) => setScheduledAtLocal(e.target.value)}
              className="text-sm"
              dir="ltr"
              data-testid="input-schedule-datetime"
            />
            <p className="text-xs text-muted-foreground">
              * يجب أن يكون الموعد في المستقبل (بعد دقيقة على الأقل).
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={scheduleMutation.isPending}
              onClick={() => setSchedulingPost(null)}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={
                !scheduledAtLocal ||
                new Date(scheduledAtLocal).getTime() <= Date.now() + 60 * 1000 ||
                scheduleMutation.isPending
              }
              onClick={() => {
                if (schedulingPost && scheduledAtLocal) {
                  scheduleMutation.mutate({
                    postId: schedulingPost.id,
                    scheduledAt: scheduledAtLocal,
                  });
                }
              }}
              data-testid="button-confirm-schedule"
            >
              {scheduleMutation.isPending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جاري الجدولة...
                </>
              ) : (
                "اعتماد الجدولة"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
