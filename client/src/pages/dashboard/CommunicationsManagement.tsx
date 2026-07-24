import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Mail,
  MessageSquare,
  Radio,
  Loader2,
  Inbox,
  FileCheck,
  FileEdit,
  XCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth, hasAnyPermission } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import EmailAgentTab from "@/components/communications/EmailAgentTab";
import WhatsAppTab from "@/components/communications/WhatsAppTab";

interface BadgeStats {
  newMessages: number;
  publishedToday: number;
  draftedToday?: number;
  rejectedToday: number;
}

const BADGE_STATS_REFETCH_MS = 180000;

// البوابات الأربع القديمة (سايدبار / صفحة / بريد / واتساب) كانت متضاربة، فمستخدم
// يملك communications.manage يرى الرابط ثم يصطدم بـ«غير مصرح». المرجع الآن الصلاحيات،
// مع إبقاء الأدوار النصية للحسابات القديمة التي لا تملك مدخلاً في user_roles.
const LEGACY_ROLES = ["admin", "system_admin", "manager"];
// مسارات البريد محروسة بـ admin.manage_settings، ومسارات الواتساب بدور admin/manager.
const EMAIL_PERMISSIONS = ["admin.manage_settings", "communications.manage"];

function ChannelSplit({ email, whatsapp }: { email: number; whatsapp: number }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1">
        <Mail className="h-3 w-3" aria-hidden="true" />
        {email}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span className="flex items-center gap-1">
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        {whatsapp}
      </span>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
  email: number;
  whatsapp: number;
  testId: string;
}

function SummaryCard({ label, value, icon: Icon, tone, email, whatsapp, testId }: SummaryCardProps) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums" data-testid={testId}>
              {value}
            </p>
            <ChannelSplit email={email} whatsapp={whatsapp} />
          </div>
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone)}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AccessDenied({ message }: { message: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        </span>
        <p className="font-medium text-foreground">لا تملك صلاحية هذا القسم</p>
        <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

export default function CommunicationsManagement() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("email");

  const role = user?.role || "";
  const canUseWhatsapp = !!user && (LEGACY_ROLES.includes(role) || hasAnyPermission(user, ...EMAIL_PERMISSIONS));
  const canUseEmail = !!user && (role === "admin" || role === "system_admin" || hasAnyPermission(user, ...EMAIL_PERMISSIONS));
  const canOpenPage = canUseEmail || canUseWhatsapp;

  const { data: whatsappStats, isFetching: whatsappFetching } = useQuery<BadgeStats>({
    queryKey: ['/api/whatsapp/badge-stats'],
    enabled: canUseWhatsapp,
    refetchInterval: BADGE_STATS_REFETCH_MS,
  });

  const { data: emailStats, isFetching: emailFetching } = useQuery<BadgeStats>({
    queryKey: ['/api/email-agent/badge-stats'],
    enabled: canUseEmail,
    refetchInterval: BADGE_STATS_REFETCH_MS,
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canOpenPage) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="py-20 text-center">
            <p className="text-lg text-destructive">غير مصرح لك بالوصول إلى هذه الصفحة</p>
            <p className="mt-2 text-sm text-muted-foreground">
              يتطلب الوصول إلى هذه الصفحة صلاحية إدارة قنوات الاتصال
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const emailNew = emailStats?.newMessages ?? 0;
  const whatsappNew = whatsappStats?.newMessages ?? 0;
  const isRefreshing = emailFetching || whatsappFetching;

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/email-agent/badge-stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/badge-stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/email-agent/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/email-agent/logs'] });
    queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/logs'] });
  };

  const summaryLoading = (canUseEmail && !emailStats) || (canUseWhatsapp && !whatsappStats);

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
          <DashboardPageHeader
            icon={Radio}
            title="قنوات الاتصال"
            description="كل ما يصل غرفة الأخبار عبر البريد والواتساب في مكان واحد"
            titleTestId="text-page-title"
            actions={
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
                disabled={isRefreshing}
                data-testid="button-refresh-all"
              >
                <RefreshCw className={cn("ml-2 h-4 w-4", isRefreshing && "animate-spin")} aria-hidden="true" />
                تحديث
              </Button>
            }
          />

          <section aria-label="ملخص اليوم" className="space-y-3">
            <div className="flex items-baseline gap-2 px-1">
              <h2 className="text-sm font-semibold text-foreground">ملخص اليوم</h2>
              <span className="text-xs text-muted-foreground">مجموع القناتين — بتوقيت الرياض</span>
            </div>

            {summaryLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-[104px]" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <SummaryCard
                  label="وارد بانتظار المعالجة"
                  value={emailNew + whatsappNew}
                  icon={Inbox}
                  tone="bg-sky-500/15 text-sky-600 dark:text-sky-400"
                  email={emailNew}
                  whatsapp={whatsappNew}
                  testId="summary-new"
                />
                <SummaryCard
                  label="منشور اليوم"
                  value={(emailStats?.publishedToday ?? 0) + (whatsappStats?.publishedToday ?? 0)}
                  icon={FileCheck}
                  tone="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  email={emailStats?.publishedToday ?? 0}
                  whatsapp={whatsappStats?.publishedToday ?? 0}
                  testId="summary-published"
                />
                <SummaryCard
                  label="مسودات اليوم"
                  value={(emailStats?.draftedToday ?? 0) + (whatsappStats?.draftedToday ?? 0)}
                  icon={FileEdit}
                  tone="bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  email={emailStats?.draftedToday ?? 0}
                  whatsapp={whatsappStats?.draftedToday ?? 0}
                  testId="summary-drafted"
                />
                <SummaryCard
                  label="مرفوض اليوم"
                  value={(emailStats?.rejectedToday ?? 0) + (whatsappStats?.rejectedToday ?? 0)}
                  icon={XCircle}
                  tone="bg-red-500/15 text-red-600 dark:text-red-400"
                  email={emailStats?.rejectedToday ?? 0}
                  whatsapp={whatsappStats?.rejectedToday ?? 0}
                  testId="summary-rejected"
                />
              </div>
            )}
          </section>

          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 sm:max-w-md">
              <TabsTrigger
                value="email"
                data-testid="tab-email"
                className="flex items-center justify-center gap-2 rounded-lg py-2.5"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                البريد الذكي
                {emailNew > 0 && (
                  <Badge variant="default" className="mr-1" data-testid="badge-email-new">
                    {emailNew}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="whatsapp"
                data-testid="tab-whatsapp"
                className="flex items-center justify-center gap-2 rounded-lg py-2.5"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                واتساب
                {whatsappNew > 0 && (
                  <Badge variant="default" className="mr-1" data-testid="badge-whatsapp-new">
                    {whatsappNew}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-6">
              {canUseEmail ? (
                <EmailAgentTab />
              ) : (
                <AccessDenied message="إدارة البريد الذكي تتطلب صلاحية إعدادات النظام (admin.manage_settings)." />
              )}
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-6">
              {canUseWhatsapp ? (
                <WhatsAppTab />
              ) : (
                <AccessDenied message="إدارة واتساب تتطلب صلاحية إدارة قنوات الاتصال." />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
