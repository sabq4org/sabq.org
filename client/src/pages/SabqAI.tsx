/**
 * عقل سبق — /sabq-ai (و/about-ai يحوّل إليه).
 *
 * صفحة تعريفية عامة بمنظومة الذكاء الاصطناعي في سبق: أول صحيفة سعودية وعربية
 * تدمج الذكاء في كامل دورة العمل التحريري. التركيب المعتمد من المالك:
 * بنية «من الإشارة إلى القصة» (خط إنتاج من خمس محطات، «عين المحرر» محطة
 * إجبارية بارزة) + ميثاق الذكاء الاصطناعي بثماني مواد + شريط «من داخل المنظومة».
 *
 * قاعدة مصداقية ملزمة: لا أرقام لحظية وهمية. قسم «الأرقام تتحدث» يقرأ
 * أرقامه من /api/public/ai-stats (استعلامات إنتاج حقيقية بكاش 5 دقائق)؛
 * وإن تعذّر الجلب لأي سبب يظهر شريط الحقائق الثابتة بدلًا منه — لا تقدير
 * ولا اختلاق.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ArrowDown,
  ArrowLeft,
  BadgeCheck,
  Brain,
  Eye,
  Gauge,
  Image as ImageIcon,
  Languages,
  Layers,
  Mic,
  Newspaper,
  PenLine,
  Satellite,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";

/** عبارات شريط «من داخل المنظومة» — قدرات حقيقية بصيغة وصفية، لا أحداث لحظية */
const TICKER_ITEMS: { tag: string; text: string }[] = [
  { tag: "رياضة", text: "تقرير المباراة يصدر بعد دقائق من صافرة النهاية — بعد إجازة المحرر" },
  { tag: "الرادار", text: "رصد المصادر العالمية وتقييم أهمية الخبر وتحويل المهم إلى مسودة عربية" },
  { tag: "صوت", text: "نشرات صوتية تُنتج بأصوات عربية وتُدقّق قبل بثّها" },
  { tag: "لغات", text: "النسخ الإنجليزية والأردية تصدر من المنظومة نفسها بعد التدقيق" },
  { tag: "عُمق", text: "تحليلات معمّقة تُبنى بعدة نماذج وتُراجع تحريريًا قبل النشر" },
  { tag: "مباشر", text: "تعليق المباريات يُعرّب لحظة بلحظة من بيانات المباراة الرسمية" },
];

/** محطات خط الإنتاج — «عين المحرر» محطة قرار بشري لا تُتجاوز */
const PIPELINE = [
  { icon: Satellite, title: "رصد الإشارة", desc: "وكالات، مصادر عالمية، بيانات المباريات الرسمية", human: false },
  { icon: Brain, title: "فهم وتقييم", desc: "تصنيف آلي، درجة أهمية، تحقق من البيانات", human: false },
  { icon: PenLine, title: "صياغة سبق", desc: "عربية أولًا، بأسلوب الدار — وبلا معلومة مخترعة", human: false },
  { icon: Eye, title: "عين المحرر", desc: "مراجعة وإجازة أو ردّ — لا استثناءات", human: true },
  { icon: Send, title: "النشر والقياس", desc: "ويب وتطبيقات وصوت بثلاث لغات، وقياس مستمر للجودة", human: false },
];

const STATS = [
  { value: "5", label: "بطولات تُغطّى بمحرّكات آلية" },
  { value: "3", label: "لغات نشر من منظومة واحدة" },
  { value: "100%", label: "من المواد بمسؤولية تحريرية بشرية" },
];

const TOURNAMENTS = [
  { label: "كأس العالم 2026", href: "/world-cup" },
  { label: "كأس آسيا 2027", href: "/asian-cup" },
  { label: "خليجي 27", href: "/gulf-cup" },
  { label: "دوري روشن", href: "/roshn" },
  { label: "كأس الملك", href: "/kings-cup" },
];

const SPORT_FACTS = [
  { value: "دقائق", label: "تقرير المباراة يصدر بعد صافرة النهاية بدقائق معدودة" },
  { value: "معاينات", label: "معاينة ذكية قبل كل مباراة: أرقام المواجهات والتشكيلة المتوقعة" },
  { value: "لحظي", label: "تعليق المباريات يُعرّب فور وقوع الحدث" },
  { value: "0", label: "معلومة مخترعة — المصدر بيانات المباراة الرسمية فقط" },
];

