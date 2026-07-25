import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, FileText, Shield } from "lucide-react";

export function PrivacySection() {
  return (
    <div className="space-y-6" data-testid="privacy-section">
      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <Shield className="h-5 w-5" />
            الخصوصية والبيانات
          </CardTitle>
          <CardDescription>
            كيف نستخدم نشاط قراءتك لتخصيص تجربتك — وما يمكنك فعله حيال ذلك
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
          <p>
            نستخدم سجل قراءتك واهتماماتك لتخصيص الخلاصة والتوصيات والملخص اليومي.
            يمكنك تعديل اهتماماتك من قسم «الاهتمامات والمحتوى»، وإيقاف أنواع الإشعارات
            من قسم «الإشعارات».
          </p>
          <p>
            حذف الحساب وإدارة الجلسات على الويب قيد التوسعة؛ على تطبيقات الموبايل
            تتوفر خيارات إضافية عبر إعدادات الحساب هناك.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="inline-flex items-center gap-2">
            <FileText className="h-5 w-5" />
            السياسات
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/privacy">
              سياسة الخصوصية
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/terms">
              شروط الاستخدام
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/ai-policy">
              سياسة الذكاء الاصطناعي
              <ChevronLeft className="mr-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
