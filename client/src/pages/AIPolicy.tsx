/**
 * سياسة استخدام الذكاء الاصطناعي — /ai-policy
 *
 * نطاق الصفحة: استخدام محتوى سبق في أنظمة AI خارجية (مطورون/شركاء).
 * ليست سياسة خصوصية القارئ — تلك في /ar/privacy.
 * ليست شرح منظومة التحرير — تلك في /sabq-ai.
 */
import { useEffect } from "react";
import { ArrowUpLeft, Mail } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";

function SectionHeading({
  id,
  number,
  title,
}: {
  id: string;
  number: string;
  title: string;
}) {
  return (
    <header id={id} className="scroll-mt-28 mb-5 md:mb-6">
      <div className="border-b border-border pb-3">
        <p className="text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground mb-1" dir="ltr">
          {number}
        </p>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{title}</h2>
      </div>
    </header>
  );
}

const ALLOWED = [
  {
    title: "الاستدلال (Inference)",
    body: "استخدام المحتوى لتقديم إجابات في المساعدات الذكية ومحركات البحث الدلالية وتطبيقات المحادثة، مع إسناد واضح ورابط مباشر للمصدر على sabq.org.",
  },
  {
    title: "الملخصات القصيرة",
    body: "إنشاء ملخصات قصيرة (حتى نحو 150 كلمة) لعرضها في تطبيقات الذكاء الاصطناعي، بشرط رابط المقال الأصلي والإسناد المطلوب.",
  },
  {
    title: "البحث والاستكشاف عبر واجهاتنا",
    body: "استخدام واجهات برمجة التطبيقات المتاحة أو خلاصات RSS للبحث في المقالات المنشورة واستكشافها وتقديم توصيات للمستخدمين النهائيين، ضمن حدود الاستخدام والإسناد.",
  },
  {
    title: "التحليل البحثي",
    body: "الاستخدام لأغراض بحثية وتحليل الاتجاهات الإخبارية، دون إعادة نشر النص الكامل ودون تدريب نماذج أساس إلا باتفاق مكتوب.",
  },
] as const;

const FORBIDDEN = [
  {
    title: "تدريب نماذج الأساس",
    body: "يُمنع استخدام محتوى سبق لتدريب نماذج اللغة الكبيرة أو نماذج الأساس أو ضبطها الدقيق (fine-tuning) دون اتفاق مكتوب مسبق مع سبق. حقل الحقوق في واجهاتنا يعلن عادةً training_allowed: false وusage: inference-only.",
  },
  {
    title: "إعادة النشر الكاملة",
    body: "يُمنع نسخ أو إعادة نشر النص الكامل للمقالات أو استبداله كمنتج محتوى بديل، حتى مع الإسناد. المسموح هو الملخصات القصيرة والربط بالمصدر.",
  },
  {
    title: "التحريف والمحتوى المضلل",
    body: "يُمنع تحريف المحتوى أو اقتطاعه بما يغيّر معناه أو نسبه زورًا أو تقديمه بطريقة تضر بسمعة سبق أو تضلل القارئ.",
  },
  {
    title: "التجريف المفرط وإساءة الاستخدام",
    body: "يُمنع السحب الآلي المفرط أو تجاوز حدود المعدل أو محاولة تجاوز ضوابط الوصول. الاستخدام المعقول عبر الواجهات الموثّقة أو RSS فقط.",
  },
  {
    title: "إعادة البيع دون اتفاق",
    body: "يُمنع بيع المحتوى كسلعة مستقلة أو ترخيصه للغير دون اتفاق شراكة مكتوب مع سبق.",
  },
] as const;

