import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { 
  Settings, 
  Info, 
  CheckCircle, 
  AlertTriangle, 
  AlertCircle, 
  Calendar, 
  Clock, 
  BarChart3, 
  Eye,
  EyeOff,
  PartyPopper,
  Megaphone,
  Bell,
  ToggleRight,
  Trophy,
  Loader2
} from "lucide-react";
import {
  useTournamentBlockSettings,
  type TournamentBlockSlug,
} from "@/hooks/useTournamentBlockSettings";

interface CelebrationModeState {
  enabled: boolean;
  years: number;
}

import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface AnnouncementData {
  message: string;
  type: "info" | "success" | "warning" | "danger";
  isActive: boolean;
  expiresAt?: string | null;
  durationType?: "1day" | "3days" | "1week" | "custom" | "never";
}

const announcementSchema = z.object({
  message: z.string().min(1, "الرجاء إدخال نص الإعلان"),
  type: z.enum(["info", "success", "warning", "danger"]),
  isActive: z.boolean(),
  durationType: z.enum(["1day", "3days", "1week", "custom", "never"]).default("never"),
  expiresAt: z.string().optional().nullable(),
});

type AnnouncementFormData = z.infer<typeof announcementSchema>;

const SectionHeader = ({ title, color, icon: Icon }: { title: string; color: string; icon?: React.ElementType }) => (
  <div className="flex items-center gap-3 px-1">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

interface FeatureToggleCardProps {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isPending?: boolean;
  icon: React.ElementType;
  iconColorEnabled: string;
  iconColorDisabled?: string;
  testId: string;
  bgColor: string;
}

function FeatureToggleCard({ 
  title, 
  description, 
  enabled, 
  onToggle, 
  isPending,
  icon: Icon,
  iconColorEnabled,
  iconColorDisabled = "text-muted-foreground",
  testId,
  bgColor
}: FeatureToggleCardProps) {
  return (
    <Card className={`hover-elevate active-elevate-2 transition-all ${bgColor}`}>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${enabled ? 'bg-primary/10' : 'bg-muted/50'} transition-colors`}>
              <Icon className={`h-6 w-6 ${enabled ? iconColorEnabled : iconColorDisabled} ${enabled ? 'animate-pulse' : ''}`} />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                {description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={enabled}
              onCheckedChange={onToggle}
              disabled={isPending}
              data-testid={testId}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** ISO → قيمة حقل datetime-local بتوقيت المتصفح (فارغ إن لم يُضبط) */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface TournamentBlockCardProps {
  slug: TournamentBlockSlug;
  title: string;
  description: string;
  championLabel: string;
  teamsEndpoint: string;
  iconColor: string;
  iconBg: string;
  bgColor: string;
}

/**
 * بطاقة تحكم بلوك بطولة في الواجهة: مفتاح الإظهار + نافذة التوقيت
 * (بدء/انتهاء العرض، فارغ = بلا حدّ) + تعيين البطل يدويًا (احتياط).
 */
function TournamentBlockCard({
  slug,
  title,
  description,
  championLabel,
  teamsEndpoint,
  iconColor,
  iconBg,
  bgColor,
}: TournamentBlockCardProps) {
  const block = useTournamentBlockSettings(slug);

  // قائمة منتخبات البطولة لخيار «تعيين البطل يدويًا» — كاش طويل، القائمة ثابتة
  const { data: teamsData } = useQuery<{ teams: { id: number; name: string }[] }>({
    queryKey: [teamsEndpoint],
    staleTime: 10 * 60 * 1000,
  });
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];

  // نافذة التوقيت تُحرَّر محليًا وتُحفظ بزر — لا حفظ عند كل ضغطة مفتاح
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [windowTouched, setWindowTouched] = useState(false);
  useEffect(() => {
    if (!windowTouched) {
      setStartLocal(isoToLocalInput(block.startAt));
      setEndLocal(isoToLocalInput(block.endAt));
    }
  }, [block.startAt, block.endAt, windowTouched]);

  const saveWindow = () => {
    block.save({
      startAt: startLocal ? new Date(startLocal).toISOString() : null,
      endAt: endLocal ? new Date(endLocal).toISOString() : null,
    });
    setWindowTouched(false);
  };

  return (
    <Card className={`hover-elevate active-elevate-2 transition-all ${bgColor}`}>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4">
          {/* الرأس + مفتاح الإظهار */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${iconBg}`}>
                <Trophy className={`h-6 w-6 ${iconColor}`} />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-md">
                  {description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {block.isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={block.visible}
                onCheckedChange={(v) => block.save({ visible: v })}
                disabled={block.isSaving}
                data-testid={`switch-${slug}-visibility`}
              />
            </div>
          </div>

          {/* نافذة التوقيت */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">يظهر من (فارغ = فورًا)</p>
              <Input
                type="datetime-local"
                dir="ltr"
                value={startLocal}
                onChange={(e) => {
                  setStartLocal(e.target.value);
                  setWindowTouched(true);
                }}
                data-testid={`input-${slug}-start`}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">يختفي بعد (فارغ = بلا حدّ)</p>
              <Input
                type="datetime-local"
                dir="ltr"
                value={endLocal}
                onChange={(e) => {
                  setEndLocal(e.target.value);
                  setWindowTouched(true);
                }}
                data-testid={`input-${slug}-end`}
              />
            </div>
          </div>
          {windowTouched && (
            <Button size="sm" onClick={saveWindow} disabled={block.isSaving} data-testid={`save-${slug}-window`}>
              حفظ التوقيت
            </Button>
          )}

          {/* البطل */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">{championLabel}</p>
            <Select
              value={block.manualChampionTeamId ? String(block.manualChampionTeamId) : "auto"}
              onValueChange={(v) =>
                block.save({ manualChampionTeamId: v === "auto" ? null : Number(v) })
              }
            >
              <SelectTrigger data-testid={`select-${slug}-champion`}>
                <SelectValue placeholder="تلقائي (من نتيجة النهائي)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">تلقائي (من نتيجة النهائي)</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemSettings() {
  const { toast } = useToast();
  const wcBlock = useTournamentBlockSettings("world-cup");

  const { data: announcement, isLoading } = useQuery<AnnouncementData>({
    queryKey: ["/api/system/announcement"],
  });

  const { data: celebrationMode } = useQuery<CelebrationModeState>({
    queryKey: ["/api/celebration-mode"],
  });

  const toggleCelebrationMode = useMutation({
    mutationFn: async (enabled: boolean) => {
      return await apiRequest("/api/celebration-mode", {
        method: "POST",
        body: JSON.stringify({ enabled, years: celebrationMode?.years || 19 }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/celebration-mode"] });
      toast({
        title: "تم الحفظ بنجاح",
        description: celebrationMode?.enabled ? "تم إلغاء وضع الاحتفال" : "تم تفعيل وضع الاحتفال",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error?.message || "حدث خطأ أثناء تحديث وضع الاحتفال",
        variant: "destructive",
      });
    },
  });


  const form = useForm<AnnouncementFormData>({
    resolver: zodResolver(announcementSchema),
    defaultValues: {
      message: announcement?.message || "",
      type: announcement?.type || "info",
      isActive: announcement?.isActive || false,
      durationType: announcement?.durationType || "never",
      expiresAt: announcement?.expiresAt || null,
    },
    values: announcement ? {
      message: announcement.message || "",
      type: announcement.type || "info",
      isActive: announcement.isActive || false,
      durationType: announcement.durationType || "never",
      expiresAt: announcement.expiresAt || null,
    } : undefined,
  });

  const updateAnnouncementMutation = useMutation({
    mutationFn: async (data: AnnouncementFormData) => {
      return await apiRequest("/api/system/announcement", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system/announcement"] });
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم حفظ إعدادات الإعلان بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error?.message || "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AnnouncementFormData) => {
    let calculatedExpiresAt: string | null = null;
    
    if (data.durationType !== "never") {
      const now = new Date();
      
      if (data.durationType === "1day") {
        now.setDate(now.getDate() + 1);
        calculatedExpiresAt = now.toISOString();
      } else if (data.durationType === "3days") {
        now.setDate(now.getDate() + 3);
        calculatedExpiresAt = now.toISOString();
      } else if (data.durationType === "1week") {
        now.setDate(now.getDate() + 7);
        calculatedExpiresAt = now.toISOString();
      } else if (data.durationType === "custom" && data.expiresAt) {
        calculatedExpiresAt = data.expiresAt;
      }
    }
    
    updateAnnouncementMutation.mutate({
      ...data,
      expiresAt: calculatedExpiresAt,
    });
  };

  const typeConfig = {
    info: {
      icon: Info,
      label: "معلومة",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10 dark:bg-muted/40",
      borderColor: "border-blue-500/30 dark:border-border",
    },
    success: {
      icon: CheckCircle,
      label: "نجاح",
      color: "text-green-500",
      bgColor: "bg-green-500/10 dark:bg-muted/40",
      borderColor: "border-green-500/30 dark:border-border",
    },
    warning: {
      icon: AlertTriangle,
      label: "تحذير",
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10 dark:bg-muted/40",
      borderColor: "border-yellow-500/30 dark:border-border",
    },
    danger: {
      icon: AlertCircle,
      label: "خطر",
      color: "text-red-500",
      bgColor: "bg-red-500/10 dark:bg-muted/40",
      borderColor: "border-red-500/30 dark:border-border",
    },
  };

  const currentType = form.watch("type");
  const currentIsActive = form.watch("isActive");
  const TypeIcon = typeConfig[currentType].icon;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8" dir="rtl">
        {/* Header Card - matching dashboard welcome style */}
        <Card className="bg-gradient-to-r from-slate-50 via-blue-50/50 to-slate-50 dark:from-card dark:via-card dark:to-card border-primary/20" data-testid="card-settings-header">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Settings className="h-7 w-7 text-primary" data-testid="icon-settings" />
                    <div className="absolute -inset-1 bg-primary/20 rounded-full blur-md"></div>
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-l from-primary to-foreground bg-clip-text text-transparent" data-testid="text-page-title">
                    إعدادات النظام
                  </h1>
                </div>
                <p className="text-muted-foreground text-base leading-relaxed max-w-2xl">
                  إدارة إعدادات العرض والمميزات الخاصة والإعلانات الداخلية
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1.5">
                  <ToggleRight className="h-3.5 w-3.5" />
                  {(celebrationMode?.enabled ? 1 : 0) + (wcBlock.visible ? 1 : 0)} مميزات نشطة
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section: Display Settings */}
        <div className="space-y-4">
          <SectionHeader title="إعدادات العرض" color="bg-blue-500" icon={Eye} />
          {/* بلوكات البطولات: مفتاح إظهار + نافذة توقيت + بطل يدوي لكل بطولة.
              المونديال يصل التطبيقات المثبّتة أيضًا (عبر overview الفارغ)؛
              الخليج وآسيا ويب فقط حاليًا (علم blockHidden). */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <TournamentBlockCard
              slug="world-cup"
              title="بلوك كأس العالم"
              description="شريط المونديال في واجهة الويب وبانر تطبيقَي iOS وأندرويد — الإطفاء يخفيه عند الجميع فورًا دون رفع تحديث للمتاجر"
              championLabel="بطل المونديال (تلقائي من النهائي أو يدوي)"
              teamsEndpoint="/api/world-cup/teams"
              iconColor="text-emerald-500"
              iconBg="bg-emerald-500/10"
              bgColor="bg-emerald-50 dark:bg-card"
            />
            <TournamentBlockCard
              slug="gulf-cup"
              title="بلوك خليجي 27"
              description="شريط كأس الخليج (جدة، 23 سبتمبر – 6 أكتوبر 2026) في واجهة الويب — اضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
              championLabel="بطل خليجي 27 (تلقائي من النهائي أو يدوي)"
              teamsEndpoint="/api/gulf-cup/teams"
              iconColor="text-violet-500"
              iconBg="bg-violet-500/10"
              bgColor="bg-violet-50 dark:bg-card"
            />
            <TournamentBlockCard
              slug="asian-cup"
              title="بلوك كأس آسيا 2027"
              description="شريط كأس آسيا (السعودية، يناير 2027) في واجهة الويب — اضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
              championLabel="بطل كأس آسيا (تلقائي من النهائي أو يدوي)"
              teamsEndpoint="/api/asian-cup/teams"
              iconColor="text-sky-500"
              iconBg="bg-sky-500/10"
              bgColor="bg-sky-50 dark:bg-card"
            />
            <TournamentBlockCard
              slug="kings-cup"
              title="بلوك كأس خادم الحرمين الشريفين"
              description="شريط كأس الملك (بطولة الأندية السعودية الإقصائية) في واجهة الويب — الإطفاء يخفيه فورًا، واضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
              championLabel="بطل كأس الملك (تلقائي من النهائي أو يدوي)"
              teamsEndpoint="/api/kings-cup/teams"
              iconColor="text-amber-500"
              iconBg="bg-amber-500/10"
              bgColor="bg-amber-50 dark:bg-card"
            />
          </div>
        </div>

        {/* Section: Celebration Features */}
        <div className="space-y-4">
          <SectionHeader title="مميزات الاحتفال" color="bg-amber-500" icon={PartyPopper} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FeatureToggleCard
              title={`وضع الاحتفال - الذكرى الـ${celebrationMode?.years || 19}`}
              description="عرض أرقام عائمة في الخلفية احتفالاً بالذكرى السنوية لتأسيس سبق"
              enabled={celebrationMode?.enabled || false}
              onToggle={(checked) => toggleCelebrationMode.mutate(checked)}
              isPending={toggleCelebrationMode.isPending}
              icon={PartyPopper}
              iconColorEnabled="text-primary"
              testId="switch-celebration-mode"
              bgColor="bg-amber-50 dark:bg-card"
            />
          </div>
        </div>

        {/* Section: Announcements */}
        <div className="space-y-4">
          <SectionHeader title="الإعلانات الداخلية" color="bg-green-500" icon={Megaphone} />
          
          {/* Current Announcement Preview */}
          {announcement?.isActive && announcement?.message && (
            <Card className="bg-green-50 dark:bg-card border-green-200 dark:border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4 text-green-600" />
                    الإعلان النشط حالياً
                  </CardTitle>
                  <Badge variant="default" className="bg-green-600">نشط</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`flex items-start gap-3 p-4 rounded-lg border ${typeConfig[announcement.type].borderColor} ${typeConfig[announcement.type].bgColor}`}>
                  <TypeIcon className={`h-5 w-5 flex-shrink-0 mt-0.5 ${typeConfig[announcement.type].color}`} />
                  <p className="text-sm font-medium flex-1">{announcement.message}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Announcement Form */}
          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5" />
                إدارة الإعلان الداخلي
              </CardTitle>
              <CardDescription>
                قم بإنشاء أو تعديل الإعلان الذي يظهر لجميع المستخدمين في أعلى الصفحة
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Message Field */}
                  <FormField
                    control={form.control}
                    name="message"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نص الإعلان</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="اكتب نص الإعلان هنا..."
                            className="resize-none min-h-[100px]"
                            data-testid="textarea-announcement-message"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          الرسالة التي ستظهر للمستخدمين في شريط الإعلان
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Type Field */}
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>نوع الإعلان</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-announcement-type">
                                <SelectValue placeholder="اختر نوع الإعلان" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="info">
                                <span className="flex items-center gap-2">
                                  <Info className="h-4 w-4 text-blue-500" />
                                  معلومة
                                </span>
                              </SelectItem>
                              <SelectItem value="success">
                                <span className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                  نجاح
                                </span>
                              </SelectItem>
                              <SelectItem value="warning">
                                <span className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                  تحذير
                                </span>
                              </SelectItem>
                              <SelectItem value="danger">
                                <span className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4 text-red-500" />
                                  خطر
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            نوع الإعلان يحدد اللون والأيقونة المستخدمة
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Duration Type Field */}
                    <FormField
                      control={form.control}
                      name="durationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            مدة عرض الإعلان
                          </FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-announcement-duration">
                                <SelectValue placeholder="اختر مدة العرض" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="never">بدون انتهاء</SelectItem>
                              <SelectItem value="1day">يوم واحد</SelectItem>
                              <SelectItem value="3days">3 أيام</SelectItem>
                              <SelectItem value="1week">أسبوع</SelectItem>
                              <SelectItem value="custom">تاريخ محدد</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            بعد انتهاء المدة سيختفي الإعلان تلقائياً
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Custom Date Field */}
                  {form.watch("durationType") === "custom" && (
                    <FormField
                      control={form.control}
                      name="expiresAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            تاريخ الانتهاء
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              data-testid="input-announcement-expires"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormDescription>
                            حدد التاريخ والوقت الذي سينتهي فيه الإعلان
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Active Switch */}
                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 bg-muted/30">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base font-semibold">تفعيل الإعلان</FormLabel>
                          <FormDescription>
                            عند التفعيل، سيظهر الإعلان لجميع المستخدمين
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-announcement-active"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      disabled={updateAnnouncementMutation.isPending}
                      data-testid="button-save-announcement"
                      className="min-w-[140px]"
                    >
                      {updateAnnouncementMutation.isPending ? (
                        <>
                          <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                          جاري الحفظ...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="ml-2 h-4 w-4" />
                          حفظ التغييرات
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
