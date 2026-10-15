import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Flag, Smartphone } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAuth, hasPermission, hasRole } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { IosNationalDayThemeConfig } from "@shared/ios-national-day-theme";

const QUERY_KEY = ["/api/system/ios-national-day-theme"];

/**
 * «ثيم اليوم الوطني — تطبيق iOS»: مفتاح واحد يلبس تطبيق الآيفون هوية
 * «عزّنا بطبعنا» (شاشة ترحيبية خضراء + أخضر للأزرار والتنقل + زخرفة سدو
 * خفيفة في رأس الرئيسية). لا يمسّ الموقع ولا تطبيق أندرويد.
 */
export default function IosNationalDayThemeSettings() {
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();
  const allowed =
    hasRole(user, "admin", "system_admin") ||
    hasPermission(user, "system.manage_settings");

  const settings = useQuery<IosNationalDayThemeConfig>({
    queryKey: QUERY_KEY,
    enabled: !!user && allowed,
  });

  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (settings.data) setEnabled(settings.data.enabled === true);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: async (next: boolean) =>
      apiRequest("/api/system/ios-national-day-theme", {
        method: "POST",
        body: JSON.stringify({ enabled: next }),
      }),
    onSuccess: (_data, next) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      toast({
        title: next ? "تم تفعيل ثيم اليوم الوطني" : "تم إيقاف ثيم اليوم الوطني",
        description: "يصل التغيير للأجهزة المتصلة خلال دقائق، وعند فتح التطبيق.",
      });
    },
    onError: (e: unknown, next) => {
      // أعِد المفتاح لحالته السابقة حتى لا تُظهر الواجهة حفظًا لم يحدث.
      setEnabled(!next);
      toast({
        title: "تعذر الحفظ",
        description: e instanceof Error ? e.message : "حدث خطأ غير متوقع",
        variant: "destructive",
      });
    },
  });

  function toggle(next: boolean) {
    setEnabled(next);
    save.mutate(next);
  }

  if (!allowed) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center" dir="rtl">
          <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h2 className="mb-2 text-2xl font-bold">للمسؤولين فقط</h2>
          <p className="text-muted-foreground">
            إعداد ثيم اليوم الوطني لتطبيق iOS متاح لمن يملك صلاحية إدارة
            الإعدادات.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div
        className="mx-auto w-full max-w-[1000px] space-y-6 px-4 pb-10 sm:px-6"
        dir="rtl"
      >
        <DashboardPageHeader
          icon={Flag}
          title="ثيم اليوم الوطني — تطبيق iOS"
          description={'«عزّنا بطبعنا» — هوية موسمية لتطبيق الآيفون وحده'}
        />

        {settings.isLoading ? (
          <Skeleton className="h-40" />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-4 w-4" />
                حالة الثيم
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    تفعيل ثيم اليوم الوطني في تطبيق iOS
                    <Badge variant={enabled ? "default" : "secondary"}>
                      {enabled ? "مفعّل" : "معطّل"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    يلبس التطبيق الهوية الخضراء: شاشة ترحيبية، وأخضر للأزرار
                    وعناصر التنقل النشطة، وزخرفة سدو خفيفة في رأس الرئيسية.
                    الإيقاف يعيد الهوية الزرقاء الأصلية كاملة.
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={toggle}
                  disabled={save.isPending}
                  data-testid="switch-ios-national-day-theme"
                  aria-label="تفعيل ثيم اليوم الوطني في تطبيق iOS"
                />
              </div>

              <div className="rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                <p className="mb-2 font-medium text-foreground">
                  متى يصل التغيير إلى الأجهزة؟
                </p>
                <ul className="list-inside list-disc space-y-1">
                  <li>
                    عند كل فتح للتطبيق، ثم كل ست ساعات أثناء الاستخدام. الجهاز
                    الذي يعمل الآن يلتقط التغيير عند عودته للواجهة.
                  </li>
                  <li>
                    التطبيق لا ينتظر الشبكة عند الإقلاع: يفتح بآخر حالة محفوظة
                    عنده، ثم يبدّل بهدوء إن تغيّرت.
                  </li>
                  <li>
                    بلا اتصال أو عند فشل الجلب تبقى آخر حالة معروفة كما هي — لا
                    يعود الجهاز للوضع الافتراضي من تلقاء نفسه.
                  </li>
                  <li>
                    شاشة الإقلاع التي يديرها iOS (قبل تشغيل التطبيق) لا يمكن
                    تغييرها عن بُعد؛ الشاشة الترحيبية الخضراء تظهر بعدها مباشرة
                    وهي التي يتحكم بها هذا المفتاح.
                  </li>
                </ul>
              </div>

              {settings.data?.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  آخر تعديل:{" "}
                  {new Date(settings.data.updatedAt).toLocaleString("ar-SA")}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