export default function AIPolicy() {
  const { data: user } = useQuery<{
    id?: string;
    name?: string | null;
    email?: string;
    role?: string;
    profileImageUrl?: string | null;
  }>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  useEffect(() => {
    document.title = "سياسة استخدام الذكاء الاصطناعي | سبق";
  }, []);
  useCanonical("https://sabq.org/ai-policy");

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      <Header user={user || undefined} />

      <section className="relative border-b border-border">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.12),_transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-14">
          <p className="text-sm font-bold text-primary mb-3">سبق</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.25]">
            سياسة استخدام الذكاء الاصطناعي
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground text-base md:text-lg leading-relaxed">
            شروط استخدام محتوى سبق في تطبيقات وأنظمة الذكاء الاصطناعي الخارجية — ترخيص{" "}
            <span dir="ltr" className="font-semibold text-foreground">
              Sabq-AI-Use-1.0
            </span>
            .
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>
              آخر تحديث: <b className="text-foreground font-semibold">يوليو 2026</b>
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>للاستخدام الخارجي للمحتوى — ليس لخصوصية القارئ</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/ai-publisher">
              <Button variant="outline" size="sm">
                دليل الناشر للـ AI
              </Button>
            </Link>
            <Link href="/sabq-ai">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                عقل سبق
              </Button>
            </Link>
            <Link href="/ar/privacy">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                سياسة الخصوصية
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14 flex-1">
        <article className="min-w-0 space-y-12 md:space-y-14">
          <section>
            <SectionHeading id="scope" number="01" title="النطاق والقبول" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                تحكم هذه السياسة استخدام محتوى صحيفة سبق («المحتوى») في أنظمة وتطبيقات الذكاء
                الاصطناعي («الأنظمة»). بالوصول إلى محتوانا عبر الموقع أو الخلاصات أو واجهات برمجة
                التطبيقات أو أي وسيلة أخرى، فإنك توافق على هذه السياسة وعلى{" "}
                <Link href="/ar/terms" className="text-primary font-semibold hover:underline underline-offset-2">
                  الشروط والأحكام
                </Link>
                .
              </p>
              <p>
                هذه الصفحة <b className="text-foreground font-semibold">لا</b> تصف كيف تعالج سبق
                بيانات القرّاء داخل خدماتها الذكية — ذلك في{" "}
                <Link href="/ar/privacy" className="text-primary font-semibold hover:underline underline-offset-2">
                  سياسة الخصوصية
                </Link>
                . ولمنهجية التحرير بالذكاء الاصطناعي داخل سبق، راجع{" "}
                <Link href="/sabq-ai" className="text-primary font-semibold hover:underline underline-offset-2">
                  عقل سبق
                </Link>
                .
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="services" number="02" title="ما يشمله المحتوى والخدمات" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>لأغراض هذه السياسة، يشمل «المحتوى» ما تنشره سبق للعامة، ومن ذلك على سبيل المثال:</p>
              <ul className="space-y-2.5 list-none">
                <li className="ps-3 border-s-2 border-primary/40">
                  المقالات والأخبار والتحليلات باللغات المتاحة على المنصة (ومنها العربية والإنجليزية
                  والأردية حيث تُنشر).
                </li>
                <li className="ps-3 border-s-2 border-border">
                  الملخصات والعناوين والبيانات الوصفية المرتبطة بالمقالات المنشورة.
                </li>
                <li className="ps-3 border-s-2 border-border">
                  تغطية رياضية عامة ظاهرة على المنصة (مثل صفحات البطولات) بصفتها محتوى منشورًا — دون
                  منح حق إعادة بيع البيانات الخام أو تدريب النماذج عليها.
                </li>
                <li className="ps-3 border-s-2 border-border">
                  ما يُقدَّم عبر واجهات عامة موثّقة (مثل مسارات المقالات والبحث) أو خلاصات RSS، مع
                  احترام حقول الحقوق المرفقة إن وُجدت.
                </li>
              </ul>
              <p>
                لا تشمل هذه السياسة أدوات التحرير الداخلية أو لوحة التحكم أو بيانات الحسابات الخاصة
                بالقرّاء أو بيانات غير المنشورة.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="allowed" number="03" title="الاستخدامات المسموحة" />
            <div className="space-y-3">
              {ALLOWED.map((item) => (
                <div key={item.title} className="rounded-xl border border-border bg-card/40 px-4 py-3.5">
                  <h3 className="text-sm font-extrabold text-foreground mb-1">{item.title}</h3>
                  <p className="text-[13.5px] text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.04] px-4 py-4">
              <h3 className="text-sm font-extrabold text-foreground mb-2">متطلبات الإسناد</h3>
              <p className="text-[13.5px] text-muted-foreground leading-relaxed mb-3">
                في كل استخدام مسموح يجب إظهار إسناد واضح يتضمن اسم سبق ورابطًا للمصدر:
              </p>
              <code
                dir="ltr"
                className="block rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] text-foreground"
              >
                المصدر: صحيفة سبق — [رابط المقال على sabq.org]
              </code>
            </div>
          </section>

          <section>
            <SectionHeading id="forbidden" number="04" title="الاستخدامات الممنوعة" />
            <div className="space-y-3">
              {FORBIDDEN.map((item) => (
                <div key={item.title} className="rounded-xl border border-border px-4 py-3.5">
                  <h3 className="text-sm font-extrabold text-foreground mb-1">{item.title}</h3>
                  <p className="text-[13.5px] text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <SectionHeading id="license" number="05" title="الترخيص والملكية الفكرية" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                جميع المحتويات المنشورة على سبق محمية بحقوق النشر والملكية الفكرية. تمنح هذه السياسة
                ترخيصًا محدودًا غير حصري وقابلًا للإلغاء لاستخدام المحتوى وفق الشروط أعلاه فقط.
              </p>
              <p>
                اسم الترخيص المرجعي:{" "}
                <b dir="ltr" className="text-foreground font-semibold">
                  Sabq-AI-Use-1.0
                </b>
                . عند توفر حقول حقوق في استجابة الواجهة البرمجية (مثل{" "}
                <span dir="ltr">attribution_required</span> و<span dir="ltr">training_allowed</span>{" "}
                و<span dir="ltr">usage</span>)، تُعد جزءًا مكمّلًا لهذه السياسة ويجب احترامها.
              </p>
              <p>
                تحتفظ سبق بالحق في تعليق أو إنهاء الترخيص عند المخالفة، وتعديل هذه السياسة مع نشر
                النسخة المحدّثة على هذه الصفحة.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="access" number="06" title="الوصول التقني والحدود" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                للاطلاع على أمثلة الاستدعاءات وحقول الحقوق، راجع{" "}
                <Link href="/ai-publisher" className="text-primary font-semibold hover:underline underline-offset-2">
                  دليل الناشر للـ AI
                </Link>
                {" "}و{" "}
                <Link href="/developers" className="text-primary font-semibold hover:underline underline-offset-2">
                  صفحة المطوّرين
                </Link>
                . قد تتوفر مسارات عامة للمقالات والبحث وخلاصات RSS وفق ما هو موثّق على المنصة.
              </p>
              <div className="grid sm:grid-cols-3 gap-3 pt-1">
                <div className="rounded-xl border border-border bg-card/40 px-4 py-3.5">
                  <h3 className="text-sm font-extrabold text-foreground mb-1.5">استخدام مجاني نموذجي</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    حدود معدّل معقولة للاستخدام غير التجاري (مثلًا بحدود يومية ودقيقة معلنة في دليل
                    الناشر). الإسناد إلزامي.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card/40 px-4 py-3.5">
                  <h3 className="text-sm font-extrabold text-foreground mb-1.5">احترافي</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    حدود أعلى ودعم تقني باتفاق — تواصل للشراكات.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card/40 px-4 py-3.5">
                  <h3 className="text-sm font-extrabold text-foreground mb-1.5">مؤسسي</h3>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">
                    حدود وترخيص مخصّصان، وقد يشمل ترخيص تدريب محدود إن وُافق عليه كتابيًا.
                  </p>
                </div>
              </div>
              <p className="text-[13.5px]">
                الأرقام الدقيقة للحدود قد تتغيّر حسب الحمولة والاتفاقيات؛ المصدر التشغيلي المرجعي هو
                ما يُعلن في دليل الناشر أو يُتفق عليه تعاقديًا.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="privacy-note" number="07" title="علاقة السياسة بخصوصية القرّاء" />
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              إن كنت مطورًا تبني نظامًا يجمع بيانات مستخدميه أثناء عرض محتوى سبق، فأنت المسؤول عن
              امتثال نظامك لأنظمة الخصوصية المعمول بها. سياسة خصوصية سبق للقرّاء على sabq.org موضّحة
              في{" "}
              <Link href="/ar/privacy" className="text-primary font-semibold hover:underline underline-offset-2">
                /ar/privacy
              </Link>
              ، وتشمل كيف تستخدم سبق الذكاء الاصطناعي لخدمة قارئها — وهي منفصلة عن ترخيص استخدام
              المحتوى هنا.
            </p>
          </section>

          <section>
            <SectionHeading id="contact" number="08" title="التواصل والشراكات" />
            <div className="rounded-2xl border border-border bg-muted/30 px-5 py-6 sm:px-7">
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                للترخيص والشراكات وحدود أعلى أو إذن تدريب مكتوب:
              </p>
              <div className="space-y-3 mb-6">
                <a
                  href="mailto:partnerships@sabq.org"
                  className="flex items-center gap-2 text-base font-extrabold text-foreground hover:text-primary"
                >
                  <Mail className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
                  partnerships@sabq.org
                </a>
                <a
                  href="mailto:privacy@sabq.org"
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
                >
                  <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                  privacy@sabq.org — للاستفسارات المتعلقة بالخصوصية
                </a>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/ai-publisher">
                  <Button variant="default" className="gap-2">
                    دليل الناشر للـ AI
                    <ArrowUpLeft className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline">اتصل بنا</Button>
                </Link>
                <Link href="/ar/terms">
                  <Button variant="ghost" className="text-muted-foreground">
                    الشروط والأحكام
                  </Button>
                </Link>
              </div>
            </div>
          </section>

          <section>
            <SectionHeading id="disclaimer" number="09" title="إخلاء المسؤولية" />
            <p className="text-[13.5px] text-muted-foreground leading-relaxed">
              تُقدَّم الواجهات والمحتوى «كما هي» دون ضمانات من أي نوع بالقدر الذي تسمح به الأنظمة.
              لا تتحمل سبق مسؤولية أضرار ناتجة عن استخدام المحتوى أو الواجهات خارج نطاق سيطرتها.
              يتحمل المستخدم مسؤولية الامتثال لهذه السياسة والأنظمة المعمول بها. باستخدام خدماتنا
              فإنك توافق على عدم تحميل سبق مسؤولية المطالبات الناتجة عن انتهاكك لهذه السياسة، وذلك في
              حدود ما يسمح به النظام.
            </p>
          </section>
        </article>
      </div>

      <Footer />
    </div>
  );
}
