/**
 * Newsletter Subscription Page
 * صفحة الاشتراك في النشرة الإخبارية
 */

import { 
  Mail, 
  Clock, 
  Shield, 
  CheckCircle, 
  Calendar, 
  Sun, 
  Star,
  XCircle,
  Headphones,
  MessageCircle,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Link } from 'wouter';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SmartNewsletterForm } from '@/components/SmartNewsletterForm';

const newsletterTypes = [
  {
    id: 'daily',
    titleAr: 'النشرة الصباحية اليومية',
    titleEn: 'Daily Morning Brief',
    icon: Sun,
    time: '6:00 صباحاً',
    frequency: 'يومياً',
    description: 'ملخص لأهم الأخبار والأحداث التي تحتاج معرفتها لبدء يومك، تصلك قبل الفجر.',
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
  {
    id: 'monthly',
    titleAr: 'النشرة الشهرية',
    titleEn: 'Monthly Highlights',
    icon: Star,
    time: 'أول كل شهر',
    frequency: 'شهرياً',
    description: 'استعراض شامل لأهم الأحداث والتحليلات والقصص المميزة خلال الشهر.',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-50 dark:bg-purple-950/20',
    borderColor: 'border-purple-200 dark:border-purple-800',
  },
];

const subscriptionSteps = [
  {
    step: 1,
    title: 'أدخل بريدك الإلكتروني',
    description: 'قم بإدخال بريدك الإلكتروني واختر الأقسام التي تهمك',
    icon: Mail,
  },
  {
    step: 2,
    title: 'تحقق من بريدك',
    description: 'ستصلك رسالة تأكيد على بريدك الإلكتروني',
    icon: CheckCircle,
  },
  {
    step: 3,
    title: 'أكد اشتراكك',
    description: 'اضغط على رابط التأكيد في الرسالة لإتمام الاشتراك',
    icon: CheckCircle,
  },
  {
    step: 4,
    title: 'رسالة الترحيب',
    description: 'ستصلك رسالة ترحيبية مع تفاصيل اشتراكك',
    icon: Sparkles,
  },
];

const privacyFaqs = [
  {
    id: 'data-usage',
    question: 'كيف تستخدم سبق بياناتي الشخصية؟',
    answer: 'نستخدم بريدك الإلكتروني فقط لإرسال النشرات الإخبارية التي اشتركت فيها. كما نستخدم اهتماماتك المختارة لتخصيص المحتوى الذي يصلك. لا نستخدم بياناتك لأي غرض آخر دون موافقتك الصريحة.',
  },
  {
    id: 'data-sharing',
    question: 'هل تشاركون بياناتي مع جهات أخرى؟',
    answer: 'لا، نحن نلتزم بعدم مشاركة بياناتك الشخصية مع أي جهة خارجية. بياناتك محمية وتُستخدم حصرياً لخدمات سبق الإخبارية.',
  },
  {
    id: 'data-protection',
    question: 'كيف تحمون بياناتي؟',
    answer: 'نستخدم تقنيات تشفير متقدمة لحماية بياناتك. جميع الاتصالات مؤمنة عبر بروتوكول HTTPS، ونتبع أفضل الممارسات الأمنية في تخزين ومعالجة البيانات.',
  },
  {
    id: 'subscriber-rights',
    question: 'ما هي حقوقي كمشترك؟',
    answer: 'لديك الحق في: الوصول إلى بياناتك الشخصية، تعديل معلوماتك، إلغاء اشتراكك في أي وقت، طلب حذف بياناتك نهائياً، والحصول على نسخة من بياناتك.',
  },
  {
    id: 'cookies',
    question: 'هل تستخدمون ملفات تعريف الارتباط (Cookies)؟',
    answer: 'نستخدم ملفات تعريف الارتباط الضرورية لتحسين تجربتك على موقعنا. يمكنك التحكم في إعدادات ملفات تعريف الارتباط من خلال متصفحك.',
  },
];

export default function NewsletterPage() {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="relative overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent_30%)]" />
        </div>
        
        <div className="container mx-auto px-4 py-16 relative">
          <Link href="/" className="inline-flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground mb-8 transition-colors" data-testid="link-back-home">
            <ArrowLeft className="w-5 h-5" />
            <span>العودة للرئيسية</span>
          </Link>
          
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 mb-6">
              <Mail className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4" data-testid="text-page-title">
              النشرة الإخبارية الذكية
            </h1>
            <p className="text-xl text-primary-foreground/90 mb-8">
              اشترك لتصلك أخبار مخصصة حسب اهتماماتك مباشرة إلى بريدك الإلكتروني
            </p>
            
            <div className="flex flex-wrap justify-center gap-3">
              <Badge variant="secondary" className="text-sm py-1.5 px-3" data-testid="badge-daily">
                <Sun className="w-4 h-4 ml-1" />
                صباحية يومية
              </Badge>
              <Badge variant="secondary" className="text-sm py-1.5 px-3" data-testid="badge-monthly">
                <Star className="w-4 h-4 ml-1" />
                شهرية
              </Badge>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="container mx-auto px-4 -mt-8 relative z-10">
        <div className="max-w-2xl mx-auto">
          <SmartNewsletterForm 
            variant="full" 
            source="newsletter-page" 
            className="shadow-xl"
          />
        </div>
      </div>

      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="text-schedule-title">
            <Calendar className="inline-block w-8 h-8 ml-2 text-primary" />
            مواعيد النشرات
          </h2>
          <p className="text-muted-foreground text-lg">
            اختر النشرة التي تناسب جدولك اليومي
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {newsletterTypes.map((newsletter) => {
            const IconComponent = newsletter.icon;
            return (
              <Card 
                key={newsletter.id} 
                className={`${newsletter.bgColor} ${newsletter.borderColor} border-2 transition-all hover-elevate`}
                data-testid={`card-newsletter-${newsletter.id}`}
              >
                <CardHeader className="pb-3">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${newsletter.color} flex items-center justify-center mb-4`}>
                    <IconComponent className="w-7 h-7 text-white" />
                  </div>
                  <CardTitle className="text-xl">{newsletter.titleAr}</CardTitle>
                  <CardDescription className="text-sm">{newsletter.titleEn}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{newsletter.time}</span>
                      <Badge variant="outline" className="mr-auto">
                        {newsletter.frequency}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {newsletter.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="text-optin-title">
              <CheckCircle className="inline-block w-8 h-8 ml-2 text-green-600" />
              تأكيد الاشتراك
            </h2>
            <p className="text-muted-foreground text-lg">
              نستخدم نظام التأكيد المزدوج لحماية خصوصيتك
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {subscriptionSteps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <div 
                    key={step.step} 
                    className="relative"
                    data-testid={`step-${step.step}`}
                  >
                    <Card className="h-full text-center p-6">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <IconComponent className="w-6 h-6 text-primary" />
                      </div>
                      <div className="absolute -top-3 right-4">
                        <Badge variant="default" className="w-8 h-8 rounded-full p-0 flex items-center justify-center">
                          {step.step}
                        </Badge>
                      </div>
                      <h3 className="font-bold text-foreground mb-2">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.description}</p>
                    </Card>
                    {index < subscriptionSteps.length - 1 && (
                      <div className="hidden lg:block absolute top-1/2 -left-2 transform -translate-y-1/2">
                        <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="text-privacy-title">
              <Shield className="inline-block w-8 h-8 ml-2 text-primary" />
              سياسة الخصوصية
            </h2>
            <p className="text-muted-foreground text-lg">
              نلتزم بحماية بياناتك الشخصية وخصوصيتك
            </p>
          </div>

          <Card className="p-6">
            <Accordion type="single" collapsible className="w-full">
              {privacyFaqs.map((faq, index) => (
                <AccordionItem 
                  key={faq.id} 
                  value={faq.id}
                  className={index === privacyFaqs.length - 1 ? 'border-b-0' : ''}
                >
                  <AccordionTrigger 
                    className="text-right hover:no-underline"
                    data-testid={`accordion-trigger-${faq.id}`}
                  >
                    <span className="font-medium">{faq.question}</span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </div>
      </section>

      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="text-unsubscribe-title">
                <XCircle className="inline-block w-8 h-8 ml-2 text-destructive" />
                إلغاء الاشتراك
              </h2>
              <p className="text-muted-foreground text-lg">
                يمكنك إلغاء اشتراكك في أي وقت بكل سهولة
              </p>
            </div>

            <Card className="p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-bold text-lg text-foreground mb-4">
                    طريقة إلغاء الاشتراك
                  </h3>
                  <ol className="space-y-3 text-muted-foreground" data-testid="list-unsubscribe-steps">
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                      <span>افتح أي رسالة نشرة إخبارية من سبق</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                      <span>انزل لأسفل الرسالة</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                      <span>اضغط على رابط "إلغاء الاشتراك"</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                      <span>سيتم إلغاء اشتراكك فوراً</span>
                    </li>
                  </ol>
                </div>
                <div className="border-r pr-8 md:border-r-border">
                  <h3 className="font-bold text-lg text-foreground mb-4">
                    ملاحظات مهمة
                  </h3>
                  <ul className="space-y-3 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                      <span>الإلغاء فوري ولا يحتاج تأكيد</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                      <span>يمكنك إعادة الاشتراك في أي وقت</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                      <span>لن نرسل لك أي رسائل بعد الإلغاء</span>
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <Headphones className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-3" data-testid="text-support-title">
            الدعم الفني
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            لديك سؤال أو استفسار؟ فريقنا جاهز لمساعدتك
          </p>

          <Card className="p-8">
            <div className="grid sm:grid-cols-2 gap-6">
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-foreground mb-2">البريد الإلكتروني</h3>
                <a 
                  href="mailto:newsletter@sabq.org" 
                  className="text-primary hover:underline"
                  data-testid="link-support-email"
                >
                  newsletter@sabq.org
                </a>
              </div>
              <div className="text-center p-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-bold text-foreground mb-2">تواصل معنا</h3>
                <Link href="/contact">
                  <Button variant="outline" data-testid="button-contact-us">
                    صفحة التواصل
                  </Button>
                </Link>
              </div>
            </div>
          </Card>

          <p className="text-sm text-muted-foreground mt-8">
            نحرص على الرد على جميع الاستفسارات خلال 24 ساعة
          </p>
        </div>
      </section>

      <section className="bg-gradient-to-br from-primary to-primary/80 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-primary-foreground mb-4">
            انضم لأكثر من 100,000 مشترك
          </h2>
          <p className="text-primary-foreground/90 mb-8 max-w-xl mx-auto">
            لا تفوت أهم الأخبار والتحليلات. اشترك الآن واحصل على محتوى حصري يصلك مباشرة.
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            data-testid="button-scroll-to-subscribe"
          >
            <Sparkles className="w-5 h-5 ml-2" />
            اشترك الآن
          </Button>
        </div>
      </section>
    </div>
  );
}
