// دليل الكاتب — المرحلة 2 من خطة لوحة الكاتب: إطار موحّد، فهرس ثابت عليه علامة لما قرأه
// الكاتب (في متصفحه فقط)، والخطوات والأدوات صفوفًا بدل البطاقات.
import { Link, useLocation } from "wouter";
import { useEffect, useState, type ReactNode } from "react";
import { WriterPageFrame, WriterSurface } from "@/components/writer/WriterPageFrame";
import { useToast } from "@/hooks/use-toast";
import { useMediaLicenseGate } from "@/hooks/useMediaLicenseGate";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BrainCircuit,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleHelp,
  Eye,
  Feather,
  FileCheck2,
  Lightbulb,
  MessageSquareText,
  PenLine,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";

const GUIDE_READ_PREF = "sabq-writer-guide-read-v1";

function loadRead(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(GUIDE_READ_PREF) || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveRead(ids: string[]) {
  try {
    window.localStorage.setItem(GUIDE_READ_PREF, JSON.stringify(ids));
  } catch {
    // تخزين محجوب: العلامات لهذه الزيارة فقط.
  }
}

/** القسم الظاهر الآن، وما قرأه الكاتب (ظهر نصفه على الأقل). */
function useGuideProgress(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  const [read, setRead] = useState<string[]>(() => (typeof window === "undefined" ? [] : loadRead()));
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          setActive(id);
          setRead((prev) => {
            if (prev.includes(id)) return prev;
            const next = [...prev, id];
            saveRead(next);
            return next;
          });
        });
      },
      { rootMargin: "-20% 0px -55% 0px" },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [ids]);
  return { active, read };
}

const sections = [
  { id: "start", label: "البداية" },
  { id: "ideas", label: "أدوات الأفكار" },
  { id: "writing", label: "كتابة المقال" },
  { id: "review", label: "المراجعة والنشر" },
  { id: "ai", label: "الاستخدام الذكي" },
  { id: "faq", label: "أسئلة شائعة" },
];

const ideaTools = [
  {
    icon: Lightbulb,
    title: "بوصلة الأفكار",
    description: "ثلاث فرص مقترحة لك بناءً على كتاباتك ومناسبات قريبة وفرص المتابعة، وليست قائمة أخبار عامة.",
    use: "اختر الفكرة الأقرب لصوتك، ثم اضغط «طوّر هذه الفكرة» لتنتقل إلى الاستوديو.",
  },
  {
    icon: BrainCircuit,
    title: "استوديو الفكرة",
    description: "مساحة تختبر فيها فكرتك قبل الكتابة: ما السؤال؟ من القارئ؟ وما الرأي المقابل؟",
    use: "اكتب بذرة من سطرين على الأقل. سيقترح المساعد أسئلة وبناءً ومصادر تحتاج إلى تحقق دون كتابة المقال بدلاً عنك.",
  },
  {
    icon: Target,
    title: "فرصة المتابعة",
    description: "تعيد فتح سؤال من مقال سابق أثار قراءة أو نقاشًا، وتساعدك على بناء جزء ثانٍ له قيمة جديدة.",
    use: "اسأل دائمًا: ما الذي تغير منذ المقال الأول؟ وما المعلومة أو الزاوية الجديدة؟",
  },
  {
    icon: CalendarClock,
    title: "تقويم الإلهام",
    description: "مناسبات قريبة قد تمنح فكرتك توقيتًا أفضل، من دون تحويل مقال الرأي إلى خبر مناسبات.",
    use: "ابدأ من أثر المناسبة على الناس، لا من تعريف المناسبة نفسها.",
  },
  {
    icon: Feather,
    title: "بصمتك الكتابية",
    description: "قراءة تراكمية لسمات صوتك ونقاط قوته، تتضح تدريجيًا بعد نشر عدة مقالات.",
    use: "استخدمها كتذكير بأسلوبك، لا كقالب ثابت يكرر كتاباتك السابقة.",
  },
  {
    icon: Eye,
    title: "قارئ سبق الأول",
    description: "قراءة مساندة للمسودة تكشف وضوح الفكرة والبناء والمواضع الحساسة قبل إرسالها للتحرير.",
    use: "راجع اقتراحاته وانتقِ المناسب فقط؛ القرار والصوت النهائيان لك.",
  },
];

