import { Link } from "wouter";
import type { ReactNode } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  BookOpenCheck,
  BrainCircuit,
  CalendarClock,
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

export default function WriterGuidePage() {
  return (
    <DashboardLayout>
      <main className="mt-3 w-full bg-background pb-12 text-right" dir="rtl">
        <section className="overflow-hidden rounded-2xl border border-sky-200/70 bg-sky-50/55 p-5 dark:border-sky-900/40 dark:bg-sky-950/10 sm:p-7 lg:p-9">
          <div className="max-w-3xl">
            <Badge variant="outline" className="mb-4 gap-1.5 border-sky-300 bg-background/70 text-sky-800 dark:text-sky-200">
              <BookOpenCheck className="h-3.5 w-3.5" /> دليل الكاتب
            </Badge>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">من الفكرة الأولى إلى المقال المنشور</h1>
            <p className="mt-4 text-base leading-8 text-foreground/70 sm:text-lg sm:leading-9">
              هذا الدليل يشرح لك مساحة الكاتب وأدواتها، وكيف تستفيد من الذكاء دون أن يفقد المقال صوتك. اقرأه بالترتيب أو انتقل مباشرة إلى ما تحتاجه.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="min-h-11 gap-2"><Link href="/dashboard/articles/new"><PenLine className="h-4 w-4" /> ابدأ مقالًا جديدًا</Link></Button>
              <Button asChild variant="outline" className="min-h-11 gap-2 bg-background/70"><Link href="/dashboard/opinion-author">العودة إلى مساحة الكاتب <ArrowLeft className="h-4 w-4" /></Link></Button>
            </div>
          </div>
        </section>

        <nav aria-label="فهرس دليل الكاتب" className="sticky top-0 z-20 -mx-3 mt-4 overflow-x-auto border-y bg-background/95 px-3 py-2 backdrop-blur md:top-0 md:mx-0 md:rounded-xl md:border">
          <div className="flex min-w-max gap-2 md:flex-wrap">
            {sections.map((section) => <a key={section.id} href={`#${section.id}`} className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">{section.label}</a>)}
          </div>
        </nav>

        <div className="mx-auto mt-8 max-w-6xl space-y-12 sm:mt-10 sm:space-y-16">
          <GuideSection id="start" eyebrow="ابدأ ببساطة" title="لا تبدأ بالصياغة؛ ابدأ بالسؤال" intro="المقال الجيد لا يحتاج فكرة ضخمة، بل سؤالًا واضحًا وموقفًا يمكنك الدفاع عنه بإنصاف.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Step number="١" title="ما الذي يشغلك؟" text="اكتب القضية في جملة واحدة دون محاولة تجميلها." />
              <Step number="٢" title="ماذا تريد أن تقول؟" text="حوّل القضية إلى موقف واضح، لا عنوان عام." />
              <Step number="٣" title="لماذا الآن؟" text="حدد تغيرًا أو موقفًا يجعل الفكرة جديرة بالقراءة اليوم." />
              <Step number="٤" title="ما الذي يثبتها؟" text="اجمع مثالًا أو رقمًا موثقًا ورأيًا مقابلًا قبل الكتابة." />
            </div>
            <SoftNote icon={Sparkles} title="صيغة تساعدك على البدء">أرى أن… لأن… وقد يعترض البعض بأن… لكن ما نغفله هو…</SoftNote>
          </GuideSection>

          <GuideSection id="ideas" eyebrow="مساحة الكاتب الذكية" title="ما أدوات الأفكار؟ وكيف تعمل؟" intro="كل أداة تجيب عن حاجة مختلفة. استخدم الأداة التي تقرّبك من الكتابة، ولا تشعر أنك مطالب باستخدامها كلها.">
            <div className="grid gap-4 md:grid-cols-2">
              {ideaTools.map((tool) => <IdeaTool key={tool.title} {...tool} />)}
            </div>
          </GuideSection>

          <GuideSection id="writing" eyebrow="وقت الكتابة" title="مقال واضح، إنساني، ويمكن الوثوق به" intro="في المحرر ستجد فقط ما تحتاجه: العنوان، نص المقال، والصورة. أما التفاصيل الفنية والتحريرية الأخرى فيتولاها الفريق.">
            <div className="grid gap-5 lg:grid-cols-2">
              <ReadingCard title="قبل الإرسال" icon={CheckCircle2} items={["العنوان يعبر عن موقف المقال ولا يَعِد بما لا يقدمه.", "الفكرة الأساسية تظهر مبكرًا، وليست مخبأة في الخاتمة.", "كل رقم أو اقتباس أو ادعاء حساس له مصدر موثوق.", "ذكرت الرأي المقابل بإنصاف قبل الرد عليه.", "حذفت التكرار والجمل التي لا تخدم الفكرة.", "الصورة مناسبة ولا تنتهك حقوقًا أو خصوصية."]} />
              <ReadingCard title="بناء بسيط مقترح" icon={PenLine} items={["مدخل قصير يضع القارئ داخل السؤال.", "الموقف الذي تريد الدفاع عنه بوضوح.", "حجتان أو ثلاث، لكل واحدة مثال أو دليل.", "اعتراض حقيقي والرد عليه بهدوء.", "خاتمة تفتح معنى أو سؤالًا، لا تعيد المقدمة."]} />
            </div>
            <SoftNote icon={ShieldCheck} title="تنبيه مهم">لا تضع بيانات شخصية، مراسلات خاصة، اتهامات، أو معلومات غير متحققة. عند الشك، اذكر حدود معرفتك أو تواصل مع فريق التحرير قبل الإرسال.</SoftNote>
          </GuideSection>

          <GuideSection id="review" eyebrow="بعد الضغط على إرسال" title="كيف تتابع المقال حتى النشر؟" intro="تبويب «مقالاتي» هو سجل المتابعة. يتحدث تلقائيًا ويعرض آخر قرار تحريري وموعده وما المطلوب منك.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {journey.map((item) => <JourneyStep key={item.title} {...item} />)}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SoftNote icon={MessageSquareText} title="إذا وصلتك ملاحظة">اقرأ السبب كاملًا، عدّل المقال واحفظه، ثم اضغط «إرسال بعد التعديل». إذا كانت الملاحظة غير واضحة فاستخدم صفحة الاستفسارات.</SoftNote>
              <SoftNote icon={CircleHelp} title="إذا كان غير صالح للنشر">ستجد السبب المسجل من فريق التحرير داخل بطاقة المقال. القرار لا يعني أن فكرتك بلا قيمة؛ قد يكون السبب توقيتًا أو توثيقًا أو تعارضًا تحريريًا.</SoftNote>
            </div>
          </GuideSection>

          <GuideSection id="ai" eyebrow="ذكاء يحافظ على صوتك" title="استخدم المساعد كشريك تفكير" intro="أفضل نتيجة تأتي عندما تعطيه سياقًا واضحًا، ثم تراجع اقتراحاته بعقلك وخبرتك.">
            <div className="grid gap-4 md:grid-cols-3">
              <Principle title="اطلب أسئلة لا إجابات" text="قل: ما الأسئلة الناقصة؟ ما الرأي المقابل؟ ما الذي يحتاج مصدرًا؟" />
              <Principle title="لا تسلّم له موقفك" text="المساعد قد يرتب الحجة، لكنه لا يعرف تجربتك ولا يتحمل مسؤولية رأيك." />
              <Principle title="تحقق قبل أن تثق" text="لا تعتمد رقمًا أو اسمًا أو اقتباسًا اقترحه الذكاء قبل الرجوع إلى مصدر أصلي." />
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/40 dark:bg-amber-950/10 sm:p-6">
              <h3 className="font-semibold text-amber-950 dark:text-amber-100">علامات تدعوك للتوقف والمراجعة</h3>
              <p className="mt-2 text-base leading-8 text-amber-950/75 dark:text-amber-100/75">عبارة تبدو مؤكدة بلا مصدر، اقتباس لا تتذكر أصله، وصف جارح لشخص أو فئة، استنتاج طبي أو قانوني، أو نص أصبح أنيقًا لكنه لم يعد يشبهك.</p>
            </div>
          </GuideSection>

          <GuideSection id="faq" eyebrow="مختصر مفيد" title="أسئلة شائعة">
            <div className="space-y-3">
              {faq.map((item) => <details key={item.q} className="group rounded-xl border bg-card p-4 sm:p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold leading-7"><span>{item.q}</span><span className="text-xl text-muted-foreground transition-transform group-open:rotate-45">＋</span></summary><p className="mt-3 border-t pt-3 text-base leading-8 text-muted-foreground">{item.a}</p></details>)}
            </div>
          </GuideSection>

          <section className="rounded-2xl border bg-muted/35 p-6 text-center sm:p-8">
            <BookOpenCheck className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-3 text-2xl font-bold">الفكرة لك، والأدوات في خدمتك</h2>
            <p className="mx-auto mt-2 max-w-2xl text-base leading-8 text-muted-foreground">ابدأ بما يشغلك فعلًا. الوضوح والتحقق والصوت الصادق أهم من استخدام كل أداة متاحة.</p>
            <Button asChild className="mt-5 min-h-11 gap-2"><Link href="/dashboard/opinion-author">افتح مساحة الكاتب <ArrowLeft className="h-4 w-4" /></Link></Button>
          </section>
        </div>
      </main>
    </DashboardLayout>
  );
}

function GuideSection({ id, eyebrow, title, intro, children }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-24 space-y-5"><header className="max-w-3xl"><p className="text-sm font-semibold text-sky-700 dark:text-sky-300">{eyebrow}</p><h2 className="mt-1 text-2xl font-bold leading-tight sm:text-3xl">{title}</h2>{intro && <p className="mt-3 text-base leading-8 text-muted-foreground sm:text-lg sm:leading-9">{intro}</p>}</header>{children}</section>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <Card className="shadow-none"><CardContent className="p-4 sm:p-5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200">{number}</span><h3 className="mt-4 font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground">{text}</p></CardContent></Card>;
}

function IdeaTool({ icon: Icon, title, description, use }: (typeof ideaTools)[number]) {
  return <Card className="shadow-none"><CardContent className="p-5 sm:p-6"><div className="flex items-start gap-3"><span className="rounded-lg bg-sky-50 p-1.5 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 sm:rounded-xl sm:p-2.5"><Icon className="h-4 w-4 sm:h-5 sm:w-5" /></span><div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-2 text-base leading-8 text-muted-foreground">{description}</p></div></div><div className="mt-4 rounded-xl bg-muted/45 p-3 text-sm leading-7"><strong>كيف تستخدمها؟ </strong>{use}</div></CardContent></Card>;
}

function SoftNote({ icon: Icon, title, children }: { icon: typeof Feather; title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-sky-200/70 bg-sky-50/45 p-4 dark:border-sky-900/40 dark:bg-sky-950/10 sm:p-5"><div className="flex items-start gap-3"><Icon className="mt-1 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300 sm:h-5 sm:w-5" /><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-7 text-foreground/70 sm:text-base sm:leading-8">{children}</p></div></div></div>;
}

function ReadingCard({ title, icon: Icon, items }: { title: string; icon: typeof Feather; items: string[] }) {
  return <Card className="shadow-none"><CardContent className="p-5 sm:p-6"><h3 className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-4 w-4 text-sky-700 dark:text-sky-300 sm:h-5 sm:w-5" />{title}</h3><ul className="mt-4 space-y-3">{items.map((item) => <li key={item} className="flex items-start gap-2 text-sm leading-7 text-muted-foreground sm:text-base"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}</ul></CardContent></Card>;
}

function JourneyStep({ icon: Icon, title, text }: { icon: typeof Feather; title: string; text: string }) {
  return <div className="relative rounded-xl border bg-card p-4"><Icon className="h-4 w-4 text-sky-700 dark:text-sky-300 sm:h-5 sm:w-5" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}

function Principle({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border bg-card p-5"><Sparkles className="h-4 w-4 text-sky-700 dark:text-sky-300 sm:h-5 sm:w-5" /><h3 className="mt-3 font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-muted-foreground sm:text-base">{text}</p></div>;
}
