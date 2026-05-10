import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  Calendar,
  Globe,
  MapPin,
  Building2,
  Star,
  ArrowLeft,
  Sparkles,
  FileText,
  Heading,
  BarChart,
  MessageSquare,
  Search,
  PenTool,
  Edit,
  Trash2,
  RefreshCw,
} from "lucide-react";
import type { CalendarEvent as BaseCalendarEvent, CalendarAiDraft as BaseCalendarAiDraft } from "@shared/schema";

interface CalendarEvent extends BaseCalendarEvent {
  category?: {
    id: string;
    nameAr: string;
  };
}

interface AiDraft extends BaseCalendarAiDraft {}

export default function CalendarEventDetail() {
  const [, params] = useRoute("/dashboard/calendar/events/:id");
  const eventId = params?.id;
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: event, isLoading: eventLoading } = useQuery<CalendarEvent>({
    queryKey: [`/api/calendar/${eventId}`],
    enabled: !!eventId,
  });

  const { data: aiDraft, isLoading: draftLoading } = useQuery<AiDraft>({
    queryKey: [`/api/calendar/${eventId}/ai-drafts`],
    enabled: !!eventId,
  });

  const generateAiDraft = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/calendar/${eventId}/ai-drafts/generate`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/calendar/${eventId}/ai-drafts`] });
      toast({
        title: "تم التوليد بنجاح",
        description: "تم توليد مسودات الذكاء الاصطناعي للمناسبة",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء توليد المسودات",
        variant: "destructive",
      });
    },
  });

  const createArticleFromIdea = useMutation({
    mutationFn: async (ideaIndex: number) => {
      return await apiRequest(`/api/calendar/${eventId}/create-article`, {
        method: "POST",
        body: JSON.stringify({ ideaIndex }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "تم إنشاء المقال",
        description: "تم إنشاء مقال جديد من الفكرة",
      });
      window.location.href = `/dashboard/articles/${data.articleId}`;
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إنشاء المقال",
        variant: "destructive",
      });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/calendar/${eventId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف المناسبة بنجاح",
      });
      navigate("/dashboard/calendar");
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل حذف المناسبة",
        variant: "destructive",
      });
    },
  });

  if (eventLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout>
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>مناسبة غير موجودة</CardTitle>
            <CardDescription>لم يتم العثور على المناسبة المطلوبة</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/calendar">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 ml-2" />
                العودة إلى التقويم
              </Button>
            </Link>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "GLOBAL":
        return <Globe className="h-5 w-5" />;
      case "NATIONAL":
        return <MapPin className="h-5 w-5" />;
      case "INTERNAL":
        return <Building2 className="h-5 w-5" />;
      default:
        return <Calendar className="h-5 w-5" />;
    }
  };

  const getEventTypeLabel = (type: string) => {
    switch (type) {
      case "GLOBAL":
        return "عالمي";
      case "NATIONAL":
        return "وطني";
      case "INTERNAL":
        return "داخلي";
      default:
        return type;
    }
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 5) return "bg-red-500";
    if (importance >= 4) return "bg-orange-500";
    if (importance >= 3) return "bg-yellow-500";
    return "bg-blue-500";
  };

  const formatEventDate = (dateInput: string | Date) => {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    const gregorian = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
    
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
    
    return { gregorian, hijri };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/dashboard/calendar">
            <Button variant="outline" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة إلى التقويم
            </Button>
          </Link>

          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/calendar/events/${eventId}/edit`}>
              <Button variant="outline" data-testid="button-edit">
                <Edit className="h-4 w-4 ml-2" />
                تعديل
              </Button>
            </Link>
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" data-testid="button-delete">
                  <Trash2 className="h-4 w-4 ml-2" />
                  حذف
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من حذف هذه المناسبة؟ لا يمكن التراجع عن هذا الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-delete-cancel">
                    إلغاء
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteEvent.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-delete-confirm"
                  >
                    حذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-lg ${getImportanceColor(event.importance)}/10`}>
                {getEventIcon(event.type)}
              </div>
              
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <CardTitle className="text-2xl">{event.title}</CardTitle>
                  <Badge variant="outline">{getEventTypeLabel(event.type)}</Badge>
                  {event.importance >= 4 && (
                    <Badge variant="secondary">
                      <Star className="h-3 w-3 ml-1" />
                      مهم
                    </Badge>
                  )}
                </div>
                
                <CardDescription>{event.description}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold mb-2 text-sm text-muted-foreground">تاريخ البدء</h4>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{formatEventDate(event.dateStart).gregorian}</span>
                    <span className="text-xs text-muted-foreground">{formatEventDate(event.dateStart).hijri}</span>
                  </div>
                </div>
              </div>

              {event.dateEnd && (
                <div>
                  <h4 className="font-semibold mb-2 text-sm text-muted-foreground">تاريخ الانتهاء</h4>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div className="flex flex-col">
                      <span>{formatEventDate(event.dateEnd).gregorian}</span>
                      <span className="text-xs text-muted-foreground">{formatEventDate(event.dateEnd).hijri}</span>
                    </div>
                  </div>
                </div>
              )}

              {event.category && (
                <div>
                  <h4 className="font-semibold mb-2 text-sm text-muted-foreground">التصنيف</h4>
                  <Badge variant="outline">{event.category.nameAr}</Badge>
                </div>
              )}

              <div>
                <h4 className="font-semibold mb-2 text-sm text-muted-foreground">الأهمية</h4>
                <div className="flex items-center gap-2">
                  {Array.from({ length: event.importance }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 fill-current ${getImportanceColor(event.importance).replace('bg-', 'text-')}`} />
                  ))}
                  <span className="text-sm text-muted-foreground">({event.importance}/5)</span>
                </div>
              </div>
            </div>

            {event.tags && event.tags.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2 text-sm text-muted-foreground">الوسوم</h4>
                <div className="flex flex-wrap gap-2">
                  {event.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Drafts Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle>مسودات الذكاء الاصطناعي</CardTitle>
              </div>
              
              {!aiDraft && !draftLoading && (
                <Button
                  onClick={() => generateAiDraft.mutate()}
                  disabled={generateAiDraft.isPending}
                  data-testid="button-generate-ai-draft"
                >
                  {generateAiDraft.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                      جاري التوليد...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 ml-2" />
                      توليد مسودات AI
                    </>
                  )}
                </Button>
              )}
            </div>
            <CardDescription>
              محتوى تحريري مُولَّد تلقائياً بواسطة الذكاء الاصطناعي
            </CardDescription>
          </CardHeader>

          <CardContent>
            {draftLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-sm text-muted-foreground">جاري تحميل المسودات...</p>
                </div>
              </div>
            ) : !aiDraft ? (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground mb-4">
                  لم يتم توليد مسودات ذكاء اصطناعي لهذه المناسبة بعد
                </p>
                <Button
                  onClick={() => generateAiDraft.mutate()}
                  disabled={generateAiDraft.isPending}
                  data-testid="button-generate-ai-draft-empty"
                >
                  {generateAiDraft.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 ml-2 animate-spin" />
                      جاري التوليد...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 ml-2" />
                      توليد مسودات الآن
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <Tabs defaultValue="ideas" className="w-full">
                <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
                  <TabsTrigger value="ideas" data-testid="tab-ideas">
                    <FileText className="h-4 w-4 md:ml-2" />
                    <span className="hidden md:inline">أفكار</span>
                  </TabsTrigger>
                  <TabsTrigger value="headlines" data-testid="tab-headlines">
                    <Heading className="h-4 w-4 md:ml-2" />
                    <span className="hidden md:inline">عناوين</span>
                  </TabsTrigger>
                  <TabsTrigger value="infographic" data-testid="tab-infographic">
                    <BarChart className="h-4 w-4 md:ml-2" />
                    <span className="hidden md:inline">إنفوجراف</span>
                  </TabsTrigger>
                  <TabsTrigger value="social" data-testid="tab-social">
                    <MessageSquare className="h-4 w-4 md:ml-2" />
                    <span className="hidden md:inline">سوشيال</span>
                  </TabsTrigger>
                  <TabsTrigger value="seo" data-testid="tab-seo">
                    <Search className="h-4 w-4 md:ml-2" />
                    <span className="hidden md:inline">SEO</span>
                  </TabsTrigger>
                  <TabsTrigger value="draft" data-testid="tab-draft">
                    <PenTool className="h-4 w-4 md:ml-2" />
                    <span className="hidden md:inline">مسودة</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ideas" className="mt-6">
                  {(aiDraft as any).ideas && Array.isArray((aiDraft as any).ideas) ? (
                    <div className="space-y-3">
                      {((aiDraft as any).ideas as string[]).map((idea: string, index: number) => (
                        <Card key={index}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-sm leading-relaxed">{idea}</p>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => createArticleFromIdea.mutate(index)}
                                disabled={createArticleFromIdea.isPending}
                                data-testid={`button-create-article-${index}`}
                              >
                                إنشاء مقال
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">لا توجد أفكار متاحة</p>
                  )}
                </TabsContent>

                <TabsContent value="headlines" className="mt-6">
                  {(aiDraft as any).headlines && Array.isArray((aiDraft as any).headlines) ? (
                    <div className="space-y-2">
                      {((aiDraft as any).headlines as string[]).map((headline: string, index: number) => (
                        <div key={index} className="p-3 border rounded-md hover-elevate">
                          <h3 className="font-semibold">{headline}</h3>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">لا توجد عناوين متاحة</p>
                  )}
                </TabsContent>

                <TabsContent value="infographic" className="mt-6">
                  {(aiDraft as any).infographic ? (
                    <div className="prose prose-ar max-w-none">
                      <div className="whitespace-pre-wrap p-4 border rounded-md bg-muted/30">
                        {(aiDraft as any).infographic}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">لا يوجد محتوى إنفوجراف متاح</p>
                  )}
                </TabsContent>

                <TabsContent value="social" className="mt-6">
                  {(aiDraft as any).social && typeof (aiDraft as any).social === "object" ? (
                    <div className="space-y-4">
                      {Object.entries((aiDraft as any).social as object).map(([platform, content]) => (
                        <Card key={platform}>
                          <CardHeader>
                            <CardTitle className="text-lg capitalize">{platform}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm whitespace-pre-wrap">{content as string}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">لا يوجد محتوى سوشيال ميديا متاح</p>
                  )}
                </TabsContent>

                <TabsContent value="seo" className="mt-6">
                  {(aiDraft as any).seo && typeof (aiDraft as any).seo === "object" ? (
                    <div className="space-y-4">
                      {Object.entries((aiDraft as any).seo as object).map(([key, value]) => (
                        <div key={key} className="p-4 border rounded-md">
                          <h4 className="font-semibold mb-2 text-sm text-muted-foreground capitalize">{key}</h4>
                          <p className="text-sm">{value as string}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">لا يوجد محتوى SEO متاح</p>
                  )}
                </TabsContent>

                <TabsContent value="draft" className="mt-6">
                  {(aiDraft as any).articleDraft ? (
                    <div className="prose prose-ar max-w-none">
                      <div className="whitespace-pre-wrap p-6 border rounded-md">
                        {(aiDraft as any).articleDraft}
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">لا توجد مسودة مقال متاحة</p>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
