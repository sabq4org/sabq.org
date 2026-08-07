// صفحة «النشر الاجتماعي» — التصميم المعتمد 2026-08-07:
// بطاقة حساب غنية + 4 بطاقات إحصائية + سجل بفلاتر وبطاقات ملونة الحالة
// تعرض المنشئ/الناشر والخبر المصدر، بتواريخ ميلادية وأرقام لاتينية
// بتوقيت الرياض (fmtSocialDateTime). البوابة: social_publish.view.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Link2,
  ListTree,
  Loader2,
  RefreshCcw,
  Share2,
  Unlink,
  User,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

type StatusFilter = "all" | "published" | "scheduled" | "failed";

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

  const [disconnectTarget, setDisconnectTarget] = useState<SafeAccount | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [attemptsFor, setAttemptsFor] = useState<string | null>(null);

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
      toast({ title: "أُلغي المنشور المجدول" });
    },
    onError: (error: any) => {
      toast({ title: "تعذر الإلغاء", description: error.message, variant: "destructive" });
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
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5 border-0">
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            متصل
          </Badge>
        );
      case "expired":
        return <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-0">انتهى الاعتماد</Badge>;
      case "revoked":
        return <Badge className="bg-red-500/10 text-red-700 dark:text-red-400 border-0">مسحوب</Badge>;
      default:
        return <Badge variant="outline">غير متصل</Badge>;
    }
  };

  const statTiles = [
    {
      key: "today",
      label: "نُشر اليوم",
      value: stats?.publishedToday,
      icon: CheckCircle2,
      chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "scheduled",
      label: "مجدولة قادمة",
      value: stats?.scheduledUpcoming,
      icon: CalendarClock,
      chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    },
    {
      key: "failed",
      label: "تحتاج انتباهك",
      value: stats?.failed,
      icon: AlertTriangle,
      chip: "bg-red-500/10 text-red-600 dark:text-red-400",
    },
    {
      key: "total",
      label: "إجمالي المنشورات",
      value: stats?.total,
      icon: BarChart3,
      chip: "bg-primary/10 text-primary",
    },
  ];

  const filterButtons: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "الكل" },
    { key: "published", label: "منشور" },
    { key: "scheduled", label: "مجدول" },
    { key: "failed", label: "فشل" },
  ];

  return (
    <DashboardLayout>
      <DashboardPageShell contentClassName="pb-10 space-y-5">
        <DashboardPageHeader
          icon={Share2}
          title="النشر الاجتماعي"
          description="نشر أخبار سبق على منصة X — فورياً أو بجدولة، مع سجل كامل للمحاولات"
          titleTestId="heading-social-publishing"
        />

        {/* الحساب + الإحصائيات */}
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,1.1fr)_2fr]">
          <Card className="rounded-2xl">
            <CardContent className="p-5 space-y-4">
              {accountsLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : xAccount ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="w-13 h-13 min-w-12 min-h-12 rounded-full bg-gradient-to-br from-primary to-blue-600 text-white flex items-center justify-center text-xl font-bold">
                      س
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-base truncate">
                        {xAccount.displayName || "حساب X"}
                      </div>
                      <div className="text-sm text-muted-foreground" dir="ltr">
                        @{xAccount.handle || "sabqorg"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {accountStatusPill(xAccount.status)}
                    {isPubler && (
                      <Badge className="bg-primary/10 text-primary border-0">عبر Publer</Badge>
                    )}
                  </div>
                  {xAccount.lastVerifiedAt && (
                    <p className="text-xs text-muted-foreground" style={{ fontVariantNumeric: latn }}>
                      آخر تحقق: {fmtSocialDateTime(xAccount.lastVerifiedAt)}
                    </p>
                  )}
                  {canManageAccounts && (
                    <div className="flex gap-2 pt-1">
                      {isPubler ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => publerSyncMutation.mutate()}
                          disabled={connectDisabled}
                          data-testid="button-publer-sync"
                        >
                          {publerSyncMutation.isPending && (
                            <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                          )}
                          إعادة المزامنة
                        </Button>
                      ) : (
                        xAccount.status !== "connected" && (
                          <Button
                            size="sm"
                            onClick={() => connectMutation.mutate()}
                            disabled={connectDisabled}
                            data-testid="button-reconnect-x"
                          >
                            {connectMutation.isPending && (
                              <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                            )}
                            إعادة الربط
                          </Button>
                        )
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground"
                        onClick={() => setDisconnectTarget(xAccount)}
                        disabled={disconnectMutation.isPending}
                        data-testid="button-disconnect-x"
                      >
                        <Unlink className="w-4 h-4 ml-1" />
                        فك الربط
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                      <Link2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-bold">لا يوجد حساب X مرتبط</div>
                      <p className="text-xs text-muted-foreground">
                        {isPubler
                          ? "يُربط الحساب من لوحة Publer ثم يُزامَن هنا — لا تُخزن توكنات لدينا"
                          : "الربط عبر تفويض OAuth الرسمي من X — لا كلمات مرور هنا أبداً"}
                      </p>
                    </div>
                  </div>
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
                  {canManageAccounts && (
                    <Button
                      size="sm"
                      onClick={() => (isPubler ? publerSyncMutation.mutate() : connectMutation.mutate())}
                      disabled={connectDisabled}
                      data-testid="button-connect-x"
                    >
                      {connectPending && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
                      {isPubler ? "مزامنة حساب X من Publer" : "ربط حساب X"}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statTiles.map((tile) => (
              <Card key={tile.key} className="rounded-2xl">
                <CardContent className="p-4 space-y-2">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${tile.chip}`}
                  >
                    <tile.icon className="w-4 h-4" />
                  </span>
                  <div
                    className="text-2xl font-bold leading-none"
                    dir="ltr"
                    style={{ fontVariantNumeric: latn }}
                    data-testid={`stat-${tile.key}`}
                  >
                    {tile.value ?? "—"}
                  </div>
                  <div className="text-xs font-semibold text-muted-foreground">{tile.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* السجل */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-bold flex items-center gap-2">
            سجل المنشورات
            <span className="text-xs font-medium text-muted-foreground">
              التواريخ ميلادية بتوقيت الرياض
            </span>
          </h2>
          <div className="flex gap-1.5 flex-wrap">
            {filterButtons.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === f.key
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
                data-testid={`filter-${f.key}`}
              >
                {f.label}{" "}
                <span dir="ltr" style={{ fontVariantNumeric: latn }}>
                  {filterCounts[f.key]}
                </span>
              </button>
            ))}
          </div>
        </div>

        <Card className="rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            {postsLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">
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
                      className="relative flex gap-4 p-4 sm:p-5"
                      data-testid={`social-log-row-${p.id}`}
                    >
                      <span className={`absolute inset-y-0 right-0 w-[3px] ${meta.strip}`} />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`${meta.pill} border-0`}>
                            {meta.label}
                            {p.status === "scheduled" && p.scheduledAt && (
                              <> · {fmtRelativeToNow(p.scheduledAt)}</>
                            )}
                          </Badge>
                          {p.status === "failed" && (
                            <Badge className="bg-muted text-muted-foreground border-0" dir="ltr" style={{ fontVariantNumeric: latn }}>
                              {p.attempts}/3
                            </Badge>
                          )}
                          {p.articleTitle && (
                            <span className="text-xs text-muted-foreground min-w-0 truncate">
                              من خبر: <b className="text-foreground font-semibold">{p.articleTitle}</b>
                            </span>
                          )}
                        </div>

                        <p className="text-[15px] leading-[1.75] break-words m-0">{p.text}</p>

                        {p.status === "failed" && p.lastError && (
                          <div className="bg-red-500/10 text-red-700 dark:text-red-400 rounded-lg px-3 py-2 text-[13px] leading-relaxed break-words">
                            {p.lastError}
                          </div>
                        )}

                        <div
                          className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground"
                          style={{ fontVariantNumeric: latn }}
                        >
                          {p.createdByName && (
                            <span className="inline-flex items-center gap-1">
                              <User className="w-3.5 h-3.5 opacity-70" />
                              أنشأه <b className="text-foreground font-semibold">{p.createdByName}</b>
                            </span>
                          )}
                          {p.publishedByName && p.status === "published" && p.publishedByName !== p.createdByName && (
                            <span>
                              نشره <b className="text-foreground font-semibold">{p.publishedByName}</b>
                            </span>
                          )}
                          {p.status === "scheduled" && p.scheduledAt ? (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="w-3.5 h-3.5 opacity-70" />
                              موعد النشر: {fmtSocialDateTime(p.scheduledAt)}
                            </span>
                          ) : (
                            <span>{fmtSocialDateTime(p.publishedAt || p.createdAt)}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {p.externalPostUrl && (
                            <Button asChild size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                              <a href={p.externalPostUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3.5 h-3.5" />
                                فتح في X
                              </a>
                            </Button>
                          )}
                          {p.status === "scheduled" && canManageScheduled && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-red-600 border-red-500/20 hover:bg-red-500/10"
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
                              className="h-7 text-xs"
                              disabled={retryMutation.isPending}
                              onClick={() => retryMutation.mutate(p.id)}
                              data-testid={`button-log-retry-${p.id}`}
                            >
                              <RefreshCcw className="w-3.5 h-3.5 ml-1" />
                              إعادة المحاولة
                            </Button>
                          )}
                          {(p.status === "failed" || p.attempts > 1) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              onClick={() => setAttemptsFor(attemptsFor === p.id ? null : p.id)}
                              data-testid={`button-attempts-${p.id}`}
                            >
                              <ListTree className="w-3.5 h-3.5 ml-1" />
                              {attemptsFor === p.id ? "إخفاء المحاولات" : "عرض المحاولات"}
                            </Button>
                          )}
                        </div>

                        {attemptsFor === p.id && (
                          <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-1.5">
                            {attemptsLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : attempts.length === 0 ? (
                              <p className="text-xs text-muted-foreground">لا محاولات مسجلة.</p>
                            ) : (
                              attempts.map((a) => (
                                <div
                                  key={a.id}
                                  className="flex items-center gap-2 flex-wrap text-xs"
                                  style={{ fontVariantNumeric: latn }}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      a.outcome === "success" ? "bg-emerald-500" : "bg-red-500"
                                    }`}
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
                                    <span className="text-red-600 dark:text-red-400 w-full break-words">
                                      {a.errorMessage}
                                    </span>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {thumb && (
                        <img
                          src={thumb}
                          alt=""
                          loading="lazy"
                          className="w-16 h-16 sm:w-[84px] sm:h-[84px] rounded-xl object-cover border border-border shrink-0 bg-muted"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </DashboardPageShell>

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
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              ) : (
                <Unlink className="w-4 h-4 ml-2" />
              )}
              فك الربط
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
