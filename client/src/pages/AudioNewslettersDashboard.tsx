import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { 
  Plus, Edit, Trash, PlayCircle, Eye, BarChart, Radio, Clock, Calendar,
  TrendingUp, Headphones, CheckCircle, AlertCircle, Filter, CalendarDays,
  Loader2, Sparkles, Timer, Search, Pause
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow, format, isWithinInterval, startOfDay, endOfDay, addDays } from "date-fns";
import { arSA } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface AudioNewsletter {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  coverImageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  status: string;
  totalListens: number;
  averageCompletion: number;
  articlesCount: number;
  publishedAt: string | null;
  createdAt: string;
  templateId?: string;
  templateName?: string;
  schedule?: {
    enabled: boolean;
    type: "once" | "daily" | "weekly" | "monthly";
    time: string;
    date?: string;
    days?: number[];
    nextRun?: string;
  };
  generationProgress?: number;
  generationMessage?: string;
}

interface AnalyticsData {
  totalNewsletters: number;
  totalListens: number;
  averageCompletion: number;
  activeListeners: number;
  scheduledCount: number;
  publishedToday: number;
  weeklyGrowth: number;
  topNewsletter?: {
    title: string;
    listens: number;
  };
}

function AnalyticsCards({ analytics }: { analytics: AnalyticsData }) {
  const cards = [
    {
      title: "إجمالي النشرات",
      value: analytics.totalNewsletters.toLocaleString("ar-EG"),
      icon: Radio,
      description: "النشرات المنشورة",
      color: "text-blue-600",
    },
    {
      title: "الاستماعات",
      value: analytics.totalListens.toLocaleString("ar-EG"),
      icon: Headphones,
      description: `معدل الإكمال ${(analytics.averageCompletion || 0).toFixed(1)}%`,
      color: "text-green-600",
    },
    {
      title: "المستمعون النشطون",
      value: analytics.activeListeners.toLocaleString("ar-EG"),
      icon: TrendingUp,
      description: `نمو أسبوعي ${(analytics.weeklyGrowth || 0).toFixed(1)}%`,
      color: "text-purple-600",
      trend: analytics.weeklyGrowth > 0 ? "up" : "down",
    },
    {
      title: "النشرات المجدولة",
      value: analytics.scheduledCount.toLocaleString("ar-EG"),
      icon: CalendarDays,
      description: `${analytics.publishedToday} منشور اليوم`,
      color: "text-orange-600",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={cn("h-4 w-4", card.color)} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              {card.trend && (
                <span className={card.trend === "up" ? "text-green-600" : "text-red-600"}>
                  {card.trend === "up" ? "↑" : "↓"}
                </span>
              )}
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GenerationProgress({ newsletter }: { newsletter: AudioNewsletter }) {
  // Polling replaces SSE to avoid long-lived connections on Autoscale.
  const isProcessing = newsletter.status === "processing";

  const { data: live } = useQuery<{ newsletter?: { status?: string; generationProgress?: number; generationMessage?: string } }>({
    queryKey: ["/api/audio-newsletters/newsletters", newsletter.id],
    queryFn: async () => {
      const res = await fetch(`/api/audio-newsletters/newsletters/${newsletter.id}`, {
        credentials: "include",
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: isProcessing,
    refetchInterval: isProcessing ? 3000 : false,
    refetchIntervalInBackground: false,
  });

  const liveStatus = live?.newsletter?.status;

  useEffect(() => {
    if (!liveStatus) return;
    if (liveStatus === "completed" || liveStatus === "failed") {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/admin"] });
    }
  }, [liveStatus]);

  if (!isProcessing) return null;

  const progress = live?.newsletter?.generationProgress ?? newsletter.generationProgress ?? 0;
  const message = live?.newsletter?.generationMessage ?? newsletter.generationMessage ?? "";

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="text-xs text-muted-foreground">{message || "جاري التوليد..."}</span>
      </div>
      <Progress value={progress} className="h-1" />
    </div>
  );
}

function ScheduleBadge({ schedule }: { schedule: AudioNewsletter["schedule"] }) {
  if (!schedule?.enabled) return null;

  const getScheduleText = () => {
    switch (schedule.type) {
      case "daily":
        return `يومياً ${schedule.time}`;
      case "weekly":
        const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
        const selectedDays = schedule.days?.map(d => days[d]).join(", ") || "";
        return `أسبوعياً (${selectedDays}) ${schedule.time}`;
      case "monthly":
        return `شهرياً ${schedule.time}`;
      case "once":
        return schedule.nextRun ? format(new Date(schedule.nextRun), "dd/MM HH:mm", { locale: arSA }) : "";
      default:
        return "";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            مجدول
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getScheduleText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AudioNewslettersDashboard() {
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  
  // Audio player state management
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState<string | null>(null);

  const { data: newsletters, isLoading } = useQuery<AudioNewsletter[]>({
    queryKey: ["/api/audio-newsletters/admin"],
    enabled: !!user && hasRole(user, "admin", "system_admin", "editor"),
    refetchInterval: (data) => {
      // Refetch every 3 seconds if any newsletter is processing
      return Array.isArray(data) && data.some(n => n.status === "processing") ? 3000 : false;
    },
  });

  const { data: analytics, isLoading: isAnalyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/audio-newsletters/analytics/overview"],
    enabled: !!user && hasRole(user, "admin", "system_admin", "editor"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/audio-newsletters/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/admin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/analytics/overview"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف النشرة الصوتية بنجاح",
      });
      setDeleteId(null);
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف النشرة الصوتية",
        variant: "destructive",
      });
    },
  });

  const generateAudioMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest(`/api/audio-newsletters/${id}/generate`, { method: "POST" });
      return response as { jobId: string; status: string; message: string };
    },
    onSuccess: () => {
      toast({
        title: "تم بدء التوليد",
        description: "جاري توليد الملف الصوتي في الخلفية...",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/admin"] });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل بدء عملية التوليد",
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/audio-newsletters/${id}/publish`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/admin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audio-newsletters/analytics/overview"] });
      toast({
        title: "تم النشر",
        description: "تم نشر النشرة الصوتية بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل نشر النشرة الصوتية",
        variant: "destructive",
      });
    },
  });

  // Handle audio playback - stop current audio if playing, start new one
  const handlePlayAudio = (newsletterId: string, audioUrl: string) => {
    // If clicking the same newsletter that's playing, pause it
    if (playingId === newsletterId && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Start loading new audio
    setAudioLoading(newsletterId);
    setPlayingId(null);

    try {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.addEventListener('loadeddata', () => {
        setAudioLoading(null);
        setPlayingId(newsletterId);
      });

      audio.addEventListener('ended', () => {
        setPlayingId(null);
        audioRef.current = null;
      });

      audio.addEventListener('error', (err) => {
        console.error('Audio playback error:', err);
        setAudioLoading(null);
        setPlayingId(null);
        audioRef.current = null;
        toast({
          title: "خطأ في التشغيل",
          description: "فشل تشغيل الملف الصوتي. يرجى المحاولة مرة أخرى.",
          variant: "destructive",
        });
      });

      audio.play().catch(err => {
        console.error('Failed to play audio:', err);
        setAudioLoading(null);
        setPlayingId(null);
        audioRef.current = null;
        toast({
          title: "خطأ في التشغيل",
          description: "فشل تشغيل الملف الصوتي. يرجى المحاولة مرة أخرى.",
          variant: "destructive",
        });
      });
    } catch (error) {
      console.error('Error creating audio element:', error);
      setAudioLoading(null);
      audioRef.current = null;
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء تحميل الملف الصوتي",
        variant: "destructive",
      });
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string; icon?: React.ElementType }> = {
      draft: { variant: "secondary", label: "مسودة", icon: Edit },
      processing: { variant: "outline", label: "قيد المعالجة", icon: Loader2 },
      completed: { variant: "default", label: "مكتمل", icon: CheckCircle },
      failed: { variant: "destructive", label: "فشل", icon: AlertCircle },
      published: { variant: "default", label: "منشور", icon: Radio },
      scheduled: { variant: "outline", label: "مجدول", icon: Clock },
    };
    
    const config = variants[status] || { variant: "outline", label: status };
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1" data-testid={`badge-status-${status}`}>
        {Icon && <Icon className={cn("h-3 w-3", status === "processing" && "animate-spin")} />}
        {config.label}
      </Badge>
    );
  };

  const getFilteredNewsletters = (tabFilter?: string) => {
    let filtered = newsletters || [];

    // Apply tab filter
    if (tabFilter === "scheduled") {
      filtered = filtered.filter(n => n.schedule?.enabled);
    } else if (tabFilter === "published") {
      filtered = filtered.filter(n => n.status === "published");
    }

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(n => n.status === statusFilter);
    }

    // Apply template filter
    if (templateFilter !== "all") {
      filtered = filtered.filter(n => n.templateId === templateFilter);
    }

    return filtered;
  };

  const upcomingScheduled = newsletters?.filter(n => {
    if (!n.schedule?.enabled || !n.schedule.nextRun) return false;
    const nextRun = new Date(n.schedule.nextRun);
    const now = new Date();
    const tomorrow = addDays(now, 1);
    return isWithinInterval(nextRun, { start: now, end: endOfDay(tomorrow) });
  }) || [];

  if (isUserLoading || !user) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      </DashboardLayout>
    );
  }

  if (!hasRole(user, "admin", "system_admin", "editor")) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle data-testid="heading-unauthorized">غير مصرح</CardTitle>
          </CardHeader>
          <CardContent>
            <p data-testid="text-unauthorized-message">
              لا تملك صلاحية الوصول إلى إدارة النشرات الصوتية
            </p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-dashboard">
              النشرات الصوتية
            </h1>
            <p className="text-muted-foreground mt-2" data-testid="text-subtitle">
              إدارة النشرات الصوتية الخاصة بالمنصة
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild data-testid="button-templates">
              <Link href="/dashboard/audio-newsletters/templates">
                <Sparkles className="h-4 w-4 ml-2" />
                القوالب
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-view-analytics">
              <Link href="/dashboard/audio-newsletters/analytics">
                <BarChart className="h-4 w-4 ml-2" />
                التحليلات
              </Link>
            </Button>
            <Button asChild data-testid="button-create-newsletter">
              <Link href="/dashboard/audio-newsletters/create">
                <Plus className="h-4 w-4 ml-2" />
                نشرة جديدة
              </Link>
            </Button>
          </div>
        </div>

        {/* Analytics Cards */}
        {analytics && !isAnalyticsLoading && (
          <AnalyticsCards analytics={analytics} />
        )}

        {/* Upcoming Scheduled Section */}
        {upcomingScheduled.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  النشرات المجدولة القادمة
                </CardTitle>
                <Badge variant="secondary">{upcomingScheduled.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {upcomingScheduled.map((newsletter) => (
                  <div
                    key={newsletter.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="space-y-1">
                      <p className="font-medium">{newsletter.title}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          <Timer className="h-3 w-3 ml-1" />
                          {newsletter.schedule?.nextRun && 
                            format(new Date(newsletter.schedule.nextRun), "dd/MM HH:mm", { locale: arSA })}
                        </Badge>
                        {newsletter.templateName && (
                          <Badge variant="secondary" className="text-xs">
                            {newsletter.templateName}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        data-testid={`button-edit-scheduled-${newsletter.id}`}
                      >
                        <Link href={`/dashboard/audio-newsletters/${newsletter.id}/edit`}>
                          <Edit className="h-3 w-3 ml-1" />
                          تعديل
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all" className="gap-1">
              الكل
              {newsletters && <Badge variant="secondary" className="mr-2">{newsletters.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="published" className="gap-1">
              المنشورة
              {newsletters && <Badge variant="secondary" className="mr-2">{newsletters.filter(n => n.status === "published").length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="gap-1">
              المجدولة
              {newsletters && <Badge variant="secondary" className="mr-2">{newsletters.filter(n => n.schedule?.enabled).length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="البحث بالعنوان..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10"
                      data-testid="input-search"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="sm:w-48" data-testid="select-status">
                      <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="draft">مسودة</SelectItem>
                      <SelectItem value="processing">قيد المعالجة</SelectItem>
                      <SelectItem value="completed">مكتمل</SelectItem>
                      <SelectItem value="published">منشور</SelectItem>
                      <SelectItem value="scheduled">مجدول</SelectItem>
                      <SelectItem value="failed">فشل</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={templateFilter} onValueChange={setTemplateFilter}>
                    <SelectTrigger className="sm:w-48" data-testid="select-template">
                      <SelectValue placeholder="القالب" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع القوالب</SelectItem>
                      <SelectItem value="morning">نشرة الصباح</SelectItem>
                      <SelectItem value="evening">نشرة المساء</SelectItem>
                      <SelectItem value="weekly">النشرة الأسبوعية</SelectItem>
                      <SelectItem value="breaking">نشرة عاجلة</SelectItem>
                      <SelectItem value="trending">الأكثر تداولاً</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 space-y-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : getFilteredNewsletters(activeTab).length === 0 ? (
                  <div className="p-8 text-center" data-testid="text-no-newsletters">
                    <p className="text-muted-foreground">
                      {searchQuery || statusFilter !== "all" || templateFilter !== "all"
                        ? "لا توجد نتائج"
                        : "لا توجد نشرات صوتية بعد"}
                    </p>
                  </div>
                ) : (
                  <Table dir="rtl">
                    <TableHeader>
                      <TableRow>
                        <TableHead>العنوان</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>القالب</TableHead>
                        <TableHead>المقالات</TableHead>
                        <TableHead>الاستماعات</TableHead>
                        <TableHead>معدل الإكمال</TableHead>
                        <TableHead>تاريخ النشر</TableHead>
                        <TableHead>الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {getFilteredNewsletters(activeTab).map((newsletter) => (
                        <TableRow key={newsletter.id} data-testid={`row-newsletter-${newsletter.id}`}>
                          <TableCell className="font-medium" data-testid={`text-title-${newsletter.id}`}>
                            <div className="space-y-1">
                              {newsletter.title}
                              {newsletter.status === "processing" && (
                                <GenerationProgress newsletter={newsletter} />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusBadge(newsletter.status)}
                              <ScheduleBadge schedule={newsletter.schedule} />
                            </div>
                          </TableCell>
                          <TableCell>
                            {newsletter.templateName ? (
                              <Badge variant="secondary" className="text-xs">
                                {newsletter.templateName}
                              </Badge>
                            ) : "-"}
                          </TableCell>
                          <TableCell data-testid={`text-articles-count-${newsletter.id}`}>
                            {newsletter.articlesCount}
                          </TableCell>
                          <TableCell data-testid={`text-listens-${newsletter.id}`}>
                            {newsletter.totalListens.toLocaleString("ar-EG")}
                          </TableCell>
                          <TableCell data-testid={`text-completion-${newsletter.id}`}>
                            {(newsletter.averageCompletion || 0).toFixed(1)}%
                          </TableCell>
                          <TableCell data-testid={`text-published-date-${newsletter.id}`}>
                            {newsletter.publishedAt
                              ? formatDistanceToNow(new Date(newsletter.publishedAt), {
                                  addSuffix: true,
                                  locale: arSA,
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      asChild
                                      data-testid={`button-edit-${newsletter.id}`}
                                    >
                                      <Link href={`/dashboard/audio-newsletters/${newsletter.id}/edit`}>
                                        <Edit className="h-4 w-4" />
                                      </Link>
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>تعديل</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                              {newsletter.status === "draft" && newsletter.articlesCount > 0 && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => generateAudioMutation.mutate(newsletter.id)}
                                        disabled={generateAudioMutation.isPending}
                                        data-testid={`button-generate-${newsletter.id}`}
                                      >
                                        <Radio className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>توليد الصوت</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {newsletter.status === "completed" && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => publishMutation.mutate(newsletter.id)}
                                        disabled={publishMutation.isPending}
                                        data-testid={`button-publish-${newsletter.id}`}
                                      >
                                        <PlayCircle className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>نشر</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {(newsletter.status === "published" || newsletter.status === "completed") && newsletter.audioUrl && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => handlePlayAudio(newsletter.id, newsletter.audioUrl!)}
                                        disabled={audioLoading === newsletter.id}
                                        data-testid={`button-play-${newsletter.id}`}
                                      >
                                        {audioLoading === newsletter.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : playingId === newsletter.id ? (
                                          <Pause className="h-4 w-4" />
                                        ) : (
                                          <Headphones className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>
                                        {audioLoading === newsletter.id
                                          ? "جاري التحميل..."
                                          : playingId === newsletter.id
                                          ? "إيقاف مؤقت"
                                          : "استماع"}
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}

                              {newsletter.status === "published" && (
                                <>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          asChild
                                          data-testid={`button-view-${newsletter.id}`}
                                        >
                                          <Link href={`/audio-newsletters/${newsletter.slug}`}>
                                            <Eye className="h-4 w-4" />
                                          </Link>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>عرض</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          asChild
                                          data-testid={`button-analytics-${newsletter.id}`}
                                        >
                                          <Link href={`/dashboard/audio-newsletters/${newsletter.id}/analytics`}>
                                            <BarChart className="h-4 w-4" />
                                          </Link>
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>الإحصائيات</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              )}

                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => setDeleteId(newsletter.id)}
                                      data-testid={`button-delete-${newsletter.id}`}
                                    >
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>حذف</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="heading-delete-confirm">تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-delete-confirm">
              هل أنت متأكد من حذف هذه النشرة الصوتية؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}