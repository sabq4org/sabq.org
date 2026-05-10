import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Users,
  Building2,
  Coins,
  Globe,
  Zap,
  Target,
  Clock,
  BarChart3,
  PieChart,
  LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ArticleWithDetails } from "@shared/schema";
import { HeroHeader } from "./HeroHeader";
import { BigNumber } from "./BigNumber";
import { DataCard } from "./DataCard";
import { ProgressBlock } from "./ProgressBlock";
import { DonutChart } from "./DonutChart";
import { Timeline } from "./Timeline";
import { KeyInsight } from "./KeyInsight";
import { SectionDivider } from "./SectionDivider";

interface DataInfographicPageProps {
  article: ArticleWithDetails;
  onShare?: () => void;
  onBookmark?: () => void;
  onReact?: () => void;
  hasReacted?: boolean;
  isBookmarked?: boolean;
  shortLink?: string;
}

// Example data structure - this would come from article content in production
interface InfographicData {
  keyInsight: string;
  numbers: Array<{
    value: number;
    label: string;
    suffix?: string;
    prefix?: string;
    color?: "primary" | "accent" | "success" | "warning" | "danger" | "info";
  }>;
  progressItems: Array<{
    label: string;
    value: number;
    maxValue?: number;
  }>;
  chartData: Array<{
    label: string;
    value: number;
  }>;
  timeline: Array<{
    date: string;
    title: string;
    description?: string;
  }>;
  cards: Array<{
    title: string;
    value?: string | number;
    description?: string;
  }>;
}

function parseInfographicData(article: ArticleWithDetails): InfographicData {
  // Parse structured data from article.infographicData if available
  const infographicData = article.infographicData as any;
  
  if (infographicData) {
    return {
      keyInsight: infographicData.keyInsight?.text || article.aiSummary || article.excerpt || "البيانات توضح تطوراً ملحوظاً في المؤشرات الرئيسية خلال الفترة الأخيرة",
      numbers: infographicData.bigNumbers?.map((n: any) => ({
        value: n.value,
        label: n.label,
        suffix: n.suffix,
        prefix: n.prefix,
        color: n.color || "primary",
      })) || [],
      progressItems: infographicData.progressBars?.map((p: any) => ({
        label: p.label,
        value: p.value,
        maxValue: p.max || 100,
      })) || [],
      chartData: infographicData.donutChart?.segments?.map((s: any) => ({
        label: s.label,
        value: s.value,
      })) || [],
      timeline: infographicData.timeline?.map((t: any) => ({
        date: t.year,
        title: t.title,
        description: t.description,
      })) || [],
      cards: infographicData.dataCards?.map((c: any) => ({
        title: c.title,
        value: c.value,
        description: c.description,
      })) || [],
    };
  }
  
  // Fallback sample data when no structured data exists
  return {
    keyInsight: article.aiSummary || article.excerpt || "البيانات توضح تطوراً ملحوظاً في المؤشرات الرئيسية خلال الفترة الأخيرة",
    numbers: [
      { value: 2500000, label: "إجمالي المستخدمين", suffix: "+", color: "primary" },
      { value: 85, label: "نسبة النمو", suffix: "%", color: "success" },
      { value: 150, label: "دولة مستهدفة", color: "info" },
      { value: 45, label: "مليار ريال", prefix: "", color: "accent" },
    ],
    progressItems: [
      { label: "المملكة العربية السعودية", value: 85, maxValue: 100 },
      { label: "الإمارات العربية المتحدة", value: 72, maxValue: 100 },
      { label: "مصر", value: 65, maxValue: 100 },
      { label: "الكويت", value: 58, maxValue: 100 },
      { label: "قطر", value: 45, maxValue: 100 },
    ],
    chartData: [
      { label: "التقنية", value: 35 },
      { label: "الصحة", value: 25 },
      { label: "التعليم", value: 20 },
      { label: "الترفيه", value: 12 },
      { label: "أخرى", value: 8 },
    ],
    timeline: [
      { date: "يناير ٢٠٢٤", title: "إطلاق المرحلة الأولى", description: "بدء التشغيل التجريبي في ثلاث مدن رئيسية" },
      { date: "مارس ٢٠٢٤", title: "التوسع الإقليمي", description: "الوصول إلى ١٠ مدن جديدة" },
      { date: "يونيو ٢٠٢٤", title: "شراكات استراتيجية", description: "توقيع اتفاقيات مع ٥ شركات عالمية" },
      { date: "سبتمبر ٢٠٢٤", title: "الإطلاق الكامل", description: "التغطية الشاملة على مستوى المنطقة" },
    ],
    cards: [
      { title: "الاستثمارات الجديدة", value: "12.5 مليار", description: "تدفقات رأس المال الأجنبي" },
      { title: "فرص العمل", value: "50,000+", description: "وظائف جديدة متوقعة" },
      { title: "المشاريع المعتمدة", value: 245, description: "مشروع تحت التنفيذ" },
    ],
  };
}

