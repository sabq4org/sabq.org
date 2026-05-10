import { useLocation } from "wouter";
import { Construction, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/DashboardLayout";

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
    "/dashboard/rss-feeds": "مصادر RSS",
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
      <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-6">
        <Card className="w-full max-w-2xl text-center">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="p-4 bg-primary/10 rounded-full">
                <Construction className="w-16 h-16 text-primary" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">قريباً</CardTitle>
            <CardDescription className="text-lg">
              صفحة <span className="font-semibold text-foreground">{pageName}</span> قيد التطوير حالياً
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              نعمل على إضافة هذه الميزة لتوفير تجربة أفضل لك. سيتم إطلاقها قريباً بإذن الله.
            </p>
            <Button 
              onClick={() => setLocation("/dashboard")}
              size="lg"
              className="gap-2"
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
