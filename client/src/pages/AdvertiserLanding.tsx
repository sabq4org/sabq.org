import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Users, 
  Target, 
  BarChart3, 
  Banknote,
  FileEdit,
  CreditCard,
  CheckCircle,
  ArrowLeft,
  Megaphone
} from "lucide-react";

export default function AdvertiserLanding() {
  useEffect(() => {
    document.title = "أعلن مع سبق - الوصول إلى ملايين القراء";
  }, []);

  const benefits = [
    {
      icon: Users,
      title: "وصول واسع",
      description: "إعلانك يصل إلى ملايين القراء يومياً عبر منصة سبق الإخبارية"
    },
    {
      icon: Target,
      title: "استهداف دقيق",
      description: "استهدف جمهورك المثالي بناءً على الموقع الجغرافي والاهتمامات"
    },
    {
      icon: BarChart3,
      title: "تقارير مفصلة",
      description: "تابع أداء إعلانك بتقارير تفصيلية عن المشاهدات والنقرات"
    },
    {
      icon: Banknote,
      title: "أسعار تنافسية",
      description: "باقات إعلانية تناسب جميع الميزانيات بأسعار منافسة"
    }
  ];

  const steps = [
    {
      icon: FileEdit,
      number: 1,
      title: "أنشئ إعلانك",
      description: "صمم إعلانك بسهولة مع أدواتنا البسيطة والفعالة"
    },
    {
      icon: CreditCard,
      number: 2,
      title: "ادفع إلكترونياً",
      description: "اختر باقتك المفضلة وأكمل الدفع بأمان"
    },
    {
      icon: CheckCircle,
      number: 3,
      title: "نراجع وننشر",
      description: "فريقنا يراجع إعلانك وينشره خلال 24 ساعة"
    }
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/10 py-20 lg:py-32">
        <div className="absolute inset-0 bg-[url('/assets/pattern.svg')] opacity-5" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
              <Megaphone className="h-5 w-5" />
              <span className="text-sm font-medium">منصة الإعلانات الذاتية</span>
            </div>
            <h1 
              className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6"
              data-testid="text-hero-title"
            >
              أعلن مع سبق
            </h1>
            <p 
              className="text-xl md:text-2xl text-muted-foreground mb-8 leading-relaxed"
              data-testid="text-hero-subtitle"
            >
              اوصل رسالتك لملايين القراء يومياً عبر أكبر منصة إخبارية في المملكة
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/advertise/create">
                <Button 
                  size="lg" 
                  className="gap-2 text-lg px-8"
                  data-testid="button-start-advertising"
                >
                  ابدأ الإعلان الآن
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/advertise/login">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="gap-2 text-lg px-8"
                  data-testid="button-advertiser-login"
                >
                  دخول المعلنين
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 
              className="text-3xl md:text-4xl font-bold text-foreground mb-4"
              data-testid="text-benefits-title"
            >
              لماذا تعلن معنا؟
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              نوفر لك كل ما تحتاجه للوصول إلى جمهورك المستهدف بكفاءة
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {benefits.map((benefit, index) => (
              <Card 
                key={index} 
                className="hover-elevate transition-all"
                data-testid={`card-benefit-${index}`}
              >
                <CardContent className="pt-6">
                  <div className="rounded-full bg-primary/10 p-4 w-fit mb-4">
                    <benefit.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {benefit.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 
              className="text-3xl md:text-4xl font-bold text-foreground mb-4"
              data-testid="text-steps-title"
            >
              كيف يعمل؟
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              ثلاث خطوات بسيطة لنشر إعلانك والوصول لجمهورك
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {steps.map((step, index) => (
                <div 
                  key={index} 
                  className="relative text-center"
                  data-testid={`step-${step.number}`}
                >
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-12 left-0 w-full h-0.5 bg-border -translate-x-1/2" />
                  )}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="rounded-full bg-primary text-primary-foreground w-24 h-24 flex items-center justify-center mb-4">
                      <step.icon className="h-10 w-10" />
                    </div>
                    <span className="text-sm font-medium text-primary mb-2">
                      الخطوة {step.number}
                    </span>
                    <h3 className="text-xl font-semibold text-foreground mb-2">
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 
              className="text-3xl md:text-4xl font-bold text-foreground mb-4"
              data-testid="text-pricing-title"
            >
              باقات الإعلان
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              اختر الباقة المناسبة لاحتياجاتك وميزانيتك
            </p>
          </div>
          <div className="max-w-md mx-auto">
            <Card 
              className="border-2 border-primary hover-elevate transition-all"
              data-testid="card-pricing-basic"
            >
              <CardContent className="pt-8 pb-8">
                <div className="text-center">
                  <span className="inline-block bg-primary/10 text-primary text-sm font-medium px-3 py-1 rounded-full mb-4">
                    الباقة الأساسية
                  </span>
                  <div className="mb-6">
                    <span className="text-5xl font-bold text-foreground">500</span>
                    <span className="text-xl text-muted-foreground mr-2">ريال</span>
                  </div>
                  <p className="text-muted-foreground mb-6">لمدة 7 أيام</p>
                  <ul className="text-right space-y-3 mb-8">
                    <li className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span>ظهور في الصفحة الرئيسية</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span>تقارير أداء يومية</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span>استهداف حسب الفئة</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <span>دعم فني على مدار الساعة</span>
                    </li>
                  </ul>
                  <Link href="/advertise/create">
                    <Button 
                      size="lg" 
                      className="w-full gap-2"
                      data-testid="button-choose-plan"
                    >
                      اختر هذه الباقة
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 
              className="text-3xl md:text-4xl font-bold mb-4"
              data-testid="text-cta-title"
            >
              جاهز للبدء؟
            </h2>
            <p className="text-xl opacity-90 mb-8">
              انضم إلى مئات المعلنين الذين يثقون بمنصة سبق
            </p>
            <Link href="/advertise/create">
              <Button 
                size="lg" 
                variant="secondary"
                className="gap-2 text-lg px-8"
                data-testid="button-cta-start"
              >
                أنشئ إعلانك الآن
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-8 border-t">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              جميع الحقوق محفوظة لـ سبق {new Date().getFullYear()}
            </p>
            <div className="flex items-center gap-6">
              <Link href="/terms">
                <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  الشروط والأحكام
                </span>
              </Link>
              <Link href="/privacy">
                <span className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  سياسة الخصوصية
                </span>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