export function DataInfographicPage({
  article,
  onShare,
  onBookmark,
  onReact,
  hasReacted,
  isBookmarked,
  shortLink,
}: DataInfographicPageProps) {
  const data = parseInfographicData(article);
  const infographicData = article.infographicData as any;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero Header */}
      <HeroHeader
        title={article.title}
        subtitle={article.excerpt || undefined}
        keyInsight={data.keyInsight}
        category={article.category?.nameAr}
        date={article.publishedAt || article.createdAt}
        views={article.views || 0}
        onShare={onShare}
        onBookmark={onBookmark}
        onReact={onReact}
        hasReacted={hasReacted}
        isBookmarked={isBookmarked}
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
              {data?.numbers?.map((num, index) => (
                <BigNumber
                  key={num.label}
                  value={num.value}
                  label={num.label}
                  suffix={num.suffix}
                  prefix={num.prefix}
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
              text={data.keyInsight}
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
                items={data.progressItems}
                delay={0.2}
              />
              
              <DonutChart
                title="توزيع القطاعات"
                data={data.chartData}
                centerValue={data?.chartData?.reduce((sum, d) => sum + d.value, 0)}
                centerLabel="إجمالي"
                size="md"
                delay={0.3}
              />
            </div>
          </div>
        </section>

        {/* Section 4: Data Cards */}
        <section className="py-16 px-6 md:px-12 bg-primary/5 dark:bg-primary/10">
          <div className="max-w-6xl mx-auto">
            <SectionDivider
              title="الإنجازات والمستهدفات"
              subtitle="أبرز المحطات في مسيرة التطوير"
              icon={Target}
              color="success"
            />
            
            <div className="grid md:grid-cols-3 gap-6 mt-8">
              {data?.cards?.map((card, index) => (
                <DataCard
                  key={card.title}
                  title={card.title}
                  value={card.value}
                  description={card.description}
                  icon={index === 0 ? Coins : index === 1 ? Users : Building2}
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
                events={data?.timeline?.map((event, i) => ({
                  ...event,
                  color: i === data.timeline.length - 1 ? "success" : "primary",
                }))}
                delay={0.2}
              />
            </div>
          </div>
        </section>

        {/* Section 6: Final Insight */}
        <section className="py-16 px-6 md:px-12 bg-muted/30">
          <div className="max-w-4xl mx-auto">
            <KeyInsight
              text="هذه البيانات تعكس التزاماً راسخاً بتحقيق أهداف التنمية المستدامة وبناء اقتصاد متنوع ومزدهر"
              author="تحليل سبق الذكية"
              variant="quote"
            />
          </div>
        </section>

        {/* Footer branding with Sabq logo */}
        <motion.footer
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="py-12 px-6"
        >
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-3">
                <img 
                  src="/branding/sabq-logo.png" 
                  alt="سبق" 
                  className="h-8 w-auto"
                />
                <div className="h-6 w-px bg-border" />
                <div className="flex items-center gap-2 text-muted-foreground">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">
                    إنفوجرافيك بياني
                  </span>
                </div>
              </div>
              {infographicData?.source && (
                <p className="text-xs text-muted-foreground">
                  المصدر: {infographicData.source}
                </p>
              )}
              {infographicData?.lastUpdated && (
                <p className="text-xs text-muted-foreground/70">
                  آخر تحديث: {infographicData.lastUpdated}
                </p>
              )}
            </div>
          </div>
        </motion.footer>
      </main>
    </div>
  );
}
