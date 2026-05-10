import { Header } from "@/components/Header";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Code, Book, Zap, Shield, Globe, Terminal } from "lucide-react";
import { useState } from "react";

export default function AIPublisher() {
  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const [selectedExample, setSelectedExample] = useState<"articles" | "search" | "breaking">("articles");

  const apiExamples = {
    articles: {
      title: "قائمة المقالات",
      method: "GET",
      endpoint: "/api/v1/articles?limit=10&status=published",
      description: "احصل على قائمة المقالات المنشورة مع إمكانية التصفية حسب الفئة، التاريخ، ونوع المقال",
      response: `{
  "total": 10,
  "limit": 10,
  "offset": 0,
  "articles": [
    {
      "id": "uuid",
      "url": "https://sabq.org/article/example-slug",
      "canonical_url": "https://sabq.org/article/example-slug",
      "title": "عنوان المقال",
      "subtitle": "عنوان فرعي",
      "section": "محليات",
      "section_en": "Local",
      "author": {
        "id": "uuid",
        "name": "اسم الكاتب",
        "email": "author@sabq.org"
      },
      "lang": "ar",
      "published_at": "2025-10-27T14:15:00.000Z",
      "updated_at": "2025-10-27T14:30:00.000Z",
      "summary": "ملخص المقال المنشأ بالذكاء الاصطناعي...",
      "full_text": "النص الكامل للمقال...",
      "image": "https://sabq.org/images/example.jpg",
      "news_type": "regular",
      "rights": {
        "attribution_required": true,
        "training_allowed": false,
        "usage": "inference-only",
        "license": "Sabq-AI-Use-1.0"
      }
    }
  ]
}`
    },
    search: {
      title: "بحث متقدم",
      method: "GET",
      endpoint: "/api/v1/search?q=الرياض&limit=5",
      description: "ابحث في المقالات باستخدام كلمات مفتاحية مع إمكانية تحديد الفئة والتاريخ",
      response: `{
  "query": "الرياض",
  "total": 5,
  "results": [
    {
      "id": "uuid",
      "url": "https://sabq.org/article/example",
      "title": "عنوان المقال عن الرياض",
      "summary": "ملخص المقال...",
      "section": "محليات",
      "author": "اسم الكاتب",
      "published_at": "2025-10-27T14:15:00.000Z",
      "news_type": "regular",
      "relevance_score": 1.0
    }
  ]
}`
    },
    breaking: {
      title: "الأخبار العاجلة",
      method: "GET",
      endpoint: "/api/v1/breaking?limit=5",
      description: "احصل على آخر الأخبار العاجلة فقط",
      response: `{
  "total": 3,
  "breaking_news": [
    {
      "id": "uuid",
      "url": "https://sabq.org/article/breaking-news",
      "title": "عاجل: خبر عاجل مهم",
      "summary": "ملخص الخبر العاجل...",
      "section": "محليات",
      "author": "اسم الكاتب",
      "published_at": "2025-10-27T16:00:00.000Z",
      "image": "https://sabq.org/images/breaking.jpg",
      "priority": "urgent"
    }
  ]
}`
    }
  };

  const currentExample = apiExamples[selectedExample];

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <Terminal className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">دليل تطوير الذكاء الاصطناعي</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            استخدم واجهات برمجة التطبيقات (API) الخاصة بسبق لدمج محتوى الأخبار العربية في تطبيقات الذكاء الاصطناعي الخاصة بك
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Zap className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">200</p>
                  <p className="text-sm text-muted-foreground">طلب يومي مجاني</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Globe className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">JSON</p>
                  <p className="text-sm text-muted-foreground">استجابات منظمة</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Shield className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">RTL</p>
                  <p className="text-sm text-muted-foreground">دعم كامل للعربية</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Code className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">REST</p>
                  <p className="text-sm text-muted-foreground">واجهة قياسية</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Sidebar - Navigation */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">نقاط النهاية المتاحة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <button
                  onClick={() => setSelectedExample("articles")}
                  className={`w-full text-right p-3 rounded-lg transition-colors ${
                    selectedExample === "articles" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover-elevate"
                  }`}
                  data-testid="button-example-articles"
                >
                  <div className="font-medium">GET /api/v1/articles</div>
                  <div className="text-sm opacity-90">قائمة المقالات</div>
                </button>
                <button
                  onClick={() => setSelectedExample("search")}
                  className={`w-full text-right p-3 rounded-lg transition-colors ${
                    selectedExample === "search" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover-elevate"
                  }`}
                  data-testid="button-example-search"
                >
                  <div className="font-medium">GET /api/v1/search</div>
                  <div className="text-sm opacity-90">بحث متقدم</div>
                </button>
                <button
                  onClick={() => setSelectedExample("breaking")}
                  className={`w-full text-right p-3 rounded-lg transition-colors ${
                    selectedExample === "breaking" 
                      ? "bg-primary text-primary-foreground" 
                      : "hover-elevate"
                  }`}
                  data-testid="button-example-breaking"
                >
                  <div className="font-medium">GET /api/v1/breaking</div>
                  <div className="text-sm opacity-90">الأخبار العاجلة</div>
                </button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Book className="h-5 w-5" />
                  موارد إضافية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <a 
                  href="/.well-known/ai-usage.json" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block p-3 rounded-lg hover-elevate"
                  data-testid="link-ai-usage-policy"
                >
                  <div className="font-medium">سياسة الاستخدام</div>
                  <div className="text-sm text-muted-foreground">ai-usage.json</div>
                </a>
                <a 
                  href="/ai-policy" 
                  className="block p-3 rounded-lg hover-elevate"
                  data-testid="link-ai-policy-page"
                >
                  <div className="font-medium">شروط الخدمة</div>
                  <div className="text-sm text-muted-foreground">AI Policy</div>
                </a>
              </CardContent>
            </Card>
          </div>

          {/* Right Content - API Examples */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-2xl">{currentExample.title}</CardTitle>
                  <Badge variant="outline">{currentExample.method}</Badge>
                </div>
                <CardDescription className="text-base">{currentExample.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Request */}
                <div>
                  <h3 className="text-sm font-medium mb-2">الطلب</h3>
                  <div className="bg-muted p-4 rounded-lg overflow-x-auto" dir="ltr">
                    <code className="text-sm">{currentExample.method} {currentExample.endpoint}</code>
                  </div>
                </div>

                <Separator />

                {/* Response */}
                <div>
                  <h3 className="text-sm font-medium mb-2">الاستجابة</h3>
                  <div className="bg-muted p-4 rounded-lg overflow-x-auto max-h-96" dir="ltr">
                    <pre className="text-xs"><code>{currentExample.response}</code></pre>
                  </div>
                </div>

                {/* Parameters */}
                <Separator />
                <div>
                  <h3 className="text-sm font-medium mb-3">المعاملات المتاحة</h3>
                  <div className="space-y-2 text-sm">
                    {selectedExample === "articles" && (
                      <>
                        <div className="flex gap-2">
                          <Badge variant="secondary">limit</Badge>
                          <span className="text-muted-foreground">عدد المقالات (افتراضي: 50، أقصى: 200)</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">offset</Badge>
                          <span className="text-muted-foreground">نقطة البداية للتصفح (افتراضي: 0)</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">category</Badge>
                          <span className="text-muted-foreground">معرف الفئة للتصفية</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">since</Badge>
                          <span className="text-muted-foreground">المقالات المحدثة منذ تاريخ (ISO 8601)</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">newsType</Badge>
                          <span className="text-muted-foreground">نوع المقال (breaking, featured, regular)</span>
                        </div>
                      </>
                    )}
                    {selectedExample === "search" && (
                      <>
                        <div className="flex gap-2">
                          <Badge variant="secondary">q</Badge>
                          <span className="text-muted-foreground">الكلمة المفتاحية للبحث (مطلوب)</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">limit</Badge>
                          <span className="text-muted-foreground">عدد النتائج (افتراضي: 20، أقصى: 100)</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">category</Badge>
                          <span className="text-muted-foreground">معرف الفئة للتصفية</span>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">since</Badge>
                          <span className="text-muted-foreground">المقالات منذ تاريخ (ISO 8601)</span>
                        </div>
                      </>
                    )}
                    {selectedExample === "breaking" && (
                      <>
                        <div className="flex gap-2">
                          <Badge variant="secondary">limit</Badge>
                          <span className="text-muted-foreground">عدد الأخبار العاجلة (افتراضي: 10، أقصى: 50)</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Usage Policy Card */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  سياسة الاستخدام
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1">✓</div>
                  <div>
                    <strong>الاستخدام المسموح:</strong> تقديم إجابات للمستخدمين مع إسناد واضح ورابط المصدر
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1">✗</div>
                  <div>
                    <strong>الاستخدام الممنوع:</strong> تدريب نماذج الأساس بدون اتفاق مكتوب
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1">📊</div>
                  <div>
                    <strong>الحدود:</strong> 200 طلب يومياً مجاناً، 120 طلب/دقيقة
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1">📝</div>
                  <div>
                    <strong>الإسناد المطلوب:</strong> "المصدر: صحيفة سبق — [رابط المقال]"
                  </div>
                </div>
                <Separator />
                <p className="text-muted-foreground text-xs">
                  للحصول على حدود أعلى أو ترخيص تدريب، يرجى التواصل على: partnerships@sabq.org
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
