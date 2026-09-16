/**
 * عقل سبق — /sabq-ai (و/about-ai يحوّل إليه).
 *
 * صفحة تعريفية عامة بمنظومة الذكاء الاصطناعي في سبق: أول صحيفة سعودية وعربية
 * تدمج الذكاء في كامل دورة العمل التحريري. التركيب المعتمد من المالك:
 * بنية «من الإشارة إلى القصة» (خط إنتاج من خمس محطات، «عين المحرر» محطة
 * إجبارية بارزة) + ميثاق الذكاء الاصطناعي بثماني مواد + شريط «من داخل المنظومة»
 * + توسعة 2026-07-29 (معتمدة للترشح لقائمة «ذكاء السعودية 50»): «تحت الغطاء»
 * (الرسم الهيكلي للبوابة الموحدة) و«الحوكمة أثناء التشغيل» و«في عام الذكاء
 * الاصطناعي». كل ادعاء في هذه الأقسام موثّق من الكود الفعلي — لا مبالغات.
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
  Mic,
  Newspaper,
  PenLine,
  RefreshCcw,
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
  { icon: Eye, title: "عين المحرر", desc: "مراجعة وإجازة أو ردّ — والمحتوى الآلي يمرّ ببوابة جودة ووسم واضح", human: true },
  { icon: Send, title: "النشر والقياس", desc: "ويب وتطبيقات وصوت بثلاث لغات، وقياس مستمر للجودة", human: false },
];

const STATS = [
  { value: "+60", label: "خدمة ذكية تعمل في المنظومة" },
  { value: "5", label: "بطولات تُغطّى بمحرّكات آلية" },
  { value: "3", label: "لغات نشر من منظومة واحدة" },
  { value: "100%", label: "مسؤولية تحريرية عن كل ما يُنشر — بشريًا كان أو آليًا" },
];

/* ==================== «تحت الغطاء» — الرسم الهيكلي للمنظومة ==================== */

/** كل بند هنا موثّق من الكود الفعلي (بوابة server/ai/gateway وسجل docs/systems/registry.json) */
const UNDER_HOOD_SOURCES = [
  "وكالات الأنباء",
  "رادار المصادر العالمية",
  "بيانات المباريات الرسمية",
  "مراسلون عبر واتساب والبريد",
  "منصة X",
  "أرشيف سبق",
];

const GATEWAY_PROVIDERS = [
  { name: "OpenAI", desc: "GPT للتحرير والتضمين والصوت" },
  { name: "Anthropic", desc: "Claude للتحليل والصياغة الرصينة" },
  { name: "Google", desc: "Gemini للبصريات والإنفوجرافيك" },
  { name: "ElevenLabs", desc: "الأصوات العربية للنشرات المسموعة" },
];

const GATEWAY_CONTROLS = [
  { name: "توجيه مستقل لكل خدمة", desc: "لكل مهمة نموذج أساسي وسلسلة بدائل" },
  { name: "تحويل تلقائي عند التعثر", desc: "يتدخل النموذج البديل دون توقف الخدمة" },
  { name: "قاطع دائرة", desc: "النموذج المتعثر يُعزل مؤقتًا ويُعاد فحصه آليًا" },
  { name: "ميزانيات وسجل كامل", desc: "حدود إنفاق، وقيد لكل عملية: نجاحها وزمنها وتكلفتها" },
];

const UNDER_HOOD_DOMAINS = [
  { title: "التحرير الذكي", sub: "عُمق، الرادار، التوليد" },
  { title: "الرياضة اللحظية", sub: "5 بطولات، تعريب فوري" },
  { title: "الأخبار المسموعة", sub: "نشرات وبودكاست" },
  { title: "الاستوديو البصري", sub: "صور وإنفوجرافيك" },
  { title: "لكل قارئ صحيفته", sub: "توصيات وتضمين دلالي" },
  { title: "الجودة والإشراف", sub: "فحص التعليقات والمشاعر" },
  { title: "ثلاث لغات", sub: "عربي، إنجليزي، أردو" },
  { title: "البوابة الموحدة", sub: "البنية والقياس" },
];

const PUBLISH_CHANNELS = ["الويب والتطبيقات", "صوت وبودكاست", "ثلاث لغات من منظومة واحدة"];

