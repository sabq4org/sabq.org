import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  MessageSquare,
  Users,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Edit,
  Trash2,
  Eye,
  Copy,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { WhatsappToken, WhatsappWebhookLog, User } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface StatsData {
  totalToday: number;
  successRate: number;
  averageQualityScore: number;
  activeTokens: number;
}

interface WhatsAppConfig {
  whatsappNumber: string | null;
  configured: boolean;
}

interface TokenFormValues {
  label: string;
  phoneNumber: string;
  autoPublish: boolean;
  allowedLanguages: string[];
  isAdmin: boolean;
  canDeleteAny: boolean;
  canArchiveAny: boolean;
  canEditAny: boolean;
  canMarkBreaking: boolean;
  isActive: boolean;
}

interface WhatsAppTabProps {
  user: User;
}

export default function WhatsAppTab({ user }: WhatsAppTabProps) {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLogDialogOpen, setDeleteLogDialogOpen] = useState(false);
  const [bulkDeleteLogsDialogOpen, setBulkDeleteLogsDialogOpen] = useState(false);
  const [selectedToken, setSelectedToken] = useState<WhatsappToken | null>(null);
  const [selectedLog, setSelectedLog] = useState<WhatsappWebhookLog | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [generatedToken, setGeneratedToken] = useState<string>("");
  const [logsPage, setLogsPage] = useState(1);
  const [logsStatusFilter, setLogsStatusFilter] = useState<string>("all");

  const [formData, setFormData] = useState<TokenFormValues>({
    label: "",
    phoneNumber: "",
    autoPublish: false,
    allowedLanguages: ["ar"],
    isAdmin: false,
    canDeleteAny: false,
    canArchiveAny: false,
    canEditAny: false,
    canMarkBreaking: false,
    isActive: true,
  });

  const { data: config } = useQuery<WhatsAppConfig>({
    queryKey: ['/api/whatsapp/config'],
    retry: 1,
    staleTime: 60000,
    enabled: !!user && ['admin', 'system_admin', 'manager'].includes(user.role || ''),
  });

  const { data: stats, isLoading: statsLoading } = useQuery<StatsData>({
    queryKey: ['/api/whatsapp/stats'],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && ['admin', 'system_admin', 'manager'].includes(user.role || ''),
  });

  const { data: tokens, isLoading: tokensLoading } = useQuery<WhatsappToken[]>({
    queryKey: ['/api/whatsapp/tokens'],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && ['admin', 'system_admin', 'manager'].includes(user.role || ''),
  });

  const { data: logsData, isLoading: logsLoading } = useQuery<{ logs: WhatsappWebhookLog[]; total: number }>({
    queryKey: ['/api/whatsapp/logs', { status: logsStatusFilter, limit: 50, offset: (logsPage - 1) * 50 }],
    retry: 1,
    staleTime: 30000,
    enabled: !!user && ['admin', 'system_admin', 'manager'].includes(user.role || ''),
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '50',
        offset: String((logsPage - 1) * 50),
      });
      if (logsStatusFilter !== 'all') {
        params.append('status', logsStatusFilter);
      }
      const res = await fetch(`/api/whatsapp/logs?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('فشل في تحميل السجلات');
      return await res.json();
    },
  });

  const generateToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = 'SABQ-';
    for (let i = 0; i < 24; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  };

  const createTokenMutation = useMutation({
    mutationFn: async (values: TokenFormValues) => {
      const token = generateToken();
      return await apiRequest('/api/whatsapp/tokens', {
        method: 'POST',
        body: JSON.stringify({ ...values, token }),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/tokens'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/stats'] });
      setGeneratedToken(data.token);
      toast({
        title: "تم بنجاح",
        description: "تم إنشاء رمز واتساب بنجاح",
      });
      setFormData({ 
        label: "", 
        phoneNumber: "", 
        autoPublish: false, 
        allowedLanguages: ["ar"],
        isAdmin: false,
        canDeleteAny: false,
        canArchiveAny: false,
        canEditAny: false,
        canMarkBreaking: false,
        isActive: true,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الرمز",
        variant: "destructive",
      });
    },
  });

  const updateTokenMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TokenFormValues> }) => {
      return await apiRequest(`/api/whatsapp/tokens/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/tokens'] });
      toast({
        title: "تم بنجاح",
        description: "تم تحديث الرمز بنجاح",
      });
      setEditDialogOpen(false);
      setSelectedToken(null);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الرمز",
        variant: "destructive",
      });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/whatsapp/tokens/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/tokens'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/stats'] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف الرمز بنجاح",
      });
      setDeleteDialogOpen(false);
      setSelectedToken(null);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الرمز",
        variant: "destructive",
      });
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/whatsapp/logs/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/stats'] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف السجل بنجاح",
      });
      setDeleteLogDialogOpen(false);
      setSelectedLog(null);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف السجل",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteLogsMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return await apiRequest('/api/whatsapp/logs/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/logs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp/stats'] });
      toast({
        title: "تم بنجاح",
        description: "تم حذف السجلات المحددة بنجاح",
      });
      setBulkDeleteLogsDialogOpen(false);
      setSelectedLogIds([]);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف السجلات",
        variant: "destructive",
      });
    },
  });

  const handleCreateToken = () => {
    setFormData({ 
      label: "", 
      phoneNumber: "", 
      autoPublish: false, 
      allowedLanguages: ["ar"],
      isAdmin: false,
      canDeleteAny: false,
      canArchiveAny: false,
      canEditAny: false,
      canMarkBreaking: false,
      isActive: true,
    });
    setGeneratedToken("");
    setCreateDialogOpen(true);
  };

  const handleEditToken = (token: WhatsappToken) => {
    setSelectedToken(token);
    setFormData({
      label: token.label || "",
      phoneNumber: token.phoneNumber,
      autoPublish: token.autoPublish,
      allowedLanguages: token.allowedLanguages,
      isAdmin: token.isAdmin || false,
      canDeleteAny: token.canDeleteAny || false,
      canArchiveAny: token.canArchiveAny || false,
      canEditAny: token.canEditAny || false,
      canMarkBreaking: token.canMarkBreaking || false,
      isActive: token.isActive !== false,
    });
    setEditDialogOpen(true);
  };

  const handleDeleteToken = (token: WhatsappToken) => {
    setSelectedToken(token);
    setDeleteDialogOpen(true);
  };

  const handleViewLog = (log: WhatsappWebhookLog) => {
    setSelectedLog(log);
    setViewDialogOpen(true);
  };

  const handleDeleteLog = (log: WhatsappWebhookLog) => {
    setSelectedLog(log);
    setDeleteLogDialogOpen(true);
  };

  const handleSelectAllLogs = (checked: boolean) => {
    if (checked && logsData?.logs) {
      setSelectedLogIds(logsData.logs.map((log) => log.id));
    } else {
      setSelectedLogIds([]);
    }
  };

  const handleSelectLog = (logId: string, checked: boolean) => {
    if (checked) {
      setSelectedLogIds((prev) => [...prev, logId]);
    } else {
      setSelectedLogIds((prev) => prev.filter((id) => id !== logId));
    }
  };

  const handleBulkDeleteLogs = () => {
    if (selectedLogIds.length > 0) {
      setBulkDeleteLogsDialogOpen(true);
    }
  };

  const handleSubmitCreate = async () => {
    if (!formData.label || !formData.phoneNumber) {
      toast({
        title: "خطأ",
        description: "الرجاء ملء جميع الحقول المطلوبة",
        variant: "destructive",
      });
      return;
    }
    await createTokenMutation.mutateAsync(formData);
  };

  const handleSubmitEdit = async () => {
    if (!selectedToken) return;
    await updateTokenMutation.mutateAsync({
      id: selectedToken.id,
      data: {
        autoPublish: formData.autoPublish,
        allowedLanguages: formData.allowedLanguages,
        isAdmin: formData.isAdmin,
        canDeleteAny: formData.canDeleteAny,
        canArchiveAny: formData.canArchiveAny,
        canEditAny: formData.canEditAny,
        canMarkBreaking: formData.canMarkBreaking,
        isActive: formData.isActive,
      },
    });
  };

  const handleToggleLanguage = (lang: string) => {
    setFormData((prev) => ({
      ...prev,
      allowedLanguages: prev.allowedLanguages.includes(lang)
        ? prev.allowedLanguages.filter((l) => l !== lang)
        : [...prev.allowedLanguages, lang],
    }));
  };

  const copyToClipboard = (text: string, isToken: boolean = false) => {
    const textToCopy = isToken ? `#TOKEN ${text}` : text;
    navigator.clipboard.writeText(textToCopy);
    toast({
      title: "تم النسخ",
      description: isToken ? "تم نسخ الرمز بالصيغة الكاملة #TOKEN SABQ-xxxx" : "تم نسخ النص إلى الحافظة",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500" data-testid={`badge-status-${status}`}>نجح</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500" data-testid={`badge-status-${status}`}>مرفوض</Badge>;
      case 'failed':
        return <Badge className="bg-yellow-500" data-testid={`badge-status-${status}`}>فشل</Badge>;
      default:
        return <Badge data-testid={`badge-status-${status}`}>{status}</Badge>;
    }
  };

  const totalPages = Math.ceil((logsData?.total || 0) / 50);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">رسائل اليوم</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-today">
              {statsLoading ? "..." : stats?.totalToday || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">معدل النجاح</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-success-rate">
              {statsLoading ? "..." : `${(stats?.successRate || 0).toFixed(1)}%`}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">متوسط الجودة</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-quality">
              {statsLoading ? "..." : (stats?.averageQualityScore || 0).toFixed(1)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الرموز النشطة</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-active-tokens">
              {statsLoading ? "..." : stats?.activeTokens || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Usage Instructions */}
      <Card className="bg-gradient-to-l from-primary/5 to-transparent border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            كيفية إرسال الأخبار عبر واتساب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  1
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">أنشئ رمزاً جديداً</h4>
                  <p className="text-sm text-muted-foreground">
                    اضغط "إنشاء رمز جديد" وأدخل رقم جوالك
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">أرسل إلى واتساب</h4>
                  <p className="text-sm text-muted-foreground">
                    أرسل الخبر إلى رقم واتساب المنصة:{" "}
                    {config?.whatsappNumber ? (
                      <code className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold" dir="ltr">
                        {config.whatsappNumber}
                      </code>
                    ) : (
                      <span className="text-muted-foreground">جاري التحميل...</span>
                    )}
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                  3
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">النشر التلقائي</h4>
                  <p className="text-sm text-muted-foreground">
                    سيتم نشر الخبر أو حفظه كمسودة حسب الإعدادات
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-muted/50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">مثال على الرسالة:</p>
                {config?.whatsappNumber && (
                  <p className="text-xs text-muted-foreground">
                    أرسل إلى: <code className="text-primary font-mono" dir="ltr">{config.whatsappNumber}</code>
                  </p>
                )}
              </div>
              <div className="bg-background p-3 rounded border font-mono text-sm" dir="ltr">
                <div className="text-primary">#TOKEN SABQ-XXXXX</div>
                <div className="mt-2">
                  عنوان الخبر هنا
                  <br />
                  محتوى الخبر...
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                💡 يمكنك إرفاق صور مع الرسالة وسيتم رفعها تلقائياً
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                رموز واتساب
              </CardTitle>
              <CardDescription>
                إدارة الرموز المصرح لها بإرسال الرسائل
              </CardDescription>
            </div>
            <Button onClick={handleCreateToken} data-testid="button-create-token" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 ml-2" />
              إنشاء رمز جديد
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {tokensLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !tokens || tokens.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">لا توجد رموز</p>
            </div>
          ) : (
            <>
              {/* Desktop view - Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التسمية</TableHead>
                      <TableHead>الرمز</TableHead>
                      <TableHead>رقم الهاتف</TableHead>
                      <TableHead>نشر تلقائي</TableHead>
                      <TableHead>اللغات</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>مرات الاستخدام</TableHead>
                      <TableHead>آخر استخدام</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tokens.map((token) => (
                      <TableRow key={token.id} data-testid={`row-token-${token.id}`}>
                        <TableCell data-testid={`text-label-${token.id}`}>{token.label}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded font-mono" data-testid={`text-token-${token.id}`}>
                              {token.token}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyToClipboard(token.token, true)}
                              data-testid={`button-copy-token-${token.id}`}
                              title="نسخ الرمز بالصيغة الكاملة #TOKEN SABQ-xxxx"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-phone-${token.id}`}>{token.phoneNumber}</TableCell>
                        <TableCell data-testid={`text-autopublish-${token.id}`}>
                          {token.autoPublish ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-languages-${token.id}`}>
                          {token.allowedLanguages.join(", ")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={token.isActive ? "default" : "secondary"} data-testid={`badge-status-${token.id}`}>
                            {token.isActive ? "نشط" : "معطل"}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-usage-${token.id}`}>{token.usageCount || 0}</TableCell>
                        <TableCell data-testid={`text-lastused-${token.id}`}>
                          {token.lastUsedAt
                            ? formatDistanceToNow(new Date(token.lastUsedAt), {
                                addSuffix: true,
                                locale: ar,
                              })
                            : "لم يستخدم بعد"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditToken(token)}
                              data-testid={`button-edit-${token.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteToken(token)}
                              data-testid={`button-delete-${token.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile view - Cards */}
              <div className="lg:hidden space-y-4">
                {tokens.map((token) => (
                  <Card key={token.id} className="p-4" data-testid={`card-token-${token.id}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base mb-1" data-testid={`text-label-${token.id}`}>
                            {token.label}
                          </h3>
                          <Badge variant={token.isActive ? "default" : "secondary"} data-testid={`badge-status-${token.id}`}>
                            {token.isActive ? "نشط" : "معطل"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditToken(token)}
                            data-testid={`button-edit-${token.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteToken(token)}
                            data-testid={`button-delete-${token.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">الرمز:</span>
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono flex-1" data-testid={`text-token-${token.id}`}>
                            {token.token}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => copyToClipboard(token.token, true)}
                            data-testid={`button-copy-token-${token.id}`}
                            title="نسخ الرمز بالصيغة الكاملة #TOKEN SABQ-xxxx"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">رقم الهاتف:</span>
                          <span data-testid={`text-phone-${token.id}`}>{token.phoneNumber}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">نشر تلقائي:</span>
                          <span data-testid={`text-autopublish-${token.id}`}>
                            {token.autoPublish ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 inline" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 inline" />
                            )}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">اللغات:</span>
                          <span data-testid={`text-languages-${token.id}`}>
                            {token.allowedLanguages.join(", ")}
                          </span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">مرات الاستخدام:</span>
                          <span data-testid={`text-usage-${token.id}`}>{token.usageCount || 0}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">آخر استخدام:</span>
                          <span data-testid={`text-lastused-${token.id}`} className="text-xs">
                            {token.lastUsedAt
                              ? formatDistanceToNow(new Date(token.lastUsedAt), {
                                  addSuffix: true,
                                  locale: ar,
                                })
                              : "لم يستخدم بعد"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  سجلات الرسائل
                </CardTitle>
                <CardDescription>جميع الرسائل المستلمة وحالة معالجتها</CardDescription>
              </div>
              <Select value={logsStatusFilter} onValueChange={setLogsStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="success">نجح</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                  <SelectItem value="failed">فشل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedLogIds.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                <p className="text-sm font-medium">تم تحديد {selectedLogIds.length} سجل</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDeleteLogs}
                  data-testid="button-bulk-delete-logs"
                >
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف المحدد
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : !logsData?.logs || logsData.logs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">لا توجد سجلات</p>
            </div>
          ) : (
            <>
              {/* Desktop view - Table */}
              <div className="hidden lg:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={logsData.logs.length > 0 && selectedLogIds.length === logsData.logs.length}
                          onCheckedChange={handleSelectAllLogs}
                          data-testid="checkbox-select-all-logs"
                          aria-label="تحديد الكل"
                        />
                      </TableHead>
                      <TableHead>من</TableHead>
                      <TableHead>نص الرسالة</TableHead>
                      <TableHead>الرمز</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead>حالة النشر</TableHead>
                      <TableHead>السبب</TableHead>
                      <TableHead>درجة الجودة</TableHead>
                      <TableHead>رابط المقال</TableHead>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsData.logs.map((log) => (
                      <TableRow key={log.id} data-testid={`row-log-${log.id}`}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedLogIds.includes(log.id)}
                            onCheckedChange={(checked) => handleSelectLog(log.id, checked as boolean)}
                            data-testid={`checkbox-log-${log.id}`}
                            aria-label={`تحديد السجل ${log.id}`}
                          />
                        </TableCell>
                        <TableCell data-testid={`text-from-${log.id}`}>{log.from}</TableCell>
                        <TableCell data-testid={`text-message-${log.id}`}>
                          <div className="max-w-[200px] truncate">
                            {log.message?.substring(0, 50)}
                            {(log.message?.length || 0) > 50 && "..."}
                          </div>
                        </TableCell>
                        <TableCell data-testid={`text-token-label-${log.id}`}>
                          {tokens?.find((t) => t.id === log.tokenId)?.label || "غير معروف"}
                        </TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell data-testid={`text-publish-status-${log.id}`}>
                          {log.publishStatus === 'published' ? (
                            <Badge className="bg-green-600" data-testid={`badge-published-${log.id}`}>منشور</Badge>
                          ) : log.publishStatus === 'draft' ? (
                            <Badge className="bg-blue-600" data-testid={`badge-draft-${log.id}`}>مسودة</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-reason-${log.id}`}>
                          {log.reason || "-"}
                        </TableCell>
                        <TableCell data-testid={`text-quality-${log.id}`}>
                          {log.qualityScore ? log.qualityScore.toFixed(1) : "-"}
                        </TableCell>
                        <TableCell data-testid={`text-article-${log.id}`}>
                          {log.articleLink ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={log.articleLink}
                                className="text-primary hover:underline text-sm"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                عرض المقال
                              </a>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyToClipboard(log.articleLink!)}
                                data-testid={`button-copy-article-link-${log.id}`}
                                title="نسخ الرابط"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell data-testid={`text-created-${log.id}`}>
                          {formatDistanceToNow(new Date(log.createdAt), {
                            addSuffix: true,
                            locale: ar,
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleViewLog(log)}
                              data-testid={`button-view-${log.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteLog(log)}
                              data-testid={`button-delete-log-${log.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile view - Cards */}
              <div className="lg:hidden space-y-4">
                {logsData.logs.map((log) => (
                  <Card key={log.id} className="p-4" data-testid={`card-log-${log.id}`}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            {getStatusBadge(log.status)}
                            {log.publishStatus === 'published' ? (
                              <Badge className="bg-green-600" data-testid={`badge-published-${log.id}`}>منشور</Badge>
                            ) : log.publishStatus === 'draft' ? (
                              <Badge className="bg-blue-600" data-testid={`badge-draft-${log.id}`}>مسودة</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground" data-testid={`text-created-${log.id}`}>
                            {formatDistanceToNow(new Date(log.createdAt), {
                              addSuffix: true,
                              locale: ar,
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewLog(log)}
                            data-testid={`button-view-${log.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLog(log)}
                            data-testid={`button-delete-log-${log.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">من:</span>
                          <span data-testid={`text-from-${log.id}`} className="text-xs">{log.from}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground">الرسالة:</span>
                          <p className="text-xs mt-1 line-clamp-2" data-testid={`text-message-${log.id}`}>
                            {log.message || "-"}
                          </p>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">الرمز:</span>
                          <span data-testid={`text-token-label-${log.id}`} className="text-xs">
                            {tokens?.find((t) => t.id === log.tokenId)?.label || "غير معروف"}
                          </span>
                        </div>

                        {log.reason && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">السبب:</span>
                            <span data-testid={`text-reason-${log.id}`} className="text-xs">
                              {log.reason}
                            </span>
                          </div>
                        )}

                        {log.qualityScore && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">الجودة:</span>
                            <span data-testid={`text-quality-${log.id}`} className="text-xs">
                              {log.qualityScore.toFixed(1)}
                            </span>
                          </div>
                        )}

                        {log.articleLink && (
                          <div className="flex items-center gap-2">
                            <a
                              href={log.articleLink}
                              className="text-primary hover:underline text-xs flex-1"
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`text-article-${log.id}`}
                            >
                              عرض المقال
                            </a>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => copyToClipboard(log.articleLink!)}
                              data-testid={`button-copy-article-link-${log.id}`}
                              title="نسخ الرابط"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                    صفحة {logsPage} من {totalPages} ({logsData.total} سجل)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                      disabled={logsPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setLogsPage((p) => Math.min(totalPages, p + 1))}
                      disabled={logsPage === totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Token Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto" data-testid="dialog-create-token">
          <DialogHeader>
            <DialogTitle>إنشاء رمز واتساب جديد</DialogTitle>
            <DialogDescription>
              {generatedToken
                ? "تم إنشاء الرمز بنجاح. احفظه في مكان آمن."
                : "أدخل البيانات لإنشاء رمز جديد"}
            </DialogDescription>
          </DialogHeader>

          {generatedToken ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>رمزك الجديد</Label>
                <div className="bg-muted p-4 rounded flex items-center justify-between">
                  <code className="text-sm font-mono" data-testid="text-generated-token">{generatedToken}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(generatedToken, true)}
                    data-testid="button-copy-token"
                    title="نسخ الرمز بالصيغة الكاملة #TOKEN SABQ-xxxx"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div className="flex items-start gap-2 text-sm bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 rounded-lg border border-amber-500/20">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>تأكد من حفظ هذا الرمز. لن تتمكن من رؤيته مرة أخرى.</p>
              </div>
              
              <Separator />
              
              <div className="space-y-3">
                <h4 className="font-medium text-sm">كيفية الاستخدام:</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p>أرسل رسالة واتساب إلى الرقم:</p>
                      {config?.whatsappNumber && (
                        <code className="bg-primary/10 text-primary px-2 py-1 rounded font-mono font-bold block mt-1" dir="ltr">
                          {config.whatsappNumber}
                        </code>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p>اكتب <code className="bg-muted px-1 rounded font-mono">#{generatedToken}</code> في أي مكان في الرسالة</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p>أضف محتوى الخبر (نص وصور)</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p>سيقوم الذكاء الاصطناعي بتحليل وتحسين الخبر ونشره</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-muted/50 p-3 rounded-lg border">
                <p className="text-xs font-medium mb-2">مثال:</p>
                <div className="bg-background p-2 rounded border font-mono text-xs" dir="ltr">
                  <div className="text-primary">#{generatedToken}</div>
                  <div className="mt-1 text-muted-foreground">
                    عنوان الخبر هنا<br />
                    محتوى الخبر...
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="label">التسمية *</Label>
                <Input
                  id="label"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="مثال: مكتب الرياض"
                  data-testid="input-label"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">رقم الهاتف *</Label>
                <Input
                  id="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+966xxxxxxxxx"
                  data-testid="input-phone"
                />
              </div>

              <div className="flex items-center space-x-2 space-x-reverse">
                <Switch
                  id="autoPublish"
                  checked={formData.autoPublish}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, autoPublish: checked })
                  }
                  data-testid="switch-autopublish"
                />
                <Label htmlFor="autoPublish">نشر تلقائي</Label>
              </div>

              <div className="space-y-2">
                <Label>اللغات المسموحة</Label>
                <div className="space-y-2">
                  {[
                    { value: "ar", label: "العربية" },
                    { value: "en", label: "English" },
                    { value: "ur", label: "اردو" },
                  ].map((lang) => (
                    <div key={lang.value} className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox
                        id={`lang-${lang.value}`}
                        checked={formData.allowedLanguages.includes(lang.value)}
                        onCheckedChange={() => handleToggleLanguage(lang.value)}
                        data-testid={`checkbox-lang-${lang.value}`}
                      />
                      <Label htmlFor={`lang-${lang.value}`}>{lang.label}</Label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advanced Permissions Section */}
              <Separator className="my-4" />
              <div className="space-y-3">
                <Label className="text-base font-semibold">صلاحيات متقدمة</Label>
                <p className="text-sm text-muted-foreground">تمنح هذه الصلاحيات التحكم في مقالات المستخدمين الآخرين</p>
                
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Switch
                    id="isAdmin"
                    checked={formData.isAdmin}
                    onCheckedChange={(checked) => {
                      setFormData({ 
                        ...formData, 
                        isAdmin: checked,
                        canDeleteAny: checked,
                        canArchiveAny: checked,
                        canEditAny: checked,
                        canMarkBreaking: checked,
                      });
                    }}
                    data-testid="switch-is-admin"
                  />
                  <Label htmlFor="isAdmin" className="font-medium">مشرف (صلاحيات كاملة)</Label>
                </div>
                
                <div className="mr-6 space-y-2">
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id="canEditAny"
                      checked={formData.canEditAny}
                      onCheckedChange={(checked) => setFormData({ ...formData, canEditAny: !!checked })}
                      disabled={formData.isAdmin}
                      data-testid="checkbox-can-edit-any"
                    />
                    <Label htmlFor="canEditAny" className="text-sm">تعديل أي مقالة</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id="canDeleteAny"
                      checked={formData.canDeleteAny}
                      onCheckedChange={(checked) => setFormData({ ...formData, canDeleteAny: !!checked })}
                      disabled={formData.isAdmin}
                      data-testid="checkbox-can-delete-any"
                    />
                    <Label htmlFor="canDeleteAny" className="text-sm">حذف أي مقالة</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id="canArchiveAny"
                      checked={formData.canArchiveAny}
                      onCheckedChange={(checked) => setFormData({ ...formData, canArchiveAny: !!checked })}
                      disabled={formData.isAdmin}
                      data-testid="checkbox-can-archive-any"
                    />
                    <Label htmlFor="canArchiveAny" className="text-sm">أرشفة أي مقالة</Label>
                  </div>
                  <div className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id="canMarkBreaking"
                      checked={formData.canMarkBreaking}
                      onCheckedChange={(checked) => setFormData({ ...formData, canMarkBreaking: !!checked })}
                      disabled={formData.isAdmin}
                      data-testid="checkbox-can-mark-breaking"
                    />
                    <Label htmlFor="canMarkBreaking" className="text-sm">تحويل لخبر عاجل</Label>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {generatedToken ? (
              <Button onClick={() => setCreateDialogOpen(false)} data-testid="button-close-create">
                إغلاق
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  data-testid="button-cancel-create"
                >
                  إلغاء
                </Button>
                <Button
                  onClick={handleSubmitCreate}
                  disabled={createTokenMutation.isPending}
                  data-testid="button-submit-create"
                >
                  {createTokenMutation.isPending ? "جاري الإنشاء..." : "إنشاء"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Token Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-token">
          <DialogHeader>
            <DialogTitle>تعديل رمز واتساب</DialogTitle>
            <DialogDescription>
              تعديل إعدادات الرمز: {selectedToken?.label}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isActive: checked })
                }
                data-testid="switch-edit-is-active"
              />
              <Label htmlFor="edit-isActive">
                {formData.isActive ? "نشط" : "معلّق"}
              </Label>
            </div>

            <div className="flex items-center space-x-2 space-x-reverse">
              <Switch
                id="edit-autoPublish"
                checked={formData.autoPublish}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, autoPublish: checked })
                }
                data-testid="switch-edit-autopublish"
              />
              <Label htmlFor="edit-autoPublish">نشر تلقائي</Label>
            </div>

            <div className="space-y-2">
              <Label>اللغات المسموحة</Label>
              <div className="space-y-2">
                {[
                  { value: "ar", label: "العربية" },
                  { value: "en", label: "English" },
                  { value: "ur", label: "اردو" },
                ].map((lang) => (
                  <div key={lang.value} className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id={`edit-lang-${lang.value}`}
                      checked={formData.allowedLanguages.includes(lang.value)}
                      onCheckedChange={() => handleToggleLanguage(lang.value)}
                      data-testid={`checkbox-edit-lang-${lang.value}`}
                    />
                    <Label htmlFor={`edit-lang-${lang.value}`}>{lang.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Advanced Permissions Section */}
            <Separator className="my-4" />
            <div className="space-y-3">
              <Label className="text-base font-semibold">صلاحيات متقدمة</Label>
              <p className="text-sm text-muted-foreground">تمنح هذه الصلاحيات التحكم في مقالات المستخدمين الآخرين</p>
              
              <div className="flex items-center space-x-2 space-x-reverse">
                <Switch
                  id="edit-isAdmin"
                  checked={formData.isAdmin}
                  onCheckedChange={(checked) => {
                    setFormData({ 
                      ...formData, 
                      isAdmin: checked,
                      canDeleteAny: checked,
                      canArchiveAny: checked,
                      canEditAny: checked,
                      canMarkBreaking: checked,
                    });
                  }}
                  data-testid="switch-edit-is-admin"
                />
                <Label htmlFor="edit-isAdmin" className="font-medium">مشرف (صلاحيات كاملة)</Label>
              </div>
              
              <div className="mr-6 space-y-2">
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="edit-canEditAny"
                    checked={formData.canEditAny}
                    onCheckedChange={(checked) => setFormData({ ...formData, canEditAny: !!checked })}
                    disabled={formData.isAdmin}
                    data-testid="checkbox-edit-can-edit-any"
                  />
                  <Label htmlFor="edit-canEditAny" className="text-sm">تعديل أي مقالة</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="edit-canDeleteAny"
                    checked={formData.canDeleteAny}
                    onCheckedChange={(checked) => setFormData({ ...formData, canDeleteAny: !!checked })}
                    disabled={formData.isAdmin}
                    data-testid="checkbox-edit-can-delete-any"
                  />
                  <Label htmlFor="edit-canDeleteAny" className="text-sm">حذف أي مقالة</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="edit-canArchiveAny"
                    checked={formData.canArchiveAny}
                    onCheckedChange={(checked) => setFormData({ ...formData, canArchiveAny: !!checked })}
                    disabled={formData.isAdmin}
                    data-testid="checkbox-edit-can-archive-any"
                  />
                  <Label htmlFor="edit-canArchiveAny" className="text-sm">أرشفة أي مقالة</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <Checkbox
                    id="edit-canMarkBreaking"
                    checked={formData.canMarkBreaking}
                    onCheckedChange={(checked) => setFormData({ ...formData, canMarkBreaking: !!checked })}
                    disabled={formData.isAdmin}
                    data-testid="checkbox-edit-can-mark-breaking"
                  />
                  <Label htmlFor="edit-canMarkBreaking" className="text-sm">تحويل لخبر عاجل</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSubmitEdit}
              disabled={updateTokenMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateTokenMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Log Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent dir="rtl" className="max-w-2xl" data-testid="dialog-view-log">
          <DialogHeader>
            <DialogTitle>تفاصيل الرسالة</DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">من</Label>
                  <p className="font-medium" data-testid="text-detail-from">{selectedLog.from}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">الحالة</Label>
                  <div>{getStatusBadge(selectedLog.status)}</div>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">الرسالة الكاملة</Label>
                <div className="bg-muted p-3 rounded mt-1" data-testid="text-detail-message">
                  {selectedLog.message}
                </div>
              </div>

              {selectedLog.reason && (
                <div>
                  <Label className="text-muted-foreground">سبب الرفض</Label>
                  <p data-testid="text-detail-reason">{selectedLog.reason}</p>
                </div>
              )}

              {selectedLog.aiAnalysis && (
                <div>
                  <Label className="text-muted-foreground">تحليل الذكاء الاصطناعي</Label>
                  <div className="bg-muted p-3 rounded mt-1 space-y-2 text-sm">
                    <div>
                      <strong>اللغة:</strong> {(selectedLog.aiAnalysis as any).detectedLanguage || "-"}
                    </div>
                    <div>
                      <strong>التصنيف:</strong> {(selectedLog.aiAnalysis as any).detectedCategory || "-"}
                    </div>
                    <div>
                      <strong>قيمة إخبارية:</strong>{" "}
                      {(selectedLog.aiAnalysis as any).hasNewsValue ? "نعم" : "لا"}
                    </div>
                    {(selectedLog.aiAnalysis as any).issues && (
                      <div>
                        <strong>المشاكل:</strong>{" "}
                        {(selectedLog.aiAnalysis as any).issues.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedLog.qualityScore && (
                <div>
                  <Label className="text-muted-foreground">درجة الجودة</Label>
                  <p className="text-2xl font-bold" data-testid="text-detail-quality">
                    {selectedLog.qualityScore.toFixed(1)}
                  </p>
                </div>
              )}

              {selectedLog.processingTimeMs && (
                <div>
                  <Label className="text-muted-foreground">وقت المعالجة</Label>
                  <p data-testid="text-detail-processing">{selectedLog.processingTimeMs} ms</p>
                </div>
              )}

              {selectedLog.articleId && (
                <div>
                  <Label className="text-muted-foreground">المقال</Label>
                  <p>
                    <a
                      href={`/dashboard/articles/${selectedLog.articleId}/edit`}
                      className="text-primary hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="link-detail-article"
                    >
                      عرض المقال
                    </a>
                  </p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">التاريخ</Label>
                <p data-testid="text-detail-created">
                  {new Date(selectedLog.createdAt).toLocaleString("ar-SA-u-ca-gregory")}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setViewDialogOpen(false)} data-testid="button-close-view">
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Token Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl" data-testid="dialog-delete-token">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الرمز "{selectedToken?.label}" نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedToken && deleteTokenMutation.mutate(selectedToken.id)}
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Log Dialog */}
      <AlertDialog open={deleteLogDialogOpen} onOpenChange={setDeleteLogDialogOpen}>
        <AlertDialogContent dir="rtl" data-testid="dialog-delete-log">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف هذا السجل نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-log">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedLog && deleteLogMutation.mutate(selectedLog.id)}
              data-testid="button-confirm-delete-log"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Logs Dialog */}
      <AlertDialog open={bulkDeleteLogsDialogOpen} onOpenChange={setBulkDeleteLogsDialogOpen}>
        <AlertDialogContent dir="rtl" data-testid="dialog-bulk-delete-logs">
          <AlertDialogHeader>
            <AlertDialogTitle>هل أنت متأكد؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف {selectedLogIds.length} سجل نهائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete-logs">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteLogsMutation.mutate(selectedLogIds)}
              data-testid="button-confirm-bulk-delete-logs"
            >
              حذف الكل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
