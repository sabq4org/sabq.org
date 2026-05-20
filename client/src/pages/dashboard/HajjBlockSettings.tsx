import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertCircle, Plus, X, Save, Eye } from "lucide-react";
import { HajjBlock } from "@/components/HajjBlock";

/**
 * Admin page for the "صدى الحج" homepage block. Controls every
 * field on the singleton hajj_block_config row — active toggle,
 * title, keyword pool, article count, lookback window, season
 * dates, and pinned articles. Live preview renders the same
 * <HajjBlock /> the homepage uses so the editor sees what the
 * reader will see.
 */
export default function HajjBlockSettings() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const allowed = hasRole(user, "admin", "system_admin");

  const settings = useQuery<{ config: HajjConfig | null }>({
    queryKey: ["/api/hajj-block/admin"],
    enabled: !!user && allowed,
  });

  // Local form state — initialised from server config + reset every
  // time the server payload changes (e.g. after a Save round-trip).
  const [form, setForm] = useState<HajjConfig>(emptyConfig());
  const [newKeyword, setNewKeyword] = useState("");
  const [newPinnedId, setNewPinnedId] = useState("");

  useEffect(() => {
    if (settings.data?.config) {
      setForm({ ...emptyConfig(), ...settings.data.config });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (payload: Partial<HajjConfig>) =>
      apiRequest("/api/hajj-block/admin", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hajj-block/admin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hajj-block"] });
      toast({ title: "تم حفظ الإعدادات بنجاح" });
    },
    onError: (e: any) => {
      toast({
        title: "تعذر الحفظ",
        description: e?.message ?? "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center" dir="rtl">
          <AlertCircle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">للمسؤولين فقط</h2>
          <p className="text-muted-foreground">
            صفحة إعدادات بلوك الحج متاحة لحسابات الإدارة.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  function addKeyword() {
    const k = newKeyword.trim();
    if (!k) return;
    if (form.keywords.includes(k)) return;
    setForm({ ...form, keywords: [...form.keywords, k] });
    setNewKeyword("");
  }

  function removeKeyword(k: string) {
    setForm({ ...form, keywords: form.keywords.filter((x) => x !== k) });
  }

  function addPinned() {
    const id = newPinnedId.trim();
    if (!id) return;
    if (form.pinnedArticleIds.includes(id)) return;
    setForm({ ...form, pinnedArticleIds: [...form.pinnedArticleIds, id] });
    setNewPinnedId("");
  }

  function removePinned(id: string) {
    setForm({
      ...form,
      pinnedArticleIds: form.pinnedArticleIds.filter((x) => x !== id),
    });
  }

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 space-y-6" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-md">
            <span className="text-2xl">🕋</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold">إعدادات بلوك الحج</h1>
            <p className="text-sm text-muted-foreground">
              "صدى الحج" — يظهر في الصفحة الرئيسية أثناء موسم الحج
            </p>
          </div>
        </div>

        {settings.isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ───────── Settings form ───────── */}
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">التفعيل والعنوان</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div>
                      <p className="font-medium">تفعيل البلوك</p>
                      <p className="text-xs text-muted-foreground">
                        عند التفعيل، يظهر البلوك في الصفحة الرئيسية ضمن نطاق التاريخ
                      </p>
                    </div>
                    <Switch
                      checked={form.isActive}
                      onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                      data-testid="switch-hajj-active"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">العنوان</label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      maxLength={80}
                      data-testid="input-hajj-title"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1.5 block">الوصف (اختياري)</label>
                    <Input
                      value={form.subtitle ?? ""}
                      onChange={(e) => setForm({ ...form, subtitle: e.target.value || null })}
                      maxLength={160}
                      placeholder="مثلاً: تغطية مباشرة لمناسك الحج 1447"
                      data-testid="input-hajj-subtitle"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">الكلمات المفتاحية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    تُستخدم لاكتشاف الأخبار المتعلقة بالحج تلقائياً. أي مقال يحتوي
                    أحد هذه الكلمات في عنوانه أو ملخصه يظهر في البلوك.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {form.keywords.map((k) => (
                      <Badge
                        key={k}
                        variant="secondary"
                        className="gap-1 cursor-pointer hover:bg-destructive/10"
                        onClick={() => removeKeyword(k)}
                      >
                        {k}
                        <X className="h-3 w-3" />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                      placeholder="أضف كلمة جديدة..."
                      maxLength={50}
                      data-testid="input-hajj-new-keyword"
                    />
                    <Button onClick={addKeyword} size="icon" variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">العرض والنافذة الزمنية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      عدد الأخبار المعروضة
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={form.articleLimit}
                      onChange={(e) =>
                        setForm({ ...form, articleLimit: Math.max(1, Math.min(20, Number(e.target.value) || 5)) })
                      }
                      data-testid="input-hajj-limit"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      عرض الأخبار خلال آخر (ساعة)
                    </label>
                    <Input
                      type="number"
                      min={1}
                      max={720}
                      value={form.lookbackHours}
                      onChange={(e) =>
                        setForm({ ...form, lookbackHours: Math.max(1, Math.min(720, Number(e.target.value) || 48)) })
                      }
                      data-testid="input-hajj-lookback"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">بداية الموسم</label>
                      <Input
                        type="date"
                        value={form.seasonStartDate?.slice(0, 10) ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, seasonStartDate: e.target.value || null })
                        }
                        data-testid="input-hajj-start"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">نهاية الموسم</label>
                      <Input
                        type="date"
                        value={form.seasonEndDate?.slice(0, 10) ?? ""}
                        onChange={(e) =>
                          setForm({ ...form, seasonEndDate: e.target.value || null })
                        }
                        data-testid="input-hajj-end"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">الأخبار المثبّتة</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    تظهر في أعلى البلوك دائماً قبل الأخبار المُكتشفة من الكلمات المفتاحية.
                    ألصق معرّف المقال (Article ID).
                  </p>
                  <div className="space-y-2">
                    {form.pinnedArticleIds.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">لا توجد أخبار مثبّتة</p>
                    )}
                    {form.pinnedArticleIds.map((id, i) => (
                      <div
                        key={id}
                        className="flex items-center gap-2 p-2 rounded-md bg-muted/40 font-mono text-xs"
                      >
                        <span className="text-amber-600 font-bold">★</span>
                        <span className="flex-1 truncate">{id}</span>
                        <span className="text-muted-foreground">#{i + 1}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removePinned(id)}
                          className="h-7 w-7"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newPinnedId}
                      onChange={(e) => setNewPinnedId(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPinned())}
                      placeholder="article-id-here"
                      className="font-mono text-xs"
                      data-testid="input-hajj-new-pinned"
                    />
                    <Button onClick={addPinned} size="icon" variant="outline">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2 sticky bottom-4 bg-background/80 backdrop-blur-sm border rounded-xl p-3 shadow-lg">
                <Button
                  size="lg"
                  onClick={() => save.mutate(form)}
                  disabled={save.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  data-testid="button-hajj-save"
                >
                  <Save className="h-4 w-4 ml-2" />
                  {save.isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
                </Button>
              </div>
            </div>

            {/* ───────── Live preview ───────── */}
            <div className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    معاينة مباشرة
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3">
                    ⚠️ المعاينة تعكس الإعدادات <strong>المحفوظة</strong> على السيرفر.
                    بعد التحرير، اضغط "حفظ التغييرات" لرؤية التحديث.
                  </p>
                  <HajjBlock />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ----------------------------------------------------------------------------
// Types + defaults
// ----------------------------------------------------------------------------

type HajjConfig = {
  id?: string;
  isActive: boolean;
  title: string;
  subtitle: string | null;
  keywords: string[];
  articleLimit: number;
  lookbackHours: number;
  seasonStartDate: string | null;
  seasonEndDate: string | null;
  pinnedArticleIds: string[];
};

function emptyConfig(): HajjConfig {
  return {
    isActive: false,
    title: "صدى الحج",
    subtitle: null,
    keywords: [
      "الحج", "المناسك", "عرفات", "المزدلفة", "منى",
      "الجمرات", "ضيوف الرحمن", "المشاعر المقدسة",
    ],
    articleLimit: 5,
    lookbackHours: 48,
    seasonStartDate: null,
    seasonEndDate: null,
    pinnedArticleIds: [],
  };
}
