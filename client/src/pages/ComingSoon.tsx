import { useLocation } from "wouter";
import { Construction, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

export default function ComingSoon() {
  const [, setLocation] = useLocation();

  const pageNames: Record<string, string> = {
    "/dashboard/articles/new": "مقال جديد",
    "/dashboard/ai/summaries": "الملخصات الصوتية",
    "/dashboard/ai/deep": "التحليل العميق",
    "/dashboard/ai/headlines": "العناوين الذكية",
    "/dashboard/permissions": "إدارة الصلاحيات",
    "/dashboard/templates": "إدارة القوالب",
    "/dashboard/analytics": "لوحات التحليلات",
    "/dashboard/analytics/trending": "تحليل الرائج",
    "/dashboard/analytics/behavior": "سلوك المستخدمين",
    "/dashboard/analytics/ab-tests": "اختبارات A/B",
    "/dashboard/integrations": "التكاملات الخارجية",
    "/dashboard/storage": "إدارة التخزين",
    "/dashboard/audit-logs": "سجلات النشاط",
    "/dashboard/profile": "الملف الشخصي",
    "/dashboard/notifications": "الإشعارات",
  };

  const currentPath = window.location.pathname;
  const pageName = pageNames[currentPath] || "هذه الصفحة";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Construction}
          title={pageName}
          description="نعمل على تجهيز هذه المساحة لتكون متسقة مع بقية لوحة التحكم"
        />

        <Card className="mx-auto w-full max-w-2xl border-border/70">
          <CardHeader className="space-y-2 text-center">
            <CardTitle className="text-2xl font-bold">قريباً</CardTitle>
            <CardDescription className="text-base leading-7">
              صفحة <span className="font-semibold text-foreground">{pageName}</span> قيد التطوير حالياً
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
              <p className="text-sm leading-7 text-muted-foreground">
                نعمل على إضافة هذه الميزة لتوفير تجربة أفضل لك. سيتم إطلاقها قريباً بإذن الله.
              </p>
              <Button
                onClick={() => setLocation("/dashboard")}
                size="lg"
                className="w-full gap-2 sm:w-auto"
                data-testid="button-back-dashboard"
              >
                العودة للوحة التحكم
                <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
      </div>
    </DashboardLayout>
  );
}
