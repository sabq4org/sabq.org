import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageSquare, Radio, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import EmailAgentTab from "@/components/communications/EmailAgentTab";
import WhatsAppTab from "@/components/communications/WhatsAppTab";

interface BadgeStats {
  newMessages: number;
  publishedToday: number;
  rejectedToday: number;
}

const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="flex items-center gap-3 px-1">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

export default function CommunicationsManagement() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("email");

  // Fetch WhatsApp badge stats with 30 second polling
  const { data: whatsappStats } = useQuery<BadgeStats>({
    queryKey: ['/api/whatsapp/badge-stats'],
    enabled: !!user && ['admin', 'system_admin', 'manager'].includes(user.role || ''),
    refetchInterval: 180000, // 3 min (was 30s)
  });

  // Fetch Email badge stats with 30 second polling
  const { data: emailStats } = useQuery<BadgeStats>({
    queryKey: ['/api/email-agent/badge-stats'],
    enabled: !!user && ['admin', 'system_admin', 'manager'].includes(user.role || ''),
    refetchInterval: 180000, // 3 min (was 30s)
  });

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !['admin', 'system_admin', 'manager'].includes(user.role || '')) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="text-center py-20">
            <p className="text-destructive text-lg">
              غير مصرح لك بالوصول إلى هذه الصفحة
            </p>
            <p className="text-muted-foreground text-sm mt-2">
              يتطلب الوصول إلى هذه الصفحة صلاحيات إدارية
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="p-4 md:p-6 space-y-6" dir="rtl">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-950/50">
                <Radio className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="text-page-title">
                  إدارة قنوات الاتصال
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  إدارة البريد الذكي والواتساب في مكان واحد
                </p>
              </div>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">رسائل البريد الجديدة</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {emailStats?.newMessages || 0}
                    </p>
                  </div>
                  <div className="p-2 rounded-md bg-blue-500/20">
                    <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">رسائل واتساب الجديدة</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {whatsappStats?.newMessages || 0}
                    </p>
                  </div>
                  <div className="p-2 rounded-md bg-green-500/20">
                    <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-emerald-50 dark:bg-emerald-950/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">منشور اليوم</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {(emailStats?.publishedToday || 0) + (whatsappStats?.publishedToday || 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded-md bg-emerald-500/20">
                    <Mail className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate active-elevate-2 transition-all bg-red-50 dark:bg-red-950/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">مرفوض اليوم</p>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {(emailStats?.rejectedToday || 0) + (whatsappStats?.rejectedToday || 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded-md bg-red-500/20">
                    <Mail className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs Section */}
          <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
              <TabsTrigger value="email" data-testid="tab-email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                البريد الذكي
                {emailStats && emailStats.newMessages > 0 && (
                  <Badge variant="default" className="mr-2" data-testid="badge-email-new">
                    {emailStats.newMessages}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="whatsapp" data-testid="tab-whatsapp" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                واتساب
                {whatsappStats && whatsappStats.newMessages > 0 && (
                  <Badge variant="default" className="mr-2" data-testid="badge-whatsapp-new">
                    {whatsappStats.newMessages}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-6">
              <EmailAgentTab user={user as any} />
            </TabsContent>

            <TabsContent value="whatsapp" className="space-y-6">
              <WhatsAppTab user={user as any} />
            </TabsContent>
          </Tabs>
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
