/**
 * عقل سبق — /sabq-ai (و/about-ai يحوّل إليه).
 *
 * صفحة تعريفية عامة بمنظومة الذكاء الاصطناعي في سبق، بتصميم سينمائي داكن
 * معتمد من المالك (2026-10-16): دماغ بشري حي في الواجهة، ثم رحلة الخبر في خمسة
 * فصول تتوقف عند «عين المحرر»، فخريطة المجالات، والبطولات، ومدار الفريق الرقمي،
 * والأرقام الحية، و«ما لن يفعله عقل سبق»، والميثاق كاملًا، وعام الذكاء الاصطناعي.
 * كل ادعاء موثّق من الكود الفعلي — لا مبالغات. iFox قد ينشر آليًا تحت بوابة جودة
 * ووسم، فلا تُكتب عبارة تزعم أن كل مادة تمرّ بالمحرر قبل النشر.
 *
 * قاعدة مصداقية ملزمة: لا أرقام لحظية وهمية. الأرقام تُقرأ من /api/public/ai-stats
 * و/api/public/ai-team (استعلامات إنتاج بكاش 5 دقائق)؛ إن تعذّر الجلب تظهر حقائق
 * ثابتة بدلها، ويسقط مدار الفريق بصمت — لا تقدير ولا اختلاق.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { BrainCanvas } from "@/components/sabq-ai/BrainCanvas";
import { useAuth } from "@/hooks/useAuth";
import { useCanonical } from "@/hooks/useCanonical";
import "@/styles/sabq-ai-page.css";

/** عبارات شريط «من داخل المنظومة» — قدرات حقيقية بصيغة وصفية، لا أحداث لحظية */
const TICKER_ITEMS: { tag: string; text: string }[] = [
  { tag: "رياضة", text: "تقرير المباراة يصدر بعد دقائق من صافرة النهاية — بعد إجازة المحرر" },
  { tag: "الرادار", text: "رصد المصادر العالمية وتقييم أهمية الخبر وتحويل المهم إلى مسودة عربية" },
  { tag: "صوت", text: "نشرات صوتية تُنتج بأصوات عربية وتُدقّق قبل بثّها" },
  { tag: "لغات", text: "النسخ الإنجليزية والأردية تصدر من المنظومة نفسها بعد التدقيق" },
  { tag: "عُمق", text: "تحليلات معمّقة تُبنى بعدة نماذج وتُراجع تحريريًا قبل النشر" },
  { tag: "مباشر", text: "تعليق المباريات يُعرّب لحظة بلحظة من بيانات المباراة الرسمية" },
];

/** مناطق الدماغ في الواجهة — مواضعها نسبية لإطار الرسم */
const BRAIN_REGIONS: { label: string; sub: string; style: CSSProperties; human?: boolean }[] = [
  { label: "القرار", sub: "المحرر", style: { right: "2%", top: "24%" }, human: true },
  { label: "الفهم", sub: "والتقييم", style: { right: "40%", top: "3%" } },
  { label: "اللغة", sub: "قلم", style: { right: "30%", top: "67%" } },
  { label: "الرؤية", sub: "عدسة وريشة", style: { left: 0, top: "30%" } },
  { label: "التنسيق", sub: "البوابة الموحدة", style: { left: "2%", top: "80%" } },
  { label: "الإشارة", sub: "راصد وسبّاق", style: { left: "43%", top: "93%" } },
];

/** كل بند هنا موثّق من الكود الفعلي (بوابة server/ai/gateway وسجل docs/systems/registry.json) */
const SIGNAL_SOURCES = [
  "وكالات الأنباء",
  "رادار المصادر العالمية",
  "بيانات المباريات الرسمية",
  "مراسلون عبر واتساب والبريد",
  "منصة X",
  "أرشيف سبق",
];

const GATEWAY_PROVIDERS = [
  { name: "OpenAI", desc: "التحرير والتضمين" },
  { name: "Anthropic", desc: "التحليل والصياغة" },
  { name: "Google Gemini", desc: "البصريات والصوت" },
  { name: "ElevenLabs", desc: "الأصوات العربية" },
  { name: "HUMAIN", desc: "صوت سعودي", saudi: true },
];

const GATEWAY_CONTROLS = [
  { name: "توجيه مستقل لكل خدمة", desc: "لكل مهمة نموذج أساسي وسلسلة بدائل" },
  { name: "تحويل تلقائي عند التعثر", desc: "يتدخل البديل دون توقف الخدمة" },
  { name: "قاطع دائرة", desc: "النموذج المتعثر يُعزل مؤقتًا ويُعاد فحصه آليًا" },
  { name: "ميزانيات وسجل كامل", desc: "قيد لكل عملية: نجاحها وزمنها وتكلفتها" },
];

