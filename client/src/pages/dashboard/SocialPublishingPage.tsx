// صفحة «النشر الاجتماعي» — سجل منشورات X + إدارة ربط الحساب.
// البوابة: social_publish.view (قسم الحسابات: social_publish.manage_accounts).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCcw,
  Share2,
  Unlink,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  status: string;
  text: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostUrl: string | null;
  lastError: string | null;
}

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "مسودة", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "مجدول", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  processing: { label: "جارٍ النشر", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  published: { label: "منشور", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  failed: { label: "فشل", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  canceled: { label: "ملغي", className: "bg-muted text-muted-foreground" },
};

const OAUTH_RESULT_MESSAGES: Record<string, { title: string; destructive: boolean }> = {
  connected: { title: "تم ربط حساب X بنجاح", destructive: false },
  denied: { title: "رُفض التفويض من X", destructive: true },
  state_mismatch: { title: "فشل التحقق من جلسة الربط — حاول مجدداً", destructive: true },
  expired: { title: "انتهت مهلة الربط — حاول مجدداً", destructive: true },
  error: { title: "تعذر إتمام ربط الحساب", destructive: true },
};

export default function SocialPublishingPage() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const canManageAccounts = hasPermission(user, "social_publish.manage_accounts");
  const canManageScheduled = hasPermission(user, "social_publish.manage_scheduled");
  const canPublishNow = hasPermission(user, "social_publish.publish_now");

  const [disconnectTarget, setDisconnectTarget] = useState<SafeAccount | null>(null);

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
  const connectAction = () =>
    isPubler ? publerSyncMutation.mutate() : connectMutation.mutate();
  const connectDisabled =
    connectPending || (isPubler ? !accountsRaw?.publerConfigured : !oauthConfigured);
  const connectLabel = isPubler ? "مزامنة حساب X من Publer" : "ربط حساب X";

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
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
      toast({ title: "نُشر على X" });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
      toast({ title: "فشلت إعادة المحاولة", description: error.message, variant: "destructive" });
    },
  });

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh",
    [],
  );

  if (!authLoading && !hasPermission(user, "social_publish.view")) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">
          لا تملك صلاحية الوصول إلى هذه الصفحة
        </div>
      </DashboardLayout>
    );
  }

  const accountBadge = (status: string) => {
    switch (status) {
      case "connected":
        return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">متصل</Badge>;
      case "expired":
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">انتهى الاعتماد</Badge>;
      case "revoked":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">مسحوب</Badge>;
      default:
        return <Badge variant="outline">غير متصل</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <DashboardPageShell contentClassName="pb-10 space-y-5 md:space-y-6">
        <DashboardPageHeader
          icon={Share2}
          title="النشر الاجتماعي"
          description="نشر أخبار سبق على منصة X — فورياً أو بجدولة، مع سجل المحاولات"
          titleTestId="heading-social-publishing"
        />

        {/* الحساب */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              حساب منصة X
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {accountsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : xAccount ? (
              <div className="flex flex-wrap items-center gap-3">
                {accountBadge(xAccount.status)}
                <div className="text-sm">
                  <span className="font-medium">{xAccount.displayName || "حساب X"}</span>{" "}
                  <span className="text-muted-foreground" dir="ltr">
                    @{xAccount.handle || "—"}
                  </span>
                </div>
                {canManageAccounts && (
                  <div className="mr-auto flex gap-2">
                    {isPubler && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => publerSyncMutation.mutate()}
                        disabled={connectDisabled}
                        data-testid="button-publer-sync"
                      >
                        {publerSyncMutation.isPending && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
                        إعادة المزامنة من Publer
                      </Button>
                    )}
                    {!isPubler && xAccount.status !== "connected" && (
                      <Button
                        size="sm"
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending || !oauthConfigured}
                        data-testid="button-reconnect-x"
                      >
                        {connectMutation.isPending && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
                        إعادة الربط
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDisconnectTarget(xAccount)}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-disconnect-x"
                    >
                      <Unlink className="w-4 h-4 ml-1" />
                      فك الربط
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {isPubler
                    ? "وسيلة النشر: Publer — يُربط حساب X من لوحة Publer (workspace)، ثم يُزامَن هنا. لا تُخزن أي توكنات لدينا."
                    : "لا يوجد حساب X مرتبط. الربط يتم عبر تفويض OAuth الرسمي من X — لا تُدخل كلمات مرور هنا أبداً."}
                </p>
                {isPubler && !accountsRaw?.publerConfigured && (
                  <p className="text-sm text-amber-600">
                    التهيئة ناقصة: يلزم ضبط PUBLER_API_KEY وPUBLER_WORKSPACE_ID في بيئة الخادم أولاً.
                  </p>
                )}
                {!isPubler && !oauthConfigured && (
                  <p className="text-sm text-amber-600">
                    التهيئة ناقصة: يلزم ضبط X_CLIENT_ID وX_CLIENT_SECRET في بيئة الخادم أولاً.
                  </p>
                )}
                {canManageAccounts && (
                  <Button
                    size="sm"
                    onClick={connectAction}
                    disabled={connectDisabled}
                    data-testid="button-connect-x"
                  >
                    {connectPending && <Loader2 className="w-4 h-4 ml-1 animate-spin" />}
                    {connectLabel}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* سجل المنشورات */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              سجل المنشورات
              <span className="text-xs font-normal text-muted-foreground">
                (المنطقة الزمنية: {timeZone})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {postsLoading ? (
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            ) : posts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                لا منشورات بعد — افتح خبراً منشوراً من «إدارة الأخبار» واختر «النشر على X».
              </p>
            ) : (
              <div className="space-y-2">
                {posts.map((p) => {
                  const badge = STATUS_BADGES[p.status] ?? STATUS_BADGES.draft;
                  return (
                    <div
                      key={p.id}
                      className="flex items-start gap-3 rounded-md border p-3 text-sm"
                      data-testid={`social-log-row-${p.id}`}
                    >
                      <Badge className={badge.className}>{badge.label}</Badge>
                      <div className="flex-1 min-w-0 space-y-1">
                        {p.articleTitle && (
                          <div className="text-xs text-muted-foreground truncate">
                            {p.articleTitle}
                          </div>
                        )}
                        <div className="truncate">{p.text}</div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {p.scheduledAt && p.status === "scheduled" && (
                            <span>موعد النشر: {new Date(p.scheduledAt).toLocaleString("ar-SA")}</span>
                          )}
                          {p.publishedAt && (
                            <span>نُشر: {new Date(p.publishedAt).toLocaleString("ar-SA")}</span>
                          )}
                        </div>
                        {p.status === "failed" && p.lastError && (
                          <div className="text-xs text-destructive">{p.lastError}</div>
                        )}
                        {p.externalPostUrl && (
                          <a
                            href={p.externalPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-sky-600 inline-flex items-center gap-1"
                            dir="ltr"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {p.externalPostUrl}
                          </a>
                        )}
                      </div>
                      {p.status === "scheduled" && canManageScheduled && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(p.id)}
                          data-testid={`button-log-cancel-${p.id}`}
                        >
                          إلغاء
                        </Button>
                      )}
                      {p.status === "failed" && canPublishNow && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(p.id)}
                          data-testid={`button-log-retry-${p.id}`}
                        >
                          <RefreshCcw className="w-3 h-3 ml-1" />
                          إعادة
                        </Button>
                      )}
                    </div>
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
        <AlertDialogContent dir="rtl">
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
