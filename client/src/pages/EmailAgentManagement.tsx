import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailAgentStats, type EmailAgentStatsData } from "@/components/EmailAgentStats";
import { TrustedSendersTable } from "@/components/TrustedSendersTable";
import { AddSenderDialog } from "@/components/AddSenderDialog";
import { WebhookLogsTable } from "@/components/WebhookLogsTable";
import { EmailDetailsModal } from "@/components/EmailDetailsModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Plus, Mail, Users, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { TrustedEmailSender, EmailWebhookLog } from "@shared/schema";

interface SenderFormValues {
  email: string;
  name: string;
  language: "ar" | "en" | "ur";
  autoPublish: boolean;
  defaultCategory?: string;
  status: "active" | "suspended" | "revoked";
  token?: string;
}

export default function EmailAgentManagement() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingSender, setEditingSender] = useState<TrustedEmailSender | null>(null);
  const [selectedLog, setSelectedLog] = useState<EmailWebhookLog | null>(null);
  const [logsPage, setLogsPage] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState<string>("all");

  // Fetch statistics with error handling
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<EmailAgentStatsData>({
    queryKey: ['/api/email-agent/stats'],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && (user.role === 'admin' || user.role === 'system_admin'),
  });

  // Fetch trusted senders with error handling
  const {
    data: senders,
    isLoading: sendersLoading,
    error: sendersError,
    refetch: refetchSenders,
  } = useQuery<TrustedEmailSender[]>({
    queryKey: ['/api/email-agent/senders'],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && (user.role === 'admin' || user.role === 'system_admin'),
  });

  // Fetch webhook logs with error handling
  const {
    data: logsData,
    isLoading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useQuery<{ logs: EmailWebhookLog[]; total: number }>({
    queryKey: ['/api/email-agent/logs', logsPage, logsStatusFilter],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && (user.role === 'admin' || user.role === 'system_admin'),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(logsPage),
        limit: '50',
      });
      if (logsStatusFilter !== 'all') {
        params.append('status', logsStatusFilter);
      }
      const res = await fetch(`/api/email-agent/logs?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Logs API error:', res.status, errorText);
        throw new Error(`فشل في تحميل سجلات البريد: ${res.status}`);
      }
      return await res.json();
    },
  });

  // Create sender mutation
  const createSenderMutation = useMutation({
    mutationFn: async (values: SenderFormValues) => {
      return await apiRequest('/api/email-agent/senders', {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/senders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/stats'] });
      toast({
        title: "تم بنجاح",
        description: "تم إضافة المرسل الموثوق بنجاح",
      });
      setAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إضافة المرسل الموثوق",
        variant: "destructive",
      });
    },
  });

  // Update sender mutation
  const updateSenderMutation = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<SenderFormValues>;
    }) => {
      return await apiRequest(`/api/email-agent/senders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/senders'] });
      toast({
        title: "تم بنجاح",
        description: "تم تحديث المرسل الموثوق بنجاح",
      });
      setEditingSender(null);
      setAddDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث المرسل الموثوق",
        variant: "destructive",
      });
    },
  });

  // Delete sender mutation
  const deleteSenderMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/email-agent/senders/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/senders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/stats'] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف المرسل الموثوق بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف المرسل الموثوق",
        variant: "destructive",
      });
    },
  });

  // Delete log mutation
  const deleteLogMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/email-agent/logs/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/stats'] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف السجل بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف السجل",
        variant: "destructive",
      });
    },
  });

  // Bulk delete logs mutation
  const bulkDeleteLogsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return await apiRequest('/api/email-agent/logs/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/email-agent/stats'] });
      toast({
        title: "تم بنجاح",
        description: `تم حذف ${ids.length} سجل بنجاح`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف السجلات",
        variant: "destructive",
      });
    },
  });

  const handleAddSender = () => {
    setEditingSender(null);
    setAddDialogOpen(true);
  };

  const handleEditSender = (sender: TrustedEmailSender) => {
    setEditingSender(sender);
    setAddDialogOpen(true);
  };

  const handleSubmitSender = async (values: SenderFormValues) => {
    if (editingSender) {
      await updateSenderMutation.mutateAsync({
        id: editingSender.id,
        values,
      });
    } else {
      await createSenderMutation.mutateAsync(values);
    }
  };

  const handleDeleteSender = (senderId: string) => {
    deleteSenderMutation.mutate(senderId);
  };

  const handleToggleSenderStatus = (
    senderId: string,
    newStatus: "active" | "suspended"
  ) => {
    updateSenderMutation.mutate({
      id: senderId,
      values: { status: newStatus },
    });
  };

  const handleLogClick = (log: EmailWebhookLog) => {
    setSelectedLog(log);
  };

  const handleStatusFilter = (status: string) => {
    setLogsStatusFilter(status);
    setLogsPage(1); // Reset to first page when filtering
  };

  const handleDeleteLog = (id: string) => {
    deleteLogMutation.mutate(id);
  };

  const handleBulkDeleteLogs = (ids: string[]) => {
    bulkDeleteLogsMutation.mutate(ids);
  };

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="text-center py-20">
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Check permissions (requires admin.manage_settings)
  // For simplicity, we'll check if user has admin or system_admin role
  if (!user || (user.role !== 'admin' && user.role !== 'system_admin')) {
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
            <div className="mt-4 text-xs text-muted-foreground">
              الدور الحالي: {user?.role || 'غير معروف'}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Show API errors if any
  const hasErrors = statsError || sendersError || logsError;
  if (hasErrors) {
    console.error('Email Agent Errors:', { statsError, sendersError, logsError });
  }

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">إدارة نظام البريد الذكي</h1>
            <p className="text-muted-foreground mt-1">
              إدارة المرسلين الموثوقين ومراقبة سجلات البريد الوارد
            </p>
          </div>
        </div>

        {/* Error Display */}
        {hasErrors && (
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">حدثت أخطاء في تحميل البيانات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {statsError && <p>• خطأ في الإحصائيات: {statsError.message}</p>}
              {sendersError && <p>• خطأ في المرسلين: {sendersError.message}</p>}
              {logsError && <p>• خطأ في السجلات: {logsError.message}</p>}
            </CardContent>
          </Card>
        )}

        {/* Statistics Dashboard */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              إحصائيات اليوم
            </CardTitle>
            <CardDescription>
              ملخص نشاط البريد الإلكتروني لهذا اليوم
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsError ? (
              <div className="text-destructive text-sm p-4 bg-destructive/10 rounded">
                فشل في تحميل الإحصائيات. الرجاء إعادة تحميل الصفحة.
              </div>
            ) : (
              <EmailAgentStats data={stats} isLoading={statsLoading} />
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Trusted Senders Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  المرسلون الموثوقون
                </CardTitle>
                <CardDescription>
                  إدارة عناوين البريد الإلكتروني المصرح لها بالنشر التلقائي
                </CardDescription>
              </div>
              <Button
                onClick={handleAddSender}
                data-testid="button-add-sender"
                disabled={!!sendersError}
              >
                <Plus className="h-4 w-4 ml-2" />
                إضافة مرسل
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {sendersError ? (
              <div className="text-destructive text-sm p-4 bg-destructive/10 rounded">
                فشل في تحميل المرسلين الموثوقين. الرجاء إعادة تحميل الصفحة.
              </div>
            ) : (
              <TrustedSendersTable
                senders={senders}
                isLoading={sendersLoading}
                onEdit={handleEditSender}
                onDelete={handleDeleteSender}
                onToggleStatus={handleToggleSenderStatus}
              />
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Email Webhook Logs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              سجلات البريد الوارد
            </CardTitle>
            <CardDescription>
              جميع الرسائل المستلمة وحالة معالجتها
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logsError ? (
              <div className="text-destructive text-sm p-4 bg-destructive/10 rounded">
                فشل في تحميل سجلات البريد. الرجاء إعادة تحميل الصفحة.
              </div>
            ) : (
              <WebhookLogsTable
                logs={logsData?.logs}
                isLoading={logsLoading}
                totalCount={logsData?.total || 0}
                currentPage={logsPage}
                pageSize={50}
                onPageChange={setLogsPage}
                onStatusFilter={handleStatusFilter}
                onRowClick={handleLogClick}
                onDelete={handleDeleteLog}
                onBulkDelete={handleBulkDeleteLogs}
              />
            )}
          </CardContent>
        </Card>

        {/* Dialogs */}
        <AddSenderDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          onSubmit={handleSubmitSender}
          editingSender={editingSender}
          isSubmitting={
            createSenderMutation.isPending || updateSenderMutation.isPending
          }
        />

        <EmailDetailsModal
          open={!!selectedLog}
          onOpenChange={(open) => !open && setSelectedLog(null)}
          log={selectedLog}
        />
        </div>
      </ErrorBoundary>
    </DashboardLayout>
  );
}
