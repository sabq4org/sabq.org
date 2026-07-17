/**
 * معاينة صفحة شرح نظام الولاء — للاطلاع فقط.
 * الهوية: غلاف سبق التسويقي. القيم مقترحة (ولاء ون: 500 نقطة = 1 ر.س)
 * وقصة الاكتساب: «10 مقالات ≈ 1 ريال» — ليست الإنتاج الحالي.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Heart,
  MessageCircle,
  Share2,
  Sparkles,
  Trophy,
  LogIn,
  Gift,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { formatDecimal, formatNumber } from "@/lib/format";

const POINTS_PER_SAR = 500;

/**
 * قيم مقترحة v2 — هدف الإحساس:
 * 10 مقالات × 50 = 500 نقطة = 1 ريال بالضبط.
 */
const PREVIEW = {
  login: 100,
  read: 50,
  deep: 100,
  like: 25,
  share: 150,
  comment: 75,
  welcome: 5000,
} as const;

const AI_LINES = [
  "خلّني أكون صريح معك…",
  "ما نبيك تجمع هللات. نبيك تحس إن قراءتك لها وزن.",
  "اقرأ 10 مقالات = 500 نقطة = 1 ريال تستبدله عبر ولاء ون.",
  "وكل ما تدخل يوميًا وتشارك… المحفظة تكبر أسرع.",
];

const EARN: {
  icon: typeof BookOpen;
  title: string;
  pts: number;
  hint: string;
  highlight?: boolean;
}[] = [
  {
    icon: BookOpen,
    title: "قراءة مقال",
    pts: PREVIEW.read,
    hint: "10 مقالات = 1 ريال",
    highlight: true,
  },
  {
    icon: Sparkles,
    title: "قراءة عميقة",
    pts: PREVIEW.deep,
    hint: "تتعمّق دقيقة فأكثر — تضاعف القيمة",
  },
  {
    icon: LogIn,
    title: "دخول يومي",
    pts: PREVIEW.login,
    hint: "عادة بسيطة… كل صباح",
  },
  {
    icon: Share2,
    title: "مشاركة خبر",
    pts: PREVIEW.share,
    hint: "توصل سبق لغيرك",
  },
  {
    icon: MessageCircle,
    title: "تعليق",
    pts: PREVIEW.comment,
    hint: "رأيك جزء من الصحيفة",
  },
  {
    icon: Heart,
    title: "إعجاب",
    pts: PREVIEW.like,
    hint: "تفاعل سريع",
  },
];

