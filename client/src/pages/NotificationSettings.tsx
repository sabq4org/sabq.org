import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, Clock, Sparkles, TrendingUp, BookMarked, Zap, PenTool, MessageCircle, Trophy, Lightbulb, Newspaper, ChevronLeft, Compass } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/Header";

interface NotificationPrefs {
  id: string;
  userId: string;
  breaking: boolean;
  interest: boolean;
  likedUpdates: boolean;
  mostRead: boolean;
  webPush: boolean;
  dailyDigest: boolean;
  matchesOnly: boolean;
  editorialDrafts: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  whatsappPhone?: string | null;
  whatsappEnabled?: boolean;
  updatedAt?: string;
}

interface RecommendationPrefs {
  enableDailyDigest: boolean;
  enablePersonalized: boolean;
  enableTrending: boolean;
  enableCrossCategory: boolean;
  digestTime?: string;
}

interface UserWithRoles {
  id: string;
  role?: string;
  roles?: { name: string }[];
}

interface ReporterNotificationPrefs {
  notifyOnPublish: boolean;
}

export default function NotificationSettings() {
  const { toast } = useToast();
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);

  const { data: user } = useQuery<UserWithRoles>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: prefs, isLoading } = useQuery<NotificationPrefs>({
    queryKey: ["/api/me/notification-prefs"],
  });

  const { data: recData } = useQuery<{ preferences: RecommendationPrefs }>({
    queryKey: ["/api/recommendations/preferences"],
    retry: false,
  });
  const recPrefs = recData?.preferences;

  useEffect(() => {
    setWhatsappPhone(prefs?.whatsappPhone ?? "");
    setWhatsappEnabled(prefs?.whatsappEnabled ?? false);
  }, [prefs?.whatsappPhone, prefs?.whatsappEnabled]);

  const { data: reporterPrefs } = useQuery<ReporterNotificationPrefs>({
    queryKey: ["/api/me/reporter-notification-prefs"],
    enabled: !!user,
  });

  // Check if user is a reporter/editor/admin (can have articles assigned)
  const isReporter = user?.role === 'reporter' || user?.role === 'editor' || user?.role === 'admin' || user?.role === 'superadmin' ||
    user?.roles?.some(r => ['reporter', 'editor', 'admin', 'superadmin'].includes(r.name));

  // محررون/أدمن فقط يستقبلون إشعارات مسودات المراسلين (DraftSubmitted)
  const editorialRoles = ['editor', 'admin', 'superadmin', 'senior_editor', 'editor_in_chief'];
  const isEditor = (user?.role ? editorialRoles.includes(user.role) : false) ||
    (user?.roles?.some(r => editorialRoles.includes(r.name)) ?? false);

  const matchesOnly = prefs?.matchesOnly ?? false;

  const updatePrefsMutation = useMutation({
    mutationFn: async (data: Partial<NotificationPrefs>) => {
      return await apiRequest("/api/me/notification-prefs", {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/notification-prefs"] });
      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات الإشعارات بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const updateRecMutation = useMutation({
    mutationFn: async (data: Partial<RecommendationPrefs>) => {
      return await apiRequest("/api/recommendations/preferences", {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations/preferences"] });
      toast({
        title: "تم الحفظ",
        description: "تم حفظ إعدادات التوصيات بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const updateReporterPrefsMutation = useMutation({
    mutationFn: async (notifyOnPublish: boolean) => {
      return await apiRequest("/api/me/reporter-notification-prefs", {
        method: "PATCH",
        body: JSON.stringify({ notifyOnPublish }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/reporter-notification-prefs"] });
      toast({
        title: "تم الحفظ",
        description: "تم تحديث إعدادات إشعارات النشر",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (key: keyof NotificationPrefs, value: boolean) => {
    updatePrefsMutation.mutate({ [key]: value });
  };

  const handleRecToggle = (key: keyof RecommendationPrefs, value: boolean) => {
    updateRecMutation.mutate({ [key]: value });
  };

  const handleQuietHoursChange = (start: string, end: string) => {
    updatePrefsMutation.mutate({
      quietHoursStart: start || null,
      quietHoursEnd: end || null,
    });
  };

  const normalizePhone = (phone: string) => {
    const digitsOnly = phone.replace(/[^0-9]/g, "");
    if (!digitsOnly) return "";
    return '+' + digitsOnly;
  };

  const handleWhatsappPhoneSave = () => {
    const normalized = normalizePhone(whatsappPhone);
    const digits = normalized.replace(/[^0-9]/g, "");

    if (!digits) {
      const prevPhone = prefs?.whatsappPhone ?? "";
      const prevEnabled = prefs?.whatsappEnabled ?? false;
      setWhatsappEnabled(false);
      setWhatsappPhone("");
      updatePrefsMutation.mutate({ whatsappPhone: null, whatsappEnabled: false }, {
        onError: () => {
          setWhatsappPhone(prevPhone);
          setWhatsappEnabled(prevEnabled);
        }
      });
      return;
    }

    if (digits.length < 10 || digits.length > 15) {
      toast({
        title: "خطأ",
        description: "رقم الهاتف غير صحيح. يجب أن يحتوي على 10-15 رقم",
        variant: "destructive",
      });
      return;
    }

    const prevPhone = prefs?.whatsappPhone ?? "";
    setWhatsappPhone(normalized);
    updatePrefsMutation.mutate({ whatsappPhone: normalized }, {
      onError: () => {
        setWhatsappPhone(prevPhone);
      }
    });
  };

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background">
        <Header user={user || undefined} />
        <div className="container max-w-4xl mx-auto py-8 px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-32 bg-muted rounded"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <Header user={user || undefined} />
      <div className="container max-w-4xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">إعدادات الإشعارات</h1>
          <p className="text-muted-foreground">
            مكان واحد للتحكم في كل إشعاراتك: العام، المباريات، والتوصيات والملخص اليومي
          </p>
        </div>

      <div className="space-y-6">
        {/* === المباريات === */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              المباريات
            </CardTitle>
            <CardDescription>
              تنبيهات المباريات تصلك تلقائياً عن الفرق التي تتابعها (بدء المباراة، الأهداف، النتيجة النهائية)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="matches-only" className="text-base font-medium">
                  وضع المباريات فقط
                </Label>
                <p className="text-sm text-muted-foreground">
                  استلم إشعارات المباريات فقط، مع كتم الملخص اليومي وإشعارات المقالات الجديدة
                </p>
              </div>
              <Switch
                id="matches-only"
                checked={matchesOnly}
                onCheckedChange={(checked) => handleToggle("matchesOnly", checked)}
                data-testid="switch-matches-only"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div className="flex items-center gap-3">
                <Compass className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-base font-medium">الفرق التي تتابعها</p>
                  <p className="text-sm text-muted-foreground">
                    تابع فرقك من صفحة الرياضة بالضغط على نجمة المتابعة ⭐ بجانب كل فريق للتحكم في تنبيهات مبارياتها
                  </p>
                </div>
              </div>
              <Link href="/sports2">
                <Button variant="outline" size="sm" data-testid="link-manage-follows">
                  متابعة الفرق
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* === عام === */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              عام
            </CardTitle>
            <CardDescription>
              اختر الإشعارات التي تريد استلامها
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Breaking News */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-destructive" />
                <div>
                  <Label htmlFor="breaking-news" className="text-base font-medium">
                    الأخبار العاجلة
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    احصل على إشعارات فورية بالأخبار العاجلة
                  </p>
                </div>
              </div>
              <Switch
                id="breaking-news"
                checked={prefs?.breaking ?? true}
                onCheckedChange={(checked) => handleToggle("breaking", checked)}
                data-testid="switch-breaking-news"
              />
            </div>

            {/* Interest Match */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <Label htmlFor="interest-match" className="text-base font-medium">
                    المقالات المطابقة لاهتماماتك
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {matchesOnly
                      ? "معطّل بسبب «وضع المباريات فقط»"
                      : "مقالات جديدة تتعلق بمواضيع تهمك"}
                  </p>
                </div>
              </div>
              <Switch
                id="interest-match"
                checked={!matchesOnly && (prefs?.interest ?? true)}
                disabled={matchesOnly}
                onCheckedChange={(checked) => handleToggle("interest", checked)}
                data-testid="switch-interest-match"
              />
            </div>

            {/* Liked Updates */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BookMarked className="h-5 w-5 text-accent" />
                <div>
                  <Label htmlFor="liked-updates" className="text-base font-medium">
                    تحديثات المقالات المفضلة
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    تحديثات على المقالات التي أعجبتك أو حفظتها
                  </p>
                </div>
              </div>
              <Switch
                id="liked-updates"
                checked={prefs?.likedUpdates ?? true}
                onCheckedChange={(checked) => handleToggle("likedUpdates", checked)}
                data-testid="switch-liked-updates"
              />
            </div>

            {/* Most Read */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-chart-1" />
                <div>
                  <Label htmlFor="most-read" className="text-base font-medium">
                    الأكثر قراءة اليوم
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    ملخص يومي للمقالات الأكثر قراءة في اهتماماتك
                  </p>
                </div>
              </div>
              <Switch
                id="most-read"
                checked={prefs?.mostRead ?? true}
                onCheckedChange={(checked) => handleToggle("mostRead", checked)}
                data-testid="switch-most-read"
              />
            </div>
          </CardContent>
        </Card>

        {/* === التوصيات والملخص اليومي === */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              التوصيات والملخص اليومي
            </CardTitle>
            <CardDescription>
              تحكم في التوصيات المخصصة والملخص اليومي للمقالات
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Daily Digest */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Newspaper className="h-5 w-5 text-primary" />
                <div>
                  <Label htmlFor="daily-digest" className="text-base font-medium">
                    الملخص اليومي
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {matchesOnly
                      ? "معطّل بسبب «وضع المباريات فقط»"
                      : "ملخص يومي للمقالات المهمة في اهتماماتك"}
                  </p>
                </div>
              </div>
              <Switch
                id="daily-digest"
                checked={!matchesOnly && (recPrefs?.enableDailyDigest ?? false)}
                disabled={matchesOnly}
                onCheckedChange={(checked) => handleRecToggle("enableDailyDigest", checked)}
                data-testid="switch-daily-digest"
              />
            </div>

            {/* Personalized */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <Label htmlFor="rec-personalized" className="text-base font-medium">
                    محتوى مخصص
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    مقالات مشابهة لما قرأته سابقاً
                  </p>
                </div>
              </div>
              <Switch
                id="rec-personalized"
                checked={recPrefs?.enablePersonalized ?? true}
                onCheckedChange={(checked) => handleRecToggle("enablePersonalized", checked)}
                data-testid="switch-rec-personalized"
              />
            </div>

            {/* Trending */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-chart-1" />
                <div>
                  <Label htmlFor="rec-trending" className="text-base font-medium">
                    الأكثر رواجاً
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    المقالات الشائعة في مجالات اهتمامك
                  </p>
                </div>
              </div>
              <Switch
                id="rec-trending"
                checked={recPrefs?.enableTrending ?? true}
                onCheckedChange={(checked) => handleRecToggle("enableTrending", checked)}
                data-testid="switch-rec-trending"
              />
            </div>

            {/* Cross Category */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Compass className="h-5 w-5 text-accent" />
                <div>
                  <Label htmlFor="rec-cross" className="text-base font-medium">
                    اكتشاف محتوى جديد
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    مقالات من أقسام أخرى قد تثير اهتمامك
                  </p>
                </div>
              </div>
              <Switch
                id="rec-cross"
                checked={recPrefs?.enableCrossCategory ?? true}
                onCheckedChange={(checked) => handleRecToggle("enableCrossCategory", checked)}
                data-testid="switch-rec-cross"
              />
            </div>
          </CardContent>
        </Card>

        {/* Reporter Notifications - Only shown to reporters/editors */}
        {isReporter && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5" />
                إشعارات المراسلين
              </CardTitle>
              <CardDescription>
                إعدادات الإشعارات الخاصة بك كمراسل أو محرر
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-primary" />
                  <div>
                    <Label htmlFor="notify-on-publish" className="text-base font-medium">
                      إشعارات نشر الأخبار
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      احصل على إشعار عند نشر خبر كتبته
                    </p>
                  </div>
                </div>
                <Switch
                  id="notify-on-publish"
                  checked={reporterPrefs?.notifyOnPublish ?? true}
                  onCheckedChange={(checked) => updateReporterPrefsMutation.mutate(checked)}
                  disabled={updateReporterPrefsMutation.isPending}
                  data-testid="switch-notify-on-publish"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* === غرفة الأخبار / المسودات — محررون وأدمن فقط === */}
        {isEditor && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Newspaper className="h-5 w-5 text-primary" />
                غرفة الأخبار
              </CardTitle>
              <CardDescription>
                إشعارات سير العمل التحريري الخاصة بالمحررين
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <PenTool className="h-5 w-5 text-primary" />
                  <div>
                    <Label htmlFor="editorial-drafts" className="text-base font-medium">
                      مسودات المراسلين الجديدة
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      إشعار عند إرسال أي مراسل مسودة خبر جديدة للمراجعة
                    </p>
                  </div>
                </div>
                <Switch
                  id="editorial-drafts"
                  checked={prefs?.editorialDrafts ?? true}
                  onCheckedChange={(checked) => handleToggle("editorialDrafts", checked)}
                  data-testid="switch-editorial-drafts"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* WhatsApp Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              إشعارات واتساب
            </CardTitle>
            <CardDescription>
              استلم الإشعارات المهمة عبر واتساب
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="whatsapp-phone">رقم الهاتف</Label>
                <div className="flex gap-2">
                  <Input
                    id="whatsapp-phone"
                    type="tel"
                    dir="ltr"
                    placeholder="+966557768427"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    onBlur={() => {
                      if (whatsappPhone !== (prefs?.whatsappPhone || "")) {
                        handleWhatsappPhoneSave();
                      }
                    }}
                    className="text-left flex-1"
                    data-testid="input-whatsapp-phone"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleWhatsappPhoneSave}
                    disabled={updatePrefsMutation.isPending || whatsappPhone === (prefs?.whatsappPhone || "")}
                    data-testid="button-save-whatsapp-phone"
                  >
                    حفظ
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  أدخل رقم الهاتف مع رمز الدولة (مثال: +966557768427)
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <Label htmlFor="whatsapp-enabled" className="text-base font-medium">
                      تفعيل إشعارات واتساب
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      تفعيل أو إيقاف الإشعارات عبر واتساب مؤقتاً
                    </p>
                  </div>
                </div>
                <Switch
                  id="whatsapp-enabled"
                  checked={whatsappEnabled}
                  onCheckedChange={(checked) => {
                    const normalized = normalizePhone(whatsappPhone);
                    const digits = normalized.replace(/[^0-9]/g, "");
                    if (checked && digits.length < 10) {
                      toast({
                        title: "خطأ",
                        description: "يجب حفظ رقم هاتف صحيح أولاً",
                        variant: "destructive",
                      });
                      return;
                    }
                    const prevEnabled = prefs?.whatsappEnabled ?? false;
                    setWhatsappEnabled(checked);
                    updatePrefsMutation.mutate({
                      whatsappEnabled: checked,
                      whatsappPhone: normalized || null
                    }, {
                      onError: () => {
                        setWhatsappEnabled(prevEnabled);
                      }
                    });
                  }}
                  disabled={updatePrefsMutation.isPending || normalizePhone(whatsappPhone).replace(/[^0-9]/g, "").length < 10}
                  data-testid="switch-whatsapp-enabled"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quiet Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              أوقات الهدوء
            </CardTitle>
            <CardDescription>
              حدد الأوقات التي لا تريد استلام إشعارات فيها
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="quiet-start">بداية وقت الهدوء</Label>
                <Input
                  id="quiet-start"
                  type="time"
                  value={prefs?.quietHoursStart || ""}
                  onChange={(e) => handleQuietHoursChange(e.target.value, prefs?.quietHoursEnd || "")}
                  data-testid="input-quiet-start"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="quiet-end">نهاية وقت الهدوء</Label>
                <Input
                  id="quiet-end"
                  type="time"
                  value={prefs?.quietHoursEnd || ""}
                  onChange={(e) => handleQuietHoursChange(prefs?.quietHoursStart || "", e.target.value)}
                  data-testid="input-quiet-end"
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-4">
              خلال هذه الأوقات، ستستمر في استلام الإشعارات في صندوق الوارد، لكن لن يتم إرسال تنبيهات فورية
            </p>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          يتم حفظ كل تغيير تلقائياً
        </p>
      </div>
      </div>
    </div>
  );
}
