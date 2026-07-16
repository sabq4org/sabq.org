import { Link } from "wouter";
import {
  BarChart3,
  Brain,
  Check,
  Clock,
  Lightbulb,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface GuestValue {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface GuestCopy {
  heroTitle: string;
  heroDescription: string;
  registerLabel: string;
  loginLabel: string;
  registerHref: string;
  loginHref: string;
  values: GuestValue[];
  benefitsTitle: string;
  benefits: string[];
}

const GUEST_COPY: Record<"ar" | "en", GuestCopy> = {
  ar: {
    heroTitle: "موجزك اليومي، مصمَّم لك بالذكاء الاصطناعي",
    heroDescription: "سجّل مجاناً ليحلّل سبق قراءتك ويقترح لك ما يناسبك كل يوم.",
    registerLabel: "إنشاء حساب مجاني",
    loginLabel: "تسجيل الدخول",
    registerHref: "/register",
    loginHref: "/login",
    values: [
      { icon: Brain, title: "تحليل اهتماماتك", description: "نقرأ سلوكك القرائي لنفهم ما يهمك فعلاً." },
      { icon: BarChart3, title: "إحصاءات يومية شخصية", description: "مقالاتك ودقائقك ومعدل إكمالك في لوحة واحدة." },
      { icon: Lightbulb, title: "اقتراحات ذكية", description: "مقالات مختارة لك بناءً على مزاجك واهتماماتك." },
      { icon: Clock, title: "إيقاعك الزمني", description: "اكتشف أفضل أوقات قراءتك وطوّر عادتك اليومية." },
    ],
    benefitsTitle: "بعد التسجيل تحصل على",
    benefits: [
      "تحية شخصية باسمك كل يوم",
      "تقرير مزاجك القرائي مع تفسيره",
      "نسبة تركيزك وهدف يومي مقترح",
      "رسم نشاطك على مدار الساعة",
      "اقتراحات مقالات بصور تناسب ذوقك",
    ],
  },
  en: {
    heroTitle: "Your daily brief, designed for you by AI",
    heroDescription: "Sign up free and let Sabq analyze your reading and suggest what fits you, every day.",
    registerLabel: "Create free account",
    loginLabel: "Sign in",
    registerHref: "/en/register",
    loginHref: "/en/login",
    values: [
      { icon: Brain, title: "Interest analysis", description: "We read your reading behavior to learn what truly matters to you." },
      { icon: BarChart3, title: "Personal daily stats", description: "Your articles, minutes, and completion rate in one place." },
      { icon: Lightbulb, title: "Smart suggestions", description: "Articles picked for you based on your mood and interests." },
      { icon: Clock, title: "Your time rhythm", description: "Discover your best reading times and build your daily habit." },
    ],
    benefitsTitle: "After signing up you get",
    benefits: [
      "A personal greeting with your name every day",
      "Your reading mood report with its explanation",
      "Your focus score and a suggested daily goal",
      "A chart of your around-the-clock activity",
      "Article suggestions with images that match your taste",
    ],
  },
};

/** صفحة هبوط حالة الضيف في الموجز اليومي (§14): Hero تسويقي + شبكة قيم 2×2 + قائمة مزايا. */
export function GuestBriefLanding({ locale }: { locale: "ar" | "en" }) {
  const copy = GUEST_COPY[locale];

  return (
    <div className="space-y-6 md:space-y-8">
      <Card
        className="border-0 bg-ai-gradient-soft shadow-sm dark:border dark:border-card-border"
        data-testid="guest-hero"
      >
        <CardContent className="p-8 md:p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 text-2xl md:text-3xl font-bold" data-testid="guest-hero-title">
            {copy.heroTitle}
          </h2>
          <p
            className="mx-auto mt-2 max-w-xl text-sm md:text-base text-muted-foreground"
            data-testid="guest-hero-description"
          >
            {copy.heroDescription}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button asChild data-testid="button-guest-register">
              <Link href={copy.registerHref}>
                <UserPlus className="h-4 w-4" />
                {copy.registerLabel}
              </Link>
            </Button>
            <Button variant="outline" asChild data-testid="button-guest-login">
              <Link href={copy.loginHref}>{copy.loginLabel}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="scroll-fade-in grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        {copy.values.map((value, index) => (
          <Card
            key={index}
            className="border-0 shadow-sm dark:border dark:border-card-border"
            data-testid={`guest-value-${index}`}
          >
            <CardContent className="p-4 md:p-6">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <value.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 font-semibold">{value.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{value.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm dark:border dark:border-card-border" data-testid="guest-benefits">
        <CardContent className="p-6 md:p-8">
          <h3 className="font-semibold text-lg">{copy.benefitsTitle}</h3>
          <ul className="mt-4 space-y-3">
            {copy.benefits.map((benefit, index) => (
              <li key={index} className="flex items-center gap-3 text-sm md:text-base">
                <Check className="h-4 w-4 shrink-0 text-primary" />
                {benefit}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