const SERVICE_DOMAINS = [
  { icon: Newspaper, label: "التحرير الذكي", count: 9 },
  { icon: Trophy, label: "الرياضة اللحظية", count: 9 },
  { icon: Mic, label: "الأخبار المسموعة", count: 6 },
  { icon: ImageIcon, label: "الاستوديو البصري", count: 6 },
  { icon: Sparkles, label: "التخصيص", count: 6 },
  { icon: ShieldCheck, label: "الجودة والإشراف", count: 5 },
  { icon: Languages, label: "اللغات", count: 2 },
  { icon: Gauge, label: "البنية الذكية", count: 2 },
];

const TOTAL_SMART_SERVICES = SERVICE_DOMAINS.reduce((total, domain) => total + domain.count, 0);

/** ميثاق سبق للذكاء الاصطناعي — ثماني مواد معتمدة من الإدارة */
const CHARTER = [
  { no: "1", title: "الإنسان يقرّر", desc: "كل مادة تمرّ بمسؤولية تحريرية بشرية، قبل النشر وبعده." },
  { no: "2", title: "لا اختلاق", desc: "النموذج يصوغ من بيانات ومصادر موثّقة فقط، ولا يضيف معلومة من عنده." },
  { no: "3", title: "الشفافية", desc: "نُبيّن للقارئ دور الذكاء حيث يكون جوهريًا في إنتاج المادة." },
  { no: "4", title: "الرأي للإنسان", desc: "الذكاء لا يكتب رأيًا ولا يتبنّى موقفًا؛ الموقف لكتّابنا." },
  { no: "5", title: "مسؤوليتنا كاملة", desc: "سبق تتحمّل مسؤولية كل ما تنشره، أيًّا كانت الأداة." },
  { no: "6", title: "خصوصية القارئ", desc: "بيانات القرّاء تُستخدم لخدمتهم، ولا شيء غير ذلك." },
  { no: "7", title: "قياس دائم", desc: "جودة كل نموذج وتكلفته تُراقبان عبر بوابة موحّدة، والأفضل يبقى." },
  { no: "8", title: "عربيةٌ أولًا", desc: "نُطوّع النماذج للغة العربية وسياقها السعودي — لا العكس." },
];