/** «الحوكمة أثناء التشغيل» — آليات مبرمجة فعلًا في المنظومة، لا وعود */
const GOVERNANCE = [
  { kicker: "صحة النماذج", title: "قاطع دائرة آلي", desc: "ثلاثة إخفاقات متتالية تعزل النموذج مؤقتًا وتحوّل المسار لبديله — ويُعاد فحصه آليًا كل خمس دقائق." },
  { kicker: "إنذار مبكر", title: "تنبيه يصل الإنسان", desc: "أي تدهور في مزوّد ذكاء يصل رئيس التحرير برسالة فورية — الآلة لا تتعثر بصمت." },
  { kicker: "انضباط مالي", title: "ميزانيات تحت المراقبة", desc: "حدود إنفاق شهرية لكل مزوّد وكل خدمة، وتكلفة كل عملية تُقيَّد وتُراقب من لوحة موحّدة." },
  { kicker: "مساءلة", title: "سجل تدقيق كامل", desc: "كل تغيير في إعدادات النماذج مقيّد: من غيّر، وماذا غيّر، ومتى — لا إعداد بلا مسؤول." },
  { kicker: "تعلم من البشر", title: "معايرة بشرية مستمرة", desc: "قرارات المشرفين على التعليقات تعود أمثلةً تضبط بها الرقابة الذكية أحكامها التالية." },
  { kicker: "صرامة المصدر", title: "لا رقم بلا مصدر", desc: "في التغطيات الرياضية: كل رقم في النص المولّد يجب أن يرد حرفيًا في بيانات المباراة الرسمية." },
];