export default function LoyaltyPreview() {
  const reduceMotion = useReducedMotion();
  const { user, isAuthenticated } = useAuth();
  const [aiStep, setAiStep] = useState(0);
  const [articles, setArticles] = useState(10);
  const [deepReads, setDeepReads] = useState(3);
  const [shares, setShares] = useState(1);

  useEffect(() => {
    document.title = "نظام الولاء — معاينة | سبق";
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      setAiStep(AI_LINES.length - 1);
      return;
    }
    if (aiStep >= AI_LINES.length - 1) return;
    const t = window.setTimeout(() => setAiStep((s) => s + 1), 2000);
    return () => window.clearTimeout(t);
  }, [aiStep, reduceMotion]);

  const deepClamped = Math.min(deepReads, articles);
  const daily = useMemo(() => {
    // القراءة العميقة تستبدل قيمة القراءة العادية لنفس المقال
    const readPts =
      (articles - deepClamped) * PREVIEW.read + deepClamped * PREVIEW.deep;
    const pts = PREVIEW.login + readPts + shares * PREVIEW.share;
    const sarDay = pts / POINTS_PER_SAR;
    return { pts, sarDay, sarMonth: sarDay * 30 };
  }, [articles, deepClamped, shares]);

  const ctaHref = isAuthenticated ? "/dashboard/loyalty" : "/register";
  const ctaLabel = isAuthenticated ? "افتح محفظة نقاطي" : "اشترك الآن وابدأ الاكتساب";

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div className="bg-amber-500/10 border-b border-amber-500/25 text-center text-xs sm:text-sm py-2 px-3 text-amber-800 dark:text-amber-200">
          معاينة للاطلاع فقط — قيم مقترحة قيد المراجعة، ليست الإصدار النهائي
        </div>

        {/* Hero */}
        <section className="text-center px-4 pt-10 pb-8 md:pt-16 md:pb-12">
          <span className="inline-flex items-center gap-1.5 max-w-full text-[11px] md:text-[13px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-3 md:px-5 py-1 md:py-1.5 mb-4 md:mb-5">
            <Trophy className="w-3.5 h-3.5" aria-hidden="true" />
            نظام الولاء في سبق · بالشراكة مع ولاء ون
          </span>
          <motion.h1
            className="text-2xl sm:text-3xl md:text-5xl font-extrabold leading-[1.35] max-w-3xl mx-auto text-balance"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            اقرأ 10 مقالات.
            <br />
            <span className="text-primary">اكسب 1 ريال.</span>
          </motion.h1>
          <p className="text-muted-foreground text-sm md:text-lg max-w-2xl mx-auto mt-3 md:mt-4 leading-relaxed">
            مو هللات بعد يوم كامل. قصة واضحة: كل 500 نقطة = 1 ريال تستبدله لدى مزودي ولاء ون.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6 md:mt-8">
            <Button asChild size="lg" className="font-bold text-base px-6">
              <Link href={ctaHref}>{ctaLabel}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="font-bold">
              <a href="#loy-math">وضّح لي الحساب</a>
            </Button>
            <Button asChild variant="ghost" size="lg" className="font-bold text-muted-foreground">
              <Link href="/loyalty-terms">شروط الولاء</Link>
            </Button>
          </div>
        </section>

        {/* القصة الرئيسية — 10 = 1 */}
        <section
          id="loy-math"
          className="bg-[#0E1620] text-white border-y border-[#1B2732]"
          aria-labelledby="loy-hook-title"
        >
          <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
            <p className="text-primary text-xs md:text-sm font-bold mb-2 tracking-wide text-center">
              الحساب اللي يهمك
            </p>
            <h2 id="loy-hook-title" className="text-xl md:text-2xl font-extrabold mb-8 text-center">
              ثلاثة أرقام… وتفهم النظام
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
              <div className="rounded-xl border border-[#1B2732] bg-[#121C28] p-5 text-center">
                <div className="text-3xl md:text-4xl font-extrabold text-primary tabular-nums">10</div>
                <div className="text-slate-300 text-sm mt-2 font-bold">مقالات تقرأها</div>
                <div className="text-slate-500 text-xs mt-1">× 50 نقطة لكل مقال</div>
              </div>
              <div className="rounded-xl border border-[#1B2732] bg-[#121C28] p-5 text-center">
                <div className="text-3xl md:text-4xl font-extrabold text-white tabular-nums">500</div>
                <div className="text-slate-300 text-sm mt-2 font-bold">نقطة في محفظتك</div>
                <div className="text-slate-500 text-xs mt-1">تتجمّع باسمك</div>
              </div>
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-center">
                <div className="text-3xl md:text-4xl font-extrabold text-amber-400 tabular-nums">1</div>
                <div className="text-amber-100 text-sm mt-2 font-bold">ريال سعودي</div>
                <div className="text-amber-200/60 text-xs mt-1">تستبدله عبر ولاء ون</div>
              </div>
            </div>

            <p className="text-slate-400 text-sm text-center mt-6 max-w-lg mx-auto leading-relaxed">
              ودخولك اليومي وحدَه = <b className="text-white">100 نقطة</b>.
              ومكافأة أول اشتراك = <b className="text-amber-400">10 ريال جاهزة</b> (5,000 نقطة).
            </p>
          </div>
        </section>

        {/* حوار */}
        <section className="px-4 py-10 md:py-14">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-lg md:text-2xl font-extrabold text-center mb-6">بكلام القارئ… مو بلغة النظام</h2>
            <div className="space-y-3" aria-live="polite">
              <AnimatePresence mode="popLayout">
                {AI_LINES.slice(0, aiStep + 1).map((line, i) => (
                  <motion.div
                    key={line}
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 rounded-xl border border-border bg-card p-3.5 md:p-4"
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <p className="text-sm md:text-[15px] leading-relaxed pt-1">
                      {i === 0 && user?.firstName ? `${user.firstName}، ${line}` : line}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </section>

        {/* جدول الاكتساب — نقاط كبيرة، بدون هللات محبطة */}
        <section className="bg-muted/30 border-y border-border px-4 py-10 md:py-14">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-lg md:text-2xl font-extrabold text-center mb-1">كيف تكسب؟</h2>
            <p className="text-xs md:text-sm text-muted-foreground text-center mb-6 md:mb-8">
              نعرض النقاط كما هي — والريال يظهر لما توصل لهدف واضح
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
              {EARN.map((item) => (
                <div
                  key={item.title}
                  className={`rounded-xl border bg-card p-3 md:p-4 min-w-0 transition-colors hover:border-primary ${
                    item.highlight ? "border-primary/40 ring-1 ring-primary/20" : "border-border"
                  }`}
                >
                  <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="w-[18px] h-[18px]" aria-hidden="true" />
                  </span>
                  <h3 className="text-[13px] md:text-[15px] font-extrabold leading-snug">{item.title}</h3>
                  <p className="text-[11px] md:text-[13px] text-muted-foreground mt-0.5 mb-2">{item.hint}</p>
                  <span className="text-lg md:text-xl font-extrabold text-primary tabular-nums">
                    +{formatNumber(item.pts)}
                  </span>
                  <span className="text-[11px] text-muted-foreground ms-1">نقطة</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex gap-3 items-start">
              <Gift className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <div className="font-extrabold text-sm md:text-base">هدية الانضمام</div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  أول ما تكمل ملفك:{" "}
                  <b className="text-foreground">
                    +{formatNumber(PREVIEW.welcome)} نقطة = {formatNumber(PREVIEW.welcome / POINTS_PER_SAR)} ريال
                  </b>{" "}
                  مباشرة في المحفظة.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* حاسبة — افتراضي 10 مقالات عشان يشوف ريال */}
        <section className="px-4 py-10 md:py-14">
          <div className="max-w-xl mx-auto">
            <h2 className="text-lg md:text-2xl font-extrabold text-center mb-1">جرّب يومك</h2>
            <p className="text-xs md:text-sm text-muted-foreground text-center mb-6">
              الافتراضي: 10 مقالات — عشان تشوف الريال قدامك
            </p>

            <div
              className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-5"
              role="group"
              aria-label="محاكاة اكتساب يومي"
            >
              <label className="block space-y-2">
                <span className="flex justify-between text-sm text-muted-foreground">
                  مقالات أقرأها <b className="text-foreground tabular-nums">{articles}</b>
                </span>
                <input
                  type="range"
                  min={1}
                  max={15}
                  value={articles}
                  onChange={(e) => setArticles(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-2">
                <span className="flex justify-between text-sm text-muted-foreground">
                  منها قراءة عميقة <b className="text-foreground tabular-nums">{deepClamped}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.min(articles, 10)}
                  value={deepClamped}
                  onChange={(e) => setDeepReads(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>
              <label className="block space-y-2">
                <span className="flex justify-between text-sm text-muted-foreground">
                  مشاركات <b className="text-foreground tabular-nums">{shares}</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  value={shares}
                  onChange={(e) => setShares(Number(e.target.value))}
                  className="w-full accent-primary"
                />
              </label>

              <div className="rounded-lg bg-primary/10 border border-primary/25 p-4 text-center">
                <div className="text-xs text-muted-foreground mb-1">يومك ≈</div>
                <div className="text-3xl md:text-4xl font-extrabold text-primary tabular-nums">
                  {daily.sarDay >= 1
                    ? `${daily.sarDay % 1 === 0 ? formatNumber(daily.sarDay) : formatDecimal(daily.sarDay, 1)} ر.س`
                    : `${formatNumber(Math.round(daily.pts))} نقطة`}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {formatNumber(daily.pts)} نقطة
                  {daily.sarDay < 1
                    ? ` — باقي ${formatNumber(POINTS_PER_SAR - daily.pts)} نقطة لتكمل ريالًا`
                    : " تستبدلها عبر ولاء ون"}
                </div>
                <div className="mt-3 pt-3 border-t border-primary/20 text-sm">
                  لو كرّرتها شهرًا:{" "}
                  <b className="text-foreground text-base">≈ {formatNumber(Math.round(daily.sarMonth))} ر.س</b>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ختام */}
        <section className="bg-[#0E1620] text-white px-4 py-12 md:py-16 text-center">
          <h2 className="text-xl md:text-3xl font-extrabold mb-3">قراءتك تستاهل أكثر من هللة</h2>
          <p className="text-slate-300 text-sm md:text-base max-w-md mx-auto mb-6 leading-relaxed">
            اشترك، اقرأ، اجمع — واستبدل عبر ولاء ون. العضوية هي مفتاح المحفظة.
          </p>
          <Button asChild size="lg" className="font-bold text-base px-8">
            <Link href={ctaHref}>
              {isAuthenticated ? "إلى محفظتي" : "أنشئ عضويتك مجانًا"}
            </Link>
          </Button>
          <p className="text-slate-500 text-xs mt-6">
            بالمشاركة فأنت توافق على{" "}
            <Link href="/loyalty-terms" className="text-slate-300 underline underline-offset-2 hover:text-white">
              شروط وأحكام برنامج الولاء
            </Link>
            {" "}— وتشمل علاقة الاستبدال مع ولاء ون.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}
