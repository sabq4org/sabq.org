import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Eye, Save, Tv } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { SahraaTvBlock } from "@/components/SahraaTvBlock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, hasPermission, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SahraaConfig {
  isActive: boolean;
  title: string;
  description: string;
  xPostUrl: string;
  updatedAt: string | null;
}

function emptyConfig(): SahraaConfig {
  return {
    isActive: true,
    title: "قناة الصحراء",
    description: "أحدث مقطع فيديو من قناة الصحراء",
    xPostUrl: "https://x.com/Sahraachannel/status/2082154114893361183/video/1",
    updatedAt: null,
  };
}

/**
 * لوحة تحديث يومي لبلوك قناة الصحراء على الرئيسية:
 * رابط منشور إكس (فيديو) + وصف + تفعيل/إيقاف.
 */
export default function SahraaTvBlockSettings() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const allowed =
    hasRole(user, "admin", "system_admin") ||
    hasPermission(user, "system.manage_settings");

  const settings = useQuery<{ config: SahraaConfig | null }>({
    queryKey: ["/api/sahraa-tv-block/admin"],
    enabled: !!user && allowed,
  });

  const [form, setForm] = useState<SahraaConfig>(emptyConfig());

  useEffect(() => {
    if (settings.data?.config) {
      setForm({ ...emptyConfig(), ...settings.data.config });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (payload: Partial<SahraaConfig>) =>
      apiRequest("/api/sahraa-tv-block/admin", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sahraa-tv-block/admin"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sahraa-tv-block"] });
      toast({ title: "تم حفظ بلوك الصحراء" });
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
            صفحة بلوك قناة الصحراء متاحة لحسابات الإدارة.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Tv}
          title="بلوك قناة الصحراء"
          description="انشر يومياً فيديو من رابط منشور إكس (يُعرض الفيديو فقط + وصفك — بدون واجهة التغريدة)"
        />

        {settings.isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="text-lg">إعدادات اليوم</CardTitle>
                <Badge variant={form.isActive ? "default" : "secondary"}>
                  {form.isActive ? "ظاهر" : "مخفي"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">إظهار البلوك على الرئيسية</p>
                    <p className="text-xs text-muted-foreground">
                      يختفي تلقائياً إن كان الرابط فارغاً أو غير صالح
                    </p>
                  </div>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(isActive) => setForm({ ...form, isActive })}
                    data-testid="sahraa-active-switch"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="sahraa-title">
                    العنوان
                  </label>
                  <Input
                    id="sahraa-title"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    maxLength={80}
                    placeholder="قناة الصحراء"
                    data-testid="sahraa-title-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="sahraa-desc">
                    وصف الفيديو
                  </label>
                  <Textarea
                    id="sahraa-desc"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    maxLength={500}
                    rows={4}
                    placeholder="جملة قصيرة توضّح محتوى مقطع اليوم للقراء"
                    data-testid="sahraa-description-input"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="sahraa-url">
                    رابط فيديو إكس (مصدر فقط)
                  </label>
                  <Input
                    id="sahraa-url"
                    dir="ltr"
                    className="text-left"
                    value={form.xPostUrl}
                    onChange={(e) => setForm({ ...form, xPostUrl: e.target.value })}
                    placeholder="https://x.com/Sahraachannel/status/…/video/1"
                    data-testid="sahraa-url-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    يُستخرج ملف الفيديو للتشغيل على سبق — لن تظهر التغريدة نفسها للقراء
                  </p>
                </div>

                {form.updatedAt ? (
                  <p className="text-xs text-muted-foreground">
                    آخر تحديث: {new Date(form.updatedAt).toLocaleString("ar-SA")}
                  </p>
                ) : null}

                <Button
                  className="w-full sm:w-auto"
                  onClick={() =>
                    save.mutate({
                      isActive: form.isActive,
                      title: form.title,
                      description: form.description,
                      xPostUrl: form.xPostUrl,
                    })
                  }
                  disabled={save.isPending}
                  data-testid="sahraa-save-button"
                >
                  <Save className="h-4 w-4 ml-2" />
                  {save.isPending ? "جاري الحفظ…" : "حفظ ونشر"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center gap-2 space-y-0">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-lg">معاينة الواجهة</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-4">
                  نفس مكوّن الرئيسية — يظهر بعد الحفظ إن كان مفعّلاً
                </p>
                <SahraaTvBlock />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
