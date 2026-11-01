/**
 * حذف الحساب — /delete-account و /ar/delete-account و /en/delete-account
 * و /privacy-terms-of-service (الرابط المسجَّل قديمًا في Google Play)
 *
 * صفحة عامة يطلبها Google Play (قسم «أمان البيانات»): تشرح لمستخدمي تطبيق
 * سبق كيف يحذفون حسابهم من داخل التطبيق أو بطلب بالبريد دون التطبيق، وما
 * الذي يُحذف وما الذي يبقى. المحتوى يطابق DELETE /api/v1/members/account.
 */
import { useEffect } from "react";
import { Mail, Smartphone, Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCanonical } from "@/hooks/useCanonical";

const PRIVACY_EMAIL = "privacy@sabq.org";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl md:text-2xl font-extrabold tracking-tight border-b border-border pb-3 mb-5">
        {title}
      </h2>
      <div className="text-[15px] text-muted-foreground leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function DeleteAccountPage() {
  useEffect(() => {
    document.title = "حذف الحساب | سبق";
  }, []);
  useCanonical("https://sabq.org/delete-account");

  return (
    <div className="public-page min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl">
      <Header />

      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 pt-12 pb-10 md:pt-16 md:pb-12">
          <p className="text-sm font-bold text-primary mb-3">تطبيق سبق — صحيفة سبق الإلكترونية</p>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-4" data-testid="heading-delete-account">
            حذف حسابك في سبق
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            يمكنك حذف حسابك وبياناتك الشخصية في أي وقت، من داخل التطبيق أو بطلب عبر البريد.
          </p>
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl px-4 py-10 flex-1">
        <Section title="الطريقة الأولى: من داخل التطبيق">
          <div className="flex items-start gap-3">
            <Smartphone className="w-5 h-5 text-primary mt-1 shrink-0" aria-hidden="true" />
            <ol className="list-decimal pr-5 space-y-1.5">
              <li>افتح تطبيق سبق وسجّل الدخول.</li>
              <li>اذهب إلى «الإعدادات» ثم «منطقة الخطر» ثم «حذف الحساب».</li>
              <li>أكّد الحذف (ويُطلب منك كلمة المرور إن كان لحسابك كلمة مرور).</li>
            </ol>
          </div>
          <p>يُحذف الحساب فورًا وتُسجَّل خارجًا من كل أجهزتك.</p>
        </Section>

        <Section title="الطريقة الثانية: دون التطبيق">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-primary mt-1 shrink-0" aria-hidden="true" />
            <p>
              أرسل رسالة إلى{" "}
              <a
                href={`mailto:${PRIVACY_EMAIL}?subject=${encodeURIComponent("طلب حذف حساب")}`}
                className="text-primary font-semibold hover:underline underline-offset-2"
                data-testid="link-delete-account-email"
              >
                {PRIVACY_EMAIL}
              </a>{" "}
              بعنوان «طلب حذف حساب»، من البريد المسجَّل في حسابك أو مع رقم الجوال المسجَّل.
              نتحقق من ملكية الحساب ثم ننفّذ الحذف خلال 30 يومًا ونؤكده لك بالبريد.
            </p>
          </div>
        </Section>

        <Section title="ما الذي يُحذف">
          <div className="flex items-start gap-3">
            <Trash2 className="w-5 h-5 text-primary mt-1 shrink-0" aria-hidden="true" />
            <ul className="list-disc pr-5 space-y-1.5">
              <li>الاسم والبريد الإلكتروني ورقم الجوال والصورة الشخصية والنبذة.</li>
              <li>الجنس وتاريخ الميلاد والمدينة والدولة.</li>
              <li>كلمة المرور وربط حساب Google أو Apple وإعدادات التحقق الثنائي.</li>
              <li>المحفوظات والاهتمامات وسجل القراءة والتفاعلات والتفضيلات.</li>
              <li>أجهزة الإشعارات وجلسات الدخول على التطبيق والويب.</li>
            </ul>
          </div>
        </Section>

        <Section title="ما الذي يبقى">
          <p>
            يبقى سجل حساب مجهول الهوية بلا أي بيانات شخصية، حتى لا تنكسر الروابط في المحتوى
            المنشور. وقد نحتفظ ببعض السجلات مدةً محدودة إذا ألزمنا النظام بذلك أو لأغراض الأمان
            ومنع الاحتيال، ثم تُحذف.
          </p>
        </Section>

        <section className="mt-14 border-t border-border pt-8" dir="ltr" lang="en">
          <h2 className="text-xl font-extrabold mb-4">Delete your Sabq account</h2>
          <div className="text-[15px] text-muted-foreground leading-relaxed space-y-3">
            <p>
              <strong>In the app:</strong> open the Sabq app, sign in, go to Settings → Danger zone → Delete account and
              confirm. Deletion is immediate and signs you out on all devices.
            </p>
            <p>
              <strong>Without the app:</strong> email{" "}
              <a href={`mailto:${PRIVACY_EMAIL}?subject=Account%20deletion%20request`} className="text-primary font-semibold">
                {PRIVACY_EMAIL}
              </a>{" "}
              with the subject "Account deletion request" from your registered email (or include your registered
              phone number). We verify ownership and complete deletion within 30 days.
            </p>
            <p>
              <strong>Deleted:</strong> name, email, phone, photo, bio, gender, birth date, city, country, password,
              Google/Apple links, two-factor settings, bookmarks, interests, reading history, reactions,
              preferences, notification devices and sessions.
            </p>
            <p>
              <strong>Kept:</strong> an anonymised account record with no personal data, so published content links
              stay intact; some records may be kept for a limited time where required by law or for security.
            </p>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