const DOMAINS = [
  { kicker: "تحرير", title: "التحرير الذكي", desc: "تحليلات «عُمق»، رادار المصادر العالمية، توليد المقالات، التصنيف والروابط الذكية" },
  { kicker: "رياضة", title: "الرياضة اللحظية", desc: "تقارير فور الصافرة، معاينات المباريات، التعليق المعرّب لحظة بلحظة" },
  { kicker: "صوت", title: "الأخبار المسموعة", desc: "نشرات وموجز صوتي بأصوات عربية طبيعية" },
  { kicker: "بصري", title: "الاستوديو البصري", desc: "صور وإنفوجرافيك ومصغّرات وأوصاف بديلة بهوية سبق" },
  { kicker: "تخصيص", title: "لكل قارئ صحيفته", desc: "الموجز اليومي والتوصيات الذكية حسب اهتماماتك الحقيقية" },
  { kicker: "جودة", title: "الجودة والإشراف", desc: "فلترة التعليقات وفحص معايير النشر وتحليل الأسلوب" },
  { kicker: "لغات", title: "ثلاث لغات", desc: "عربي وإنجليزي وأردو من منظومة تحريرية واحدة" },
  { kicker: "بنية", title: "البوابة الموحدة", desc: "توجيه النماذج بين المزوّدين وقياس الجودة والتكلفة باستمرار" },
];

const STATIC_FACTS = [
  { value: "+60", label: "خدمة ذكية تعمل في المنظومة" },
  { value: "5", label: "بطولات تُغطّى بمحرّكات آلية" },
  { value: "3", label: "لغات نشر من منظومة واحدة" },
  { value: "100%", label: "مسؤولية تحريرية عن كل ما يُنشر — بشريًا كان أو آليًا" },
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

/** «ما لن يفعله عقل سبق» — آليات مبرمجة فعلًا في المنظومة، لا وعود */
const GOVERNANCE: { title: string; body: ReactNode }[] = [
  {
    title: "يحلّ محل المحرر",
    body: (
      <>
        <b>الذكاء يقترح، والإنسان يقرّر.</b> المحرر يملك الإجازة والرد والتعديل، وسبق تتحمّل مسؤولية كل ما تنشره.
      </>
    ),
  },
  {
    title: "يتعثر بصمت",
    body: (
      <>
        ثلاثة إخفاقات متتالية تعزل النموذج وتحوّل المسار لبديله، ويُعاد فحصه آليًا كل خمس دقائق. وأي تدهور في مزوّد
        ذكاء <b>يصل رئيس التحرير برسالة فورية</b>.
      </>
    ),
  },
  {
    title: "يضيف رقمًا من عنده",
    body: (
      <>
        في التغطيات الرياضية: <b>كل رقم في النص المولّد يجب أن يرد حرفيًا</b> في بيانات المباراة الرسمية.
      </>
    ),
  },
  {
    title: "يُخفي أن الصورة مولّدة",
    body: (
      <>
        كل صورة يولّدها الذكاء الاصطناعي تحمل داخل ملفها <b>وسمًا معياريًا (IPTC)</b> يعلن أنها مولّدة خوارزميًا، ويُعاد
        كتابته بعد كل معالجة.
      </>
    ),
  },
  {
    title: "يعمل في الظل",
    body: (
      <>
        سجل تدقيق يفصل ما فعله <b>إنسان</b> عمّا فعله <b>النظام</b> عمّا فعله <b>الذكاء الاصطناعي</b>. وكل تغيير في
        إعدادات النماذج مقيّد: من غيّر، وماذا، ومتى.
      </>
    ),
  },
  {
    title: "ينفق بلا رقابة",
    body: <>حدود إنفاق شهرية لكل مزوّد وكل خدمة، وتكلفة كل عملية تُقيَّد وتُراقب من لوحة موحّدة.</>,
  },
  {
    title: "يحكم على التعليقات وحده",
    body: (
      <>
        قرارات المشرفين على التعليقات تعود أمثلةً <b>تضبط بها الرقابة الذكية أحكامها التالية</b>.
      </>
    ),
  },
  {
    title: "يسمح بتدريب الآلات على صحافتنا",
    body: (
      <>
        ملف <code>robots.txt</code> يغلق الباب أمام زواحف تدريب النماذج — GPTBot وClaudeBot وCCBot وغيرها — ويبقيه
        مفتوحًا لمحركات البحث.
      </>
    ),
  },
  {
    title: "يترجم بدل أن يكتب",
    body: (
      <>
        أسلوب الدار وقواعد اللغة مكتوبة داخل كل نموذج توليد، وأسماء اللاعبين والملاعب والمدربين تُعرّب عبر طبقات تحقق
        بمراجعة تحريرية — فلا يصل القارئ حرف أجنبي.
      </>
    ),
  },
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

const DOORS = [
  {
    href: "/prompt-studio",
    title: "استوديو البرومبت",
    desc: "أداة مجانية لكل زائر لتحسين صياغة أوامره للذكاء الاصطناعي — مساهمة في رفع الوعي التقني.",
    cta: "جرّب الأداة ←",
  },
  { href: "/sports/live", title: "المباريات الآن", desc: "تغطية حية وتعريب فوري لكل مباراة.", cta: "ادخل ←" },
  { href: "/live", title: "لحظة بلحظة", desc: "الأحداث كما يرصدها العقل ويجيزها المحرر.", cta: "ادخل ←" },
  { href: "/en", title: "سبق بثلاث لغات", desc: "العقل نفسه بالإنجليزية والأردية.", cta: "English · اردو ←" },
];

/* ==================== البيانات الحية ==================== */

interface AiPublicStats {
  generatedAt: string;
  ai: {
    totalOps: number;
    todayOps: number;
    totalTokens: number;
    successRate: number;
    sinceDate: string | null;
    daily: { date: string; count: number }[];
    todayByDomain?: { editorial: number; sports: number; visual: number; audio: number };
  };
  comments: { total: number; aiAnalyzed: number };
  stories: { total: number };
  articles: { totalPublished: number; todayPublished: number };
  audio?: { totalMinutes: number };
  radar?: { totalItems: number };
  sports?: { totalOps: number };
}

interface AiTeamPublicPayload {
  generatedAt: string;
  team: { slug: string; nameAr: string; titleAr: string; departmentAr: string; avatarUrl: string }[];
  counters: { monthOps: number; teamCount: number };
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
      { threshold: 0.3 },
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
    const duration = 1800;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const n = from + (value - from) * (1 - Math.pow(1 - p, 4));
      currentRef.current = n;
      setDisplay(n);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, value]);

  return (
    <span ref={ref} className="sai-num">
      {display.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
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
  return d.toLocaleDateString("ar", { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}) });
}

