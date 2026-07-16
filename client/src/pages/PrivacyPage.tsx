/**
 * سياسة الخصوصية — /privacy و /ar/privacy
 *
 * المحتوى: مسودة تقنية محدّثة بقسم الذكاء الاصطناعي مبني على ما تعمل به المنصة.
 * الاعتماد القانوني النهائي (PDPL والمستشار) يبقى عند الإدارة.
 *
 * التصميم: وثيقة مقروءة بعرض واحد — بلا فهرس جانبي.
 */
import { useEffect } from "react";
import {
  ArrowUpLeft,
  Brain,
  Mail,
  Mic,
  Newspaper,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";

const AI_FEATURES = [
  {
    icon: Sparkles,
    title: "التوصيات والتخصيص",
    body: "حساب التوصيات والموجز اليومي وهضم الإشعارات يعتمد أساسًا على بيانات تفاعلك واهتماماتك داخل أنظمة سبق. لتحسين جودة التشابه بين المقالات، قد تُعالَج نصوص المقالات التحريرية (لا بيانات حسابك) عبر خدمات متجهات من مزوّدين مثل OpenAI.",
  },
  {
    icon: Shield,
    title: "إشراف التعليقات",
    body: "عند نشر تعليق، يُحلَّل نصّه آليًا لأغراض السلامة والجودة. قد يُرسل نص التعليق إلى مزوّدي نماذج متعاقدين مثل OpenAI، مع احتياطي عبر Anthropic أو Google Gemini حسب إعدادات المنصة. لا يوجد إلغاء منفصل لهذه المراجعة لأنها جزء من حماية المجتمع.",
  },
  {
    icon: Newspaper,
    title: "النشرة البريدية الذكية",
    body: "إن اشتركت في النشرة، قد نستخدم نماذج لغوية (مثل OpenAI) لصياغة مقدمة أو عناوين مخصّصة بناءً على اهتمامات التصنيفات ومحتوى النشرة. الاشتراك قد يُزامَن مع منصة إرسال بريد متعاقدة (مثل MailerLite). يمكنك الإلغاء من رابط الرسالة في أي وقت.",
  },
  {
    icon: Volume2,
    title: "الصوت والنشرات المسموعة",
    body: "إذا طلبت الاستماع لملخص مقال أو نشرة صوتية، يُحوَّل النص التحريري إلى صوت عبر مزوّدين مثل ElevenLabs و/أو Google Cloud TTS و/أو OpenAI حسب الإعداد. بيانات تتبّع الاستماع تُحفظ على أنظمة سبق ولا تُرسل إلى مزوّد التحويل الصوتي كملفّ شخصي.",
  },
  {
    icon: Mic,
    title: "المساعد الصوتي في المتصفح",
    body: "إن فعّلت الأوامر الصوتية، يتم التعرّف على الكلام غالبًا عبر إمكانيات المتصفح/نظام التشغيل لديك. يمكنك إيقاف الميزة ومنع صلاحية الميكروفون من إعدادات المتصفح.",
  },
] as const;

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

export default function PrivacyPage() {
  const { data: user } = useQuery<{
    name?: string | null;
    email?: string;
    role?: string;
    profileImageUrl?: string | null;
  }>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    document.title = "سياسة الخصوصية | سبق";
  }, []);
  useCanonical("https://sabq.org/ar/privacy");

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      <Header user={user || undefined} />

      {/* Hero — تكوين واحد: اسم سبق + العنوان + جملة قصيرة */}
      <section className="relative border-b border-border">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.12),_transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-14">
          <p className="text-sm font-bold text-primary mb-3" data-testid="text-privacy-subtitle">
            سبق
          </p>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.25]"
            data-testid="heading-privacy-title"
          >
            سياسة الخصوصية
          </h1>
          <p
            className="mt-4 max-w-2xl text-muted-foreground text-base md:text-lg leading-relaxed"
            data-testid="text-intro-content"
          >
            كيف نجمع بياناتك ونستخدمها ونحميها — بما في ذلك خدمات الذكاء الاصطناعي
            مثل التوصيات وإشراف التعليقات والصوت والنشرات.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span data-testid="text-last-updated">
              آخر تحديث: <b className="text-foreground font-semibold">يوليو 2026</b>
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>ملتزمون بنظام حماية البيانات الشخصية في المملكة</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/notification-settings">
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-manage-preferences-top">
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                إدارة التفضيلات
              </Button>
            </Link>
            <Link href="/sabq-ai">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" data-testid="button-sabq-ai-top">
                <Brain className="w-4 h-4" aria-hidden="true" />
                عقل سبق
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14 flex-1">
          <article className="min-w-0 space-y-12 md:space-y-14">
            {/* 1 */}
            <section>
              <SectionHeading id="collect" number="01" title="المعلومات التي نجمعها" />
              <div className="space-y-5 text-[15px] leading-relaxed text-muted-foreground">
                <div>
                  <h3 className="text-foreground font-bold mb-1.5">معلومات تقدمها أنت</h3>
                  <p>
                    مثل الاسم والبريد الإلكتروني عند إنشاء حساب أو الاشتراك في النشرة البريدية،
                    والاهتمامات التي تختارها، والتعليقات التي تنشرها.
                  </p>
                </div>
                <div>
                  <h3 className="text-foreground font-bold mb-1.5">بيانات الاستخدام</h3>
                  <ul className="space-y-3 list-none">
                    <li className="ps-3 border-s-2 border-primary/40">
                      <b className="text-foreground">بيانات التفاعل:</b> المقالات التي تقرأها،
                      المواضيع التي تفضلها، والإعجابات والحفظ، والوقت على المنصة — لتشغيل التوصيات
                      والموجز المناسب لك.
                    </li>
                    <li className="ps-3 border-s-2 border-border">
                      <b className="text-foreground">بيانات تقنية:</b> نوع الجهاز، نظام التشغيل،
                      عنوان IP، ونوع المتصفح — لتحسين الأداء والأمان، وقد تُسجَّل مع بعض أحداث
                      الاستماع للنشرات الصوتية.
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* 2 */}
            <section>
              <SectionHeading id="use" number="02" title="كيف نستخدم معلوماتك" />
              <ul className="grid sm:grid-cols-2 gap-3">
                {[
                  {
                    t: "تخصيص تجربتك",
                    d: "توصيات إخبارية، موجز يومي، وهضم/إشعارات مخصّصة عند تفعيلها.",
                  },
                  {
                    t: "حماية المجتمع",
                    d: "مراجعة آلية للتعليقات للمساعدة في كشف المحتوى المسيء أو المخالف.",
                  },
                  {
                    t: "تحسين الخدمات",
                    d: "فهم تفاعل القرّاء مع المنصة وتطوير ميزات جديدة.",
                  },
                  {
                    t: "التواصل معك",
                    d: "إشعارات الحساب وتحديثات المنصة والنشرات بعد موافقتك أو اشتراكك.",
                  },
                ].map((item) => (
                  <li
                    key={item.t}
                    className="rounded-xl border border-border bg-card/40 px-4 py-3.5"
                  >
                    <h3 className="text-sm font-extrabold text-foreground mb-1">{item.t}</h3>
                    <p className="text-[13.5px] text-muted-foreground leading-relaxed">{item.d}</p>
                  </li>
                ))}
              </ul>
            </section>

            {/* 3 — AI featured band */}
            <section id="ai" className="scroll-mt-28">
              <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] px-4 py-6 sm:px-6 sm:py-8 md:px-8">
                <div className="flex items-start gap-3 mb-5">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Brain className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground mb-1" dir="ltr">
                      03
                    </p>
                    <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
                      الذكاء الاصطناعي وبياناتك
                    </h2>
                  </div>
                </div>

                <div className="space-y-3 text-[15px] leading-relaxed text-muted-foreground mb-7">
                  <p>
                    نستخدم تقنيات الذكاء الاصطناعي لتحسين تجربتك وحماية المنصة — لا لاستغلال
                    بياناتك تجاريًا. بيانات القرّاء تُستخدم لخدمتهم ضمن المنصة، ولا نبيع معلوماتك
                    الشخصية.{" "}
                    <Link href="/sabq-ai" className="text-primary font-semibold underline-offset-2 hover:underline">
                      اعرف منهجية «عقل سبق»
                    </Link>
                    .
                  </p>
                  <p>
                    بعض الخدمات تعمل على خوادم سبق، وبعضها يمرّ عبر مزوّدين متعاقدين لمعالجة
                    محدودة بالغرض. لا نرسل ملفّك الشخصي الكامل (مثل بريدك وسجل قراءتك الكامل) إلى
                    نماذج الذكاء الاصطناعي إلا بالقدر اللازم للخدمة التي طلبتها أو التي يقتضيها
                    أمان المنصة.
                  </p>
                </div>

                <h3 className="text-sm font-extrabold text-foreground mb-3">ما الذي يعمل بالذكاء الاصطناعي؟</h3>
                <div className="space-y-3 mb-7">
                  {AI_FEATURES.map((f) => (
                    <div
                      key={f.title}
                      className="flex gap-3 rounded-xl bg-background/80 border border-border/80 px-3.5 py-3.5"
                    >
                      <f.icon className="w-5 h-5 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                      <div className="min-w-0">
                        <h4 className="text-sm font-extrabold text-foreground mb-1">{f.title}</h4>
                        <p className="text-[13.5px] text-muted-foreground leading-relaxed">{f.body}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-7">
                  <div className="rounded-xl border border-border bg-background/70 px-4 py-4">
                    <h3 className="text-sm font-extrabold text-foreground mb-2">مزوّدون ومعالجة</h3>
                    <p className="text-[13.5px] text-muted-foreground leading-relaxed">
                      نتعامل مع مزوّدي الخدمات بوصفهم معالجين متعاقدين. لا نبيع بياناتك، ولا نستخدم
                      بياناتك الشخصية لتدريب نماذج عامة نملكها وننشرها. سياسات التدريب لدى المزوّدين
                      تحكمها عقودهم وإعدادات الخدمة؛ نسعى لإعدادات تمنع استخدام محتوى العملاء لتدريب
                      نماذج عامة حيث يتيسّر ذلك تعاقديًا.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/70 px-4 py-4">
                    <h3 className="text-sm font-extrabold text-foreground mb-2">كيف تتحكم؟</h3>
                    <ul className="space-y-2.5 text-[13.5px] text-muted-foreground leading-relaxed">
                      <li>
                        <Link href="/notification-settings" className="text-primary font-semibold hover:underline underline-offset-2">
                          إعدادات الإشعارات
                        </Link>
                        {" — "}التخصيص والتوصيات والهضم اليومي.
                      </li>
                      <li>النشرة: إلغاء الاشتراك من رابط الرسالة.</li>
                      <li>الصوت: لا تستخدم الاستماع إن لم ترغب بتمرير النص لخدمة التحويل.</li>
                      <li>طلبات البيانات: عبر قنوات الاتصال أدناه وفق الأنظمة المعمول بها.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>

            {/* 4 */}
            <section>
              <SectionHeading id="protect" number="04" title="كيف نحمي معلوماتك" />
              <ul className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <li className="ps-3 border-s-2 border-border">
                  تدابير أمنية تقنية وتنظيمية مناسبة (تشفير، نقل آمن، ضوابط وصول).
                </li>
                <li className="ps-3 border-s-2 border-border">
                  لا نبيع أو نؤجر معلوماتك الشخصية لأطراف ثالثة لأغراض تسويقية دون موافقتك الصريحة.
                </li>
                <li className="ps-3 border-s-2 border-border">
                  نقيّد وصول الموظفين والمقاولين بما يلزم لأداء مهامهم، ونراجع مزوّدي الخدمات عند التعاقد.
                </li>
              </ul>
            </section>

            {/* 5 */}
            <section>
              <SectionHeading id="cookies" number="05" title="ملفات تعريف الارتباط" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                نستخدم ملفات تعريف الارتباط وتقنيات مشابهة لتخزين تفضيلاتك وتشغيل الجلسة وتحسين
                التصفح وقياس الأداء. يمكنك التحكم في كثير منها من إعدادات المتصفح؛ تعطيل بعضها قد
                يؤثر على عمل المنصة.
              </p>
            </section>

            {/* 6 */}
            <section>
              <SectionHeading id="rights" number="06" title="حقوقك" />
              <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
                <p>
                  وفق الأنظمة المعمول بها في المملكة العربية السعودية (بما في ذلك نظام حماية
                  البيانات الشخصية) وما ينطبق من ممارساتنا، لك حقوق تشمل: الوصول إلى بياناتك، طلب
                  تصحيحها، طلب حذفها في الحالات النظامية، والاعتراض على بعض أنواع المعالجة أو سحب
                  موافقتك حين يكون الأساس هو الموافقة.
                </p>
                <p>
                  يمكنك إلغاء الاشتراك من الرسائل البريدية في أي وقت، وإدارة تفضيلات التخصيص
                  والإشعارات من حسابك. لطلب ممارسة حقوقك راسلنا عبر البريد أدناه أو صفحة اتصل بنا.
                </p>
              </div>
            </section>

            {/* 7 */}
            <section>
              <SectionHeading id="changes" number="07" title="التغييرات على هذه السياسة" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                قد نحدّث هذه السياسة مع تطوّر خدماتنا — بما في ذلك خدمات الذكاء الاصطناعي. عند
                تغييرات جوهرية سننشر النسخة المحدّثة هنا مع تحديث تاريخ «آخر تحديث»، وقد نُعلمك عبر
                المنصة أو البريد عند الاقتضاء.
              </p>
            </section>

            {/* 8 */}
            <section>
              <SectionHeading id="contact" number="08" title="الاتصال بنا" />
              <div className="rounded-2xl border border-border bg-muted/30 px-5 py-6 sm:px-7">
                <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                  لأسئلة الخصوصية أو طلبات البيانات الشخصية:
                </p>
                <a
                  href="mailto:privacy@sabq.org"
                  className="inline-flex items-center gap-2 text-lg font-extrabold text-foreground hover:text-primary"
                  data-testid="link-privacy-email"
                >
                  <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
                  privacy@sabq.org
                </a>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/contact">
                    <Button variant="default" className="gap-2" data-testid="button-contact-privacy">
                      صفحة اتصل بنا
                      <ArrowUpLeft className="w-4 h-4" aria-hidden="true" />
                    </Button>
                  </Link>
                  <Link href="/notification-settings">
                    <Button variant="outline" className="gap-2" data-testid="button-manage-preferences">
                      <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                      إدارة تفضيلاتك
                    </Button>
                  </Link>
                  <Link href="/ai-policy">
                    <Button variant="ghost" className="gap-2 text-muted-foreground" data-testid="button-ai-policy">
                      سياسة استخدام المحتوى للـ AI
                    </Button>
                  </Link>
                </div>
              </div>
            </section>
          </article>
      </div>

      <Footer />
    </div>
  );
}