function Ticker() {
  return (
    <div className="flex items-center overflow-hidden bg-[#0E1620] border-y border-[#1B2732]" aria-hidden="true">
      <span className="relative z-10 shrink-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-2">
        من داخل المنظومة
      </span>
      {/* غلاف overflow-hidden مستقل: transform الحزام يرسم خارج صندوقه فينزلق فوق التسمية بدونه */}
      <div className="flex-1 overflow-hidden">
        <div className="sabqai-belt flex whitespace-nowrap">
          {[0, 1].map((half) => (
            <div key={half} className="flex shrink-0">
              {TICKER_ITEMS.map((item, i) => (
                <span key={i} className="text-[13px] text-slate-300 py-2 pe-12 inline-flex items-center gap-2">
                  <b className="text-primary font-bold">{item.tag}</b>
                  {item.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .sabqai-belt { animation: sabqai-belt 60s linear infinite; }
        @keyframes sabqai-belt { from { transform: translateX(0); } to { transform: translateX(50%); } }
        @media (prefers-reduced-motion: reduce) { .sabqai-belt { animation: none; } }
      `}</style>
    </div>
  );
}

function Hero() {
  return (
    <section className="text-center px-4 pt-14 pb-10 md:pt-20 md:pb-14">
      <span className="inline-block text-xs md:text-[13px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-5 py-1.5 mb-5">
        عقل سبق — أول منظومة ذكاء تحريري متكاملة في صحيفة سعودية وعربية
      </span>
      <h1 className="text-3xl md:text-5xl font-extrabold leading-[1.4] max-w-3xl mx-auto text-balance">
        من الإشارة الأولى إلى القصة المنشورة…
        <br />
        <span className="text-primary">في دقائق، وبقرار بشري</span>
      </h1>
      <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto mt-4">
        هكذا يعمل الذكاء الاصطناعي في سبق: خط إنتاج واحد يرصد ويحلل ويصوغ —
        ولا يعبر شيء إلى القارئ قبل محطة المحرر.
      </p>
    </section>
  );
}

function Pipeline() {
  return (
    <section className="px-4 pb-4" data-testid="sabqai-pipeline">
      {/* عمودي على الجوال حتى تبقى محطة «عين المحرر» ظاهرة بلا تمرير أفقي */}
      <div className="flex flex-col md:flex-row items-stretch gap-2 max-w-md md:max-w-6xl mx-auto pb-2 pt-3">
        {PIPELINE.map((station, i) => (
          <div key={station.title} className="contents">
            {i > 0 && (
              <>
                <ArrowDown className="w-5 h-5 shrink-0 self-center text-muted-foreground/50 md:hidden" aria-hidden="true" />
                <ArrowLeft className="hidden md:block w-5 h-5 shrink-0 self-center text-muted-foreground/50" aria-hidden="true" />
              </>
            )}
            <div
              className={`relative flex-1 min-w-[150px] rounded-xl border p-4 text-center ${
                station.human
                  ? "border-2 border-emerald-500 bg-emerald-500/5"
                  : "border-border bg-muted/30"
              }`}
            >
              {station.human && (
                <span className="absolute -top-2.5 right-1/2 translate-x-1/2 bg-emerald-600 text-white text-[11px] font-bold rounded-full px-3 py-0.5 whitespace-nowrap">
                  قرار بشري
                </span>
              )}
              <span
                className={`mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg ${
                  station.human ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"
                }`}
              >
                <station.icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className="text-sm font-extrabold mb-1">{station.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{station.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-[13px] text-muted-foreground pt-2">
        المحطة الرابعة ليست شعارًا: <b className="text-emerald-600">كل مسار توليد في المنظومة يمرّ بها إجباريًا.</b>
      </p>
    </section>
  );
}

function StatsBand() {
  return (
    <section className="px-4 py-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-4xl mx-auto">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5 text-center">
            <div className="text-2xl md:text-3xl font-extrabold text-primary tabular-nums" dir="ltr">
              {s.value}
            </div>
            <div className="text-xs md:text-sm text-muted-foreground mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ==================== الأرقام تتحدث — عدّادات حية ==================== */

interface AiPublicStats {
  generatedAt: string;
  ai: {
    totalOps: number;
    todayOps: number;
    totalTokens: number;
    successRate: number;
    sinceDate: string | null;
    daily: { date: string; count: number }[];
  };
  comments: { total: number; aiAnalyzed: number };
  stories: { total: number };
  articles: { totalPublished: number; todayPublished: number };
}

/** عدّاد تصاعدي: يبدأ عند دخوله الشاشة، ويكمل من قيمته الحالية عند كل تحديث */
function CountUp({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [started, setStarted] = useState(false);
  const [display, setDisplay] = useState(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      currentRef.current = value;
      setDisplay(value);
      return;
    }
    const from = currentRef.current;
    const duration = 1400;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const n = from + (value - from) * eased;
      currentRef.current = n;
      setDisplay(n);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, value]);

  return (
    <span ref={ref} className="tabular-nums" dir="ltr">
      {display.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

function formatUpdatedAgo(generatedAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 60000));
  if (minutes < 1) return "قبل لحظات";
  if (minutes === 1) return "قبل دقيقة";
  if (minutes === 2) return "قبل دقيقتين";
  if (minutes <= 10) return `قبل ${minutes} دقائق`;
  return `قبل ${minutes} دقيقة`;
}

function formatArabicDate(isoDate: string, withYear = false): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("ar", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** رسم أعمدة النشاط اليومي — عمود اليوم الجاري مفرّغ لأنه غير مكتمل */
function DailyOpsChart({ daily }: { daily: { date: string; count: number }[] }) {
  const max = Math.max(...daily.map((d) => d.count), 1);
  const maxIndex = daily.findIndex((d) => d.count === max);
  const lastIndex = daily.length - 1;
  return (
    <div className="rounded-xl border border-[#1B2732] bg-white/[.045] p-5 pb-3">
      <h3 className="text-sm font-extrabold">النشاط اليومي للمنظومة — آخر ١٤ يومًا</h3>
      <p className="text-xs text-[#8FA3B4] mb-3.5">
        عدد عمليات الذكاء الاصطناعي المنفّذة يوميًا (المصدر: سجل الاستخدام الموحّد)
      </p>
      <div
        className="flex items-end gap-1 h-28 pt-4"
        dir="ltr"
        role="img"
        aria-label={`رسم أعمدة لعمليات الذكاء الاصطناعي اليومية، الذروة ${max.toLocaleString("en-US")}`}
      >
        {daily.map((d, i) => {
          const isPartial = i === lastIndex;
          const labeled = i === maxIndex || isPartial;
          return (
            <div key={d.date} className="group relative flex-1 flex items-end h-full">
              <div
                className={
                  isPartial
                    ? "w-full rounded-t border-[1.5px] border-b-0 border-primary min-h-[3px]"
                    : "w-full rounded-t bg-primary min-h-[3px] group-hover:opacity-75 transition-opacity"
                }
                style={{ height: `${Math.max(3, Math.round((d.count / max) * 100))}%` }}
              />
              {labeled && (
                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10.5px] font-bold tabular-nums whitespace-nowrap">
                  {d.count.toLocaleString("en-US")}
                </span>
              )}
              <span
                dir="rtl"
                className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-md border border-[#1B2732] bg-[#060A0F] px-2.5 py-1 text-[11.5px] opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {formatArabicDate(d.date)}
                {isPartial ? " (جارٍ)" : ""} — <b className="text-primary tabular-nums">{d.count.toLocaleString("en-US")}</b> عملية
              </span>
            </div>
          );
        })}
      </div>
      <div
        className="flex justify-between border-t border-[#1B2732] mt-1.5 pt-1.5 text-[10.5px] text-[#8FA3B4] tabular-nums"
        dir="ltr"
      >
        <span>{daily.length > 0 ? formatArabicDate(daily[0].date) : ""}</span>
        <span>اليوم</span>
      </div>
    </div>
  );
}

/**
 * الحزام الحي: يقرأ من /api/public/ai-stats ويتحدّث كل دقيقة.
 * أي فشل أو نقص بيانات → الرجوع لشريط الحقائق الثابتة (StatsBand) — لا أرقام وهمية.
 */
function LiveStatsBand() {
  const { data: statsRaw } = useQuery<AiPublicStats>({
    queryKey: ["/api/public/ai-stats"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const stats = statsRaw && statsRaw.ai ? statsRaw : null;

  if (!stats || stats.ai.totalOps <= 0) return <StatsBand />;

  const daily = Array.isArray(stats.ai.daily) ? stats.ai.daily : [];
  const commentsPct =
    stats.comments.total > 0
      ? Math.round((100 * stats.comments.aiAnalyzed) / stats.comments.total)
      : null;
  const tokensM = stats.ai.totalTokens / 1_000_000;

  return (
    <section className="bg-[#0E1620] text-[#E7EEF4] px-4 py-10 md:py-11" data-testid="sabqai-live-stats">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-1.5">
          <h2 className="text-xl md:text-2xl font-extrabold">
            الأرقام <span className="text-primary">تتحدث</span>
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 px-3 py-0.5 text-xs font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
            مباشر من قاعدة البيانات
          </span>
          <span className="ms-auto text-xs text-[#8FA3B4]">
            آخر تحديث: {formatUpdatedAgo(stats.generatedAt)}
          </span>
        </div>
        <p className="text-[13.5px] text-[#8FA3B4] max-w-xl mb-6">
          لا أرقام تقديرية ولا وهمية — كل رقم في هذا القسم يُقرأ لحظة فتح الصفحة من أنظمة
          سبق العاملة، ويتحدّث تلقائيًا.
        </p>

        <div className="text-center pb-6">
          <div className="text-primary font-extrabold leading-none text-[clamp(52px,9vw,84px)]">
            <CountUp value={stats.ai.totalOps} />
          </div>
          <div className="text-[15px] font-bold mt-2">عملية ذكاء اصطناعي نفّذتها المنظومة</div>
          {stats.ai.sinceDate && (
            <div className="text-[12.5px] text-[#8FA3B4] mt-0.5">
              منذ إطلاق مركز قياس الذكاء الاصطناعي — {formatArabicDate(stats.ai.sinceDate, true)}
            </div>
          )}
          <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-[#1B2732] bg-white/[.045] px-4 py-1 text-[13px]">
            اليوم حتى الآن:
            <b className="text-primary">
              <CountUp value={stats.ai.todayOps} />
            </b>
            عملية
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-6">
          <div className="rounded-xl border border-[#1B2732] bg-white/[.045] px-4 py-4">
            <div className="text-2xl font-extrabold text-primary">
              <CountUp value={stats.ai.successRate} decimals={1} />
              <span className="text-[15px]">%</span>
            </div>
            <div className="text-xs text-[#8FA3B4] mt-0.5 leading-relaxed">معدل نجاح عمليات الذكاء الاصطناعي</div>
          </div>
          <div className="rounded-xl border border-[#1B2732] bg-white/[.045] px-4 py-4">
            <div className="text-2xl font-extrabold">
              <CountUp value={tokensM} decimals={1} />
              <span className="text-[15px]">M</span>
            </div>
            <div className="text-xs text-[#8FA3B4] mt-0.5 leading-relaxed">توكن معالج منذ إطلاق مركز القياس</div>
          </div>
          {commentsPct !== null && (
            <div className="rounded-xl border border-[#1B2732] bg-white/[.045] px-4 py-4">
              <div className="text-2xl font-extrabold">
                <CountUp value={commentsPct} />
                <span className="text-[15px]">%</span>
              </div>
              <div className="text-xs text-[#8FA3B4] mt-0.5 leading-relaxed">من تعليقات القرّاء تُفحص آليًا قبل النشر</div>
            </div>
          )}
          <div className="rounded-xl border border-[#1B2732] bg-white/[.045] px-4 py-4">
            <div className="text-2xl font-extrabold">
              <CountUp value={stats.stories.total} />
            </div>
            <div className="text-xs text-[#8FA3B4] mt-0.5 leading-relaxed">قصة متابعة ذكية تجمع الأخبار المترابطة آليًا</div>
          </div>
          <div className="rounded-xl border border-[#1B2732] bg-white/[.045] px-4 py-4">
            <div className="text-2xl font-extrabold">
              <CountUp value={stats.articles.todayPublished} />
            </div>
            <div className="text-xs text-[#8FA3B4] mt-0.5 leading-relaxed">خبرًا نُشر اليوم عبر خط الإنتاج — بعد عين المحرر</div>
          </div>
          <div className="rounded-xl border border-[#1B2732] bg-white/[.045] px-4 py-4">
            <div className="text-2xl font-extrabold text-primary">
              <CountUp value={stats.articles.totalPublished} />
            </div>
            <div className="text-xs text-[#8FA3B4] mt-0.5 leading-relaxed">خبرًا في أرشيف سبق منذ التأسيس</div>
          </div>
        </div>

        {daily.length >= 3 && <DailyOpsChart daily={daily} />}

        <p className="text-center text-xs text-[#8FA3B4] mt-5">
          وكل مادة من هذه الأرقام مرّت بمحطة واحدة لا تُتجاوز: <b className="text-[#E7EEF4]">عين المحرر</b>.
        </p>
      </div>
    </section>
  );
}

function SportsBand() {
  return (
    <section className="bg-[#0E2233] text-white px-4 py-10 md:py-12" data-testid="sabqai-sports">
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <h2 className="text-xl md:text-2xl font-extrabold">
            البطولات نموذجًا: <span className="text-primary">من المونديال إلى دوري روشن</span>
          </h2>
        </div>
        <p className="text-sm text-slate-300 max-w-2xl mb-5">
          واكبنا كأس العالم بتقارير تصدر مع صافرة النهاية — واليوم تعمل المحرّكات نفسها
          في البطولات القارية والمحلية.
        </p>
        <div className="flex flex-wrap gap-2 mb-7">
          {TOURNAMENTS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="text-[13px] font-bold border border-white/25 rounded-full px-4 py-1.5 hover:border-primary hover:text-primary transition-colors"
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SPORT_FACTS.map((f) => (
            <div key={f.label} className="rounded-xl border border-white/15 bg-white/5 p-4">
              <div className="text-xl font-extrabold text-primary">{f.value}</div>
              <p className="text-[13px] text-slate-300 mt-1 leading-relaxed">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ServicesShowcase() {
  return (
    <section
      className="relative isolate overflow-hidden bg-[#07111f] px-4 py-14 text-white md:py-20"
      data-testid="sabqai-services-showcase"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-4xl bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.18),transparent_68%)]"
        aria-hidden="true"
      />
      <div className="mx-auto max-w-7xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-5 py-2 text-xs font-extrabold text-sky-400 md:text-sm">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          منظومة الخدمات الذكية
        </span>

        <div
          className="mx-auto mt-7 w-fit bg-gradient-to-b from-sky-300 via-sky-400 to-blue-500 bg-clip-text text-[clamp(6rem,18vw,11rem)] font-black leading-[0.82] tracking-[-0.08em] text-transparent drop-shadow-[0_0_42px_rgba(14,165,233,0.22)] tabular-nums"
          dir="ltr"
          aria-label={`${TOTAL_SMART_SERVICES} خدمة ذكية`}
        >
          {TOTAL_SMART_SERVICES}
        </div>

        <h2 className="mt-8 text-2xl font-extrabold leading-tight md:text-4xl">
          خدمة ذكية تعمل الآن داخل عقل سبق
        </h2>
        <p className="mx-auto mt-3 max-w-3xl text-sm leading-7 text-slate-400 md:text-lg">
          منظومة حقيقية تعمل في خط الإنتاج يوميًا — من رصد الإشارة وصناعة القصة،
          إلى الرياضة والصوت والصورة والتخصيص، تحت إشراف المحرر.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5 md:mt-11 md:gap-3">
          <span className="inline-flex min-h-12 items-center gap-2 rounded-full border border-sky-400 bg-sky-500 px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_35px_rgba(14,165,233,0.24)]">
            <Layers className="h-4 w-4" aria-hidden="true" />
            الكل
            <b className="tabular-nums" dir="ltr">{TOTAL_SMART_SERVICES}</b>
          </span>
          {SERVICE_DOMAINS.map((domain) => (
            <span
              key={domain.label}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-4 py-2.5 text-sm font-bold text-slate-200 md:px-5"
            >
              <domain.icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
              {domain.label}
              <b className="text-white tabular-nums" dir="ltr">{domain.count}</b>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Charter() {
  return (
    <section className="bg-muted/30 border-y border-border px-4 py-10 md:py-14" data-testid="sabqai-charter">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <span className="h-px flex-1 bg-foreground/60" aria-hidden="true" />
          <h2 className="text-xl md:text-2xl font-extrabold whitespace-nowrap">ميثاق سبق للذكاء الاصطناعي</h2>
          <span className="h-px flex-1 bg-foreground/60" aria-hidden="true" />
        </div>
        <p className="text-sm text-muted-foreground text-center mb-7">
          ثماني مواد معلنة للقارئ، ملزمة لغرفة التحرير — تُحدَّث كلما تطوّرت المنظومة
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {CHARTER.map((art) => (
            <div key={art.no} className="flex gap-4 py-4 border-b border-border">
              <span className="text-4xl md:text-5xl font-extrabold text-primary min-w-[3rem] text-center leading-none">
                {art.no}
              </span>
              <div>
                <h3 className="text-[15px] font-extrabold mb-0.5">{art.title}</h3>
                <p className="text-[13.5px] text-muted-foreground leading-relaxed">{art.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 mt-9">
          <span className="inline-flex items-center gap-1.5 border-2 border-emerald-600 text-emerald-600 font-extrabold text-sm rounded-md px-4 py-1.5 -rotate-2">
            <BadgeCheck className="w-4 h-4" aria-hidden="true" />
            أجازه المحرر
          </span>
          <p className="text-sm text-muted-foreground max-w-md">
            كل تقرير آلي في سبق يحمل هذا المعنى قبل أن يصل إليك — الذكاء يُسرّع الإنتاج،
            وصحفيّونا يملكون القرار الأخير.
          </p>
        </div>
      </div>
    </section>
  );
}

export default function SabqAI() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = "عقل سبق — الذكاء الاصطناعي في خدمة الصحافة | سبق";
  }, []);
  useCanonical("https://sabq.org/sabq-ai");

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1">
        <Hero />
        <Ticker />
        <ServicesShowcase />
        <Pipeline />
        <LiveStatsBand />
        <SportsBand />
        <Charter />
      </main>

      <Footer />
    </div>
  );
}