/** يضيف is-in لكل .sai-rv عند دخوله الشاشة؛ يُعاد عند تغيّر contentKey لأن أقسام البيانات تظهر لاحقًا */
function useReveal(rootRef: RefObject<HTMLElement>, contentKey: string) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        }
      },
      { threshold: 0.15 },
    );
    root.querySelectorAll(".sai-rv:not(.is-in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [rootRef, contentKey]);
}

/* ==================== الأقسام ==================== */

function Hero({ stats, team }: { stats: AiPublicStats | null; team: AiTeamPublicPayload | null }) {
  const teamCount = team ? team.counters.teamCount || team.team.length : 0;
  return (
    <header className="sai-hero">
      <div className="sai-wrap sai-hero-grid">
        <div className="sai-hero-text">
          <span className="sai-tagline sai-rv">
            <i aria-hidden="true" />
            عقل سبق يعمل الآن
          </span>
          <h1 className="sai-h1 sai-rv sai-d1">
            <span className="g">عقلٌ لا ينام.</span>
            <br />
            <span className="h">وقرارٌ لا يُفوَّض.</span>
          </h1>
          <p className="sai-lede sai-rv sai-d2">
            أول منظومة ذكاء تحريري متكاملة في صحيفة سعودية وعربية. ترصد وتحلل وتكتب بالعربية على مدار الساعة، ثم تتوقف
            عند محرر يقرّر.
          </p>
          <div className="sai-strip sai-rv sai-d3">
            {stats ? (
              <div className="now">
                <b>
                  <CountUp value={stats.ai.todayOps} />
                </b>
                <span>عملية ذكاء اليوم</span>
              </div>
            ) : (
              <div className="now">
                <b className="sai-num">+60</b>
                <span>خدمة ذكية</span>
              </div>
            )}
            {teamCount > 0 ? (
              <div>
                <b className="sai-num">{teamCount}</b>
                <span>زميلًا رقميًا</span>
              </div>
            ) : (
              <div>
                <b className="sai-num">3</b>
                <span>لغات نشر</span>
              </div>
            )}
            {stats ? (
              <div>
                <b className="sai-num">{stats.ai.successRate.toFixed(1)}%</b>
                <span>نجاح العمليات</span>
              </div>
            ) : (
              <div>
                <b className="sai-num">5</b>
                <span>بطولات</span>
              </div>
            )}
            <div>
              <b className="sai-num">24/7</b>
              <span>بلا انقطاع</span>
            </div>
          </div>
        </div>
        <div className="sai-brain sai-rv sai-d1" role="img" aria-label="دماغ عقل سبق: شبكة عصبية تنتهي عند عقدة قرار المحرر">
          <BrainCanvas />
          {BRAIN_REGIONS.map((r) => (
            <span key={r.label} className={`sai-region${r.human ? " hu" : ""}`} style={r.style} aria-hidden="true">
              <b>{r.label}</b> {r.sub}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function Ticker() {
  return (
    <div className="sai-ticker" aria-hidden="true">
      <span className="lbl">من داخل المنظومة</span>
      {/* غلاف overflow-hidden مستقل: transform الحزام يرسم خارج صندوقه فينزلق فوق التسمية بدونه */}
      <div className="sai-belt-wrap">
        <div className="sai-belt">
          {[0, 1].map((half) =>
            TICKER_ITEMS.map((item) => (
              <span key={`${half}-${item.tag}`}>
                <b>{item.tag}</b>
                {item.text}
              </span>
            )),
          )}
        </div>
      </div>
    </div>
  );
}

function Manifesto() {
  return (
    <section className="sai-manifesto">
      <div className="sai-wrap">
        <p className="sai-rv">
          الآلة <em>تسرّع</em>. الآلة <em>ترتّب</em>. الآلة <em>تكتب المسودة</em>.
          <br />
          لكن في سبق، <em className="hu">المسؤولية تحريرية كاملة</em> عن كل ما يصل إليك.
        </p>
      </div>
    </section>
  );
}

function Figure({ value, caption }: { value: ReactNode; caption: string }) {
  return (
    <div className="sai-fig sai-rv sai-d2">
      <div className="sai-big">{value}</div>
      <div className="sai-cap">{caption}</div>
    </div>
  );
}

/** رحلة الخبر: خط الإنتاج و«تحت الغطاء» في خمسة فصول — الرابع محطة القرار البشري */
function Journey({ stats }: { stats: AiPublicStats | null }) {
  const radarItems = stats?.radar?.totalItems ?? 0;
  const tokensM = stats ? Math.round(stats.ai.totalTokens / 1_000_000) : 0;
  return (
    <section className="sai-journey" data-testid="sabqai-pipeline">
      <div className="sai-spine" aria-hidden="true" />
      <div className="sai-wrap" data-testid="sabqai-under-hood">
        <article className="sai-ch">
          <div className="sai-copy sai-rv">
            <div className="sai-idx">01 · الرصد</div>
            <h3>يسمع العالم</h3>
            <p>«راصد» و«سبّاق» يلتقطان الإشارة قبل أن تصير خبرًا، من ست بوابات:</p>
            <div className="sai-chips">
              {SIGNAL_SOURCES.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
          {radarItems > 0 ? (
            <Figure value={<CountUp value={radarItems} />} caption="مادة التقطها رادار المصادر العالمية" />
          ) : (
            <Figure value={<span className="sai-num">6</span>} caption="بوابات رصد تعمل على مدار الساعة" />
          )}
        </article>

        <article className="sai-ch">
          <div className="sai-copy sai-rv">
            <div className="sai-idx">02 · الفهم</div>
            <h3>يفرز ويُقيّم</h3>
            <p>
              تصنيف آلي، ودرجة أهمية، وتحقق من البيانات. ليس كل ما يحدث خبرًا، والعقل يقرر ما يستحق وقت المحرر.
            </p>
          </div>
          {stats && stats.stories.total > 0 ? (
            <Figure value={<CountUp value={stats.stories.total} />} caption="قصة متابعة ذكية تربط الخبر بما سبقه" />
          ) : (
            <Figure value="درجة" caption="أهمية لكل إشارة قبل أن تصل المحرر" />
          )}
        </article>

        <article className="sai-ch">
          <div className="sai-copy sai-rv">
            <div className="sai-idx">03 · الكتابة</div>
            <h3>يكتب بلسان سبق</h3>
            <p>
              عربية أولًا بأسلوب الدار، وبلا معلومة مخترعة — عبر بوابة واحدة لكل عملية ذكاء، لا نداء يخرج عنها.
            </p>
            <div className="sai-chips">
              {GATEWAY_PROVIDERS.map((p) => (
                <span key={p.name} className={p.saudi ? "sa" : undefined}>
                  {p.name} · {p.desc}
                </span>
              ))}
            </div>
            <div className="sai-gate">
              <h4>كيف تُدار البوابة</h4>
              <ul>
                {GATEWAY_CONTROLS.map((c) => (
                  <li key={c.name}>
                    <b>{c.name}</b> — {c.desc}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {tokensM > 0 ? (
            <Figure
              value={
                <span className="sai-num">
                  <CountUp value={tokensM} />M
                </span>
              }
              caption={
                stats?.ai.sinceDate
                  ? `توكن عالجها العقل منذ ${formatArabicDate(stats.ai.sinceDate, true)}`
                  : "توكن عالجها العقل"
              }
            />
          ) : (
            <Figure value={<span className="sai-num">5</span>} caption="مزوّدي ذكاء خلف بوابة واحدة" />
          )}
        </article>

        <article className="sai-ch human">
          <div className="sai-copy sai-rv">
            <div className="sai-idx">04 · التوقف</div>
            <h3>ثم يتوقف.</h3>
            <p className="stopline">هنا تنتهي صلاحيات الآلة.</p>
            <p>
              «عين المحرر»: مراجعة وإجازة أو ردّ — والمحتوى الآلي يمرّ ببوابة جودة ووسم واضح. الآلة تقترح، والمحرر
              يوقّع.
            </p>
          </div>
          <Figure value="المحرر" caption="صاحب القرار الأخير" />
        </article>

        <article className="sai-ch">
          <div className="sai-copy sai-rv">
            <div className="sai-idx">05 · النشر والقياس</div>
            <h3>يصل إليك</h3>
            <p>على الويب والتطبيقات، وبالصوت والبودكاست، وبثلاث لغات من منظومة واحدة.</p>
            <div className="sai-loop">
              <b>حلقة القياس:</b> كل عملية تُسجَّل لحظة وقوعها — نجحت أم أخفقت، كم استغرقت، كم كلّفت — ثم تعود لتضبط
              اختيار النماذج وإعداداتها. المنظومة تقيس نفسها وتتحسن بها.
            </div>
          </div>
          {stats && stats.articles.totalPublished > 0 ? (
            <Figure value={<CountUp value={stats.articles.totalPublished} />} caption="خبر في أرشيف سبق" />
          ) : (
            <Figure value={<span className="sai-num">3</span>} caption="لغات نشر من منظومة واحدة" />
          )}
        </article>
      </div>
    </section>
  );
}

function DomainsGrid() {
  return (
    <section className="sai-domains" data-testid="sabqai-domains">
      <div className="sai-wrap sai-center">
        <div className="sai-eyebrow sai-rv">خريطة العقل</div>
        <h2 className="sai-h2 sai-rv sai-d1">ثمانية مجالات، أكثر من ستين خدمة</h2>
        <p className="sai-sub sai-rv sai-d2">كل مجال قسم من أقسام الدماغ، وكلها تمر عبر البوابة نفسها.</p>
        <div className="sai-dgrid">
          {DOMAINS.map((d, i) => (
            <div key={d.title} className={`sai-dm sai-rv${i % 4 ? ` sai-d${i % 4}` : ""}`}>
              <small>{d.kicker}</small>
              <h3>{d.title}</h3>
              <p>{d.desc}</p>
            </div>
          ))}
        </div>
        <div className="sai-facts3 sai-rv">
          {STATIC_FACTS.slice(0, 3).map((f) => (
            <div key={f.label}>
              <b className="sai-num">{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SportsBand() {
  return (
    <section className="sai-sports" data-testid="sabqai-sports">
      <div className="sai-wrap sai-sports-grid">
        <div>
          <div className="sai-eyebrow sai-rv">البطولات نموذجًا</div>
          <h2 className="sai-h2 sai-rv sai-d1">
            من المونديال
            <br />
            إلى دوري روشن
          </h2>
          <p className="sai-sub sai-rv sai-d2" style={{ margin: 0 }}>
            واكبنا كأس العالم بتقارير تصدر مع صافرة النهاية — واليوم تعمل المحرّكات نفسها في البطولات القارية والمحلية.
          </p>
          <div className="sai-tourn sai-rv sai-d3">
            {TOURNAMENTS.map((t) => (
              <Link key={t.href} href={t.href}>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="sai-sfacts sai-rv sai-d2">
          {SPORT_FACTS.map((f) => (
            <div key={f.label} className="sai-sf">
              <b className={f.value === "0" ? "sai-num" : undefined}>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * مدار الفريق: أول غرفة أخبار سعودية تعرّف بزملائها الرقميين بأسمائهم، وهيئة التحرير
 * في المركز. نسخة منقّاة — أسماء وأدوار ومجاميع شهرية فقط؛ التكاليف والنماذج والأعطال
 * تبقى داخل اللوحة. أي فشل في الجلب → يسقط القسم بصمت.
 */
function TeamOrbit({ team }: { team: AiTeamPublicPayload | null }) {
  if (!team || team.team.length === 0) return null;
  const members = team.team;
  const positions = members.map((_, i) => {
    const ring = i % 2 ? 41 : 32;
    const a = (i / members.length) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(a) * ring, y: 50 + Math.sin(a) * ring };
  });
  const teamCount = team.counters.teamCount || members.length;

  return (
    <section className="sai-team" data-testid="sabqai-team">
      <div className="sai-wrap">
        <div className="sai-eyebrow sai-rv">داخل عقل سبق</div>
        <h2 className="sai-h2 sai-rv sai-d1">فريق سبق الذكي</h2>
        <p className="sai-sub sai-rv sai-d2">
          أول غرفة أخبار سعودية تعرّفك بزملائها الرقميين بأسمائهم وأدوارهم وأقسامهم — يعملون على مدار الساعة، وفي
          المركز دائمًا هيئة التحرير.
        </p>
        <div className="sai-orbit sai-rv sai-d3">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="sai-orbit-line" gradientUnits="userSpaceOnUse" x1="50" y1="50" x2="90" y2="90">
                <stop offset="0" stopColor="#3fe0a0" stopOpacity=".7" />
                <stop offset="1" stopColor="#5cb4ff" stopOpacity=".15" />
              </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(92,180,255,.12)" strokeWidth=".15" />
            <circle cx="50" cy="50" r="41" fill="none" stroke="rgba(92,180,255,.08)" strokeWidth=".15" strokeDasharray=".6 .8" />
            {positions.map((p, i) => (
              <line key={members[i].slug} x1="50" y1="50" x2={p.x} y2={p.y} stroke="url(#sai-orbit-line)" strokeWidth=".18" />
            ))}
          </svg>
          <div className="sai-core">
            <div>
              <b>هيئة التحرير</b>
              <small>القرار الأخير</small>
            </div>
          </div>
          {members.map((m, i) => (
            <div key={m.slug} className="sai-mate" style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}>
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" loading="lazy" width={60} height={60} />
              ) : (
                <span className="ph" aria-hidden="true" />
              )}
              <b>{m.nameAr}</b>
              <small>{m.titleAr}</small>
              <em>{m.departmentAr}</em>
            </div>
          ))}
        </div>
        <div className="sai-team-foot sai-rv">
          {team.counters.monthOps > 0 && (
            <div>
              <b>
                <CountUp value={team.counters.monthOps} />
              </b>
              عملًا هذا الشهر
            </div>
          )}
          <div>
            <b className="sai-num">{teamCount}</b>
            زميلًا رقميًا
          </div>
          <div>
            <b className="sai-num">100%</b>
            تحت إشراف بشري
          </div>
        </div>
        <span className="sai-policy sai-rv">🛡 الإنسان يعتمد كل شيء — سياسة سبق للذكاء الاصطناعي</span>
      </div>
    </section>
  );
}

/** الأرقام الحية — أي فشل أو نقص بيانات يعرض الحقائق الثابتة بدلها */
function LiveNumbers({ stats, team }: { stats: AiPublicStats | null; team: AiTeamPublicPayload | null }) {
  if (!stats) {
    return (
      <section className="sai-count" data-testid="sabqai-live-stats">
        <div className="sai-wrap">
          <div className="sai-eyebrow sai-rv">الأرقام تتحدث</div>
          <div className="sai-static sai-rv sai-d1">
            {STATIC_FACTS.map((f) => (
              <div key={f.label}>
                <b className="sai-num">{f.value}</b>
                <span>{f.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  const daily = Array.isArray(stats.ai.daily) ? stats.ai.daily : [];
  const dailyMax = Math.max(1, ...daily.map((d) => d.count));
  const commentsPct =
    stats.comments.total > 0 ? Math.round((100 * stats.comments.aiAnalyzed) / stats.comments.total) : null;
  const audioMinutes = stats.audio?.totalMinutes ?? 0;
  const radarItems = stats.radar?.totalItems ?? 0;
  const sportsOps = stats.sports?.totalOps ?? 0;
  const monthOps = team?.counters.monthOps ?? 0;
  const byDomain = stats.ai.todayByDomain;
  const domainRows = byDomain
    ? [
        { label: "رياضة", value: byDomain.sports },
        { label: "تحرير", value: byDomain.editorial },
        { label: "بصري", value: byDomain.visual },
        { label: "صوت", value: byDomain.audio },
      ].sort((a, b) => b.value - a.value)
    : [];
  const domainTotal = Math.max(1, domainRows.reduce((s, d) => s + d.value, 0));

  const horizon: { value: ReactNode; label: string; show: boolean }[] = [
    { value: <span className="sai-num"><CountUp value={stats.ai.successRate} decimals={1} />%</span>, label: "معدل نجاح العمليات", show: true },
    { value: <span className="sai-num"><CountUp value={stats.ai.totalTokens / 1_000_000} decimals={1} />M</span>, label: "توكن معالج منذ الإطلاق", show: stats.ai.totalTokens > 0 },
    { value: <span className="sai-num"><CountUp value={commentsPct ?? 0} />%</span>, label: "تعليقات تُفحص آليًا", show: commentsPct !== null },
    { value: <CountUp value={stats.stories.total} />, label: "قصة متابعة ذكية", show: true },
    { value: <CountUp value={stats.articles.todayPublished} />, label: "خبرًا نُشر اليوم", show: true },
    { value: <CountUp value={stats.articles.totalPublished} />, label: "خبرًا في الأرشيف", show: true },
    { value: <CountUp value={audioMinutes} />, label: "دقيقة صوت أُنتجت آليًا", show: audioMinutes > 0 },
    { value: <CountUp value={radarItems} />, label: "مادة رصدها رادار المصادر", show: radarItems > 0 },
    { value: <CountUp value={sportsOps} />, label: "عملية في التغطيات الرياضية", show: sportsOps > 0 },
    { value: <CountUp value={stats.comments.aiAnalyzed} />, label: "تعليقًا حلّله «حارس»", show: stats.comments.aiAnalyzed > 0 },
    { value: <CountUp value={monthOps} />, label: "عملًا للفريق هذا الشهر", show: monthOps > 0 },
    { value: <CountUp value={stats.ai.todayOps} />, label: "عملية اليوم حتى الآن", show: true },
  ];

  return (
    <section className="sai-count" data-testid="sabqai-live-stats">
      <div className="sai-wrap">
        <span className="sai-live-badge sai-rv">
          <i aria-hidden="true" />
          مباشر من قاعدة البيانات
        </span>
        <div className="sai-giant sai-rv sai-d1">
          <CountUp value={stats.ai.totalOps} />
        </div>
        <div className="cap2 sai-rv sai-d2">
          عملية ذكاء اصطناعي نفّذتها المنظومة
          {stats.ai.sinceDate ? ` منذ ${formatArabicDate(stats.ai.sinceDate, true)}` : ""}
        </div>
        <div className="src sai-rv sai-d2">
          لا أرقام تقديرية ولا وهمية — كل رقم يُقرأ لحظة فتح الصفحة من أنظمة سبق، ويتحدّث تلقائيًا
        </div>

        <div className="sai-horizon sai-rv sai-d3">
          {horizon
            .filter((h) => h.show)
            .map((h) => (
              <div key={h.label}>
                <b>{h.value}</b>
                <span>{h.label}</span>
              </div>
            ))}
        </div>

        {(domainRows.length > 0 || daily.length >= 3) && (
          <div className="sai-today sai-rv">
            {domainRows.length > 0 && stats.ai.todayOps > 0 && (
              <div>
                <h3>عمليات اليوم حسب المجال</h3>
                {domainRows.map((d) => (
                  <div key={d.label} className="sai-dom">
                    <span>{d.label}</span>
                    <div className="sai-bar">
                      <b style={{ width: `${Math.round((100 * d.value) / domainTotal)}%` }} />
                    </div>
                    <span className="sai-num">{d.value.toLocaleString("en-US")}</span>
                  </div>
                ))}
              </div>
            )}
            {daily.length >= 3 && (
              <div>
                <h3>النشاط اليومي — آخر {daily.length} يومًا</h3>
                <div
                  className="sai-chart"
                  dir="ltr"
                  role="img"
                  aria-label={`رسم أعمدة لعمليات الذكاء الاصطناعي اليومية، الذروة ${dailyMax.toLocaleString("en-US")}`}
                >
                  {daily.map((d, i) => (
                    <span
                      key={d.date}
                      className={i === daily.length - 1 ? "today" : undefined}
                      style={{ height: `${Math.max(3, Math.round((100 * d.count) / dailyMax))}%` }}
                      title={`${formatArabicDate(d.date)} — ${d.count.toLocaleString("en-US")} عملية`}
                    />
                  ))}
                </div>
                <div className="sai-chart-cap" dir="ltr">
                  <span>{formatArabicDate(daily[0].date)}</span>
                  <span>اليوم</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="sai-updated">آخر تحديث: {formatUpdatedAgo(stats.generatedAt)}</div>
      </div>
    </section>
  );
}

function GovernanceBand() {
  return (
    <section className="sai-nots" data-testid="sabqai-governance">
      <div className="sai-wrap">
        <div className="sai-eyebrow sai-rv sai-center">الحوكمة</div>
        <h2 className="sai-h2 sai-rv sai-d1 sai-center">ما لن يفعله عقل سبق</h2>
        <div className="sai-not-list">
          {GOVERNANCE.map((g) => (
            <div key={g.title} className="sai-not sai-rv">
              <h3>
                <s>لن</s> {g.title}
              </h3>
              <p>{g.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Charter() {
  return (
    <section className="sai-charter" id="charter" data-testid="sabqai-charter">
      <div className="sai-wrap sai-center">
        <div className="sai-eyebrow sai-rv">الميثاق</div>
        <h2 className="sai-h2 sai-rv sai-d1">ميثاق سبق للذكاء الاصطناعي</h2>
        <p className="sai-sub sai-rv sai-d2">ثماني مواد تحكم كل نموذج يعمل في غرفة أخبارنا.</p>
        <div className="sai-cgrid">
          {CHARTER.map((art, i) => (
            <div key={art.no} className={`sai-art sai-rv${i % 4 ? ` sai-d${i % 4}` : ""}`}>
              <div className="n sai-num">{art.no}</div>
              <h3>{art.title}</h3>
              <p>{art.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** الاصطفاف الوطني — عام الذكاء الاصطناعي 2026 بلغة وقائع لا شعارات */
function Finale() {
  return (
    <section className="sai-finale" data-testid="sabqai-national">
      <div className="sai-wrap">
        <div className="sai-yr sai-num sai-rv" aria-hidden="true">
          2026
        </div>
        <h2 className="sai-h2 sai-rv sai-d1">
          عام الذكاء الاصطناعي.
          <br />
          <span>في سبق، بدأ قبل ذلك.</span>
        </h2>
        <p className="sai-sub sai-rv sai-d2">
          اعتمدت المملكة 2026 عامًا للذكاء الاصطناعي. منظومة إعلامية سعودية تخدم أهداف الاستراتيجية الوطنية للبيانات
          والذكاء الاصطناعي — بقرار بشري في كل مادة.
        </p>
        <div className="sai-doors">
          {DOORS.map((d, i) => (
            <Link key={d.href} href={d.href} className={`sai-door sai-rv${i ? ` sai-d${i}` : ""}`}>
              <h3>{d.title}</h3>
              <p>{d.desc}</p>
              <em>{d.cta}</em>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function SabqAI() {
  const { user } = useAuth();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = "عقل سبق — الذكاء الاصطناعي في خدمة الصحافة | سبق";
  }, []);
  useCanonical("https://sabq.org/sabq-ai");

  const { data: statsRaw } = useQuery<AiPublicStats>({
    queryKey: ["/api/public/ai-stats"],
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  const stats = statsRaw && statsRaw.ai && statsRaw.ai.totalOps > 0 ? statsRaw : null;

  const { data: teamRaw } = useQuery<AiTeamPublicPayload>({
    queryKey: ["/api/public/ai-team"],
    staleTime: 5 * 60_000,
  });
  const team = teamRaw && Array.isArray(teamRaw.team) && teamRaw.counters ? teamRaw : null;

  useReveal(mainRef, `${Boolean(stats)}-${Boolean(team)}`);

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-background flex flex-col" dir="rtl">
      <Header user={user || undefined} />
      <NavigationBar />

      <main ref={mainRef} className="sai flex-1 min-w-0 overflow-x-hidden">
        <Hero stats={stats} team={team} />
        <Ticker />
        <Manifesto />
        <Journey stats={stats} />
        <DomainsGrid />
        <SportsBand />
        <TeamOrbit team={team} />
        <LiveNumbers stats={stats} team={team} />
        <GovernanceBand />
        <Charter />
        <Finale />
      </main>

      <Footer />
    </div>
  );
}
