import { Header } from "@/components/Header";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Shield, FileText, AlertCircle, CheckCircle2, Mail } from "lucide-react";

export default function AIPolicy() {
  const { data: user } = useQuery<{ id: string; name?: string; email?: string }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <Header user={user} />
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">سياسة استخدام الذكاء الاصطناعي</h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            شروط وأحكام استخدام محتوى صحيفة سبق في تطبيقات وأنظمة الذكاء الاصطناعي
          </p>
          <p className="text-sm text-muted-foreground mt-2">آخر تحديث: 27 أكتوبر 2025</p>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                نظرة عامة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 leading-relaxed">
              <p>
                تحدد هذه السياسة الشروط والأحكام التي تحكم استخدام محتوى صحيفة سبق ("المحتوى") 
                في أنظمة وتطبيقات الذكاء الاصطناعي ("الأنظمة"). باستخدام واجهات برمجة التطبيقات (API) 
                الخاصة بنا أو الوصول إلى محتوانا، فإنك توافق على الالتزام بهذه السياسة.
              </p>
              <p className="text-muted-foreground">
                صحيفة سبق هي مصدر إخباري موثوق يقدم تغطية شاملة للأخبار العربية. نحن ملتزمون بدعم 
                الابتكار في مجال الذكاء الاصطناعي مع حماية حقوق الملكية الفكرية والحفاظ على جودة المحتوى.
              </p>
            </CardContent>
          </Card>

          {/* Allowed Uses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                الاستخدامات المسموحة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-green-600"></div>
                  <div>
                    <h3 className="font-semibold mb-1">الاستدلال (Inference)</h3>
                    <p className="text-sm text-muted-foreground">
                      يُسمح باستخدام المحتوى لتقديم إجابات للمستخدمين في تطبيقات الذكاء الاصطناعي 
                      التحادثية، محركات البحث الدلالية، والمساعدات الذكية، بشرط تقديم إسناد واضح ورابط 
                      مباشر للمصدر.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-green-600"></div>
                  <div>
                    <h3 className="font-semibold mb-1">الملخصات القصيرة</h3>
                    <p className="text-sm text-muted-foreground">
                      يُسمح بإنشاء ملخصات قصيرة (حتى 150 كلمة) من محتوانا لعرضها في تطبيقات الذكاء 
                      الاصطناعي، بشرط تضمين رابط للمقال الأصلي.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-green-600"></div>
                  <div>
                    <h3 className="font-semibold mb-1">البحث والاستكشاف</h3>
                    <p className="text-sm text-muted-foreground">
                      يُسمح باستخدام واجهات برمجة التطبيقات للبحث في المحتوى واستكشاف المقالات وتقديم 
                      توصيات مخصصة للمستخدمين.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-green-600"></div>
                  <div>
                    <h3 className="font-semibold mb-1">التحليل البحثي</h3>
                    <p className="text-sm text-muted-foreground">
                      يُسمح باستخدام المحتوى لأغراض البحث الأكاديمي وتحليل الاتجاهات الإخبارية، بشرط 
                      عدم إعادة نشر المحتوى الكامل بدون إذن.
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  متطلبات الإسناد
                </h3>
                <p className="text-sm">
                  يجب تضمين الإسناد التالي في جميع الاستخدامات المسموحة:
                </p>
                <div className="mt-2 p-3 bg-background rounded border text-sm" dir="ltr">
                  <code>"المصدر: صحيفة سبق — [رابط المقال]"</code>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Prohibited Uses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                الاستخدامات الممنوعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-destructive"></div>
                  <div>
                    <h3 className="font-semibold mb-1">تدريب نماذج الأساس</h3>
                    <p className="text-sm text-muted-foreground">
                      يُمنع استخدام محتوانا لتدريب نماذج اللغة الكبيرة (LLMs) أو أي نماذج ذكاء 
                      اصطناعي أساسية بدون اتفاق مكتوب مسبق مع صحيفة سبق.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-destructive"></div>
                  <div>
                    <h3 className="font-semibold mb-1">إعادة النشر الكاملة</h3>
                    <p className="text-sm text-muted-foreground">
                      يُمنع إعادة نشر المحتوى الكامل للمقالات بدون إذن، حتى مع الإسناد. يُسمح فقط 
                      بالملخصات القصيرة مع رابط المصدر.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-destructive"></div>
                  <div>
                    <h3 className="font-semibold mb-1">المحتوى المضلل</h3>
                    <p className="text-sm text-muted-foreground">
                      يُمنع استخدام محتوانا بطريقة مضللة أو تحريفه أو تقديمه بشكل يخالف السياق الأصلي 
                      أو يضر بسمعة صحيفة سبق.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-destructive"></div>
                  <div>
                    <h3 className="font-semibold mb-1">التجريف المفرط (Scraping)</h3>
                    <p className="text-sm text-muted-foreground">
                      يُمنع تجريف محتوانا بشكل مفرط أو آلي يتجاوز الحدود المحددة في سياسة الاستخدام 
                      (200 طلب/يوم للاستخدام المجاني).
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-destructive"></div>
                  <div>
                    <h3 className="font-semibold mb-1">الاستخدام التجاري المباشر</h3>
                    <p className="text-sm text-muted-foreground">
                      يُمنع بيع محتوانا أو استخدامه مباشرة لأغراض تجارية بدون اتفاق شراكة مع صحيفة سبق.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quotas and Limits */}
          <Card>
            <CardHeader>
              <CardTitle>الحدود والحصص</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-2">المستوى المجاني</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• 200 طلب/يوم</li>
                    <li>• 120 طلب/دقيقة</li>
                    <li>• إسناد إلزامي</li>
                  </ul>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-2">المستوى الاحترافي</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• حدود أعلى</li>
                    <li>• اتفاقية مستوى الخدمة</li>
                    <li>• دعم تقني</li>
                  </ul>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-2">المستوى المؤسسي</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• حدود مخصصة</li>
                    <li>• ترخيص تدريب محدود</li>
                    <li>• شراكات استراتيجية</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Licensing */}
          <Card>
            <CardHeader>
              <CardTitle>الترخيص والملكية الفكرية</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 leading-relaxed">
              <p>
                جميع المحتويات المنشورة على صحيفة سبق محمية بموجب قوانين حقوق النشر والملكية الفكرية. 
                تمنح هذه السياسة ترخيصاً محدوداً لاستخدام المحتوى وفقاً للشروط المذكورة أعلاه.
              </p>
              <p className="text-muted-foreground">
                <strong>رخصة الاستخدام:</strong> Sabq-AI-Use-1.0
              </p>
              <p className="text-sm text-muted-foreground">
                هذا الترخيص قابل للإلغاء في حالة انتهاك أي من شروط هذه السياسة. تحتفظ صحيفة سبق بالحق 
                في تعديل هذه السياسة في أي وقت مع إشعار مسبق للمستخدمين.
              </p>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                التواصل والشراكات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="leading-relaxed">
                للاستفسارات حول الترخيص، الشراكات، أو الحصول على حدود استخدام أعلى، يرجى التواصل معنا:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-2">الشراكات التجارية</h3>
                  <a 
                    href="mailto:partnerships@sabq.org" 
                    className="text-primary hover:underline"
                  >
                    partnerships@sabq.org
                  </a>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-2">الدعم التقني</h3>
                  <a 
                    href="mailto:api-support@sabq.org" 
                    className="text-primary hover:underline"
                  >
                    api-support@sabq.org
                  </a>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                نرحب بالتعاون مع مطوري الذكاء الاصطناعي والشركات التقنية لبناء تطبيقات مبتكرة تخدم 
                المستخدمين العرب.
              </p>
            </CardContent>
          </Card>

          {/* Legal Disclaimer */}
          <Card className="border-muted">
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>إخلاء مسؤولية:</strong> تُقدم واجهات برمجة التطبيقات والمحتوى "كما هي" بدون أي 
                ضمانات من أي نوع. لا تتحمل صحيفة سبق أي مسؤولية عن أي أضرار ناتجة عن استخدام المحتوى 
                أو واجهات برمجة التطبيقات. يتحمل المستخدم المسؤولية الكاملة عن الامتثال لهذه السياسة 
                وأي قوانين ولوائح معمول بها. باستخدام خدماتنا، فإنك توافق على تعويض صحيفة سبق عن أي 
                مطالبات أو خسائر ناتجة عن انتهاكك لهذه السياسة.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
