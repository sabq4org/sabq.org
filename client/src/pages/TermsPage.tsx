/**
 * الشروط والأحكام — /terms و /ar/terms
 * تصميم وثيقة مقروءة متوافق مع صفحة سياسة الخصوصية.
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

export default function TermsPage() {
  const { data: user } = useQuery<{
    name?: string | null;
    email?: string;
    role?: string;
    profileImageUrl?: string | null;
  }>({
    queryKey: ["/api/auth/user"],
  });

  useEffect(() => {
    document.title = "الشروط والأحكام | سبق";
  }, []);
  useCanonical("https://sabq.org/ar/terms");

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      <Header user={user || undefined} />

      <section className="relative border-b border-border">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.12),_transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-14">
          <p className="text-sm font-bold text-primary mb-3" data-testid="text-terms-subtitle">
            سبق
          </p>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.25]"
            data-testid="heading-terms-title"
          >
            الشروط والأحكام
          </h1>
          <p
            className="mt-4 max-w-2xl text-muted-foreground text-base md:text-lg leading-relaxed"
            data-testid="text-intro-content"
          >
            باستخدامك لمنصة سبق، فإنك توافق على هذه الشروط. نرجو قراءتها بعناية — واستمرارك في
            الاستخدام يُعد قبولًا بها.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span data-testid="text-last-updated">
              آخر تحديث: <b className="text-foreground font-semibold">يوليو 2026</b>
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>تخضع لأنظمة المملكة العربية السعودية</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/ar/privacy">
              <Button variant="outline" size="sm" data-testid="button-privacy-link">
                سياسة الخصوصية
              </Button>
            </Link>
            <Link href="/sabq-ai">
              <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-sabq-ai-link">
                عقل سبق
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14 flex-1">
        <article className="min-w-0 space-y-12 md:space-y-14">
          <section>
            <SectionHeading id="usage" number="01" title="استخدام المنصة" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                تلتزم باستخدام المنصة لأغراض مشروعة وبما لا ينتهك حقوق الآخرين أو يحد من استخدامهم
                للمنصة.
              </p>
              <p>
                المحتوى المنشور على سبق (نصوص، صور، فيديوهات وغيرها) ملك فكري للمنصة ومحمي بموجب
                أنظمة حقوق النشر، ولا يجوز نسخه أو إعادة نشره دون إذن خطي مسبق — مع مراعاة ما تسمح
                به سياسة استخدام المحتوى للذكاء الاصطناعي على{" "}
                <Link href="/ai-policy" className="text-primary font-semibold hover:underline underline-offset-2">
                  /ai-policy
                </Link>
                .
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="ai-services" number="02" title="المحتوى والخدمات الذكية" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                تستخدم سبق تقنيات الذكاء الاصطناعي لتحليل المحتوى وتقديم توصيات مخصصة وتحسين جودة
                التجربة — بما في ذلك ميزات مثل الموجز والتخصيص وإشراف التعليقات والصوت، وفق ما هو
                موضّح في{" "}
                <Link href="/ar/privacy" className="text-primary font-semibold hover:underline underline-offset-2">
                  سياسة الخصوصية
                </Link>
                .
              </p>
              <p>
                نسعى لتقديم محتوى دقيق وموثوق، لكننا لا نضمن خلوه من الأخطاء بشكل مطلق. المحتوى
                المقدَّم لا يُعد استشارة قانونية أو طبية أو مالية أو مهنية.
              </p>
              <p>
                المواد التي يساهم الذكاء الاصطناعي في إنتاجها أو صياغتها تمرّ بمسؤولية تحريرية بشرية
                قبل النشر حيث ينطبق ذلك، وتبقى سبق مسؤولة عمّا تنشره على المنصة.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="account" number="03" title="حساب المستخدم" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                قد يتطلب الوصول إلى بعض الميزات إنشاء حساب شخصي. أنت مسؤول عن الحفاظ على سرية معلومات
                حسابك وعن جميع الأنشطة التي تحدث من خلاله.
              </p>
              <p>يجب أن تكون البيانات المقدمة عند التسجيل صحيحة ودقيقة، وأن تحدّثها عند تغيّرها.</p>
            </div>
          </section>

          <section>
            <SectionHeading id="conduct" number="04" title="سلوك المستخدم والتعليقات" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                عند التفاعل مع المنصة (بما في ذلك التعليقات والمشاركة)، تلتزم بعدم نشر محتوى مسيء أو
                مخالف للأنظمة أو ينتهك حقوق الغير. تحتفظ سبق بحق مراجعة المحتوى الذي يقدمه المستخدمون
                — بما في ذلك المراجعة الآلية — وإخفائه أو حذفه أو تقييد الحساب عند المخالفة.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="disclaimer" number="05" title="إخلاء المسؤولية" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                سبق لا تتحمل مسؤولية أي أضرار مباشرة أو غير مباشرة قد تنشأ عن استخدامك للمنصة أو
                اعتمادك على محتواها، وذلك في حدود ما تسمح به الأنظمة المعمول بها.
              </p>
              <p>
                الروابط الخارجية التي قد تظهر في محتوانا لا تخضع لسيطرتنا، ولسنا مسؤولين عن محتوى تلك
                المواقع أو سياساتها.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="changes" number="06" title="تعديل الشروط" />
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              نحتفظ بالحق في تعديل هذه الشروط في أي وقت. تُنشر النسخة المحدّثة على هذه الصفحة مع تحديث
              تاريخ «آخر تحديث»، ويُعد استمرارك في استخدام المنصة بعد التعديل موافقة على الشروط
              الجديدة.
            </p>
          </section>

          <section>
            <SectionHeading id="law" number="07" title="القانون الواجب التطبيق" />
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              تخضع هذه الشروط والأحكام وتُفسَّر وفقًا للأنظمة والقوانين المعمول بها في المملكة
              العربية السعودية.
            </p>
          </section>

          <section>
            <SectionHeading id="contact" number="08" title="الاتصال بنا" />
            <div className="rounded-2xl border border-border bg-muted/30 px-5 py-6 sm:px-7">
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                لأي أسئلة حول هذه الشروط والأحكام:
              </p>
              <a
                href="mailto:privacy@sabq.org"
                className="inline-flex items-center gap-2 text-lg font-extrabold text-foreground hover:text-primary"
                data-testid="link-terms-email"
              >
                <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
                privacy@sabq.org
              </a>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/contact">
                  <Button variant="default" className="gap-2" data-testid="button-contact-terms">
                    صفحة اتصل بنا
                    <ArrowUpLeft className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </Link>
                <Link href="/ar/privacy">
                  <Button variant="outline" data-testid="button-privacy-footer">
                    سياسة الخصوصية
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