const journey = [
  { icon: PenLine, title: "مسودة", text: "اكتب العنوان والنص وأضف الصورة، واحفظ متى شئت." },
  { icon: SearchCheck, title: "تحت المراجعة", text: "وصل المقال إلى فريق التحرير ولا يحتاج منك إجراء الآن." },
  { icon: MessageSquareText, title: "ملاحظات", text: "ستظهر الملاحظة داخل لوحة المتابعة مع زر العودة للتعديل." },
  { icon: FileCheck2, title: "اعتماد وجدولة", text: "يظهر اعتماد المقال، ثم موعد النشر بدقته عند جدولته." },
  { icon: CheckCircle2, title: "نشر", text: "بعد النشر تستطيع مشاهدة المقال وقراءة أثره وتفاعل القراء." },
];

const faq = [
  { q: "هل يكتب الذكاء الاصطناعي المقال عني؟", a: "لا. دوره أن يسأل ويرتب وينبه، بينما الموقف والصياغة والنص مسؤوليتك أنت." },
  { q: "لماذا لا أرى التصنيف وإعدادات SEO؟", a: "هذه تفاصيل يتولاها فريق التحرير. واجهتك مقصودة لتبقى مركزة على العنوان والنص والصورة." },
  { q: "أين أعرف ماذا حدث بعد الإرسال؟", a: "من تبويب «مقالاتي» في مساحة الكاتب. ستجد الحالة والموعد والملاحظة أو سبب عدم النشر." },
  { q: "هل أستطيع تعديل مقال تحت المراجعة؟", a: "انتظر نتيجة المراجعة. عندما يعيده المحرر بملاحظة سيظهر زر التعديل وإعادة الإرسال." },
  { q: "ماذا أفعل إذا لم أفهم ملاحظة التحرير؟", a: "افتح «استفساراتي» وأرسل سؤالًا مرتبطًا بالمقال، بدل التخمين أو حذف أجزاء جوهرية." },
];

const SECTION_IDS = sections.map((x) => x.id);

