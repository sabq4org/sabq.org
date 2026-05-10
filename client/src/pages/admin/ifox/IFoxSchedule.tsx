import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isToday, isPast, isFuture } from "date-fns";
import { ar } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { IFoxCalendar } from "@/components/admin/ifox/IFoxCalendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import {
  Calendar,
  Clock,
  Plus,
  Edit,
  Trash2,
  AlertTriangle,
  CheckCircle,
  X,
  List,
  Grid,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Share2,
  Bell,
  Eye,
  FileText,
  TrendingUp,
  Sparkles,
  Zap,
  Timer,
  CalendarDays,
  History,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
  Youtube,
  Send
} from "lucide-react";

interface ScheduledArticle {
  id: string;
  articleId: string;
  title: string;
  category: string;
  author: string;
  scheduledAt: string;
  status: "scheduled" | "published" | "failed" | "cancelled";
  publishOptions: {
    publishToSite: boolean;
    shareToSocial: string[];
    sendNotifications: boolean;
  };
  recurrence?: {
    type: "daily" | "weekly" | "monthly";
    endDate?: string;
  };
  aiScore?: number;
}

interface DraftArticle {
  id: string;
  title: string;
  category: string;
  author: string;
  createdAt: string;
  wordCount: number;
  aiScore?: number;
}

interface PublishingSlot {
  time: string;
  maxArticles: number;
  currentArticles: number;
  isOptimal: boolean;
}

const socialPlatforms = [
  { value: "twitter", label: "Twitter", icon: Twitter, color: "text-[hsl(var(--ifox-info))]" },
  { value: "facebook", label: "Facebook", icon: Facebook, color: "text-[hsl(var(--ifox-info))]" },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin, color: "text-[hsl(var(--ifox-info))]" },
  { value: "instagram", label: "Instagram", icon: Instagram, color: "text-[hsl(var(--ifox-error))]" },
  { value: "youtube", label: "YouTube", icon: Youtube, color: "text-[hsl(var(--ifox-error))]" },
];

