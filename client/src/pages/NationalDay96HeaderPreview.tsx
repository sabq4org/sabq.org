import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ND96_SCOPE_CLASS,
  ND96_SCOPE_STYLE,
  NationalDay96GreetingBar,
  NationalDay96ScopeStyles,
  NationalDaySaduStrip,
  useNationalDay96Season,
} from "@/components/seasonal/NationalDay96Theme";
import {
  NationalDay96Block,
  type NDBlockArticle,
} from "@/components/seasonal/NationalDay96Block";

// عناوين تجريبية للمعاينة — من لوحة الأفكار المعتمدة. (تعيش هنا وليس في ملف
// المكوّن لأن lazyNamed في Home.tsx يشترط ألا يصدّر الملف غير مكوّنات.)
const ND96_SAMPLE_ARTICLES: NDBlockArticle[] = [
  {
    id: "sample-1",
    title: "فعاليات اليوم الوطني الـ96 في 30 مدينة.. الخريطة الكاملة",
    meta: "محليات · قبل ساعتين",
    thumbGradient: "linear-gradient(135deg,#0E4A36,#187653)",
  },
  {
    id: "sample-2",
    title: "قصة العلم السعودي.. لماذا لا يُنكّس ولا يُلامس الأرض؟",
    meta: "تقارير · قبل 4 ساعات",
    thumbGradient: "linear-gradient(135deg,#123B57,#1B5E8C)",
  },
  {
    id: "sample-3",
    title: "عروض الطيران والمطاعم في اليوم الوطني.. القائمة المحدّثة",
    meta: "اقتصاد · قبل 6 ساعات",
    thumbGradient: "linear-gradient(135deg,#5A2340,#8C2F55)",
  },
];

/**
 * صفحة معاينة مستقلة لهيدر اليوم الوطني الـ96 («عزّنا بطبعنا») — للاختبار
 * الداخلي قبل التركيب الفعلي. لا رابط لها من أي مكان في الموقع، وهي noindex.
 *
 * المسار: /nd96-preview
 */
export default function NationalDay96HeaderPreview() {
  const [themeOn, setThemeOn] = useState(true);
  // force=true: المعاينة تعمل في أي تاريخ بغضّ النظر عن نافذة الموسم
  const { dismissed, dismiss, resetDismiss } = useNationalDay96Season(true);

  const { data: user } = useQuery<{
    id: string;
    name?: string;
    email?: string;
    role?: string;
  }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    document.title = "معاينة هيدر اليوم الوطني الـ96 — سبق";
  }, []);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* الهيدر + السدو + التهنئة كتلة لاصقة واحدة أعلى الصفحة */}
      <div
        className={`sticky top-0 z-50 ${themeOn ? ND96_SCOPE_CLASS : ""}`}
        style={themeOn ? ND96_SCOPE_STYLE : undefined}
        data-testid="nd96-header-scope"
      >
        <NationalDay96ScopeStyles />
        <Header user={user} sticky={false} />
        {themeOn && (
          <>
            <NationalDaySaduStrip />
            <NationalDay96GreetingBar
              active
              dismissed={dismissed}
              onDismiss={dismiss}
            />
          </>
        )}
      </div>

      {/* محتوى تجريبي للتمرير تحت الهيدر اللاصق */}
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <span className="text-xs font-bold tracking-widest text-primary">
            صفحة اختبار داخلية
          </span>
          <h1 className="text-2xl font-bold mt-2 mb-3">
            معاينة هيدر اليوم الوطني السعودي الـ96
          </h1>
          <p className="text-muted-foreground max-w-2xl leading-relaxed">
            هذه الصفحة تعرض هيدر الموقع الفعلي وهو يلبس هوية «عزّنا بطبعنا»،
            وبلوك «اليوم الوطني» كما سيظهر في الرئيسية: عدّاد تنازلي حيّ،
            ثلاث بطاقات أخبار، وشريط القيم الست. مرّر للأسفل لاختبار
            الالتصاق، وجرّب زر ✕ في شريط التهنئة، وبدّل السمة من لوحة
            الأدوات.
          </p>
        </div>

        {/* بلوك الرئيسية — الفكرة 2 من اللوحة */}
        <div className="mb-10">
          <NationalDay96Block previewArticles={ND96_SAMPLE_ARTICLES} />
          <p className="text-xs text-muted-foreground mt-2">
            العناوين في البلوك تجريبية للمعاينة — عند التركيب الفعلي تُجمع
            التغطية تلقائيًا بالكلمات المفتاحية مع تثبيت يدوي من لوحة التحكم
            (نمط بلوك الحج)، والعدّاد التنازلي حقيقي حتى 23 سبتمبر 2026.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="rounded-lg border bg-card overflow-hidden"
              aria-hidden="true"
            >
              <div
                className="h-36"
                style={{
                  background: `linear-gradient(135deg, hsl(${160 + i * 4} 40% 22%), hsl(${150 + i * 6} 45% 34%))`,
                }}
              />
              <div className="p-4 space-y-2">
                <div className="h-4 rounded bg-muted w-11/12" />
                <div className="h-4 rounded bg-muted w-3/4" />
                <div className="h-3 rounded bg-muted/60 w-1/3 mt-3" />
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* لوحة أدوات المعاينة */}
      <div
        className="fixed bottom-4 left-4 z-[60] w-64 rounded-lg border bg-card text-card-foreground shadow-lg p-4 space-y-3"
        data-testid="nd96-preview-controls"
      >
        <h2 className="text-sm font-bold">أدوات المعاينة</h2>
        <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
          <span>سمة اليوم الوطني</span>
          <Switch
            checked={themeOn}
            onCheckedChange={setThemeOn}
            aria-label="تشغيل أو إيقاف سمة اليوم الوطني"
            data-testid="switch-nd96-theme"
          />
        </label>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={resetDismiss}
          disabled={!dismissed}
          data-testid="button-reset-nd96-greeting"
        >
          إعادة إظهار شريط التهنئة
        </Button>
        <p className="text-xs text-muted-foreground leading-relaxed">
          القوائم المنبثقة (البحث والحساب) تحتفظ بألوان الموقع — السمة تلوّن
          الهيدر وحده عمدًا.
        </p>
      </div>
    </div>
  );
}
