/**
 * عقل سبق — /sabq-ai (و/about-ai يحوّل إليه).
 *
 * صفحة تعريفية عامة بمنظومة الذكاء الاصطناعي في سبق: أول صحيفة سعودية وعربية
 * تدمج الذكاء في كامل دورة العمل التحريري. التركيب المعتمد من المالك:
 * بنية «من الإشارة إلى القصة» (خط إنتاج من خمس محطات، «عين المحرر» محطة
 * إجبارية بارزة) + ميثاق الذكاء الاصطناعي بثماني مواد + شريط «من داخل المنظومة».
 *
 * قاعدة مصداقية ملزمة: لا أرقام لحظية وهمية — كل الأرقام هنا حقائق ثابتة
 * قابلة للتحقق (عدد الخدمات/البطولات/اللغات). العدّادات الحية تُضاف لاحقًا
 * من واجهات برمجية فعلية فقط.
 */
import { useEffect } from "react";
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
  { value: "+40", label: "خدمة ذكية تعمل في المنظومة" },
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

const DOMAINS = [
  { icon: Newspaper, kicker: "تحرير", title: "التحرير الذكي", desc: "تحليلات «عُمق»، رادار المصادر العالمية، توليد المقالات، التصنيف والروابط الذكية" },
  { icon: Trophy, kicker: "رياضة", title: "الرياضة اللحظية", desc: "تقارير فور الصافرة، معاينات المباريات، التعليق المعرّب لحظة بلحظة" },
  { icon: Mic, kicker: "صوت", title: "الأخبار المسموعة", desc: "نشرات وموجز صوتي بأصوات عربية طبيعية" },
  { icon: ImageIcon, kicker: "بصري", title: "الاستوديو البصري", desc: "صور وإنفوجرافيك ومصغّرات وأوصاف بديلة بهوية سبق" },
  { icon: Sparkles, kicker: "تخصيص", title: "لكل قارئ صحيفته", desc: "الموجز اليومي والتوصيات الذكية حسب اهتماماتك الحقيقية" },
  { icon: ShieldCheck, kicker: "جودة", title: "الجودة والإشراف", desc: "فلترة التعليقات وفحص معايير النشر وتحليل الأسلوب" },
  { icon: Languages, kicker: "لغات", title: "ثلاث لغات", desc: "عربي وإنجليزي وأردو من منظومة تحريرية واحدة" },
  { icon: Gauge, kicker: "بنية", title: "البوابة الموحدة", desc: "توجيه النماذج بين المزوّدين وقياس الجودة والتكلفة باستمرار" },
];

/** ميثاق سبق للذكاء الاصطناعي — ثماني مواد معتمدة من الإدارة */
const CHARTER = [
  { no: "١", title: "الإنسان يقرّر", desc: "كل مادة تمرّ بمسؤولية تحريرية بشرية، قبل النشر وبعده." },
  { no: "٢", title: "لا اختلاق", desc: "النموذج يصوغ من بيانات ومصادر موثّقة فقط، ولا يضيف معلومة من عنده." },
  { no: "٣", title: "الشفافية", desc: "نُبيّن للقارئ دور الذكاء حيث يكون جوهريًا في إنتاج المادة." },
  { no: "٤", title: "الرأي للإنسان", desc: "الذكاء لا يكتب رأيًا ولا يتبنّى موقفًا؛ الموقف لكتّابنا." },
  { no: "٥", title: "مسؤوليتنا كاملة", desc: "سبق تتحمّل مسؤولية كل ما تنشره، أيًّا كانت الأداة." },
  { no: "٦", title: "خصوصية القارئ", desc: "بيانات القرّاء تُستخدم لخدمتهم، ولا شيء غير ذلك." },
  { no: "٧", title: "قياس دائم", desc: "جودة كل نموذج وتكلفته تُراقبان عبر بوابة موحّدة، والأفضل يبقى." },
  { no: "٨", title: "عربيةٌ أولًا", desc: "نُطوّع النماذج للغة العربية وسياقها السعودي — لا العكس." },
];

const CTA_LINKS = [
  { label: "تحليلات عُمق", href: "/omq", primary: true },
  { label: "النشرات الصوتية", href: "/audio-newsletters", primary: false },
  { label: "مركز المونديال", href: "/world-cup", primary: false },
  { label: "موجزك اليومي", href: "/daily-brief", primary: false },
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-5xl mx-auto">
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

function DomainsGrid() {
  return (
    <section className="px-4 py-10 md:py-12" data-testid="sabqai-domains">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-xl md:text-2xl font-extrabold text-center mb-1.5">
          ثمانية مجالات… أكثر من 40 خدمة
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-6">
          منظومة واحدة تخدم غرفة التحرير والقارئ معًا — على مدار الساعة
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {DOMAINS.map((d) => (
            <div
              key={d.title}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary"
            >
              <span className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <d.icon className="w-[18px] h-[18px]" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-bold text-primary tracking-wide">{d.kicker}</span>
              <h3 className="text-[15px] font-extrabold mt-0.5 mb-1">{d.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{d.desc}</p>
            </div>
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
              <span className="text-2xl font-extrabold text-primary min-w-[2.5rem] text-center leading-tight">
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

function CtaSection() {
  return (
    <section className="px-4 py-10 md:py-12 text-center" data-testid="sabqai-cta">
      <h2 className="text-lg md:text-xl font-extrabold mb-5">لا تصدّق الوصف — جرّب النتيجة</h2>
      <div className="flex flex-wrap justify-center gap-2.5">
        {CTA_LINKS.map((cta) => (
          <Link
            key={cta.href}
            href={cta.href}
            className={`text-sm font-bold rounded-full px-6 py-2.5 border transition-colors ${
              cta.primary
                ? "bg-primary border-primary text-primary-foreground hover:opacity-90"
                : "border-border hover:border-primary hover:text-primary"
            }`}
          >
            {cta.label}
          </Link>
        ))}
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
        <Pipeline />
        <StatsBand />
        <SportsBand />
        <DomainsGrid />
        <Charter />
        <CtaSection />
      </main>

      <Footer />
    </div>
  );
}
