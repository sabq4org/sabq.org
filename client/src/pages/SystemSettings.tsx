import { useEffect, useState, useId } from "react";
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
  Eye,
  EyeOff,
  PartyPopper,
  Megaphone,
  Bell,
  ToggleRight,
  Trophy,
  PanelTop,
  Loader2,
  CalendarRange,
  X,
  Sparkles,
  Check,
  RotateCcw,
  ShieldAlert,
  HelpCircle
} from "lucide-react";
import {
  useTournamentBlockSettings,
  type TournamentBlockSlug,
} from "@/hooks/useTournamentBlockSettings";
import { useDmsTopAdsVisibility } from "@/hooks/useDmsTopAdsVisibility";
import { format, parseISO } from "date-fns";
import { ar } from "date-fns/locale";

interface CelebrationModeState {
  enabled: boolean;
  years: number;
}

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

const SectionHeader = ({ 
  title, 
  subtitle,
  color, 
  icon: Icon,
  badge
}: { 
  title: string; 
  subtitle?: string;
  color: string; 
  icon?: React.ElementType;
  badge?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-sky-100 bg-gradient-to-l from-sky-50/60 via-background to-transparent px-4 py-3 dark:border-sky-900/30 dark:from-sky-950/20 shadow-xs">
    <div className="flex items-center gap-3">
      <div className={`h-6 w-1.5 ${color} rounded-full shrink-0`} />
      {Icon && (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100/70 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">
          <Icon className="h-4 w-4" />
        </div>
      )}
      <div>
        <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {badge && <div className="mt-1 sm:mt-0 flex items-center">{badge}</div>}
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
  badgeText?: string;
  accentBorderColor?: string;
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
  badgeText,
  accentBorderColor = "border-border/70 hover:border-primary/40"
}: FeatureToggleCardProps) {
  return (
    <Card className={`group relative overflow-hidden rounded-2xl border ${accentBorderColor} bg-card shadow-xs transition-all duration-200 hover:shadow-md`}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <div className={`mt-0.5 shrink-0 rounded-xl p-2.5 transition-colors ${enabled ? "bg-primary/15" : "bg-muted/60"}`}>
              <Icon className={`h-5 w-5 ${enabled ? iconColorEnabled : iconColorDisabled}`} />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-foreground text-sm sm:text-base leading-snug">{title}</p>
                {badgeText && (
                  <Badge variant="secondary" className="text-[10px] font-semibold py-0 px-2 h-4.5">
                    {badgeText}
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground max-w-xl">
                {description}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <span className={`text-xs font-semibold sm:hidden ${enabled ? "text-primary" : "text-muted-foreground"}`}>
              {enabled ? "مفعّل" : "معطّل"}
            </span>
            <div className="flex items-center gap-2.5">
              {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={enabled}
                onCheckedChange={onToggle}
                disabled={isPending}
                data-testid={testId}
                aria-label={title}
                className="scale-105 data-[state=checked]:bg-primary"
              />
            </div>
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

/** تنسيق عربي مقروء لتاريخ ISO */
function formatReadableDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    if (isNaN(d.getTime())) return null;
    return format(d, "d MMMM yyyy - h:mm a", { locale: ar });
  } catch {
    return null;
  }
}

/** احتساب الحالة الفعلية للبلوك وفق التواريخ ومفتاح التفعيل */
function getTournamentBlockEffectiveStatus(
  visible: boolean,
  startAt: string | null,
  endAt: string | null
): {
  status: "active" | "scheduled" | "expired" | "disabled";
  label: string;
  badgeClass: string;
  description: string;
} {
  if (!visible) {
    return {
      status: "disabled",
      label: "معطّل يدويًا",
      badgeClass: "bg-muted text-muted-foreground border-border",
      description: "البلوك معطل ولن يظهر للزوار حتى يتم تفعيله.",
    };
  }

  const now = Date.now();
  const startTime = startAt ? Date.parse(startAt) : null;
  const endTime = endAt ? Date.parse(endAt) : null;

  if (startTime && !isNaN(startTime) && now < startTime) {
    return {
      status: "scheduled",
      label: "مجدول للظهور",
      badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      description: `سيظهر تلقائيًا عند حلول تاريخ البدء: ${formatReadableDate(startAt)}`,
    };
  }

  if (endTime && !isNaN(endTime) && now > endTime) {
    return {
      status: "expired",
      label: "منتهي العرض",
      badgeClass: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      description: `انتهت فترة العرض المحددة في: ${formatReadableDate(endAt)}`,
    };
  }

  return {
    status: "active",
    label: "معروض حاليًا",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
    description: "البلوك ظاهر للزوار حاليًا في الموقع والتطبيقات المربوطة.",
  };
}

interface TournamentBlockCardProps {
  slug: TournamentBlockSlug;
  title: string;
  description: string;
  championLabel: string;
  teamsEndpoint: string;
  iconColor: string;
  iconBg: string;
  borderAccent?: string;
  tournamentTag?: string;
}

/**
 * بطاقة تحكم بلوك بطولة في الواجهة:
 * - تصميم حديث ومتجاوب كلياً على الجوال وشاشات الديسكتوب
 * - حالة واضحة وشارات ملونة (معروض حالياً / مجدول / منتهي / معطل)
 * - حقول التواريخ منسقة بعناية مع أزرار مسح وتطبيق سريعة
 * - حفظ تلقائي ومؤشرات واضحة
 */
function TournamentBlockCard({
  slug,
  title,
  description,
  championLabel,
  teamsEndpoint,
  iconColor,
  iconBg,
  borderAccent = "border-border/70 hover:border-primary/40",
  tournamentTag,
}: TournamentBlockCardProps) {
  const block = useTournamentBlockSettings(slug);
  const { toast } = useToast();

  const { data: teamsData } = useQuery<{ teams: { id: number; name: string }[] }>({
    queryKey: [teamsEndpoint],
    staleTime: 10 * 60 * 1000,
  });
  const teams = Array.isArray(teamsData?.teams) ? teamsData.teams : [];

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
    const startIso = startLocal ? new Date(startLocal).toISOString() : null;
    const endIso = endLocal ? new Date(endLocal).toISOString() : null;

    if (startIso && endIso && new Date(startIso) >= new Date(endIso)) {
      toast({
        title: "تنبيه في التوقيت",
        description: "يجب أن يكون تاريخ البدء أسبق من تاريخ الانتهاء",
        variant: "destructive",
      });
      return;
    }

    block.save({
      startAt: startIso,
      endAt: endIso,
    });
    setWindowTouched(false);
    toast({
      title: "تم حفظ التوقيت بنجاح",
      description: `تم تحديث نافذة عرض ${title}`,
    });
  };

  const clearStart = () => {
    setStartLocal("");
    setWindowTouched(true);
  };

  const clearEnd = () => {
    setEndLocal("");
    setWindowTouched(true);
  };

  const clearBoth = () => {
    setStartLocal("");
    setEndLocal("");
    block.save({ startAt: null, endAt: null });
    setWindowTouched(false);
    toast({
      title: "تم إلغاء قيود التوقيت",
      description: `يظهر ${title} فوراً دون حد زمني طالما المفتاح مفعل`,
    });
  };

  const statusInfo = getTournamentBlockEffectiveStatus(
    block.visible,
    block.startAt,
    block.endAt
  );

  const startId = useId();
  const endId = useId();

  return (
    <Card className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border ${borderAccent} bg-card shadow-xs transition-all duration-200 hover:shadow-md`}>
      {/* رأس البطاقة وحالة البلوك */}
      <CardHeader className="p-4 sm:p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`mt-0.5 shrink-0 rounded-xl p-2.5 ${iconBg}`}>
              <Trophy className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base sm:text-lg font-bold leading-snug">
                  {title}
                </CardTitle>
                {tournamentTag && (
                  <Badge variant="outline" className="text-[10px] font-semibold py-0 px-2 h-4.5 bg-background/80">
                    {tournamentTag}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs sm:text-sm leading-relaxed text-muted-foreground line-clamp-2 sm:line-clamp-none">
                {description}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className="flex items-center gap-2">
              {block.isSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <Switch
                checked={block.visible}
                onCheckedChange={(v) => {
                  block.save({ visible: v });
                  toast({
                    title: v ? "تم تفعيل البلوك" : "تم تعطيل البلوك",
                    description: v ? `أصبح ${title} مفعلاً` : `تم إخفاء ${title} من الواجهات`,
                  });
                }}
                disabled={block.isSaving}
                data-testid={`switch-${slug}-visibility`}
                aria-label={`تفعيل ${title}`}
                className="scale-105 data-[state=checked]:bg-primary"
              />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground hidden sm:inline-block">
              {block.visible ? "مفعّل" : "معطّل"}
            </span>
          </div>
        </div>

        {/* شريط الحالة والملخص الزمني */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 p-2.5 border border-border/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-medium">حالة العرض:</span>
            <Badge variant="outline" className={`font-bold px-2 py-0.5 text-[11px] border ${statusInfo.badgeClass}`}>
              {statusInfo.label}
            </Badge>
          </div>
          {(block.startAt || block.endAt) && (
            <button
              type="button"
              onClick={clearBoth}
              disabled={block.isSaving}
              className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors font-medium"
              title="إلغاء قيود التوقيت"
            >
              <RotateCcw className="h-3 w-3" />
              <span>إعادة ضبط التوقيت</span>
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
        {/* قسم نافذة التوقيت: ابتداء وانتهاء الظهور بتصميم مهيّأ للجوال والحواسيب */}
        <div className="rounded-xl border border-border/60 bg-gradient-to-b from-muted/20 to-muted/40 p-3 sm:p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
              <CalendarRange className="h-3.5 w-3.5 text-primary" />
              <span>جدولة نافذة الظهور التلقائي</span>
            </div>
            <span className="text-[11px] text-muted-foreground">فارغ = فوري وبلا حد</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* تاريخ البدء */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={startId} className="text-xs font-semibold text-foreground/90 flex items-center gap-1">
                  <span>يظهر من تاريخ:</span>
                  {startLocal && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      ({formatReadableDate(startLocal ? new Date(startLocal).toISOString() : null) || "محدد"})
                    </span>
                  )}
                </label>
                {startLocal && (
                  <button
                    type="button"
                    onClick={clearStart}
                    className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    <span>مسح</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id={startId}
                  type="datetime-local"
                  dir="ltr"
                  value={startLocal}
                  onChange={(e) => {
                    setStartLocal(e.target.value);
                    setWindowTouched(true);
                  }}
                  data-testid={`input-${slug}-start`}
                  className="h-10 text-sm bg-background/90 text-start font-sans"
                />
              </div>
            </div>

            {/* تاريخ الانتهاء */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={endId} className="text-xs font-semibold text-foreground/90 flex items-center gap-1">
                  <span>يختفي بعد تاريخ:</span>
                  {endLocal && (
                    <span className="text-[10px] font-normal text-muted-foreground">
                      ({formatReadableDate(endLocal ? new Date(endLocal).toISOString() : null) || "محدد"})
                    </span>
                  )}
                </label>
                {endLocal && (
                  <button
                    type="button"
                    onClick={clearEnd}
                    className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors"
                  >
                    <X className="h-3 w-3" />
                    <span>مسح</span>
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id={endId}
                  type="datetime-local"
                  dir="ltr"
                  value={endLocal}
                  onChange={(e) => {
                    setEndLocal(e.target.value);
                    setWindowTouched(true);
                  }}
                  data-testid={`input-${slug}-end`}
                  className="h-10 text-sm bg-background/90 text-start font-sans"
                />
              </div>
            </div>
          </div>

          {/* زر حفظ التوقيت يظهر فور التعديل */}
          {windowTouched && (
            <div className="pt-1 flex items-center justify-end gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => {
                  setStartLocal(isoToLocalInput(block.startAt));
                  setEndLocal(isoToLocalInput(block.endAt));
                  setWindowTouched(false);
                }}
                disabled={block.isSaving}
                className="h-8 px-3 text-xs"
              >
                إلغاء التعديل
              </Button>
              <Button 
                size="sm" 
                onClick={saveWindow} 
                disabled={block.isSaving} 
                data-testid={`save-${slug}-window`}
                className="h-8 px-4 text-xs font-bold gap-1.5 shadow-xs bg-primary text-primary-foreground"
              >
                {block.isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>حفظ التوقيت</span>
              </Button>
            </div>
          )}
        </div>

        {/* تعيين البطل يدويًا */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            <span>{championLabel}</span>
          </label>
          <Select
            value={block.manualChampionTeamId ? String(block.manualChampionTeamId) : "auto"}
            onValueChange={(v) => {
              block.save({ manualChampionTeamId: v === "auto" ? null : Number(v) });
              toast({
                title: "تم تحديث إعداد البطل",
                description: v === "auto" ? "تم ضبط البطل على التحديد التلقائي" : "تم تعيين البطل يدويًا",
              });
            }}
          >
            <SelectTrigger data-testid={`select-${slug}-champion`} className="h-10 text-sm bg-background">
              <SelectValue placeholder="تلقائي (من نتيجة النهائي أو ختام البطولة)" />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value="auto" className="font-semibold text-primary">
                تلقائي (من نتيجة النهائي أو ختام البطولة)
              </SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SystemSettings() {
  const { toast } = useToast();
  const wcBlock = useTournamentBlockSettings("world-cup");
  const dmsTopAds = useDmsTopAdsVisibility();

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
      bgColor: "bg-blue-500/10 dark:bg-blue-950/30",
      borderColor: "border-blue-500/30 dark:border-blue-800",
    },
    success: {
      icon: CheckCircle,
      label: "نجاح",
      color: "text-green-500",
      bgColor: "bg-green-500/10 dark:bg-green-950/30",
      borderColor: "border-green-500/30 dark:border-green-800",
    },
    warning: {
      icon: AlertTriangle,
      label: "تحذير",
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10 dark:bg-yellow-950/30",
      borderColor: "border-yellow-500/30 dark:border-yellow-800",
    },
    danger: {
      icon: AlertCircle,
      label: "خطر",
      color: "text-red-500",
      bgColor: "bg-red-500/10 dark:bg-red-950/30",
      borderColor: "border-red-500/30 dark:border-red-800",
    },
  };

  const currentType = form.watch("type");
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

  const activeFeaturesCount = (celebrationMode?.enabled ? 1 : 0) + (wcBlock.visible ? 1 : 0) + (dmsTopAds.showTopAds ? 1 : 0);
  const celebrationYears = celebrationMode?.years || 19;

  return (
    <DashboardLayout>
      <div className="relative min-h-full overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.07),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.045),_transparent_45%),linear-gradient(180deg,_rgba(240,249,255,0.55)_0%,_transparent_26%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.1),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.05),_transparent_45%),linear-gradient(180deg,_rgba(8,47,73,0.22)_0%,_transparent_28%)]"
        />
        <div className="relative space-y-6 sm:space-y-8" dir="rtl">
          {/* Header */}
          <header className="relative overflow-hidden rounded-2xl border border-sky-200/70 bg-gradient-to-l from-sky-50/90 via-background to-emerald-50/50 p-4 sm:p-6 shadow-xs dark:border-sky-900/40 dark:from-sky-950/30 dark:via-background dark:to-emerald-950/20" data-testid="card-settings-header">
            <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#1BADF8]/10 blur-3xl dark:bg-[#1BADF8]/15" />
            <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="rounded-xl bg-[#1BADF8]/15 p-2.5 text-[#078fd1] dark:text-[#45c0f5] shrink-0">
                    <Settings className="h-5 w-5 sm:h-6 sm:w-6" data-testid="icon-settings" />
                  </span>
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight" data-testid="text-page-title">
                    إعدادات النظام
                  </h1>
                </div>
                <p className="text-xs sm:text-sm md:text-base leading-relaxed text-muted-foreground">
                  إدارة إعدادات العرض وبطاقات البطولات وجدولة الظهور والمميزات الخاصة والإعلانات
                </p>
              </div>
              <Badge variant="outline" className="gap-1.5 border-sky-200/80 bg-background/80 px-3 py-1 text-xs font-bold dark:border-sky-900/40 shadow-2xs">
                <ToggleRight className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />
                <span className="tabular-nums">{activeFeaturesCount.toLocaleString("en-US")}</span> ميزات نشطة
              </Badge>
            </div>
          </header>

          {/* Section: Tournament Blocks */}
          <div className="space-y-4">
            <SectionHeader 
              title="إعدادات بطاقات وبلوكات البطولات" 
              subtitle="التحكم في ظهور أشرطة البطولات وجدولة فترات العرض التلقائية وتحديد الأبطال"
              color="bg-[#1BADF8]" 
              icon={Trophy}
              badge={
                <Badge variant="secondary" className="text-xs font-semibold">
                  5 بطولات مدعومة
                </Badge>
              }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
              <TournamentBlockCard
                slug="world-cup"
                title="بلوك كأس العالم 2026"
                description="شريط المونديال في واجهة الويب وتطبيقي iOS وأندرويد — الإطفاء يخفيه عند الجميع فورًا دون رفع تحديث للمتاجر"
                championLabel="بطل المونديال"
                teamsEndpoint="/api/world-cup/teams"
                iconColor="text-emerald-600 dark:text-emerald-300"
                iconBg="bg-emerald-100/90 dark:bg-emerald-950/50"
                borderAccent="border-emerald-200/70 hover:border-emerald-400/80 dark:border-emerald-900/50"
                tournamentTag="مونديال 2026"
              />
              <TournamentBlockCard
                slug="gulf-cup"
                title="بلوك خليجي 27"
                description="شريط كأس الخليج (جدة، 23 سبتمبر – 6 أكتوبر 2026) في واجهة الويب — اضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
                championLabel="بطل خليجي 27"
                teamsEndpoint="/api/gulf-cup/teams"
                iconColor="text-teal-600 dark:text-teal-300"
                iconBg="bg-teal-100/90 dark:bg-teal-950/50"
                borderAccent="border-teal-200/70 hover:border-teal-400/80 dark:border-teal-900/50"
                tournamentTag="خليجي 27"
              />
              <TournamentBlockCard
                slug="asian-cup"
                title="بلوك كأس آسيا 2027"
                description="شريط كأس آسيا (السعودية، يناير 2027) في واجهة الويب — اضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
                championLabel="بطل كأس آسيا"
                teamsEndpoint="/api/asian-cup/teams"
                iconColor="text-sky-600 dark:text-sky-300"
                iconBg="bg-sky-100/90 dark:bg-sky-950/50"
                borderAccent="border-sky-200/70 hover:border-sky-400/80 dark:border-sky-900/50"
                tournamentTag="كأس آسيا 2027"
              />
              <TournamentBlockCard
                slug="kings-cup"
                title="بلوك كأس خادم الحرمين الشريفين"
                description="شريط كأس الملك (بطولة الأندية السعودية الإقصائية) في واجهة الويب — الإطفاء يخفيه فورًا، واضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
                championLabel="بطل كأس الملك"
                teamsEndpoint="/api/kings-cup/teams"
                iconColor="text-amber-600 dark:text-amber-300"
                iconBg="bg-amber-100/90 dark:bg-amber-950/50"
                borderAccent="border-amber-200/70 hover:border-amber-400/80 dark:border-amber-900/50"
                tournamentTag="كأس الملك"
              />
              <TournamentBlockCard
                slug="pro-league"
                title="بلوك دوري روشن السعودي"
                description="شريط دوري روشن في الرئيسية (عدّاد ما قبل الموسم / الجولة / المباراة / البطل) — الإطفاء يخفيه فورًا، واضبط نافذة التوقيت ليظهر ويختفي تلقائيًا"
                championLabel="بطل دوري روشن"
                teamsEndpoint="/api/rsl/teams"
                iconColor="text-cyan-600 dark:text-cyan-300"
                iconBg="bg-cyan-100/90 dark:bg-cyan-950/50"
                borderAccent="border-cyan-200/70 hover:border-cyan-400/80 dark:border-cyan-900/50"
                tournamentTag="دوري روشن"
              />
            </div>
          </div>

          {/* Section: Commercial Ads (DMS) */}
          <div className="space-y-4">
            <SectionHeader 
              title="الإعلانات التجارية (DMS)" 
              subtitle="إدارة وتجاوز ظهور المساحات الإعلانية البارزة على مستوى الموقع"
              color="bg-rose-500" 
              icon={PanelTop} 
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FeatureToggleCard
                title="إعلانات أعلى الصفحات"
                description="الإعلان البارز أسفل الهيدر (Leaderboard للديسكتوب وMPU للجوال) في الرئيسية والمقالات والأقسام والرأي وبقية الصفحات — الإطفاء يخفيه فورًا من كل الموقع، وإعلانات وسط المحتوى لا تتأثر"
                enabled={dmsTopAds.showTopAds}
                onToggle={(checked) => dmsTopAds.setShowTopAds(checked)}
                isPending={dmsTopAds.isSaving}
                icon={PanelTop}
                iconColorEnabled="text-rose-600 dark:text-rose-300"
                testId="switch-dms-top-ads"
                badgeText="مساحة علوية رئيسية"
                accentBorderColor="border-rose-200/60 hover:border-rose-400/80 dark:border-rose-900/40"
              />
            </div>
          </div>

          {/* Section: Celebration Features */}
          <div className="space-y-4">
            <SectionHeader 
              title="مميزات الاحتفال والمناسبات" 
              subtitle="تأثيرات بصرية مؤقتة للمناسبات الوطنية والذكرى السنوية"
              color="bg-amber-400" 
              icon={PartyPopper} 
            />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FeatureToggleCard
                title={`وضع الاحتفال - الذكرى الـ${celebrationYears.toLocaleString("en-US")}`}
                description="عرض أرقام عائمة وتأثيرات بصرية في خلفية صفحات الويب احتفالاً بالذكرى السنوية لتأسيس صحيفة سبق"
                enabled={celebrationMode?.enabled || false}
                onToggle={(checked) => toggleCelebrationMode.mutate(checked)}
                isPending={toggleCelebrationMode.isPending}
                icon={PartyPopper}
                iconColorEnabled="text-amber-600 dark:text-amber-300"
                testId="switch-celebration-mode"
                badgeText={`الذكرى الـ${celebrationYears}`}
                accentBorderColor="border-amber-200/60 hover:border-amber-400/80 dark:border-amber-900/40"
              />
            </div>
          </div>

          {/* Section: Announcements */}
          <div className="space-y-4">
            <SectionHeader 
              title="الإعلانات والتنبيهات الداخلية" 
              subtitle="نشر شريط تنبيه عام يظهر لجميع زوار وقراء صحيفة سبق في أعلى الموقع"
              color="bg-emerald-500" 
              icon={Megaphone} 
            />
            
            {/* Current Announcement Preview */}
            {announcement?.isActive && announcement?.message && (
              <Card className="rounded-2xl border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 via-card to-card shadow-xs dark:border-emerald-900/50 dark:from-emerald-950/30">
                <CardHeader className="p-4 sm:p-5 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2 text-sm sm:text-base font-bold">
                      <Bell className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                      الإعلان الداخلي النشط حالياً
                    </CardTitle>
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 font-bold px-2.5">
                      نشط ومعروض
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 sm:p-5 pt-0">
                  <div className={`flex items-start gap-3 rounded-xl border p-3.5 sm:p-4 ${typeConfig[announcement.type].borderColor} ${typeConfig[announcement.type].bgColor}`}>
                    <TypeIcon className={`mt-0.5 h-5 w-5 shrink-0 ${typeConfig[announcement.type].color}`} />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-relaxed">{announcement.message}</p>
                      {announcement.expiresAt && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          <span>ينتهي في: {formatReadableDate(announcement.expiresAt)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Announcement Form */}
            <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
              <CardHeader className="p-4 sm:p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
                  <span className="rounded-lg bg-sky-100/80 p-1.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                    <Megaphone className="h-4 w-4" />
                  </span>
                  تحرير وضبط الإعلان الداخلي
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  قم بإنشاء أو تعديل الإعلان الذي يظهر لجميع المستخدمين في أعلى صفحات الموقع
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    {/* Message Field */}
                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm font-bold">نص الإعلان</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="اكتب نص الإعلان الذي سيظهر في الشريط العلوي هنا..."
                              className="resize-none min-h-[90px] text-sm leading-relaxed"
                              data-testid="textarea-announcement-message"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            الرسالة الإخبارية أو التنويه الذي سيظهر للمستخدمين
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                      {/* Type Field */}
                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs sm:text-sm font-bold">نوع ومستوى الإعلان</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-announcement-type" className="h-10 text-sm">
                                  <SelectValue placeholder="اختر نوع الإعلان" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="info">
                                  <span className="flex items-center gap-2">
                                    <Info className="h-4 w-4 text-blue-500" />
                                    معلومة (أزرق)
                                  </span>
                                </SelectItem>
                                <SelectItem value="success">
                                  <span className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-500" />
                                    نجاح وتنويه إيجابي (أخضر)
                                  </span>
                                </SelectItem>
                                <SelectItem value="warning">
                                  <span className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                    تحذير وتنبيه مهم (أصفر)
                                  </span>
                                </SelectItem>
                                <SelectItem value="danger">
                                  <span className="flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                    عاجل وخطر (أحمر)
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
                              يحدد اللون والأيقونة المستخدمة في الشريط
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
                            <FormLabel className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>مدة العرض التلقائي</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-announcement-duration" className="h-10 text-sm">
                                  <SelectValue placeholder="اختر مدة العرض" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="never">بدون انتهاء (مستمر حتى الإيقاف)</SelectItem>
                                <SelectItem value="1day">يوم واحد (24 ساعة)</SelectItem>
                                <SelectItem value="3days">3 أيام</SelectItem>
                                <SelectItem value="1week">أسبوع كامل</SelectItem>
                                <SelectItem value="custom">تاريخ ووقت محدد</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormDescription className="text-xs">
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
                          <FormItem className="rounded-xl border border-border/80 bg-muted/30 p-3.5">
                            <FormLabel className="text-xs sm:text-sm font-bold flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-primary" />
                              <span>تاريخ ووقت الانتهاء المخصص</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                dir="ltr"
                                data-testid="input-announcement-expires"
                                className="h-10 text-sm bg-background"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              حدد التاريخ والوقت الذي سينتهي فيه ظهور الإعلان بدقة
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
                        <FormItem className="flex flex-row items-center justify-between rounded-xl border border-sky-100/90 bg-sky-50/40 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                          <div className="space-y-0.5">
                            <FormLabel className="text-sm sm:text-base font-bold text-foreground">
                              تفعيل ونشر الإعلان فورًا
                            </FormLabel>
                            <FormDescription className="text-xs text-muted-foreground">
                              عند التفعيل، سيظهر هذا الإعلان لجميع زوار صحيفة سبق في أعلى الصفحة
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-announcement-active"
                              className="scale-105 data-[state=checked]:bg-primary"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end pt-2">
                      <Button 
                        type="submit" 
                        disabled={updateAnnouncementMutation.isPending}
                        data-testid="button-save-announcement"
                        className="w-full sm:w-auto min-w-[150px] h-10 font-bold gap-2 shadow-xs"
                      >
                        {updateAnnouncementMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>جاري الحفظ...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4" />
                            <span>حفظ التغييرات</span>
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
      </div>
    </DashboardLayout>
  );
}