export default function WriterGuidePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { createBlocked, createBlockedReason, openMediaLicenseForm } = useMediaLicenseGate();
  const { active, read } = useGuideProgress(SECTION_IDS);
  const startNewArticle = () => {
    if (createBlocked) {
      toast({
        title: "الترخيص المهني مطلوب",
        description: createBlockedReason,
        variant: "destructive",
      });
      openMediaLicenseForm();
      return;
    }
    navigate("/dashboard/articles/new");
  };

  return (
    <WriterPageFrame
      title="دليل الكاتب"
      description="من الفكرة الأولى إلى المقال المنشور، وكيف تستفيد من أدوات سبق دون أن تفقد صوتك."
      actions={
        <button
          type="button"
          onClick={startNewArticle}
          title={createBlocked ? createBlockedReason : undefined}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-[15px] font-semibold text-white hover:bg-[#178BD0]",
            createBlocked && "opacity-60",
          )}
          data-testid="button-writer-guide-new-article"
        >
          <PenLine className="h-4 w-4" /> ابدأ مقالًا جديدًا
        </button>
      }
    >
      <nav aria-label="فهرس دليل الكاتب" className="sticky top-0 z-20 -mx-4 overflow-x-auto bg-[#F4F7FB]/95 px-4 py-2 backdrop-blur dark:bg-background/95 lg:hidden">
        <div className="flex min-w-max gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm",
                active === section.id ? "bg-[#1E9BE6] font-semibold text-white" : "bg-card shadow-[inset_0_0_0_1px_#DCE4EC]",
              )}
            >
              {read.includes(section.id) && active !== section.id && <Check className="h-3.5 w-3.5 text-[#13734E]" />}
              {section.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="flex items-start gap-8">
        <div className="min-w-0 flex-1 space-y-12">
          <GuideSection id="start" eyebrow="البداية" title="لا تبدأ بالصياغة؛ ابدأ بالسؤال" intro="المقال الجيد لا يحتاج فكرة ضخمة، بل سؤالًا واضحًا وموقفًا يمكنك الدفاع عنه بإنصاف.">
            <Rows
              items={[
                { title: "ما الذي يشغلك؟", text: "اكتب القضية في جملة واحدة دون محاولة تجميلها." },
                { title: "ماذا تريد أن تقول؟", text: "حوّل القضية إلى موقف واضح، لا عنوان عام." },
                { title: "لماذا الآن؟", text: "حدد تغيرًا أو موقفًا يجعل الفكرة جديرة بالقراءة اليوم." },
                { title: "ما الذي يثبتها؟", text: "اجمع مثالًا أو رقمًا موثقًا ورأيًا مقابلًا قبل الكتابة." },
              ]}
              numbered
            />
            <SoftNote icon={Sparkles} title="صيغة تساعدك على البدء">أرى أن… لأن… وقد يعترض البعض بأن… لكن ما نغفله هو…</SoftNote>
          </GuideSection>

          <GuideSection id="ideas" eyebrow="أدوات الأفكار" title="ما أدوات الأفكار؟ وكيف تعمل؟" intro="كل أداة تجيب عن حاجة مختلفة. استخدم الأداة التي تقرّبك من الكتابة، ولا تشعر أنك مطالب باستخدامها كلها.">
            <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
              {ideaTools.map(({ icon: Icon, title, description, use }) => (
                <div key={title} className="flex gap-4 px-5 py-5 sm:px-6">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E6F4FD] text-[#0B6FA8]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="text-base font-semibold">{title}</h3>
                    <p className="text-[15px] leading-8 text-[#55667A] dark:text-muted-foreground">{description}</p>
                    <p className="text-sm leading-7"><span className="font-semibold text-[#0B6FA8]">كيف تستخدمها؟ </span>{use}</p>
                  </div>
                </div>
              ))}
            </WriterSurface>
          </GuideSection>

          <GuideSection id="writing" eyebrow="كتابة المقال" title="مقال واضح، إنساني، ويمكن الوثوق به" intro="في المحرر ستجد فقط ما تحتاجه: العنوان، نص المقال، والصورة. أما التفاصيل الفنية والتحريرية الأخرى فيتولاها الفريق.">
            <div className="grid gap-5 xl:grid-cols-2">
              <Checklist title="قبل الإرسال" items={["العنوان يعبر عن موقف المقال ولا يَعِد بما لا يقدمه.", "الفكرة الأساسية تظهر مبكرًا، وليست مخبأة في الخاتمة.", "كل رقم أو اقتباس أو ادعاء حساس له مصدر موثوق.", "ذكرت الرأي المقابل بإنصاف قبل الرد عليه.", "حذفت التكرار والجمل التي لا تخدم الفكرة.", "الصورة مناسبة ولا تنتهك حقوقًا أو خصوصية."]} />
              <Checklist title="بناء بسيط مقترح" numbered items={["مدخل قصير يضع القارئ داخل السؤال.", "الموقف الذي تريد الدفاع عنه بوضوح.", "حجتان أو ثلاث، لكل واحدة مثال أو دليل.", "اعتراض حقيقي والرد عليه بهدوء.", "خاتمة تفتح معنى أو سؤالًا، لا تعيد المقدمة."]} />
            </div>
            <SoftNote icon={ShieldCheck} title="تنبيه مهم">لا تضع بيانات شخصية، مراسلات خاصة، اتهامات، أو معلومات غير متحققة. عند الشك، اذكر حدود معرفتك أو تواصل مع فريق التحرير قبل الإرسال.</SoftNote>
          </GuideSection>

          <GuideSection id="review" eyebrow="المراجعة والنشر" title="كيف تتابع المقال حتى النشر؟" intro="تبويب «مقالاتي» هو سجل المتابعة. يتحدث تلقائيًا ويعرض آخر قرار تحريري وموعده وما المطلوب منك.">
            <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
              {journey.map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                  <Icon className="mt-1 h-4 w-4 shrink-0 text-[#0B6FA8]" />
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{title}</h3>
                    <p className="text-sm leading-7 text-[#55667A] dark:text-muted-foreground">{text}</p>
                  </div>
                </div>
              ))}
            </WriterSurface>
            <div className="grid gap-4 md:grid-cols-2">
              <SoftNote icon={MessageSquareText} title="إذا وصلتك ملاحظة">اقرأ السبب كاملًا، عدّل المقال واحفظه، ثم اضغط «إرسال بعد التعديل». إذا كانت الملاحظة غير واضحة فاستخدم صفحة الاستفسارات.</SoftNote>
              <SoftNote icon={CircleHelp} title="إذا كان غير صالح للنشر">ستجد السبب المسجل من فريق التحرير داخل بطاقة المقال. القرار لا يعني أن فكرتك بلا قيمة؛ قد يكون السبب توقيتًا أو توثيقًا أو تعارضًا تحريريًا.</SoftNote>
            </div>
          </GuideSection>

          <GuideSection id="ai" eyebrow="الاستخدام الذكي" title="استخدم المساعد كشريك تفكير" intro="أفضل نتيجة تأتي عندما تعطيه سياقًا واضحًا، ثم تراجع اقتراحاته بعقلك وخبرتك.">
            <Rows
              items={[
                { title: "اطلب أسئلة لا إجابات", text: "قل: ما الأسئلة الناقصة؟ ما الرأي المقابل؟ ما الذي يحتاج مصدرًا؟" },
                { title: "لا تسلّم له موقفك", text: "المساعد قد يرتب الحجة، لكنه لا يعرف تجربتك ولا يتحمل مسؤولية رأيك." },
                { title: "تحقق قبل أن تثق", text: "لا تعتمد رقمًا أو اسمًا أو اقتباسًا اقترحه الذكاء قبل الرجوع إلى مصدر أصلي." },
              ]}
            />
            <div className="rounded-[18px] bg-[#FFF6E5] p-5 text-[#946000] dark:bg-amber-950/30 dark:text-amber-200 sm:p-6">
              <h3 className="font-semibold">علامات تدعوك للتوقف والمراجعة</h3>
              <p className="mt-2 text-[15px] leading-8">عبارة تبدو مؤكدة بلا مصدر، اقتباس لا تتذكر أصله، وصف جارح لشخص أو فئة، استنتاج طبي أو قانوني، أو نص أصبح أنيقًا لكنه لم يعد يشبهك.</p>
            </div>
          </GuideSection>

          <GuideSection id="faq" eyebrow="أسئلة شائعة" title="مختصر مفيد">
            <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
              {faq.map((item) => (
                <details key={item.q} className="group px-5 py-4 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold leading-7">
                    <span>{item.q}</span>
                    <span className="text-xl text-[#8A99A8] transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <p className="mt-2 text-[15px] leading-8 text-[#55667A] dark:text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </WriterSurface>
          </GuideSection>

          <div className="flex flex-col items-start gap-3 rounded-[22px] bg-[#E6F4FD] p-6 dark:bg-sky-950/30 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-[#0B6FA8]">الفكرة لك، والأدوات في خدمتك</h2>
              <p className="text-sm leading-7 text-[#0B6FA8]">ابدأ بما يشغلك فعلًا. الوضوح والتحقق والصوت الصادق أهم من استخدام كل أداة متاحة.</p>
            </div>
            <Link href="/dashboard/opinion-author" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-card px-5 text-sm font-semibold text-[#0B6FA8]">
              افتح مساحة الكاتب <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <aside className="sticky top-6 hidden w-[260px] shrink-0 space-y-2.5 lg:block" aria-label="فهرس دليل الكاتب">
          <p className="text-[13px] text-[#55667A] dark:text-muted-foreground">في هذا الدليل</p>
          <WriterSurface className="space-y-0.5 p-2.5">
            {sections.map((section) => {
              const isActive = active === section.id;
              const isRead = read.includes(section.id);
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className={cn(
                    "flex h-10 items-center gap-2.5 rounded-xl px-3 text-sm transition",
                    isActive ? "bg-[#E6F4FD] font-semibold text-[#0B6FA8]" : "hover:bg-[#F7F9FB] dark:hover:bg-muted/40",
                  )}
                  data-testid={`toc-${section.id}`}
                >
                  <span
                    className={cn(
                      "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
                      isRead ? "bg-[#13734E] text-white" : "shadow-[inset_0_0_0_1.5px_#C9D5E0]",
                    )}
                  >
                    {isRead && <Check className="h-3 w-3" />}
                  </span>
                  {section.label}
                </a>
              );
            })}
          </WriterSurface>
          <p className="text-xs leading-6 text-[#617183] dark:text-muted-foreground">تظهر ✓ على ما قرأته، ويبقى الفهرس ثابتًا أثناء التمرير.</p>
        </aside>
      </div>
    </WriterPageFrame>
  );
}

function GuideSection({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-5">
      <header className="max-w-3xl space-y-1.5">
        <p className="text-[13px] font-semibold text-[#0B6FA8]">{eyebrow}</p>
        <h2 className="text-[22px] font-bold leading-tight">{title}</h2>
        {intro && <p className="text-[15px] leading-8 text-[#55667A] dark:text-muted-foreground">{intro}</p>}
      </header>
      {children}
    </section>
  );
}

function Rows({ items, numbered }: { items: Array<{ title: string; text: string }>; numbered?: boolean }) {
  return (
    <WriterSurface className="divide-y divide-[#EEF2F6] dark:divide-border">
      {items.map((item, i) => (
        <div key={item.title} className="flex items-start gap-4 px-5 py-4 sm:px-6">
          {numbered ? (
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#E6F4FD] text-sm font-bold text-[#0B6FA8]">{i + 1}</span>
          ) : (
            <Sparkles className="mt-1 h-4 w-4 shrink-0 text-[#0B6FA8]" />
          )}
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold">{item.title}</h3>
            <p className="text-sm leading-7 text-[#55667A] dark:text-muted-foreground">{item.text}</p>
          </div>
        </div>
      ))}
    </WriterSurface>
  );
}

function Checklist({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  return (
    <WriterSurface className="p-5 sm:p-6">
      <h3 className="text-base font-semibold">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item, i) => (
          <li key={item} className="flex items-start gap-2.5 text-[15px] leading-7 text-[#55667A] dark:text-muted-foreground">
            {numbered ? (
              <span className="mt-0.5 w-5 shrink-0 text-sm font-bold text-[#0B6FA8]">{i + 1}.</span>
            ) : (
              <CheckCircle2 className="mt-1.5 h-4 w-4 shrink-0 text-[#13734E]" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </WriterSurface>
  );
}

function SoftNote({ icon: Icon, title, children }: { icon: typeof Feather; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[18px] bg-[#E6F4FD] p-5 dark:bg-sky-950/30">
      <Icon className="mt-1 h-4 w-4 shrink-0 text-[#0B6FA8]" />
      <div>
        <h3 className="font-semibold text-[#0B6FA8]">{title}</h3>
        <p className="mt-1 text-[15px] leading-8 text-[#1B2B3A] dark:text-foreground/80">{children}</p>
      </div>
    </div>
  );
}
