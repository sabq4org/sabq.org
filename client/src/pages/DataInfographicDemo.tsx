import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  Building2,
  Coins,
  Globe,
  Target,
  Clock,
  BarChart3,
  Zap,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  BigNumber,
  DataCard,
  DonutChart,
  HeroHeader,
  KeyInsight,
  ProgressBlock,
  SectionDivider,
  Timeline,
} from "@/components/data-infographic";

export default function DataInfographicDemo() {
  // Sample data for demonstration
  const keyNumbers = [
    { value: 2500000, label: "إجمالي المستخدمين", suffix: "+", color: "primary" as const },
    { value: 85, label: "نسبة النمو", suffix: "%", color: "success" as const },
    { value: 150, label: "دولة مستهدفة", color: "info" as const },
    { value: 45, label: "مليار ريال", color: "accent" as const },
  ];

  const progressData = [
    { label: "المملكة العربية السعودية", value: 85, maxValue: 100 },
    { label: "الإمارات العربية المتحدة", value: 72, maxValue: 100 },
    { label: "مصر", value: 65, maxValue: 100 },
    { label: "الكويت", value: 58, maxValue: 100 },
    { label: "قطر", value: 45, maxValue: 100 },
  ];

  const chartData = [
    { label: "التقنية", value: 35 },
    { label: "الصحة", value: 25 },
    { label: "التعليم", value: 20 },
    { label: "الترفيه", value: 12 },
    { label: "أخرى", value: 8 },
  ];

  const timelineEvents = [
    { 
      date: "يناير ٢٠٢٤", 
      title: "إطلاق المرحلة الأولى", 
      description: "بدء التشغيل التجريبي في ثلاث مدن رئيسية",
      color: "primary" as const,
    },
    { 
      date: "مارس ٢٠٢٤", 
      title: "التوسع الإقليمي", 
      description: "الوصول إلى ١٠ مدن جديدة",
      color: "primary" as const,
    },
    { 
      date: "يونيو ٢٠٢٤", 
      title: "شراكات استراتيجية", 
      description: "توقيع اتفاقيات مع ٥ شركات عالمية",
      color: "accent" as const,
    },
    { 
      date: "سبتمبر ٢٠٢٤", 
      title: "الإطلاق الكامل", 
      description: "التغطية الشاملة على مستوى المنطقة",
      color: "success" as const,
    },
  ];

  const dataCards = [
    { 
      title: "الاستثمارات الجديدة", 
      value: "12.5 مليار", 
      description: "تدفقات رأس المال الأجنبي خلال الربع الأخير",
      icon: Coins,
    },
    { 
      title: "فرص العمل", 
      value: "50,000+", 
      description: "وظائف جديدة متوقعة في القطاعات المستهدفة",
      icon: Users,
    },
    { 
      title: "المشاريع المعتمدة", 
      value: 245, 
      description: "مشروع تحت التنفيذ في مختلف المناطق",
      icon: Building2,
    },
  ];

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "إنفوجرافيك سبق الذكية",
        text: "رؤية ٢٠٣٠ - التحول الاقتصادي في أرقام",
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero Header */}
      <HeroHeader
        title="رؤية ٢٠٣٠ - التحول الاقتصادي في أرقام"
        subtitle="نظرة شاملة على مؤشرات التنمية والنمو الاقتصادي في المملكة العربية السعودية"
        keyInsight="المملكة تحقق قفزات نوعية في مؤشرات التنويع الاقتصادي مع نمو غير نفطي يتجاوز التوقعات"
        category="اقتصاد"
        date={new Date()}
        views={15420}
        onShare={handleShare}
      />

      {/* Main Content - Full Width Sections */}
      <main className="relative">
        {/* Section 1: Big Numbers */}
        <section className="py-16 px-6 md:px-12">
          <div className="max-w-6xl mx-auto">
            <SectionDivider
              title="الأرقام الرئيسية"
              subtitle="المؤشرات الأساسية في لمحة سريعة"
              icon={TrendingUp}
              color="primary"
            />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-8">
              {keyNumbers.map((num, index) => (
                <BigNumber
                  key={num.label}
                  value={num.value}
                  label={num.label}
                  suffix={num.suffix}
                  color={num.color}
                  size="md"
                  delay={index * 0.1}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Section 2: Key Insight Highlight */}
        <section className="py-12 px-6 md:px-12 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <KeyInsight
              text="التحول الرقمي والتنويع الاقتصادي يمثلان ركيزتين أساسيتين في مسيرة المملكة نحو اقتصاد مستدام ومزدهر"
              variant="gradient"
            />
          </div>
        </section>

        {/* Section 3: Progress & Distribution */}
        <section className="py-16 px-6 md:px-12">
          <div className="max-w-6xl mx-auto">
            <SectionDivider
              title="التوزيع الجغرافي"
              subtitle="الانتشار على مستوى المنطقة"
              icon={Globe}
              color="accent"
            />
            
            <div className="grid md:grid-cols-2 gap-8 mt-8">
              <ProgressBlock
                title="نسبة الانتشار حسب الدولة"
                items={progressData}
                delay={0.2}
              />
              
              <DonutChart
                title="توزيع القطاعات"
                data={chartData}
                centerValue={chartData.reduce((sum, d) => sum + d.value, 0)}
                centerLabel="إجمالي"
                size="md"
                delay={0.3}
              />
            </div>
          </div>
        </section>

        {/* Section 4: Data Cards */}
        <section className="py-16 px-6 md:px-12 bg-gradient-to-br from-indigo-50/50 to-violet-50/50 dark:from-indigo-950/20 dark:to-violet-950/20">
          <div className="max-w-6xl mx-auto">
            <SectionDivider
              title="الإنجازات والمستهدفات"
              subtitle="أبرز المحطات في مسيرة التطوير"
              icon={Target}
              color="success"
            />
            
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              {dataCards.map((card, index) => (
                <DataCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  description={card.description}
                  icon={card.icon}
                  delay={index * 0.1}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Section 5: Timeline */}
        <section className="py-16 px-6 md:px-12">
          <div className="max-w-4xl mx-auto">
            <SectionDivider
              title="المراحل الزمنية"
              subtitle="رحلة التطور والنمو"
              icon={Clock}
              color="primary"
            />
            
            <div className="mt-8">
              <Timeline
                events={timelineEvents}
                delay={0.2}
              />
            </div>
          </div>
        </section>

        {/* Section 6: Additional Key Insights */}
        <section className="py-16 px-6 md:px-12 bg-muted/30">
          <div className="max-w-6xl mx-auto">
            <SectionDivider
              title="رؤى إضافية"
              subtitle="تحليلات ومعطيات"
              icon={Zap}
              color="danger"
            />
            
            <div className="grid md:grid-cols-2 gap-6 mt-8">
              <KeyInsight
                text="القطاع غير النفطي يسجل نمواً بنسبة ٤.٧٪ متجاوزاً التوقعات الأولية"
                variant="highlight"
              />
              <KeyInsight
                text="الاستثمارات الأجنبية المباشرة تتضاعف ثلاث مرات مقارنة بالعام الماضي"
                variant="quote"
                author="تقرير البنك الدولي"
              />
            </div>
          </div>
        </section>

        {/* Section 7: Final Quote */}
        <section className="py-16 px-6 md:px-12">
          <div className="max-w-4xl mx-auto">
            <KeyInsight
              text="هذه البيانات تعكس التزاماً راسخاً بتحقيق أهداف التنمية المستدامة وبناء اقتصاد متنوع ومزدهر يخدم الأجيال القادمة"
              author="تحليل سبق الذكية"
              variant="quote"
            />
          </div>
        </section>

        {/* Footer branding */}
        <motion.footer
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="py-12 px-6"
        >
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <BarChart3 className="w-5 h-5" />
              <span className="text-sm font-medium">
                إنفوجرافيك من سبق الذكية
              </span>
            </div>
            
            <Link href="/">
              <Button variant="outline" size="sm" data-testid="button-back-home">
                <ArrowRight className="w-4 h-4 ml-2" />
                العودة للرئيسية
              </Button>
            </Link>
          </div>
        </motion.footer>
      </main>
    </div>
  );
}