export default function IFoxSchedule() {
  useRoleProtection('admin');
  const { toast } = useToast();
  
  const [viewMode, setViewMode] = useState<"calendar" | "timeline">("calendar");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<DraftArticle | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduledArticle | null>(null);
  
  // Schedule form state
  const [scheduleForm, setScheduleForm] = useState({
    articleId: "",
    scheduledAt: "",
    publishToSite: true,
    shareToSocial: [] as string[],
    sendNotifications: false,
    recurrenceType: "none" as "none" | "daily" | "weekly" | "monthly",
    recurrenceEndDate: "",
  });

  // Fetch scheduled articles
  const { data: scheduledArticlesRaw, isLoading, error: scheduleError } = useQuery<ScheduledArticle[]>({
    queryKey: ["/api/admin/ifox/schedule"]
  });
  const scheduledArticles = Array.isArray(scheduledArticlesRaw) ? scheduledArticlesRaw : [];

  // Fetch draft articles
  const { data: draftArticlesRaw, error: draftsError } = useQuery<DraftArticle[]>({
    queryKey: ["/api/admin/ifox/articles/drafts"]
  });
  const draftArticles = Array.isArray(draftArticlesRaw) ? draftArticlesRaw : [];

  // Fetch publishing slots
  const { data: publishingSlotsRaw, error: slotsError } = useQuery<PublishingSlot[]>({
    queryKey: ["/api/admin/ifox/schedule/slots", selectedDate]
  });
  const publishingSlots = Array.isArray(publishingSlotsRaw) ? publishingSlotsRaw : [];

  // Ensure data is always an array
  const safeScheduledArticles = Array.isArray(scheduledArticles) ? scheduledArticles : [];
  const safeDraftArticles = Array.isArray(draftArticles) ? draftArticles : [];
  const safePublishingSlots = Array.isArray(publishingSlots) ? publishingSlots : [];

  // Create/Update schedule mutation
  const scheduleArticleMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/admin/ifox/schedule", {
        method: editingSchedule ? "PUT" : "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/schedule"] });
      toast({
        title: "تمت الجدولة بنجاح",
        description: editingSchedule ? "تم تحديث الجدولة بنجاح" : "تمت جدولة المقال بنجاح",
      });
      setIsScheduleDialogOpen(false);
      resetScheduleForm();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشلت عملية الجدولة",
        variant: "destructive",
      });
    }
  });

  // Delete schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: string) => {
      return apiRequest(`/api/admin/ifox/schedule/${scheduleId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/schedule"] });
      toast({
        title: "تم الإلغاء بنجاح",
        description: "تم إلغاء الجدولة بنجاح",
      });
    }
  });

  const resetScheduleForm = () => {
    setScheduleForm({
      articleId: "",
      scheduledAt: "",
      publishToSite: true,
      shareToSocial: [],
      sendNotifications: false,
      recurrenceType: "none",
      recurrenceEndDate: "",
    });
    setSelectedArticle(null);
    setEditingSchedule(null);
  };

  const openScheduleDialog = (article?: DraftArticle, schedule?: ScheduledArticle) => {
    if (schedule) {
      setEditingSchedule(schedule);
      setScheduleForm({
        articleId: schedule.articleId,
        scheduledAt: format(new Date(schedule.scheduledAt), "yyyy-MM-dd'T'HH:mm"),
        publishToSite: schedule.publishOptions.publishToSite,
        shareToSocial: schedule.publishOptions.shareToSocial,
        sendNotifications: schedule.publishOptions.sendNotifications,
        recurrenceType: schedule.recurrence?.type || "none",
        recurrenceEndDate: schedule.recurrence?.endDate ? format(new Date(schedule.recurrence.endDate), "yyyy-MM-dd") : "",
      });
    } else if (article) {
      setSelectedArticle(article);
      setScheduleForm({
        ...scheduleForm,
        articleId: article.id,
      });
    }
    setIsScheduleDialogOpen(true);
  };

  const handleScheduleSubmit = () => {
    const data = {
      ...scheduleForm,
      articleId: selectedArticle?.id || scheduleForm.articleId,
      recurrence: scheduleForm.recurrenceType !== "none" ? {
        type: scheduleForm.recurrenceType,
        endDate: scheduleForm.recurrenceEndDate || undefined,
      } : undefined,
    };
    scheduleArticleMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled": return "bg-[hsl(var(--ifox-info)/.2)] text-[hsl(var(--ifox-info))] border-[hsl(var(--ifox-info)/.3)]";
      case "published": return "bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))] border-[hsl(var(--ifox-success)/.3)]";
      case "failed": return "bg-[hsl(var(--ifox-error)/.2)] text-[hsl(var(--ifox-error))] border-[hsl(var(--ifox-error)/.3)]";
      case "cancelled": return "bg-[hsl(var(--ifox-neutral)/.2)] text-[hsl(var(--ifox-text-secondary))] border-[hsl(var(--ifox-neutral)/.3)]";
      default: return "bg-[hsl(var(--ifox-neutral)/.2)] text-[hsl(var(--ifox-text-secondary))] border-[hsl(var(--ifox-neutral)/.3)]";
    }
  };

  const upcomingArticles = safeScheduledArticles
    .filter(a => a?.status === "scheduled" && isFuture(new Date(a?.scheduledAt)))
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    .slice(0, 5);

  const publishedArticles = safeScheduledArticles
    .filter(a => a?.status === "published")
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 10);

  const hasConflict = (date: Date) => {
    const hour = format(date, "HH:00");
    const slot = safePublishingSlots.find(s => s?.time === hour);
    return slot ? slot.currentArticles >= slot.maxArticles : false;
  };

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="space-y-3 sm:space-y-4"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-accent-primary)/1)] shadow-[0_10px_15px_hsl(var(--ifox-surface-overlay)/.1)] shadow-[hsl(var(--ifox-info)/.3)] flex-shrink-0">
                    <Calendar className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-text-primary))]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-accent-primary)/1)] bg-clip-text text-transparent truncate">
                      جدولة النشر
                    </h1>
                    <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] truncate">إدارة وجدولة نشر المقالات</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap">
                  <div className="flex bg-[hsl(var(--ifox-surface-overlay)/.05)] rounded-lg p-0.5 sm:p-1">
                    <Button
                      data-testid="button-view-calendar"
                      variant={viewMode === "calendar" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("calendar")}
                      className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                    >
                      <Grid className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">التقويم</span>
                    </Button>
                    <Button
                      data-testid="button-view-timeline"
                      variant={viewMode === "timeline" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("timeline")}
                      className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
                    >
                      <List className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden xs:inline">الخط الزمني</span>
                    </Button>
                  </div>
                  <Button
                    data-testid="button-new-schedule"
                    onClick={() => setIsScheduleDialogOpen(true)}
                    className="gap-1 sm:gap-2 bg-gradient-to-r from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-accent-primary)/1)] hover:from-[hsl(var(--ifox-info-muted)/1)] hover:to-[hsl(var(--ifox-accent-muted)/1)] text-xs sm:text-sm px-3 sm:px-4"
                  >
                    <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden xs:inline">جدولة جديدة</span>
                    <span className="xs:hidden">جديد</span>
                  </Button>
                </div>
              </div>

              {/* Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                <Card data-testid="card-stats-today" className="bg-gradient-to-br from-[hsl(var(--ifox-info)/.2)] to-[hsl(var(--ifox-info)/.1)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] truncate">مجدول اليوم</p>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                          {safeScheduledArticles.filter(a => 
                            a?.scheduledAt && isToday(new Date(a.scheduledAt)) && a.status === "scheduled"
                          ).length}
                        </p>
                      </div>
                      <CalendarDays className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-info))] opacity-50 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-stats-week" className="bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/.2)] to-[hsl(var(--ifox-accent-secondary)/.1)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] truncate">هذا الأسبوع</p>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                          {safeScheduledArticles.filter(a => {
                            const date = new Date(a?.scheduledAt);
                            const now = new Date();
                            return date >= startOfWeek(now) && date <= endOfWeek(now) && a?.status === "scheduled";
                          }).length}
                        </p>
                      </div>
                      <Timer className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-accent-primary))] opacity-50 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-stats-published" className="bg-gradient-to-br from-[hsl(var(--ifox-success)/.2)] to-[hsl(var(--ifox-success)/.1)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] truncate">تم النشر</p>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">
                          {safeScheduledArticles.filter(a => a?.status === "published").length}
                        </p>
                      </div>
                      <CheckCircle className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-success))] opacity-50 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-stats-drafts" className="bg-gradient-to-br from-[hsl(var(--ifox-warning)/.2)] to-[hsl(var(--ifox-warning)/.1)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))] truncate">مسودات متاحة</p>
                        <p className="text-lg sm:text-xl md:text-2xl font-bold text-[hsl(var(--ifox-text-primary))]">{safeDraftArticles.length}</p>
                      </div>
                      <FileText className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[hsl(var(--ifox-warning))] opacity-50 flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Main Content Area */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4 sm:gap-6"
            >
              {/* Calendar/Timeline View */}
              <div className="min-w-0">
                {viewMode === "calendar" ? (
                  <Card data-testid="card-calendar-view" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                    <CardHeader className="p-3 sm:p-4 md:p-6">
                      <CardTitle className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                        <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="truncate">التقويم</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 md:p-6 overflow-x-auto">
                      <div className="min-w-[600px] md:min-w-0">
                        <IFoxCalendar
                          events={safeScheduledArticles.map(article => ({
                            id: article.id,
                            title: article.title,
                            start: new Date(article.scheduledAt),
                            end: new Date(new Date(article.scheduledAt).getTime() + 30 * 60 * 1000),
                            category: article.category,
                            status: article.status,
                          }))}
                          onEventClick={(event) => {
                            const article = safeScheduledArticles.find(a => a.id === event.id);
                            if (article) openScheduleDialog(undefined, article);
                          }}
                          onDateClick={(date) => {
                            setSelectedDate(date);
                            setScheduleForm({
                              ...scheduleForm,
                              scheduledAt: format(date, "yyyy-MM-dd'T'HH:mm"),
                            });
                            setIsScheduleDialogOpen(true);
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card data-testid="card-timeline-view" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                    <CardHeader className="p-3 sm:p-4 md:p-6">
                      <CardTitle className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                        <List className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span className="truncate">الخط الزمني</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 sm:p-4 md:p-6">
                      <ScrollArea className="h-[400px] sm:h-[500px] md:h-[600px] pl-2 sm:pl-4">
                        <div className="space-y-3 sm:space-y-4">
                          {upcomingArticles.map((article, index) => (
                            <motion.div
                              key={article.id}
                              data-testid={`timeline-article-${article.id}`}
                              initial={{ x: -20, opacity: 0 }}
                              animate={{ x: 0, opacity: 1 }}
                              transition={{ delay: index * 0.1 }}
                              className="flex gap-2 sm:gap-4"
                            >
                              <div className="relative hidden sm:block">
                                <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-[hsl(var(--ifox-info))] mt-2" />
                                {index < upcomingArticles.length - 1 && (
                                  <div className="absolute top-5 right-1 sm:right-1.5 w-px h-full bg-[hsl(var(--ifox-surface-overlay)/.2)]" />
                                )}
                              </div>
                              <div className="flex-1 pb-6 sm:pb-8 min-w-0">
                                <div className="p-3 sm:p-4 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.05)] border border-[hsl(var(--ifox-surface-overlay)/.1)] hover:border-[hsl(var(--ifox-surface-overlay)/.2)] transition-colors">
                                  <div className="flex flex-col sm:flex-row items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0 flex-1">
                                      <h3 className="text-xs sm:text-sm md:text-base text-[hsl(var(--ifox-text-primary))] font-medium truncate">{article.title}</h3>
                                      <p className="text-[hsl(var(--ifox-text-secondary))] text-xs sm:text-sm mt-1 truncate">{article.category}</p>
                                    </div>
                                    <Badge className={cn(getStatusColor(article.status), "text-xs flex-shrink-0")}>
                                      {article.status === "scheduled" ? "مجدول" : article.status}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">
                                    <div className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                                      <span>{format(new Date(article.scheduledAt), "d MMM", { locale: ar })}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                                      <span>{format(new Date(article.scheduledAt), "h:mm a", { locale: ar })}</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-2 sm:mt-3">
                                    {article.publishOptions.publishToSite && (
                                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                                        <Eye className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                                        <span className="hidden sm:inline">الموقع</span>
                                      </Badge>
                                    )}
                                    {article.publishOptions.shareToSocial.slice(0, 2).map(platform => {
                                      const platformInfo = socialPlatforms.find(p => p.value === platform);
                                      const Icon = platformInfo?.icon;
                                      return Icon ? (
                                        <Badge key={platform} variant="secondary" className="text-[10px] sm:text-xs">
                                          <Icon className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${platformInfo.color} sm:ml-1`} />
                                          <span className="hidden sm:inline">{platformInfo.label}</span>
                                        </Badge>
                                      ) : null;
                                    })}
                                    {article.publishOptions.shareToSocial.length > 2 && (
                                      <Badge variant="secondary" className="text-[10px] sm:text-xs">
                                        +{article.publishOptions.shareToSocial.length - 2}
                                      </Badge>
                                    )}
                                    {article.publishOptions.sendNotifications && (
                                      <Badge variant="secondary" className="text-[10px] sm:text-xs hidden sm:flex">
                                        <Bell className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                                        إشعارات
                                      </Badge>
                                    )}
                                    {article.recurrence && (
                                      <Badge variant="secondary" className="text-[10px] sm:text-xs hidden sm:flex">
                                        <Repeat className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                                        {article.recurrence.type === "daily" ? "يومي" :
                                         article.recurrence.type === "weekly" ? "أسبوعي" : "شهري"}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2 mt-3">
                                    <Button
                                      data-testid={`button-edit-${article.id}`}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openScheduleDialog(undefined, article)}
                                      className="text-xs sm:text-sm"
                                    >
                                      <Edit className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                                      تعديل
                                    </Button>
                                    <Button
                                      data-testid={`button-cancel-${article.id}`}
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        if (confirm("هل أنت متأكد من إلغاء هذه الجدولة؟")) {
                                          deleteScheduleMutation.mutate(article.id);
                                        }
                                      }}
                                      className="text-[hsl(var(--ifox-error))] hover:text-[hsl(var(--ifox-error))] text-xs sm:text-sm"
                                    >
                                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                                      إلغاء
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4 sm:space-y-6">
                {/* Publishing Slots */}
                <Card data-testid="card-publishing-slots" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="truncate">أوقات النشر المثلى</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 space-y-2">
                    {safePublishingSlots.map((slot) => (
                      <div
                        key={slot.time}
                        data-testid={`slot-${slot.time}`}
                        className={cn(
                          "p-2 sm:p-3 rounded-lg border transition-colors",
                          slot.isOptimal
                            ? "bg-[hsl(var(--ifox-success)/.1)] border-[hsl(var(--ifox-success)/.3)]"
                            : "bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-1">
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-[hsl(var(--ifox-text-secondary))] flex-shrink-0" />
                            <span className="text-xs sm:text-sm text-[hsl(var(--ifox-text-primary))] font-medium truncate">{slot.time}</span>
                            {slot.isOptimal && (
                              <Badge className="bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))] border-[hsl(var(--ifox-success)/.3)] text-[10px] sm:text-xs hidden sm:flex">
                                <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                                مثالي
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs sm:text-sm flex-shrink-0">
                            <span className={cn(
                              "font-medium",
                              slot.currentArticles >= slot.maxArticles
                                ? "text-[hsl(var(--ifox-error))]"
                                : "text-[hsl(var(--ifox-text-primary))]"
                            )}>
                              {slot.currentArticles}
                            </span>
                            <span className="text-[hsl(var(--ifox-text-secondary))]"> / {slot.maxArticles}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Draft Articles */}
                <Card data-testid="card-draft-articles" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="truncate">مسودات جاهزة للنشر</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <ScrollArea className="h-[200px] sm:h-[250px]">
                      <div className="space-y-2">
                        {safeDraftArticles.map((article) => (
                          <div
                            key={article.id}
                            data-testid={`draft-${article.id}`}
                            className="p-2 sm:p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.05)] border border-[hsl(var(--ifox-surface-overlay)/.1)] hover:border-[hsl(var(--ifox-surface-overlay)/.2)] transition-colors"
                          >
                            <h4 className="text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm font-medium mb-1 line-clamp-1 truncate">
                              {article.title}
                            </h4>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[hsl(var(--ifox-text-secondary))] text-[10px] sm:text-xs truncate">{article.category}</span>
                              <Button
                                data-testid={`button-schedule-draft-${article.id}`}
                                variant="ghost"
                                size="sm"
                                onClick={() => openScheduleDialog(article)}
                                className="h-6 sm:h-7 text-[10px] sm:text-xs px-2 sm:px-3 flex-shrink-0"
                              >
                                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                                جدولة
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Publishing History */}
                <Card data-testid="card-publishing-history" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                      <History className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="truncate">سجل النشر</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <ScrollArea className="h-[150px] sm:h-[200px]">
                      <div className="space-y-2">
                        {publishedArticles.map((article) => (
                          <div
                            key={article.id}
                            data-testid={`published-${article.id}`}
                            className="p-2 sm:p-3 rounded-lg bg-[hsl(var(--ifox-surface-overlay)/.05)] border border-[hsl(var(--ifox-surface-overlay)/.1)]"
                          >
                            <h4 className="text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm font-medium mb-1 line-clamp-1 truncate">
                              {article.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-[hsl(var(--ifox-text-secondary))]">
                              <span className="truncate">{format(new Date(article.scheduledAt), "d MMM, h:mm a", { locale: ar })}</span>
                              <Badge className="bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))] border-[hsl(var(--ifox-success)/.3)] text-[10px] sm:text-xs">
                                تم النشر
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </motion.div>
        </div>
      </ScrollArea>

      {/* Schedule Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={(open) => {
        if (!open) resetScheduleForm();
        setIsScheduleDialogOpen(open);
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg md:max-w-2xl bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-surface-overlay)/.1)] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="px-4 sm:px-6">
            <DialogTitle className="text-sm sm:text-base md:text-lg text-[hsl(var(--ifox-text-primary))] truncate">
              {editingSchedule ? "تعديل الجدولة" : "جدولة مقال جديد"}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">
              حدد وقت النشر وخيارات المشاركة
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 sm:space-y-4 px-4 sm:px-6" dir="rtl">
            {/* Article Selection */}
            {!editingSchedule && (
              <div>
                <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">اختر المقال</Label>
                <Select
                  value={scheduleForm.articleId}
                  onValueChange={(value) => {
                    setScheduleForm({ ...scheduleForm, articleId: value });
                    setSelectedArticle(draftArticles.find(a => a.id === value) || null);
                  }}
                >
                  <SelectTrigger data-testid="select-article" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm h-9 sm:h-10">
                    <SelectValue placeholder="اختر مقال من المسودات" />
                  </SelectTrigger>
                  <SelectContent>
                    {draftArticles.map((article) => (
                      <SelectItem key={article.id} value={article.id} className="text-xs sm:text-sm">
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="truncate">{article.title}</span>
                          {article.aiScore && (
                            <Badge variant="secondary" className="mr-2 text-[10px] sm:text-xs flex-shrink-0">
                              AI: {article.aiScore}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Schedule Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">التاريخ والوقت</Label>
                <Input
                  data-testid="input-datetime"
                  type="datetime-local"
                  value={scheduleForm.scheduledAt}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, scheduledAt: e.target.value })}
                  className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm h-9 sm:h-10"
                />
                {scheduleForm.scheduledAt && hasConflict(new Date(scheduleForm.scheduledAt)) && (
                  <div className="flex items-center gap-1 mt-2 text-[hsl(var(--ifox-warning))] text-[10px] sm:text-xs">
                    <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="truncate">تحذير: هذا الوقت مزدحم بالمقالات</span>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">التكرار</Label>
                <Select
                  value={scheduleForm.recurrenceType}
                  onValueChange={(value: any) => setScheduleForm({ ...scheduleForm, recurrenceType: value })}
                >
                  <SelectTrigger data-testid="select-recurrence" className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm h-9 sm:h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs sm:text-sm">بدون تكرار</SelectItem>
                    <SelectItem value="daily" className="text-xs sm:text-sm">يومي</SelectItem>
                    <SelectItem value="weekly" className="text-xs sm:text-sm">أسبوعي</SelectItem>
                    <SelectItem value="monthly" className="text-xs sm:text-sm">شهري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {scheduleForm.recurrenceType !== "none" && (
              <div>
                <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">تاريخ انتهاء التكرار (اختياري)</Label>
                <Input
                  data-testid="input-recurrence-end"
                  type="date"
                  value={scheduleForm.recurrenceEndDate}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, recurrenceEndDate: e.target.value })}
                  className="bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm h-9 sm:h-10"
                />
              </div>
            )}

            {/* Publishing Options */}
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">خيارات النشر</Label>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  data-testid="checkbox-publish-to-site"
                  id="publishToSite"
                  checked={scheduleForm.publishToSite}
                  onCheckedChange={(checked) => 
                    setScheduleForm({ ...scheduleForm, publishToSite: checked as boolean })
                  }
                />
                <label
                  htmlFor="publishToSite"
                  className="text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm cursor-pointer flex items-center gap-1 sm:gap-2"
                >
                  <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">نشر على موقع آي فوكس</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  data-testid="checkbox-send-notifications"
                  id="sendNotifications"
                  checked={scheduleForm.sendNotifications}
                  onCheckedChange={(checked) => 
                    setScheduleForm({ ...scheduleForm, sendNotifications: checked as boolean })
                  }
                />
                <label
                  htmlFor="sendNotifications"
                  className="text-[hsl(var(--ifox-text-primary))] text-xs sm:text-sm cursor-pointer flex items-center gap-1 sm:gap-2"
                >
                  <Bell className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="truncate">إرسال إشعارات للمتابعين</span>
                </label>
              </div>
            </div>

            {/* Social Media Sharing */}
            <div className="space-y-2 sm:space-y-3">
              <Label className="text-xs sm:text-sm text-[hsl(var(--ifox-text-secondary))]">المشاركة على وسائل التواصل</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {socialPlatforms.map((platform) => {
                  const Icon = platform.icon;
                  const isSelected = scheduleForm.shareToSocial.includes(platform.value);
                  
                  return (
                    <button
                      key={platform.value}
                      data-testid={`button-social-${platform.value}`}
                      type="button"
                      onClick={() => {
                        setScheduleForm({
                          ...scheduleForm,
                          shareToSocial: isSelected
                            ? scheduleForm.shareToSocial.filter(p => p !== platform.value)
                            : [...scheduleForm.shareToSocial, platform.value]
                        });
                      }}
                      className={cn(
                        "p-2 sm:p-3 rounded-lg border transition-all",
                        isSelected
                          ? "bg-[hsl(var(--ifox-surface-overlay)/.1)] border-white/30"
                          : "bg-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] hover:border-[hsl(var(--ifox-surface-overlay)/.2)]"
                      )}
                    >
                      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 mx-auto ${platform.color}`} />
                      <span className="text-[hsl(var(--ifox-text-primary))] text-[10px] sm:text-xs mt-0.5 sm:mt-1 block truncate">{platform.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="px-4 sm:px-6 flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              data-testid="button-dialog-cancel"
              variant="ghost"
              onClick={() => {
                resetScheduleForm();
                setIsScheduleDialogOpen(false);
              }}
              className="text-xs sm:text-sm w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button
              data-testid="button-dialog-submit"
              onClick={handleScheduleSubmit}
              disabled={!scheduleForm.articleId || !scheduleForm.scheduledAt}
              className="bg-gradient-to-r from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:from-[hsl(var(--ifox-info)/1)] hover:to-[hsl(var(--ifox-accent-secondary)/1)] text-xs sm:text-sm w-full sm:w-auto"
            >
              {editingSchedule ? "تحديث الجدولة" : "جدولة المقال"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </IFoxLayout>
  );
}