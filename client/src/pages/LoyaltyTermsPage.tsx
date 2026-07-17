/**
 * شروط وأحكام برنامج ولاء سبق — /loyalty-terms
 * مسودة منتج/قانوني مبنية لحماية سبق عند الشراكة مع ولاء ون.
 * تخضع لمراجعة المستشار القانوني قبل الاعتماد النهائي.
 */
import { useEffect } from "react";
import { ArrowUpLeft, Mail } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useCanonical } from "@/hooks/useCanonical";
import { useAuth } from "@/hooks/useAuth";

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
        <p
          className="text-[11px] font-medium tabular-nums tracking-wide text-muted-foreground mb-1"
          dir="ltr"
        >
          {number}
        </p>
        <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">{title}</h2>
      </div>
    </header>
  );
}

export default function LoyaltyTermsPage() {
  const { user } = useAuth();

  useEffect(() => {
    document.title = "شروط برنامج الولاء | سبق";
  }, []);
  useCanonical("https://sabq.org/loyalty-terms");

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      <Header user={user || undefined} />

      <section className="relative border-b border-border">
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.12),_transparent_55%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-14">
          <p className="text-sm font-bold text-primary mb-3">سبق · الولاء</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.25]">
            شروط وأحكام برنامج الولاء
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground text-base md:text-lg leading-relaxed">
            تنظّم هذه الشروط اكتساب نقاط الولاء داخل سبق، وعلاقتها ببرنامج ولاء ون عند الاستبدال.
            بمشاركتك في البرنامج أو استمرارك فيه، فإنك تقرّ بقراءتها وقبولها.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
            <span>
              آخر تحديث: <b className="text-foreground font-semibold">يوليو 2026</b>
            </span>
            <span className="hidden sm:inline text-border">|</span>
            <span>مسودة للمراجعة القانونية قبل الاعتماد النهائي</span>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/terms">
              <Button variant="outline" size="sm">
                شروط المنصة العامة
              </Button>
            </Link>
            <Link href="/loyalty-preview">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                معاينة الولاء
              </Button>
            </Link>
            <a
              href="https://www.walaone.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                موقع ولاء ون
              </Button>
            </a>
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:py-14 flex-1">
        <article className="min-w-0 space-y-12 md:space-y-14">
          <section>
            <SectionHeading id="overview" number="01" title="نظرة عامة وطبيعة البرنامج" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                «برنامج ولاء سبق» (البرنامج) ميزة اختيارية تقدّمها سبق لأعضائها المسجّلين، تتيح
                اكتساب نقاط مقابل تفاعلات مؤهّلة داخل منصات سبق (الويب والتطبيقات)، وفق ما تعلنه سبق
                من حين لآخر.
              </p>
              <p>
                النقاط المكتسبة داخل سبق هي <b className="text-foreground">نقاط ولاء سبق</b>، وليست
                نقدًا ولا رصيدًا بنكيًا ولا حقًا مكتسبًا غير قابل للإلغاء. قيمتها الاستبدالية — إن
                وُجدت — تُحدَّد وفق سياسات سبق وشروط الشركاء، بما في ذلك برنامج ولاء ون حيث ينطبق.
              </p>
              <p>
                هذه الشروط مكمّلة لـ{" "}
                <Link href="/terms" className="text-primary font-semibold hover:underline underline-offset-2">
                  شروط وأحكام منصة سبق
                </Link>{" "}
                و{" "}
                <Link href="/privacy" className="text-primary font-semibold hover:underline underline-offset-2">
                  سياسة الخصوصية
                </Link>
                . عند التعارض بشأن الولاء، تسود أحكام هذه الصفحة فيما يخص النقاط والاستبدال.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="layers" number="02" title="طبقتان منفصلتان: محفظة سبق وولاء ون" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                <b className="text-foreground">طبقة سبق:</b> تُسجَّل نقاط الولاء في محفظة العضو داخل
                سبق نتيجة أفعال مؤهّلة (مثل الدخول والقراءة والتفاعل والمكافآت التي تعلنها سبق). سبق
                وحدها تحدّد قواعد الاكتساب والأسقف ومنع التكرار داخل منصاتها.
              </p>
              <p>
                <b className="text-foreground">طبقة ولاء ون:</b> عند اختيارك استبدال نقاط سبق أو
                تحويلها/شحنها إلى ولاء ون (أو الاستفادة من عروض ولاء ون عبر الشراكة)، تخضع النقاط
                من تلك اللحظة فصاعدًا — كليًا أو جزئيًا حسب آلية الاستبدال المفعّلة — لشروط وأحكام
                برنامج ولاء ون المنشورة على{" "}
                <a
                  href="https://www.walaone.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary font-semibold hover:underline underline-offset-2"
                >
                  www.walaone.com
                </a>
                ، بما في ذلك ما يتعلق باستخدام النقاط، وعدم الاسترجاع، وعدم التحويل للغير، وانتهاء
                الصلاحية، والمسؤولية.
              </p>
              <p>
                سبق ليست مشغّل برنامج ولاء ون، ولا تضمن استمرار عروض ولاء ون أو شركائها أو أسعار
                الاستبدال أو توفر القسائم. أي تأخير أو خطأ أو تعديل أو إلغاء من جانب ولاء ون يقع ضمن
                نطاق ولاء ون وشروطها.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="earn" number="03" title="اكتساب النقاط داخل سبق" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                تُمنح النقاط فقط للأعضاء المسجّلين ووفق الأفعال والمعدّلات والأسقف المعلنة في واجهة
                البرنامج أو في سياسات سبق الرسمية. أي أرقام تظهر في صفحات معاينة أو حملات تجريبية لا
                تُعد ملزمة حتى تُعتمد وتنشر ضمن هذه الشروط أو في جدول الاكتساب الرسمي.
              </p>
              <p>
                يجوز لسبق — وفق تقديرها — تعديل معدّلات الاكتساب، أو إيقاف أفعال معيّنة، أو فرض أسقف
                يومية/شهرية، أو مضاعفات مؤقتة، أو استبعاد مصادر معيّنة (بما فيها التوقعات الرياضية أو
                الحملات) دون أن يترتب على ذلك تعويض نقدي.
              </p>
              <p>
                قد يحدث تأخير بين إتمام الفعل المؤهّل وظهور النقاط في المحفظة بسبب أنظمة تقنية أو
                مراجعة احتيال. يقع على العضو التأكد من رصيده وإبلاغ سبق عن أي خطأ ظاهر خلال المهلة
                الواردة في بند المطالبات.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="no-cash" number="04" title="عدم التحويل النقدي وعدم الاسترجاع" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                نقاط ولاء سبق غير قابلة للاستبدال نقدًا أو برصيد بنكي أو بأي وسيلة دفع أخرى لدى سبق،
                إلا إذا أعلنت سبق صراحةً آلية استبدال محددة ومكتوبة.
              </p>
              <p>
                بعد إتمام عملية استبدال/شحن ناجحة نحو ولاء ون (أو أي شريك استبدال معلن)، تُعد العملية
                نهائية من جهة سبق، ولا تلتزم سبق بإعادة النقاط إلى محفظة سبق أو بتعويض نقدي، بما
                يتوافق مع مبدأ «عدم استرجاع النقاط بعد الشحن» المعمول به لدى ولاء ون.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="transfer" number="05" title="عدم البيع والتحويل بين الحسابات" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                لا يجوز بيع نقاط سبق أو تداولها أو رهنها أو تحويلها إلى عضو آخر أو حساب آخر داخل سبق
                أو خارجه، إلا عبر آلية استبدال رسمية توفّرها سبق — إن وُجدت.
              </p>
              <p>
                بعد انتقال النقاط إلى ولاء ون، تسري كذلك قيود ولاء ون: عدم البيع أو التداول أو
                التحويل بين حسابات ولاء ون المختلفة، واستخدام النقاط فقط ضمن القنوات التي تسمح بها
                ولاء ون.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="expiry" number="06" title="انتهاء الصلاحية" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                <b className="text-foreground">في محفظة سبق:</b> يجوز لسبق تحديد مدة صلاحية لنقاط
                سبق (كلياً أو لفئات معيّنة مثل مكافآت الحملات والهدايا والمسابقات). عند إغلاق حساب
                العضو في سبق أو إيقاف عضويته في البرنامج، يجوز إلغاء الرصيد المتبقي دون تعويض.
              </p>
              <p>
                <b className="text-foreground">بعد الاستبدال عبر ولاء ون:</b> تخضع النقاط لمدد انتهاء
                صلاحية ولاء ون المعمول بها وقتها — بما في ذلك ما ورد في شروط ولاء ون من انتهاء بعد
                مرور 12 شهرًا للنقاط المجمّعة/المشحونة عمومًا، وانتهاء أقصر (مثل 14 يومًا) لنقاط
                المسابقات والهدايا والكاش باك والحملات الترويجية، وآلية «الوارد أولًا يُصرف أولًا»
                (FIFO) عند الإلغاء بسبب انتهاء الصلاحية — وذلك كما تنشره ولاء ون وتحدّثه من حين لآخر.
              </p>
              <p>
                سبق لا تتحمّل مسؤولية انتهاء صلاحية نقاط أصبحت خاضعة لولاء ون، ولا تضمن إشعارًا فرديًا
                قبل الانتهاء ما لم توفّر سبق أو ولاء ون ذلك صراحةً.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="abuse" number="07" title="إساءة الاستخدام والاحتيال" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                تحتفظ سبق بحقها — وفق تقديرها المعقول — في تعليق المنح، أو خصم نقاط، أو إلغاء رصيد،
                أو تقييد/إنهاء المشاركة في البرنامج، إذا تبيّن أو اشتُبه بسلوك يشمل على سبيل المثال
                لا الحصر: الزراعة الآلية، تكرار أفعال غير مشروعة لتجاوز الأسقف، انتحال الهوية، تعدد
                الحسابات للاحتيال، التلاعب بالأحداث أو السجلات، أو أي خرق لهذه الشروط أو لشروط المنصة.
              </p>
              <p>
                يتوافق هذا مع حق ولاء ون المماثل بإلغاء نقاط عند الاحتيال أو الاستغلال أو خرق شروطها؛
                وقد يمتد أثر المخالفة إلى رفض الاستبدال أو إلغاء عمليات جارية عند الاشتباه المعقول.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="claims" number="08" title="المطالبات بالنقاط غير المضافة" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                أي مطالبة بنقاط سبق يعتقد العضو أنها استحُقّت ولم تُضف إلى محفظته يجب أن تُقدَّم إلى
                سبق خلال <b className="text-foreground">15 يومًا</b> من تاريخ الفعل المؤهّل أو من
                التاريخ الذي كان يُفترض فيه ظهور النقاط، مع ما تطلبه سبق من بيانات أو أدلة مقبولة.
              </p>
              <p>
                المطالبات المتعلقة بنقاط أصبحت داخل ولاء ون أو بعمليات شراء/عروض لدى ولاء ون تُوجَّه
                إلى ولاء ون وفق آلياتها ومستنداتها (وقد تشترط ولاء ون مهلة مماثلة وأدلة مثل الفواتير).
                سبق غير ملزمة بالفصل في نزاعات تقع بالكامل ضمن منصة ولاء ون.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="changes-program" number="09" title="تعديل البرنامج والشركاء" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                تحتفظ سبق بحقها في تعديل البرنامج أو إيقافه مؤقتًا أو نهائيًا، أو تغيير جدول الاكتساب،
                أو سحب مزايا، أو تغيير شركاء الاستبدال (بما في ذلك إنهاء أو تعليق التعاون مع ولاء ون)،
                في أي وقت، مع نشر التحديث على هذه الصفحة أو الإعلان المناسب داخل المنصة.
              </p>
              <p>
                استمرارك في اكتساب النقاط أو استخدامها بعد نفاذ التعديل يُعد قبولًا للشروط المحدّثة.
                إن لم توافق، عليك التوقف عن المشاركة في البرنامج و/أو طلب إغلاق عضوية الولاء وفق
                الآليات المتاحة.
              </p>
              <p>
                كذلك تحتفظ ولاء ون — وفق شروطها — بتعديل أو وقف برنامجها وعروضها وشركائها دون إعلان
                مسبق في بعض الحالات؛ ولا تتحمّل سبق مسؤولية تلك التغييرات.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="liability" number="10" title="المسؤولية وحدودها" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                العضو مسؤول عن حماية حسابه في سبق (وفي ولاء ون إن كان لديه حساب هناك). أي عملية تتم
                عبر حسابه تُعد صادرة عنه ما لم يُثبت العكس وفق إجراءات سبق الأمنية.
              </p>
              <p>
                في حدود ما تسمح به أنظمة المملكة العربية السعودية، لا تتحمّل سبق مسؤولية أضرار مباشرة
                أو غير مباشرة أو تبعية ناشئة عن: المشاركة في البرنامج؛ تأخير أو خطأ في رصيد النقاط؛
                انتهاء الصلاحية؛ تغيير المعدّلات أو إيقاف البرنامج؛ تصرّفات أو إهمال أو عروض أي شريك
                استبدال بما في ذلك ولاء ون؛ أو تعذّر استخدام نقاط لدى طرف ثالث.
              </p>
              <p>
                لا يتجاوز التزام سبق — إن ثبت قانونًا — إعادة قيد نقاط سبق محلّ نزاع ومثبتة الاستحقاق
                داخل محفظة سبق، دون تعويض نقدي، ما لم يُلزم نص نظامي آمر بخلاف ذلك.
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="account-close" number="11" title="إغلاق الحساب وإنهاء المشاركة" />
            <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">
              <p>
                عند إغلاق حساب سبق أو إنهاء المشاركة في البرنامج، يجوز إلغاء نقاط سبق غير المُستبدَلة.
                النقاط التي سبق تحويلها/استبدالها لدى ولاء ون تبقى خاضعة لشروط ولاء ون (بما في ذلك
                الإلغاء عند إغلاق حساب ولاء ون إن طبّقت ذلك).
              </p>
            </div>
          </section>

          <section>
            <SectionHeading id="law" number="12" title="القانون الواجب التطبيق" />
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              تخضع هذه الشروط وتُفسَّر وفق أنظمة المملكة العربية السعودية. أي نزاع يتعلق ببرنامج ولاء
              سبق يُسعى لحله ودّيًا أولًا عبر قنوات دعم سبق، ثم وفق الاختصاص النظامي المختص في
              المملكة، مع مراعاة أن النزاعات الخالصة لولاء ون قد تخضع لآليات ولاء ون وشروطها.
            </p>
          </section>

          <section>
            <SectionHeading id="contact" number="13" title="التواصل" />
            <div className="rounded-2xl border border-border bg-muted/30 px-5 py-6 sm:px-7">
              <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">
                لاستفسارات برنامج ولاء سبق والمطالبات ضمن مهلة 15 يومًا:
              </p>
              <a
                href="mailto:privacy@sabq.org"
                className="inline-flex items-center gap-2 text-lg font-extrabold text-foreground hover:text-primary"
              >
                <Mail className="w-5 h-5 text-primary" aria-hidden="true" />
                privacy@sabq.org
              </a>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/contact">
                  <Button variant="default" className="gap-2">
                    صفحة اتصل بنا
                    <ArrowUpLeft className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </Link>
                <Link href="/terms">
                  <Button variant="outline">شروط المنصة</Button>
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
