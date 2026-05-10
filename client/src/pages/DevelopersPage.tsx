import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Code, 
  Shield, 
  Zap, 
  Book, 
  Terminal, 
  Server, 
  Lock, 
  Clock, 
  FileJson, 
  Globe,
  Key,
  MessageSquare,
  Newspaper,
  FolderTree,
  Brain,
  Rss,
  Mail,
  ExternalLink,
  Copy,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Ban,
  Timer,
  ServerCrash,
  Gauge,
  Archive,
  GitBranch,
  Layers,
  HelpCircle
} from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function DevelopersPage() {
  const { toast } = useToast();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const copyToClipboard = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(id);
    toast({
      title: "تم النسخ",
      description: "تم نسخ الكود إلى الحافظة",
    });
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const endpoints = [
    {
      name: "المصادقة",
      nameEn: "Authentication",
      path: "/api/auth/*",
      description: "تسجيل الدخول والتسجيل وإدارة الجلسات",
      icon: Key,
      color: "text-blue-500"
    },
    {
      name: "المقالات",
      nameEn: "Articles",
      path: "/api/articles/*",
      description: "إنشاء وتحديث وقراءة المقالات والأخبار",
      icon: Newspaper,
      color: "text-green-500"
    },
    {
      name: "التصنيفات",
      nameEn: "Categories",
      path: "/api/categories/*",
      description: "إدارة وعرض التصنيفات الإخبارية",
      icon: FolderTree,
      color: "text-purple-500"
    },
    {
      name: "التعليقات",
      nameEn: "Comments",
      path: "/api/comments/*",
      description: "إضافة وإدارة التعليقات على المقالات",
      icon: MessageSquare,
      color: "text-orange-500"
    },
    {
      name: "الذكاء الاصطناعي",
      nameEn: "AI Features",
      path: "/api/ai/*",
      description: "التلخيص الذكي والتحليل والتوصيات",
      icon: Brain,
      color: "text-pink-500"
    },
    {
      name: "RSS Feeds",
      nameEn: "RSS",
      path: "/api/rss/*",
      description: "خلاصات RSS للاشتراك في الأخبار",
      icon: Rss,
      color: "text-amber-500"
    }
  ];

  const statusCodes = [
    { code: 200, name: "Success", nameAr: "نجاح", description: "العملية تمت بنجاح", icon: CheckCircle, color: "text-green-500" },
    { code: 201, name: "Created", nameAr: "تم الإنشاء", description: "تم إنشاء المورد بنجاح", icon: CheckCircle, color: "text-green-500" },
    { code: 400, name: "Bad Request", nameAr: "طلب غير صالح", description: "بيانات الطلب غير صحيحة", icon: AlertTriangle, color: "text-yellow-500" },
    { code: 401, name: "Unauthorized", nameAr: "غير مصرح", description: "يجب تسجيل الدخول أولاً", icon: Lock, color: "text-red-500" },
    { code: 403, name: "Forbidden", nameAr: "محظور", description: "ليس لديك صلاحية لهذا الإجراء", icon: Ban, color: "text-red-500" },
    { code: 404, name: "Not Found", nameAr: "غير موجود", description: "المورد المطلوب غير موجود", icon: XCircle, color: "text-gray-500" },
    { code: 429, name: "Rate Limited", nameAr: "تجاوز الحد", description: "تم تجاوز عدد الطلبات المسموح", icon: Timer, color: "text-orange-500" },
    { code: 500, name: "Server Error", nameAr: "خطأ في الخادم", description: "حدث خطأ داخلي في الخادم", icon: ServerCrash, color: "text-red-600" }
  ];

  const jsCode = `// الحصول على قائمة المقالات
const response = await fetch('https://sabq.org/api/articles?page=1&limit=10', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Accept-Language': 'ar'
  }
});

const articles = await response.json();
console.log(articles);`;

  const jsAuthCode = `// إنشاء مقال جديد (يتطلب مصادقة)
const response = await fetch('https://sabq.org/api/articles', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN'
  },
  body: JSON.stringify({
    title: 'عنوان المقال',
    content: 'محتوى المقال هنا...',
    categoryId: 'category-uuid'
  })
});

const newArticle = await response.json();`;

  const pythonCode = `import requests

# الحصول على قائمة المقالات
response = requests.get(
    'https://sabq.org/api/articles',
    params={'page': 1, 'limit': 10},
    headers={
        'Content-Type': 'application/json',
        'Accept-Language': 'ar'
    }
)

articles = response.json()
print(articles)`;

  const pythonAuthCode = `import requests

# إنشاء مقال جديد (يتطلب مصادقة)
response = requests.post(
    'https://sabq.org/api/articles',
    headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_JWT_TOKEN'
    },
    json={
        'title': 'عنوان المقال',
        'content': 'محتوى المقال هنا...',
        'categoryId': 'category-uuid'
    }
)

new_article = response.json()`;

  const curlCode = `# الحصول على قائمة المقالات
curl -X GET "https://sabq.org/api/articles?page=1&limit=10" \\
  -H "Content-Type: application/json" \\
  -H "Accept-Language: ar"`;

  const curlAuthCode = `# إنشاء مقال جديد (يتطلب مصادقة)
curl -X POST "https://sabq.org/api/articles" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -d '{
    "title": "عنوان المقال",
    "content": "محتوى المقال هنا...",
    "categoryId": "category-uuid"
  }'`;

  const errorResponseExample = `{
  "message": "التحقق من صحة البيانات فشل",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "title",
      "message": "العنوان مطلوب"
    }
  ]
}`;

  const CodeBlock = ({ code, id, language }: { code: string; id: string; language: string }) => (
    <div className="relative">
      <div className="absolute top-2 left-2 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{language}</Badge>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => copyToClipboard(code, id)}
          data-testid={`button-copy-${id}`}
        >
          {copiedCode === id ? (
            <CheckCircle className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="bg-gray-900 text-gray-100 p-4 pt-10 rounded-lg overflow-x-auto text-sm font-mono leading-relaxed" dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <section className="text-center mb-16" data-testid="section-hero">
          <div className="flex justify-center mb-4">
            <Badge variant="outline" className="text-sm px-3 py-1" data-testid="badge-version">
              <Code className="h-3 w-3 ml-1" />
              v1.0
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-hero-title">
            بوابة المطورين - Sabq API
          </h1>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
            واجهة برمجة تطبيقات RESTful v1.0 للوصول إلى محتوى منصة سبق الإخبارية
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Button asChild size="lg" data-testid="button-swagger-docs">
              <a href="/api-docs" target="_blank" rel="noopener noreferrer">
                <Book className="h-5 w-5 ml-2" />
                التوثيق التفاعلي
                <ExternalLink className="h-4 w-4 mr-2" />
              </a>
            </Button>
            <Button variant="outline" size="lg" data-testid="button-quick-start" onClick={() => document.getElementById('code-examples')?.scrollIntoView({ behavior: 'smooth' })}>
              <Zap className="h-5 w-5 ml-2" />
              البدء السريع
            </Button>
          </div>
        </section>

        <section className="mb-16" data-testid="section-api-type">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-6 w-6 text-primary" />
                نوع الـ API
              </CardTitle>
              <CardDescription>مواصفات واجهة برمجة التطبيقات</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <Globe className="h-6 w-6 text-blue-500 mt-1" />
                  <div>
                    <h3 className="font-semibold">RESTful API</h3>
                    <p className="text-sm text-muted-foreground">معمارية REST كاملة</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <FileJson className="h-6 w-6 text-green-500 mt-1" />
                  <div>
                    <h3 className="font-semibold">JSON Format</h3>
                    <p className="text-sm text-muted-foreground">جميع الاستجابات بصيغة JSON</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <Terminal className="h-6 w-6 text-purple-500 mt-1" />
                  <div>
                    <h3 className="font-semibold">HTTP Methods</h3>
                    <p className="text-sm text-muted-foreground">GET, POST, PUT, DELETE</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
                  <Code className="h-6 w-6 text-orange-500 mt-1" />
                  <div>
                    <h3 className="font-semibold">UTF-8 Encoding</h3>
                    <p className="text-sm text-muted-foreground">دعم كامل للغة العربية</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" data-testid="section-endpoints">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            نقاط النهاية
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {endpoints.map((endpoint, index) => (
              <Card key={endpoint.path} className="hover-elevate transition-all" data-testid={`card-endpoint-${index}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <endpoint.icon className={`h-5 w-5 ${endpoint.color}`} />
                    {endpoint.name}
                  </CardTitle>
                  <CardDescription className="text-xs font-mono bg-muted px-2 py-1 rounded w-fit" dir="ltr">
                    {endpoint.path}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{endpoint.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-16" data-testid="section-auth">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                الأمان والمصادقة
              </CardTitle>
              <CardDescription>طرق المصادقة المدعومة في الـ API</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="h-5 w-5 text-blue-500" />
                    <h3 className="font-semibold">Session Cookies</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">مصادقة بالجلسات عبر الكوكيز للتطبيقات الويب</p>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold">JWT Bearer</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">رموز JWT للتطبيقات والخدمات</p>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">OAuth2</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">دعم Google و Apple Sign-In</p>
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">مثال على رأس المصادقة:</h4>
                <CodeBlock 
                  code={`Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`}
                  id="auth-header"
                  language="HTTP Header"
                />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" id="code-examples" data-testid="section-code-examples">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-6 w-6 text-primary" />
                أمثلة عملية
              </CardTitle>
              <CardDescription>أمثلة برمجية بلغات مختلفة</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="javascript" dir="ltr">
                <TabsList className="mb-4" data-testid="tabs-languages">
                  <TabsTrigger value="javascript" data-testid="tab-javascript">JavaScript</TabsTrigger>
                  <TabsTrigger value="python" data-testid="tab-python">Python</TabsTrigger>
                  <TabsTrigger value="curl" data-testid="tab-curl">cURL</TabsTrigger>
                </TabsList>
                
                <TabsContent value="javascript" className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2 text-right">الحصول على المقالات</h4>
                    <CodeBlock code={jsCode} id="js-get" language="JavaScript" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-right">إنشاء مقال (مصادقة)</h4>
                    <CodeBlock code={jsAuthCode} id="js-post" language="JavaScript" />
                  </div>
                </TabsContent>
                
                <TabsContent value="python" className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2 text-right">الحصول على المقالات</h4>
                    <CodeBlock code={pythonCode} id="py-get" language="Python" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-right">إنشاء مقال (مصادقة)</h4>
                    <CodeBlock code={pythonAuthCode} id="py-post" language="Python" />
                  </div>
                </TabsContent>
                
                <TabsContent value="curl" className="space-y-6">
                  <div>
                    <h4 className="font-semibold mb-2 text-right">الحصول على المقالات</h4>
                    <CodeBlock code={curlCode} id="curl-get" language="cURL" />
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2 text-right">إنشاء مقال (مصادقة)</h4>
                    <CodeBlock code={curlAuthCode} id="curl-post" language="cURL" />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" data-testid="section-errors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-primary" />
                إدارة الأخطاء
              </CardTitle>
              <CardDescription>رموز الحالة HTTP ومعانيها</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="overflow-x-auto">
                <Table data-testid="table-status-codes">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الرمز</TableHead>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right">الوصف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statusCodes.map((status) => (
                      <TableRow key={status.code} data-testid={`row-status-${status.code}`}>
                        <TableCell className="font-mono">
                          <Badge variant={status.code < 300 ? "default" : status.code < 500 ? "secondary" : "destructive"}>
                            {status.code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <status.icon className={`h-4 w-4 ${status.color}`} />
                            {status.nameAr}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{status.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div>
                <h4 className="font-semibold mb-2">مثال على استجابة خطأ:</h4>
                <CodeBlock code={errorResponseExample} id="error-example" language="JSON" />
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" data-testid="section-rate-limit">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                حدود الاستخدام
              </CardTitle>
              <CardDescription>قيود معدل الطلبات لحماية الخدمة</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">API العام</span>
                      <Badge variant="outline">500 طلب / 15 دقيقة</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">جميع نقاط النهاية العامة</p>
                  </div>
                  <div className="p-4 rounded-lg border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">المصادقة</span>
                      <Badge variant="outline">5 محاولات / 15 دقيقة</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">تسجيل الدخول والتسجيل</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">رؤوس الاستجابة:</h4>
                  <CodeBlock 
                    code={`X-RateLimit-Limit: 500
X-RateLimit-Remaining: 498
X-RateLimit-Reset: 1703856000`}
                    id="rate-headers"
                    language="HTTP Headers"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" data-testid="section-versioning">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-6 w-6 text-primary" />
                إصدارات الـ API
              </CardTitle>
              <CardDescription>نظام إدارة الإصدارات</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-500">v1.0</Badge>
                    <span className="font-semibold">الإصدار الحالي</span>
                  </div>
                  <p className="text-muted-foreground">
                    نستخدم نظام إصدارات مبني على URL. الإصدار الحالي هو v1.0 ومتوفر على المسار الأساسي /api/.
                  </p>
                  <div className="p-4 rounded-lg bg-muted/50">
                    <h4 className="font-semibold mb-2">التزامنا:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>الحفاظ على التوافق العكسي</li>
                      <li>إشعار مسبق قبل أي تغييرات جوهرية</li>
                      <li>فترة انتقالية لا تقل عن 6 أشهر</li>
                    </ul>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">مثال على المسار:</h4>
                  <CodeBlock 
                    code={`# الإصدار الحالي (v1.0)
https://sabq.org/api/articles

# الإصدارات المستقبلية
https://sabq.org/api/v2/articles`}
                    id="version-example"
                    language="URLs"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" data-testid="section-performance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-6 w-6 text-primary" />
                الأداء
              </CardTitle>
              <CardDescription>تحسينات الأداء والتخزين المؤقت</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Archive className="h-5 w-5 text-blue-500" />
                    <h3 className="font-semibold">التخزين المؤقت</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">رؤوس Cache-Control للاستجابات القابلة للتخزين</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block" dir="ltr">Cache-Control: max-age=300</code>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-5 w-5 text-green-500" />
                    <h3 className="font-semibold">الضغط</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">ضغط gzip للاستجابات لتقليل حجم البيانات</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block" dir="ltr">Content-Encoding: gzip</code>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="h-5 w-5 text-purple-500" />
                    <h3 className="font-semibold">التصفح</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">دعم التصفح بالصفحات للقوائم الكبيرة</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded mt-2 block" dir="ltr">?page=1&limit=20</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mb-16" data-testid="section-support">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HelpCircle className="h-6 w-6 text-primary" />
                الدعم الفني
              </CardTitle>
              <CardDescription>هل تحتاج مساعدة؟ نحن هنا للمساعدة</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                <a 
                  href="mailto:developers@sabq.org" 
                  className="p-4 rounded-lg border bg-background hover-elevate flex items-center gap-3"
                  data-testid="link-email-support"
                >
                  <Mail className="h-6 w-6 text-primary" />
                  <div>
                    <h3 className="font-semibold">البريد الإلكتروني</h3>
                    <p className="text-sm text-muted-foreground" dir="ltr">developers@sabq.org</p>
                  </div>
                </a>
                <a 
                  href="/api-docs" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-lg border bg-background hover-elevate flex items-center gap-3"
                  data-testid="link-swagger"
                >
                  <Book className="h-6 w-6 text-green-500" />
                  <div>
                    <h3 className="font-semibold">توثيق Swagger</h3>
                    <p className="text-sm text-muted-foreground">التوثيق التفاعلي الكامل</p>
                  </div>
                </a>
                <Link 
                  href="/contact"
                  className="p-4 rounded-lg border bg-background hover-elevate flex items-center gap-3"
                  data-testid="link-contact"
                >
                  <MessageSquare className="h-6 w-6 text-purple-500" />
                  <div>
                    <h3 className="font-semibold">تواصل معنا</h3>
                    <p className="text-sm text-muted-foreground">صفحة التواصل</p>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="bg-footer text-footer-foreground py-8 border-t">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} سبق الإلكترونية. جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>
    </div>
  );
}