/** «في عام الذكاء الاصطناعي» — الاصطفاف الوطني بلغة وقائع */
const NATIONAL = [
  { title: "عربيةٌ أولًا", desc: "أسلوب الدار وقواعد اللغة مكتوبة داخل كل نموذج توليد — الذكاء هنا يتحدث العربية أصالةً، لا ترجمةً." },
  { title: "تعريب شامل للرياضة العالمية", desc: "أسماء اللاعبين والملاعب والمدربين تُعرّب عبر طبقات تحقق متعددة بمراجعة تحريرية — فلا يصل القارئ حرف أجنبي." },
  { title: "أدوات مفتوحة للجمهور", desc: "استوديو البرومبت أداة مجانية لكل زائر لتحسين صياغة أوامره للذكاء الاصطناعي — مساهمة في رفع الوعي التقني.", href: "/prompt-studio", linkLabel: "جرّب استوديو البرومبت" },
  { title: "اصطفاف مع الرؤية", desc: "منظومة إعلامية سعودية تخدم أهداف الاستراتيجية الوطنية للبيانات والذكاء الاصطناعي — بقرار بشري في كل مادة." },
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
  { no: "1", title: "الإنسان يقرّر", desc: "كل مادة تمرّ بمراجعة بشرية قبل النشر، أو تصدر موسومةً كمحتوى آلي تحت بوابات جودة مبرمجة وإشراف تحريري." },
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
    <div className="flex items-center overflow-hidden max-w-full bg-[#0E1620] border-y border-[#1B2732]" aria-hidden="true">
      <span className="relative z-10 shrink-0 bg-primary text-primary-foreground text-[11px] sm:text-xs font-bold px-2.5 sm:px-4 py-1.5 sm:py-2">
        من داخل المنظومة
      </span>
      {/* غلاف overflow-hidden مستقل: transform الحزام يرسم خارج صندوقه فينزلق فوق التسمية بدونه */}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="sabqai-belt flex w-max whitespace-nowrap">
          {[0, 1].map((half) => (
            <div key={half} className="flex shrink-0">
              {TICKER_ITEMS.map((item, i) => (
                <span key={i} className="text-[12px] sm:text-[13px] text-slate-300 py-1.5 sm:py-2 pe-8 sm:pe-12 inline-flex items-center gap-2">
                  <b className="text-primary font-bold">{item.tag}</b>
                  {item.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .sabqai-belt { animation: sabqai-belt 60s linear infinite; will-change: transform; }
        @keyframes sabqai-belt { from { transform: translate3d(0,0,0); } to { transform: translate3d(50%,0,0); } }
        @media (prefers-reduced-motion: reduce) { .sabqai-belt { animation: none; } }
      `}</style>
    </div>
  );
}

function Hero() {
  return (
    <section className="text-center px-4 pt-10 pb-7 md:pt-20 md:pb-14">
      <span className="inline-block max-w-full text-[11px] md:text-[13px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-3 md:px-5 py-1 md:py-1.5 mb-4 md:mb-5 leading-snug">
        عقل سبق — أول منظومة ذكاء تحريري متكاملة في صحيفة سعودية وعربية
      </span>
      <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold leading-[1.35] max-w-3xl mx-auto text-balance">
        من الإشارة الأولى إلى القصة المنشورة…
        <br />
        <span className="text-primary">في دقائق، وبقرار بشري</span>
      </h1>
      <p className="text-muted-foreground text-sm md:text-lg max-w-2xl mx-auto mt-3 md:mt-4">
        هكذا يعمل الذكاء الاصطناعي في سبق: خط إنتاج واحد يرصد ويحلل ويصوغ —
        ولا يعبر شيء إلى القارئ قبل محطة المحرر.
      </p>
    </section>
  );
}

function Pipeline() {
  return (
    <section className="px-4 pb-3 md:pb-4 overflow-x-hidden" data-testid="sabqai-pipeline">
      {/* عمودي على الجوال حتى تبقى محطة «عين المحرر» ظاهرة بلا تمرير أفقي */}
      <div className="flex flex-col md:flex-row items-stretch gap-1.5 md:gap-2 max-w-md md:max-w-6xl mx-auto pb-1 md:pb-2 pt-2 md:pt-3">
        {PIPELINE.map((station, i) => (
          <div key={station.title} className="contents">
            {i > 0 && (
              <>
                <ArrowDown className="w-4 h-4 md:w-5 md:h-5 shrink-0 self-center text-muted-foreground/50 md:hidden" aria-hidden="true" />
                <ArrowLeft className="hidden md:block w-5 h-5 shrink-0 self-center text-muted-foreground/50" aria-hidden="true" />
              </>
            )}
            <div
              className={`relative flex-1 min-w-0 md:min-w-[150px] rounded-lg md:rounded-xl border px-3 py-2.5 md:p-4 text-center ${
                station.human
                  ? "border-2 border-emerald-500 bg-emerald-500/5"
                  : "border-border bg-muted/30"
              }`}
            >
              {station.human && (
                <span className="absolute -top-2 right-1/2 translate-x-1/2 bg-emerald-600 text-white text-[10px] md:text-[11px] font-bold rounded-full px-2.5 md:px-3 py-0.5 whitespace-nowrap">
                  قرار بشري
                </span>
              )}
              <span
                className={`mx-auto mb-1.5 md:mb-2.5 flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg ${
                  station.human ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"
                }`}
              >
                <station.icon className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
              </span>
              <h3 className="text-[13px] md:text-sm font-extrabold mb-0.5 md:mb-1">{station.title}</h3>
              <p className="text-[11px] md:text-xs text-muted-foreground leading-relaxed">{station.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-center text-xs md:text-[13px] text-muted-foreground pt-2 px-1">
        المحطة الرابعة ليست شعارًا: <b className="text-emerald-600">كل مسار توليد في المنظومة يمرّ بها إجباريًا.</b>
      </p>
    </section>
  );
}

/* ==================== تحت الغطاء — كيف تعمل النماذج ==================== */

function UnderHoodStageLabel({ no, label, human = false }: { no: string; label: string; human?: boolean }) {
  return (
    <div className="flex items-center gap-2 md:gap-2.5 mb-2 md:mb-2.5 text-[11px] md:text-xs font-extrabold text-[#8FA3B4]">
      <span className={`h-2 w-2 shrink-0 rounded-full ${human ? "bg-emerald-400" : "bg-primary"}`} aria-hidden="true" />
      <span className="shrink-0 tabular-nums" dir="ltr">{no}</span>
      <span className="shrink min-w-0">{label}</span>
      <span className="h-px flex-1 min-w-4 bg-[#1B2732]" aria-hidden="true" />
    </div>
  );
}

function UnderHoodArrow() {
  return <ArrowDown className="mx-auto my-2.5 md:my-3.5 w-4 h-4 md:w-5 md:h-5 text-[#8FA3B4]/60" aria-hidden="true" />;
}

/** الرسم الهيكلي الكامل: النسخة التفصيلية لخط الإنتاج — البوابة الموحدة وحلقة القياس */
function UnderHood() {
  return (
    <section className="bg-[#0E1620] text-[#E7EEF4] px-4 py-7 md:py-12 overflow-x-hidden" data-testid="sabqai-under-hood">
      <div className="max-w-4xl mx-auto min-w-0">
        <h2 className="text-lg md:text-2xl font-extrabold text-center mb-1">
          تحت الغطاء: <span className="text-primary">كيف تعمل النماذج</span> في سبق
        </h2>
        <p className="text-xs md:text-sm text-[#8FA3B4] text-center max-w-xl mx-auto mb-5 md:mb-8 leading-relaxed">
          المخطط أعلاه هو الرحلة — وهذا هو المحرّك. كل نداء ذكاء اصطناعي في سبق، من تقرير
          المباراة إلى فحص التعليق، يمرّ عبر البنية نفسها.
        </p>

        <UnderHoodStageLabel no="1" label="مصادر الإشارة" />
        <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
          {UNDER_HOOD_SOURCES.map((s) => (
            <span key={s} className="text-[11.5px] md:text-[13px] font-bold rounded-full border border-[#1B2732] bg-white/[.045] px-3 py-1 md:py-1.5">
              {s}
            </span>
          ))}
        </div>

        <UnderHoodArrow />

        <UnderHoodStageLabel no="2" label="البوابة الموحدة" />
        <div className="rounded-lg md:rounded-xl border-[1.5px] border-primary bg-gradient-to-b from-primary/10 to-transparent px-3 py-4 md:p-6">
          <h3 className="text-sm md:text-base font-extrabold text-center">بوابة الذكاء الموحدة</h3>
          <p className="text-[11px] md:text-xs text-[#8FA3B4] text-center mb-3.5 md:mb-5">
            باب واحد لكل عملية ذكاء في المنظومة — لا نداء يخرج عنه
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
            <div className="min-w-0">
              <h4 className="text-[11px] md:text-xs font-extrabold text-primary mb-1.5 md:mb-2">
                أربعة مزودين، أكثر من 20 نموذجًا
              </h4>
              <ul className="flex flex-col gap-1.5">
                {GATEWAY_PROVIDERS.map((p) => (
                  <li key={p.name} className="rounded-md md:rounded-lg border border-[#1B2732] bg-white/[.045] px-2.5 py-1.5 md:px-3 md:py-2 text-[12px] md:text-[13px]">
                    <b>{p.name}</b> <span className="text-[#8FA3B4] text-[11px] md:text-xs">— {p.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-w-0">
              <h4 className="text-[11px] md:text-xs font-extrabold text-primary mb-1.5 md:mb-2">كيف تُدار</h4>
              <ul className="flex flex-col gap-1.5">
                {GATEWAY_CONTROLS.map((c) => (
                  <li key={c.name} className="rounded-md md:rounded-lg border border-[#1B2732] bg-white/[.045] px-2.5 py-1.5 md:px-3 md:py-2 text-[12px] md:text-[13px]">
                    <b>{c.name}</b> <span className="text-[#8FA3B4] text-[11px] md:text-xs">— {c.desc}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <UnderHoodArrow />

        <UnderHoodStageLabel no="3" label="أكثر من 60 خدمة في ثمانية مجالات" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-2">
          {UNDER_HOOD_DOMAINS.map((d) => (
            <div key={d.title} className="rounded-md md:rounded-lg border border-[#1B2732] bg-white/[.045] px-2 py-1.5 md:px-3 md:py-2.5 text-center min-w-0">
              <div className="text-[11.5px] md:text-[13px] font-extrabold leading-snug">{d.title}</div>
              <div className="text-[10px] md:text-[11px] text-[#8FA3B4] leading-snug">{d.sub}</div>
            </div>
          ))}
        </div>

        <UnderHoodArrow />

        <UnderHoodStageLabel no="4" label="المحطة الإلزامية" human />
        <div className="relative rounded-lg md:rounded-xl border-2 border-emerald-500 bg-emerald-500/5 px-3 pt-4 pb-3 md:p-5 text-center">
          <span className="absolute -top-2.5 right-1/2 translate-x-1/2 bg-emerald-600 text-white text-[10px] md:text-[11px] font-bold rounded-full px-2.5 md:px-3 py-0.5 whitespace-nowrap">
            قرار بشري
          </span>
          <h3 className="text-sm md:text-base font-extrabold">عين المحرر</h3>
          <p className="text-[11px] md:text-[13px] text-[#8FA3B4] mt-0.5 leading-relaxed">
            كل مسار توليد في المخطط يمرّ من هنا إجباريًا — مراجعة، ثم إجازة أو ردّ. لا استثناءات.
          </p>
        </div>

        <UnderHoodArrow />

        <UnderHoodStageLabel no="5" label="النشر" />
        <div className="flex flex-wrap justify-center gap-1.5 md:gap-2">
          {PUBLISH_CHANNELS.map((c) => (
            <span key={c} className="text-[11.5px] md:text-[13px] font-bold rounded-full border border-[#1B2732] bg-white/[.045] px-3 py-1 md:py-1.5">
              {c}
            </span>
          ))}
        </div>

        <div className="mt-5 md:mt-7 flex items-start gap-2.5 md:gap-3.5 rounded-lg md:rounded-xl border border-dashed border-primary/60 px-3 py-3 md:px-5 md:py-4">
          <RefreshCcw className="w-4 h-4 md:w-5 md:h-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
          <p className="text-[11.5px] md:text-[13px] text-[#8FA3B4] leading-relaxed min-w-0">
            <b className="text-[#E7EEF4]">حلقة القياس — وبها يكتمل الشكل:</b> كل عملية تُسجَّل لحظة
            وقوعها (نجحت أم أخفقت، كم استغرقت، كم كلّفت)، تغذّي لوحة مراقبة داخلية وقسم «الأرقام
            تتحدث» أدناه، ثم تعود لتضبط اختيار النماذج وإعداداتها. المنظومة تقيس نفسها وتتحسن بها.
          </p>
        </div>
      </div>
    </section>
  );
}

function StatsBand() {
  return (
    <section className="px-4 py-6 md:py-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 max-w-5xl mx-auto">
        {STATS.map((s) => (
          <div key={s.label} className="rounded-lg md:rounded-xl border border-border bg-card p-3 md:p-5 text-center">
            <div className="text-xl md:text-3xl font-extrabold text-primary tabular-nums" dir="ltr">
              {s.value}
            </div>
            <div className="text-[11px] md:text-sm text-muted-foreground mt-1 leading-snug">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}


/* ==================== فريق سبق الذكي — الزملاء الرقميون ==================== */

interface AiTeamPublicPayload {
  generatedAt: string;
  team: { slug: string; nameAr: string; titleAr: string; departmentAr: string; avatarUrl: string }[];
  counters: { monthOps: number; teamCount: number };
}

/**
 * شريحة الفريق: أول غرفة أخبار سعودية تعرّف بزملائها الرقميين بأسمائهم.
 * نسخة استعراض وحوكمة منقّاة — أسماء وأدوار ومجاميع شهرية فقط؛ التكاليف
 * والنماذج والأعطال تبقى داخل اللوحة. أي فشل في الجلب → تسقط الشريحة
 * بصمت (قاعدة المصداقية: لا أرقام وهمية).
 */
function TeamBand() {
  const { data: teamRaw } = useQuery<AiTeamPublicPayload>({
    queryKey: ["/api/public/ai-team"],
    staleTime: 5 * 60_000,
  });
  const payload = teamRaw && Array.isArray(teamRaw.team) && teamRaw.team.length > 0 ? teamRaw : null;
  if (!payload) return null;

  return (
    <section className="bg-[#0E2233] text-white px-4 py-7 md:py-12 overflow-x-hidden" data-testid="sabqai-team">
      <div className="max-w-5xl mx-auto text-center min-w-0">
        <div className="text-[11px] md:text-xs font-bold tracking-wide text-[#4CBCFD] mb-2">داخل عقل سبق</div>
        <h2 className="text-xl md:text-3xl font-extrabold mb-2">فريق سبق الذكي</h2>
        <p className="text-xs md:text-sm text-[#8CA3B5] max-w-xl mx-auto mb-6">
          أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم — يعملون على مدار الساعة،
          ولا يُنشر لهم حرف قبل اعتماد محرر بشري.
        </p>
        {/* الوعد يُوفى: كل زميل باسمه ومسماه وإدارته — لا دوائر مجهولة */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 md:gap-3 mb-7 text-right">
          {payload.team.map((m) => (
            <div
              key={m.slug}
              className="flex items-center gap-2.5 md:gap-3 rounded-xl border border-[#1E3448] bg-[#12293B] px-2.5 py-2 md:px-3 md:py-2.5 min-w-0"
            >
              <span className="w-11 h-11 md:w-14 md:h-14 rounded-full overflow-hidden bg-[#0E76B8] shrink-0 flex items-center justify-center">
                {m.avatarUrl ? (
                  <img src={m.avatarUrl} alt={m.nameAr} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-white font-bold">{m.nameAr.slice(0, 1)}</span>
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm md:text-base font-extrabold leading-tight truncate">{m.nameAr}</span>
                <span className="block text-[11px] md:text-xs text-[#DCF1FE]/80 leading-tight truncate">{m.titleAr}</span>
                <span className="block text-[10px] text-[#4CBCFD] leading-tight truncate">{m.departmentAr}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-8 md:gap-12 flex-wrap mb-6">
          {payload.counters.monthOps > 0 && (
            <div>
              <div className="text-2xl md:text-3xl font-extrabold text-[#4CBCFD] tabular-nums">
                {payload.counters.monthOps.toLocaleString("en-US")}
              </div>
              <div className="text-[11px] text-[#8CA3B5]">عملًا هذا الشهر</div>
            </div>
          )}
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-[#4CBCFD] tabular-nums">{payload.counters.teamCount}</div>
            <div className="text-[11px] text-[#8CA3B5]">زميلًا رقميًا</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-extrabold text-[#4CBCFD] tabular-nums">100%</div>
            <div className="text-[11px] text-[#8CA3B5]">تحت إشراف بشري</div>
          </div>
        </div>
        <span className="inline-block text-[11px] md:text-xs border border-[#4CBCFD]/40 bg-[#4CBCFD]/10 text-[#DCF1FE] rounded-full px-5 py-1.5">
          🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي
        </span>
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
    /** اختيارية: قد تصل استجابة CDN قديمة بلا الحقول الجديدة أثناء النشر التدريجي */
    todayByDomain?: { editorial: number; sports: number; visual: number; audio: number };
  };
  comments: { total: number; aiAnalyzed: number };
  stories: { total: number };
  articles: { totalPublished: number; todayPublished: number };
  audio?: { totalMinutes: number };
  radar?: { totalItems: number };
  sports?: { totalOps: number };
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
    <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] p-3 md:p-5 pb-2.5 md:pb-3 overflow-hidden">
      <h3 className="text-[13px] md:text-sm font-extrabold leading-snug">النشاط اليومي — آخر ١٤ يومًا</h3>
      <p className="text-[11px] md:text-xs text-[#8FA3B4] mb-2.5 md:mb-3.5 leading-snug">
        عمليات الذكاء الاصطناعي يوميًا (سجل الاستخدام الموحّد)
      </p>
      <div
        className="flex items-end gap-0.5 sm:gap-1 h-20 md:h-28 pt-3 md:pt-4 overflow-hidden"
        dir="ltr"
        role="img"
        aria-label={`رسم أعمدة لعمليات الذكاء الاصطناعي اليومية، الذروة ${max.toLocaleString("en-US")}`}
      >
        {daily.map((d, i) => {
          const isPartial = i === lastIndex;
          const labeled = i === maxIndex || isPartial;
          return (
            <div key={d.date} className="group relative flex-1 min-w-0 flex items-end h-full">
              <div
                className={
                  isPartial
                    ? "w-full rounded-t border-[1.5px] border-b-0 border-primary min-h-[3px]"
                    : "w-full rounded-t bg-primary min-h-[3px] group-hover:opacity-75 transition-opacity"
                }
                style={{ height: `${Math.max(3, Math.round((d.count / max) * 100))}%` }}
                title={`${formatArabicDate(d.date)}${isPartial ? " (جارٍ)" : ""} — ${d.count.toLocaleString("en-US")} عملية`}
              />
              {labeled && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[9px] md:text-[10.5px] font-bold tabular-nums">
                  {d.count.toLocaleString("en-US")}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div
        className="flex justify-between border-t border-[#1B2732] mt-1.5 pt-1.5 text-[10px] md:text-[10.5px] text-[#8FA3B4] tabular-nums"
        dir="ltr"
      >
        <span className="truncate">{daily.length > 0 ? formatArabicDate(daily[0].date) : ""}</span>
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
  const audioMinutes = stats.audio?.totalMinutes ?? 0;
  const radarItems = stats.radar?.totalItems ?? 0;
  const sportsOps = stats.sports?.totalOps ?? 0;
  const byDomain = stats.ai.todayByDomain;

  return (
    <section className="bg-[#0E1620] text-[#E7EEF4] border-t border-[#1B2732] px-4 py-7 md:py-11 overflow-x-hidden" data-testid="sabqai-live-stats">
      <div className="max-w-5xl mx-auto min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 mb-1.5">
          <h2 className="text-lg md:text-2xl font-extrabold">
            الأرقام <span className="text-primary">تتحدث</span>
          </h2>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 px-2.5 md:px-3 py-0.5 text-[11px] md:text-xs font-bold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 motion-safe:animate-pulse" />
            مباشر من قاعدة البيانات
          </span>
          <span className="w-full sm:w-auto sm:ms-auto text-[11px] md:text-xs text-[#8FA3B4]">
            آخر تحديث: {formatUpdatedAgo(stats.generatedAt)}
          </span>
        </div>
        <p className="text-xs md:text-[13.5px] text-[#8FA3B4] max-w-xl mb-4 md:mb-6 leading-relaxed">
          لا أرقام تقديرية ولا وهمية — كل رقم يُقرأ لحظة فتح الصفحة من أنظمة سبق، ويتحدّث تلقائيًا.
        </p>

        <div className="text-center pb-4 md:pb-6">
          <div className="text-primary font-extrabold leading-none text-[clamp(36px,11vw,84px)] break-all">
            <CountUp value={stats.ai.totalOps} />
          </div>
          <div className="text-[13px] md:text-[15px] font-bold mt-1.5 md:mt-2">عملية ذكاء اصطناعي نفّذتها المنظومة</div>
          {stats.ai.sinceDate && (
            <div className="text-[11px] md:text-[12.5px] text-[#8FA3B4] mt-0.5 px-2">
              منذ إطلاق مركز القياس — {formatArabicDate(stats.ai.sinceDate, true)}
            </div>
          )}
          <div className="mt-2.5 md:mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-[#1B2732] bg-white/[.045] px-3 md:px-4 py-1 text-xs md:text-[13px]">
            اليوم حتى الآن:
            <b className="text-primary">
              <CountUp value={stats.ai.todayOps} />
            </b>
            عملية
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-2.5 mb-4 md:mb-6">
          <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
            <div className="text-lg md:text-2xl font-extrabold text-primary">
              <CountUp value={stats.ai.successRate} decimals={1} />
              <span className="text-xs md:text-[15px]">%</span>
            </div>
            <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">معدل نجاح العمليات</div>
          </div>
          <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
            <div className="text-lg md:text-2xl font-extrabold">
              <CountUp value={tokensM} decimals={1} />
              <span className="text-xs md:text-[15px]">M</span>
            </div>
            <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">توكن معالج منذ الإطلاق</div>
          </div>
          {commentsPct !== null && (
            <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
              <div className="text-lg md:text-2xl font-extrabold">
                <CountUp value={commentsPct} />
                <span className="text-xs md:text-[15px]">%</span>
              </div>
              <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">تعليقات تُفحص آليًا</div>
            </div>
          )}
          <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
            <div className="text-lg md:text-2xl font-extrabold">
              <CountUp value={stats.stories.total} />
            </div>
            <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">قصة متابعة ذكية</div>
          </div>
          <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
            <div className="text-lg md:text-2xl font-extrabold">
              <CountUp value={stats.articles.todayPublished} />
            </div>
            <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">خبرًا نُشر اليوم</div>
          </div>
          <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
            <div className="text-lg md:text-2xl font-extrabold text-primary">
              <CountUp value={stats.articles.totalPublished} />
            </div>
            <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">خبرًا في الأرشيف</div>
          </div>
          {audioMinutes > 0 && (
            <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
              <div className="text-lg md:text-2xl font-extrabold">
                <CountUp value={audioMinutes} />
              </div>
              <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">دقيقة صوت أُنتجت آليًا</div>
            </div>
          )}
          {radarItems > 0 && (
            <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
              <div className="text-lg md:text-2xl font-extrabold">
                <CountUp value={radarItems} />
              </div>
              <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">مادة رصدها رادار المصادر العالمية</div>
            </div>
          )}
          {sportsOps > 0 && (
            <div className="rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-4 min-w-0">
              <div className="text-lg md:text-2xl font-extrabold text-primary">
                <CountUp value={sportsOps} />
              </div>
              <div className="text-[11px] md:text-xs text-[#8FA3B4] mt-0.5 leading-snug">عملية ذكاء في التغطيات الرياضية</div>
            </div>
          )}
          {byDomain && stats.ai.todayOps > 0 && (
            <div className="col-span-2 md:col-span-3 rounded-lg md:rounded-xl border border-[#1B2732] bg-white/[.045] px-3 py-2.5 md:px-4 md:py-3.5 min-w-0">
              <div className="text-[11px] md:text-xs text-[#8FA3B4] mb-1.5 md:mb-2">عمليات اليوم حسب المجال</div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[
                  { label: "تحرير", value: byDomain.editorial },
                  { label: "رياضة", value: byDomain.sports },
                  { label: "بصري", value: byDomain.visual },
                  { label: "صوت", value: byDomain.audio },
                ].map((d) => (
                  <div key={d.label} className="min-w-0">
                    <div className="text-sm md:text-lg font-extrabold">
                      <CountUp value={d.value} />
                    </div>
                    <div className="text-[10px] md:text-[11px] text-[#8FA3B4]">{d.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {daily.length >= 3 && <DailyOpsChart daily={daily} />}

        <p className="text-center text-[11px] md:text-xs text-[#8FA3B4] mt-4 md:mt-5 px-1">
          وكل مادة مرّت بمحطة واحدة لا تُتجاوز: <b className="text-[#E7EEF4]">عين المحرر</b>.
        </p>
      </div>
    </section>
  );
}

function SportsBand() {
  return (
    <section className="bg-[#0E2233] text-white px-4 py-7 md:py-12 overflow-x-hidden" data-testid="sabqai-sports">
      <div className="max-w-5xl mx-auto min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2 md:mb-3">
          <h2 className="text-lg md:text-2xl font-extrabold leading-snug">
            البطولات نموذجًا: <span className="text-primary">من المونديال إلى دوري روشن</span>
          </h2>
        </div>
        <p className="text-xs md:text-sm text-slate-300 max-w-2xl mb-4 md:mb-5 leading-relaxed">
          واكبنا كأس العالم بتقارير تصدر مع صافرة النهاية — واليوم تعمل المحرّكات نفسها
          في البطولات القارية والمحلية.
        </p>
        <div className="flex flex-wrap gap-1.5 md:gap-2 mb-5 md:mb-7">
          {TOURNAMENTS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="text-[12px] md:text-[13px] font-bold border border-white/25 rounded-full px-3 md:px-4 py-1 md:py-1.5 hover:border-primary hover:text-primary transition-colors"
            >
              {t.label}
            </Link>
          ))}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          {SPORT_FACTS.map((f) => (
            <div key={f.label} className="rounded-lg md:rounded-xl border border-white/15 bg-white/5 p-2.5 md:p-4 min-w-0">
              <div className="text-base md:text-xl font-extrabold text-primary">{f.value}</div>
              <p className="text-[11px] md:text-[13px] text-slate-300 mt-0.5 md:mt-1 leading-snug">{f.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DomainsGrid() {
  return (
    <section className="px-4 py-7 md:py-12 overflow-x-hidden" data-testid="sabqai-domains">
      <div className="max-w-5xl mx-auto min-w-0">
        <h2 className="text-lg md:text-2xl font-extrabold text-center mb-1">
          ثمانية مجالات… أكثر من 60 خدمة
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground text-center mb-4 md:mb-6">
          منظومة واحدة تخدم غرفة التحرير والقارئ معًا — على مدار الساعة
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          {DOMAINS.map((d) => (
            <div
              key={d.title}
              className="rounded-lg md:rounded-xl border border-border bg-card p-2.5 md:p-4 transition-colors hover:border-primary min-w-0"
            >
              <span className="mb-1.5 md:mb-2.5 flex h-7 w-7 md:h-9 md:w-9 items-center justify-center rounded-md md:rounded-lg bg-primary/10 text-primary">
                <d.icon className="w-3.5 h-3.5 md:w-[18px] md:h-[18px]" aria-hidden="true" />
              </span>
              <span className="text-[10px] md:text-[11px] font-bold text-primary tracking-wide">{d.kicker}</span>
              <h3 className="text-[13px] md:text-[15px] font-extrabold mt-0.5 mb-0.5 md:mb-1 leading-snug">{d.title}</h3>
              <p className="text-[11px] md:text-[13px] text-muted-foreground leading-snug md:leading-relaxed">{d.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** الحوكمة أثناء التشغيل — الميثاق وعدٌ، وهذه أدواته المبرمجة */
function GovernanceBand() {
  return (
    <section className="border-t border-border px-4 py-7 md:py-12 overflow-x-hidden" data-testid="sabqai-governance">
      <div className="max-w-5xl mx-auto min-w-0">
        <h2 className="text-lg md:text-2xl font-extrabold text-center mb-1">
          الحوكمة <span className="text-primary">أثناء التشغيل</span>
        </h2>
        <p className="text-xs md:text-sm text-muted-foreground text-center max-w-xl mx-auto mb-4 md:mb-6">
          الميثاق أدناه وعدٌ معلن — وهذه أدواته المبرمجة داخل المنظومة، تعمل دون تدخل أحد:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
          {GOVERNANCE.map((g) => (
            <div
              key={g.title}
              className="rounded-lg md:rounded-xl border border-border bg-card p-3 md:p-4 transition-colors hover:border-primary min-w-0"
            >
              <span className="text-[10px] md:text-[11px] font-bold text-primary tracking-wide">{g.kicker}</span>
              <h3 className="text-[13px] md:text-[15px] font-extrabold mt-0.5 mb-0.5 md:mb-1 leading-snug">{g.title}</h3>
              <p className="text-[11px] md:text-[13px] text-muted-foreground leading-snug md:leading-relaxed">{g.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** الاصطفاف الوطني — عام الذكاء الاصطناعي 2026 بلغة وقائع لا شعارات */
function NationalBand() {
  return (
    <section className="bg-[#0E2233] text-white px-4 py-7 md:py-12 overflow-x-hidden" data-testid="sabqai-national">
      <div className="max-w-5xl mx-auto min-w-0">
        <h2 className="text-lg md:text-2xl font-extrabold text-center mb-1">
          في <span className="text-primary">عام الذكاء الاصطناعي</span>
        </h2>
        <p className="text-xs md:text-sm text-slate-300 text-center max-w-xl mx-auto mb-4 md:mb-6 leading-relaxed">
          اعتمدت المملكة 2026 عامًا للذكاء الاصطناعي — وفي غرفة أخبار سبق، كان العام قد بدأ قبل ذلك.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
          {NATIONAL.map((n) => (
            <div key={n.title} className="rounded-lg md:rounded-xl border border-white/15 bg-white/5 p-3 md:p-4 min-w-0">
              <h3 className="text-[13px] md:text-[15px] font-extrabold mb-0.5 md:mb-1 leading-snug">{n.title}</h3>
              <p className="text-[11px] md:text-[13px] text-slate-300 leading-snug md:leading-relaxed">{n.desc}</p>
              {n.href && (
                <Link
                  href={n.href}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] md:text-[13px] font-bold text-primary hover:underline"
                >
                  {n.linkLabel}
                  <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Charter() {
  return (
    <section className="bg-muted/30 border-y border-border px-4 py-7 md:py-14 overflow-x-hidden" data-testid="sabqai-charter">
      <div className="max-w-4xl mx-auto min-w-0">
        <div className="flex items-center gap-2 md:gap-4 mb-2">
          <span className="h-px flex-1 min-w-4 bg-foreground/60" aria-hidden="true" />
          <h2 className="text-base sm:text-xl md:text-2xl font-extrabold text-center shrink">
            ميثاق سبق للذكاء الاصطناعي
          </h2>
          <span className="h-px flex-1 min-w-4 bg-foreground/60" aria-hidden="true" />
        </div>
        <p className="text-xs md:text-sm text-muted-foreground text-center mb-5 md:mb-7 px-1">
          ثماني مواد معلنة للقارئ، ملزمة لغرفة التحرير — تُحدَّث كلما تطوّرت المنظومة
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
          {CHARTER.map((art) => (
            <div key={art.no} className="flex gap-3 md:gap-4 py-3 md:py-4 border-b border-border min-w-0">
              <span className="text-3xl md:text-5xl font-extrabold text-primary w-8 md:min-w-[3rem] shrink-0 text-center leading-none">
                {art.no}
              </span>
              <div className="min-w-0">
                <h3 className="text-[14px] md:text-[15px] font-extrabold mb-0.5">{art.title}</h3>
                <p className="text-[12.5px] md:text-[13.5px] text-muted-foreground leading-relaxed">{art.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 mt-6 md:mt-9">
          <span className="inline-flex items-center gap-1.5 border-2 border-emerald-600 text-emerald-600 font-extrabold text-xs md:text-sm rounded-md px-3 md:px-4 py-1 md:py-1.5 -rotate-2">
            <BadgeCheck className="w-4 h-4" aria-hidden="true" />
            أجازه المحرر
          </span>
          <p className="text-xs md:text-sm text-muted-foreground max-w-md text-center md:text-start">
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
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main className="flex-1 min-w-0 overflow-x-hidden">
        <Hero />
        <Ticker />
        <Pipeline />
        <UnderHood />
        <LiveStatsBand />
        <TeamBand />
        <SportsBand />
        <DomainsGrid />
        <GovernanceBand />
        <Charter />
        <NationalBand />
      </main>

      <Footer />
    </div>
  );
}
