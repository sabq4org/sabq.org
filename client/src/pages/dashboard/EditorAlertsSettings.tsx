import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import {
  Bell,
  Mail,
  MessageSquare,
  Save,
  Send,
  Loader2,
  CheckCircle2,
  Settings,
  Phone,
  AlertCircle,
  Plus,
  Trash2,
  Bot,
  AlertTriangle,
  Users,
  Activity,
  Radio,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

interface EditorAlertSettings {
  enabled: boolean;
  email?: string;
  whatsappNumber?: string;
  whatsappNumbers?: string[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  aiCriticalAlertsEnabled?: boolean;
}

export default function EditorAlertsSettings() {
  useRoleProtection("admin");
  const { toast } = useToast();

  const [settings, setSettings] = useState<EditorAlertSettings>({
    enabled: false,
    email: "",
    whatsappNumbers: [],
    emailEnabled: true,
    whatsappEnabled: true,
    aiCriticalAlertsEnabled: true,
  });

  const [newNumber, setNewNumber] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [lastActivityNote, setLastActivityNote] = useState<string | null>(null);

  const {
    data: serverSettings,
    isLoading,
    isFetching,
  } = useQuery<EditorAlertSettings>({
    queryKey: ["/api/admin/editor-alerts/settings"],
  });

  useEffect(() => {
    if (serverSettings) {
      const rawNumbers = Array.isArray(serverSettings.whatsappNumbers)
        ? serverSettings.whatsappNumbers
        : serverSettings.whatsappNumber
          ? [serverSettings.whatsappNumber]
          : [];
      setSettings({
        ...serverSettings,
        whatsappNumbers: rawNumbers,
      });
    }
  }, [serverSettings]);

  const saveMutation = useMutation({
    mutationFn: async (data: EditorAlertSettings) => {
      return await apiRequest("/api/admin/editor-alerts/settings", {
        method: "PUT",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/editor-alerts/settings"] });
      setHasChanges(false);
      setLastActivityNote("تم حفظ الإعدادات بنجاح");
      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات التنبيهات بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/editor-alerts/test", {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        const whatsappCount = data.whatsappSentCount || (data.whatsappSent ? 1 : 0);
        setLastActivityNote("تم إرسال تنبيه النشر التجريبي بنجاح");
        toast({
          title: "تم الإرسال",
          description: `تم إرسال رسالة التجربة${data.emailSent ? " (بريد)" : ""}${
            whatsappCount > 0 ? ` (واتساب: ${whatsappCount} رسالة)` : ""
          }`,
        });
      } else {
        const errorsList = Array.isArray(data?.errors) ? data.errors.join(", ") : "";
        toast({
          title: "تحذير",
          description: errorsList || "فشل في إرسال الرسالة",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إرسال رسالة التجربة",
        variant: "destructive",
      });
    },
  });

  const testAiMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/editor-alerts/test-ai", {
        method: "POST",
      });
    },
    onSuccess: (data: any) => {
      if (data?.success) {
        setLastActivityNote(`تم اختبار تنبيه AI (${data.sent ?? 1} رسالة)`);
        toast({
          title: "تم الإرسال",
          description: `تم إرسال تنبيه ذكاء اصطناعي تجريبي (واتساب: ${data.sent} رسالة)`,
        });
      } else {
        toast({
          title: "تحذير",
          description:
            data?.skipped === "no-recipients"
              ? "أضف رقم واتساب أولاً ثم احفظ الإعدادات"
              : data?.message || "فشل في إرسال التنبيه التجريبي",
          variant: "destructive",
        });
      }
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل في إرسال التنبيه التجريبي",
        variant: "destructive",
      });
    },
  });

  const handleChange = (key: keyof EditorAlertSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const whatsappNumbers = useMemo(
    () => (Array.isArray(settings.whatsappNumbers) ? settings.whatsappNumbers : []),
    [settings.whatsappNumbers],
  );

  const addWhatsAppNumber = () => {
    const trimmed = newNumber.trim();
    if (!trimmed) return;

    if (!trimmed.startsWith("+")) {
      toast({
        title: "تنبيه",
        description: "يجب أن يبدأ الرقم بـ + (مثال: +966500000000)",
        variant: "destructive",
      });
      return;
    }

    if (whatsappNumbers.includes(trimmed)) {
      toast({
        title: "تنبيه",
        description: "هذا الرقم مضاف مسبقاً",
        variant: "destructive",
      });
      return;
    }

    handleChange("whatsappNumbers", [...whatsappNumbers, trimmed]);
    setNewNumber("");
  };

  const removeWhatsAppNumber = (numberToRemove: string) => {
    handleChange(
      "whatsappNumbers",
      whatsappNumbers.filter((n) => n !== numberToRemove),
    );
  };

  const handleSave = () => {
    if (settings.enabled) {
      const hasEmailChannel = Boolean(settings.emailEnabled && settings.email?.trim());
      const hasWhatsAppChannel = Boolean(settings.whatsappEnabled && whatsappNumbers.length > 0);
      if (!hasEmailChannel && !hasWhatsAppChannel) {
        toast({
          title: "تحذير",
          description: "يجب تفعيل قناة واحدة على الأقل (بريد أو واتساب) مع إدخال البيانات",
          variant: "destructive",
        });
        return;
      }
    }
    saveMutation.mutate(settings);
  };

  const handleTest = () => {
    testMutation.mutate();
  };

  // KPI metrics
  const kpiStats = useMemo(() => {
    const hasEmailRecipient = Boolean(settings.email && settings.email.trim().length > 0);
    const emailReady = Boolean(settings.emailEnabled && hasEmailRecipient);
    const whatsappReady = Boolean(settings.whatsappEnabled && whatsappNumbers.length > 0);
    const enabledChannelsCount =
      (settings.emailEnabled ? 1 : 0) + (settings.whatsappEnabled ? 1 : 0);
    const readyChannelsCount = (emailReady ? 1 : 0) + (whatsappReady ? 1 : 0);
    const totalRecipientsCount =
      (hasEmailRecipient ? 1 : 0) + whatsappNumbers.length;
    const aiAlertsActive = settings.aiCriticalAlertsEnabled ?? true;
    const activeEventRulesCount = (settings.enabled ? 1 : 0) + (aiAlertsActive ? 3 : 0);

    return {
      hasEmailRecipient,
      emailReady,
      whatsappReady,
      enabledChannelsCount,
      readyChannelsCount,
      totalRecipientsCount,
      aiAlertsActive,
      activeEventRulesCount,
    };
  }, [settings, whatsappNumbers]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Bell}
          title="تنبيهات رئيس التحرير"
          titleTestId="page-title-editor-alerts"
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>إرسال إشعارات فورية عند نشر الأخبار الجديدة وتنبيهات الطوارئ التقنية</span>
              {hasChanges && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs"
                >
                  تغييرات غير محفوظة
                </Badge>
              )}
            </span>
          }
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  queryClient.invalidateQueries({ queryKey: ["/api/admin/editor-alerts/settings"] })
                }
                disabled={isFetching}
                className="gap-1.5"
                data-testid="button-refresh-alerts"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                تحديث
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTest}
                disabled={!settings.enabled || testMutation.isPending}
                className="gap-1.5"
                data-testid="button-test"
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                تجربة
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || saveMutation.isPending}
                className="gap-1.5"
                data-testid="button-save"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                حفظ الإعدادات
              </Button>
            </>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          data-testid="kpi-strip-editor-alerts"
        >
          {/* 1. حالة النظام العام */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-system-status">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    حالة النظام العام
                  </p>
                  <p
                    className={`text-xl sm:text-2xl font-bold tracking-tight ${
                      settings.enabled
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {settings.enabled ? "مفعّل" : "معطّل"}
                  </p>
                </div>
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    settings.enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {settings.enabled ? (
                    <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  )}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  {settings.enabled ? "يرسل فور نشر أي خبر جديد" : "الإرسال التلقائي متوقف حالياً"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 2. قنوات التنبيه المفعّلة */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-active-channels">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    قنوات التنبيه المفعّلة
                  </p>
                  <p
                    className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums"
                    dir="ltr"
                  >
                    {kpiStats.enabledChannelsCount} / 2
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <Radio className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge
                  variant={kpiStats.emailReady ? "secondary" : "outline"}
                  className="text-[11px] font-normal px-2 py-0"
                >
                  بريد: {settings.emailEnabled ? "نشط" : "متوقف"}
                </Badge>
                <Badge
                  variant={kpiStats.whatsappReady ? "secondary" : "outline"}
                  className="text-[11px] font-normal px-2 py-0"
                >
                  واتساب: {settings.whatsappEnabled ? "نشط" : "متوقف"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* 3. المستلمون والأحداث */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-recipients-count">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    المستلمون والأحداث
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
                      {kpiStats.totalRecipientsCount}
                    </p>
                    <span className="text-xs text-muted-foreground">مستلم</span>
                  </div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>
                  {whatsappNumbers.length} رقم واتساب ·{" "}
                  {kpiStats.hasEmailRecipient ? "1 بريد" : "بدون بريد"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 4. حالة الرصد والاختبار */}
          <Card className="border-border/70 shadow-xs" data-testid="kpi-alert-readiness">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    قواعد الرصد والاختبار
                  </p>
                  <p className="text-lg sm:text-xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
                    {kpiStats.activeEventRulesCount} قواعد نشطة
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Activity className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                <span className="truncate">
                  {lastActivityNote ||
                    (kpiStats.aiAlertsActive
                      ? "رصد نشر الأخبار + طوارئ AI"
                      : "رصد نشر الأخبار فقط")}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* الإعدادات العامة — المفتاح الرئيسي */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Settings className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-base sm:text-lg">الإعدادات العامة للتنبيهات</CardTitle>
                  <CardDescription className="mt-0.5">
                    التحكم الرئيسي في إرسال الإشعارات التلقائية عند نشر أي خبر جديد في الصحيفة
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant={settings.enabled ? "secondary" : "outline"}
                className={
                  settings.enabled
                    ? "self-start sm:self-auto border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "self-start sm:self-auto"
                }
              >
                {settings.enabled ? "النظام نشط" : "النظام متوقف"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="space-y-1">
                <Label htmlFor="switch-alerts-enabled" className="text-sm sm:text-base font-semibold cursor-pointer">
                  تفعيل التنبيهات الفورية لرئيس التحرير
                </Label>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  عند التفعيل، يتم إشعار المستلمين فوراً عبر القنوات المحددة أدناه بمجرد نشر أي خبر جديد.
                </p>
              </div>
              <Switch
                id="switch-alerts-enabled"
                checked={settings.enabled}
                onCheckedChange={(checked) => handleChange("enabled", checked)}
                data-testid="switch-alerts-enabled"
              />
            </div>
          </CardContent>
        </Card>

        {/* شبكة القنوات: البريد الإلكتروني + واتساب */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* قناة البريد الإلكتروني */}
          <Card className="border-border/70 shadow-xs flex flex-col justify-between">
            <div>
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400">
                      <Mail className="h-5 w-5" />
                    </span>
                    <div>
                      <CardTitle className="text-base sm:text-lg">قناة البريد الإلكتروني</CardTitle>
                      <CardDescription className="mt-0.5">
                        إرسال ملخص الخبر المنشور ورابطه المباشر عبر البريد
                      </CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={settings.emailEnabled}
                    onCheckedChange={(checked) => handleChange("emailEnabled", checked)}
                    data-testid="switch-email-enabled"
                  />
                </div>
              </CardHeader>

              <CardContent className="p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-xs sm:text-sm">
                  <span className="text-muted-foreground">حالة القناة</span>
                  <span
                    className={`font-semibold ${
                      kpiStats.emailReady
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {settings.emailEnabled
                      ? kpiStats.hasEmailRecipient
                        ? "جاهزة للإرسال"
                        : "بانتظار إدخال البريد"
                      : "معطّلة"}
                  </span>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="input-email" className="text-sm font-medium block">
                    عنوان البريد الإلكتروني للمستلم
                  </Label>
                  <Input
                    id="input-email"
                    type="email"
                    placeholder="editor@example.com"
                    value={settings.email || ""}
                    onChange={(e) => handleChange("email", e.target.value)}
                    disabled={!settings.emailEnabled}
                    dir="ltr"
                    data-testid="input-email"
                  />
                  <p className="text-xs text-muted-foreground">
                    يُستخدم هذا العنوان لاستقبال إشعارات النشر الفورية ورسائل الاختبار.
                  </p>
                </div>
              </CardContent>
            </div>
          </Card>

          {/* قناة واتساب */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Phone className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base sm:text-lg">قناة واتساب</CardTitle>
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {whatsappNumbers.length} رقم
                      </Badge>
                    </div>
                    <CardDescription className="mt-0.5">
                      إرسال إشعارات فورية عبر واتساب لأرقام متعددة
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={settings.whatsappEnabled}
                  onCheckedChange={(checked) => handleChange("whatsappEnabled", checked)}
                  data-testid="switch-whatsapp-enabled"
                />
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="input-new-whatsapp" className="text-sm font-medium block">
                  إضافة رقم واتساب جديد
                </Label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    id="input-new-whatsapp"
                    type="tel"
                    placeholder="+966500000000"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addWhatsAppNumber()}
                    disabled={!settings.whatsappEnabled}
                    dir="ltr"
                    className="flex-1 font-mono"
                    data-testid="input-new-whatsapp"
                  />
                  <Button
                    variant="outline"
                    onClick={addWhatsAppNumber}
                    disabled={!settings.whatsappEnabled || !newNumber.trim()}
                    className="gap-1.5 shrink-0"
                    data-testid="button-add-whatsapp"
                  >
                    <Plus className="h-4 w-4" />
                    إضافة الرقم
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  الرقم بصيغة دولية مع رمز الدولة (مثال: +966564255999)
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <Label className="text-xs font-semibold text-muted-foreground block">
                  الأرقام المسجّلة ({whatsappNumbers.length})
                </Label>

                {whatsappNumbers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
                    لم تتم إضافة أرقام واتساب بعد
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {whatsappNumbers.map((number, index) => (
                      <div
                        key={number}
                        className="flex items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2"
                        data-testid={`whatsapp-number-${index}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span dir="ltr" className="text-sm font-mono truncate">
                            {number}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeWhatsAppNumber(number)}
                          disabled={!settings.whatsappEnabled}
                          className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
                          data-testid={`button-remove-whatsapp-${index}`}
                          title="حذف الرقم"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* تنبيهات الذكاء الاصطناعي الحرجة */}
        <Card className="border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <CardTitle className="text-base sm:text-lg">
                    تنبيهات الذكاء الاصطناعي الحرجة
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    إشعار فوري عبر واتساب عند حدوث أعطال أو تدهور في نماذج الذكاء الاصطناعي
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testAiMutation.mutate()}
                  disabled={
                    !settings.whatsappEnabled ||
                    whatsappNumbers.length === 0 ||
                    testAiMutation.isPending
                  }
                  className="gap-1.5"
                  data-testid="button-test-ai-alert"
                >
                  {testAiMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  تجربة تنبيه AI
                </Button>
                <Switch
                  checked={settings.aiCriticalAlertsEnabled ?? true}
                  onCheckedChange={(checked) =>
                    handleChange("aiCriticalAlertsEnabled", checked)
                  }
                  data-testid="switch-ai-alerts-enabled"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">فشل / توقّف نموذج</p>
                  <p className="text-xs text-muted-foreground">
                    انقطاع الاستجابة من مزود الذكاء الاصطناعي الأساسي
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">نفاد رصيد المزوّد</p>
                  <p className="text-xs text-muted-foreground">
                    تجاوز الحصة الائتمانية أو توقف مفاتيح API
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3.5">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">تدهور أداء نموذج</p>
                  <p className="text-xs text-muted-foreground">
                    ارتفاع غير معتاد في زمن الاستجابة أو نسبة الأخطاء
                  </p>
                </div>
              </div>
            </div>

            {(!settings.whatsappEnabled || whatsappNumbers.length === 0) && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  فعّل قناة واتساب وأضف رقمًا واحدًا على الأقل لاستقبال تنبيهات الذكاء الاصطناعي الحرجة.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* بطاقة الملخص الحي للمستلمين */}
        {settings.enabled ? (
          <Card
            className="border-emerald-500/30 bg-emerald-500/[0.04] shadow-xs"
            data-testid="card-alerts-active-summary"
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-emerald-700 dark:text-emerald-300">
                    التنبيهات مفعّلة وجاهزة للإرسال
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    سيتم إرسال تنبيه تلقائي عند نشر أي خبر جديد إلى المستلمين التاليين:
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {settings.emailEnabled && settings.email && (
                      <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs sm:text-sm">
                        <Mail className="h-4 w-4 text-blue-500 shrink-0" />
                        <span dir="ltr" className="font-mono">
                          {settings.email}
                        </span>
                      </div>
                    )}
                    {settings.whatsappEnabled &&
                      whatsappNumbers.map((number) => (
                        <div
                          key={number}
                          className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs sm:text-sm"
                        >
                          <MessageSquare className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span dir="ltr" className="font-mono">
                            {number}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card
            className="border-amber-500/30 bg-amber-500/[0.04] shadow-xs"
            data-testid="card-alerts-disabled-summary"
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start gap-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-amber-700 dark:text-amber-300">
                    التنبيهات معطّلة
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    لن يتم إرسال أي تنبيهات عند نشر الأخبار الجديدة. قم بتفعيل التنبيهات من قسم الإعدادات العامة أعلاه.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
