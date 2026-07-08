import SwiftUI

// MARK: - الصفحات التعريفية والقانونية
//
// «عن التطبيق» · «سياسة الاستخدام» · «شروط الاستخدام» + «حذف الحساب» (منطقة خطرة).
// تُفتح كصفحات push من قسم «عن التطبيق» في «حسابي»، بثيم VARA الأبيض النظيف.

// قالب موحّد لصفحة قانونية: ترويسة (أيقونة + عنوان + سطر) + بطاقات أقسام بيضاء.
struct LegalScaffold<Content: View>: View {
    let title: String
    let icon: String
    let intro: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: icon)
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(SpTheme.green)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(SpTheme.green.opacity(0.12)))
                    Text(title)
                        .font(SportsFonts.headline(size: 24))
                        .foregroundStyle(SpTheme.onDark)
                    Text(intro)
                        .font(SportsFonts.app(size: 13))
                        .foregroundStyle(SpTheme.onDarkDim)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                content()
            }
            .padding(16)
            .padding(.bottom, 24)
        }
        .background(SpAmbientBackground())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// بطاقة قسم: عنوان أخضر + فقرة/نقاط.
struct LegalSection: View {
    let heading: String
    var text: String = ""
    var bullets: [String] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(heading)
                .font(SportsFonts.app(size: 15, weight: .heavy))
                .foregroundStyle(SpTheme.green)
            if !text.isEmpty {
                Text(text)
                    .font(SportsFonts.app(size: 13))
                    .foregroundStyle(SpTheme.onDark)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineSpacing(3)
            }
            if !bullets.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(bullets, id: \.self) { b in
                        HStack(alignment: .top, spacing: 8) {
                            Circle().fill(SpTheme.green).frame(width: 5, height: 5).padding(.top, 6)
                            Text(b)
                                .font(SportsFonts.app(size: 13))
                                .foregroundStyle(SpTheme.onDark)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).fill(SpTheme.card)
            .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.cardStroke, lineWidth: 1)))
    }
}

// MARK: - عن التطبيق

struct AboutAppView: View {
    private var version: String {
        let b = Bundle.main
        let v = (b.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "1.0"
        let n = (b.infoDictionary?["CFBundleVersion"] as? String) ?? "1"
        return "\(v) (\(n))"
    }

    var body: some View {
        LegalScaffold(title: L("عن التطبيق"), icon: "info.circle.fill",
                      intro: L("VARA تطبيقٌ رياضيٌّ عربيّ يجمع المباريات والبطولات والتوقّعات الذكية في مكانٍ واحد — بتصميمٍ نظيف وأرقام حيّة.")) {
            LegalSection(heading: L("ما الذي يقدّمه VARA؟"), text: "", bullets: [
                L("جدول المباريات بالتواريخ مع التنقّل الزمني السلس بين الأدوار والأيام."),
                L("مركز مباراة غنيّ: الأحداث، الإحصائيات، التشكيلات، التقييمات، والمواجهات."),
                L("«توقّع VARA» الذكي: خوارزمية ديناميكية تحسب احتمالات النتيجة من الترتيب والفورمة وأفضلية الأرض."),
                L("تنبيهات لحظية لمبارياتك وفِرقك (أهداف، بطاقات، فار، بداية ونهاية)."),
                L("متابعة الفِرق والمباريات + بطاقة «مبارياتي» مع عدّاد تنازليّ حيّ."),
            ])
            LegalSection(heading: L("مصادر البيانات"), text: L("تُجمع نتائج المباريات والإحصاءات من مزوّدي بيانات رياضية متخصّصين، وقد تتأخّر أو تختلف قليلًا عن المصادر الرسمية. توقّعات VARA تقديرية للمتعة والتحليل فقط."))
            LegalSection(heading: L("الإصدار"), text: Lf("النسخة الحالية: %@.", version))
        }
    }
}

// MARK: - سياسة الاستخدام

struct UsagePolicyView: View {
    var body: some View {
        LegalScaffold(title: L("سياسة الاستخدام"), icon: "checkmark.shield.fill",
                      intro: L("تنظّم هذه السياسة طريقة استخدامك لتطبيق VARA لضمان تجربة عادلة وآمنة للجميع.")) {
            LegalSection(heading: L("الاستخدام المقبول"), text: L("VARA متاحٌ للاستخدام الشخصي غير التجاري. يُمنع إساءة استخدام الخدمة أو محاولة تعطيلها أو استخراج بياناتها آليًّا دون إذن."))
            LegalSection(heading: L("التوقّعات للمتعة فقط"), text: L("نظام «توقّع VARA» ولوحة المتصدّرين للمنافسة والتسلية فقط — لا رهان ولا مقابل ماديّ، والنقاط رمزية ولا تمثّل قيمة نقدية."))
            LegalSection(heading: L("دقّة المحتوى"), text: L("نسعى لعرض بيانات دقيقة وحيّة، لكنّنا لا نضمن خلوّها من الأخطاء أو التأخّر. القرارات المبنية على هذه البيانات تقع على مسؤوليتك."))
            LegalSection(heading: L("الحساب والخصوصية"), text: L("أنت مسؤول عن الحفاظ على سرّية بيانات حسابك. تُستخدم بياناتك لتقديم الخدمة وتخصيص التنبيهات والتوقّعات، ويمكنك حذف حسابك وبياناتك في أي وقت من الإعدادات."))
            LegalSection(heading: L("الإشعارات"), text: L("بتفعيلك للتنبيهات توافق على استقبال إشعارات عن مبارياتك وفِرقك. يمكنك إيقافها في أي وقت من إعدادات التطبيق أو النظام."))
        }
    }
}

// MARK: - شروط الاستخدام

struct TermsView: View {
    var body: some View {
        LegalScaffold(title: L("شروط الاستخدام"), icon: "doc.text.fill",
                      intro: L("باستخدامك تطبيق VARA فإنك توافق على الشروط التالية.")) {
            LegalSection(heading: L("قبول الشروط"), text: L("يُعدّ تنزيلك أو استخدامك للتطبيق موافقةً على هذه الشروط. إن لم توافق عليها، يُرجى التوقّف عن استخدام التطبيق."))
            LegalSection(heading: L("الحساب"), text: L("تلتزم بتقديم معلومات صحيحة عند إنشاء الحساب، وبعدم انتحال هويّة الغير. نحتفظ بحقّ تعليق الحسابات المخالفة."))
            LegalSection(heading: L("الملكية الفكرية"), text: L("علامة VARA وتصميم التطبيق وواجهاته مملوكة لمالك التطبيق. لا يجوز نسخها أو إعادة نشرها دون إذن. تبقى حقوق بيانات المباريات لمزوّديها."))
            LegalSection(heading: L("حدود المسؤولية"), text: L("يُقدَّم التطبيق «كما هو» دون ضمانات. لا نتحمّل مسؤولية أي خسارة ناتجة عن انقطاع الخدمة أو أخطاء البيانات أو التوقّعات."))
            LegalSection(heading: L("تعديل الشروط"), text: L("قد نحدّث هذه الشروط من وقتٍ لآخر، ويسري التعديل فور نشره داخل التطبيق."))
        }
    }
}

// MARK: - حذف الحساب (منطقة خطرة)

struct DeleteAccountView: View {
    @Environment(SpAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirming = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(SpTheme.crimson)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(SpTheme.crimson.opacity(0.12)))
                    Text(L("حذف الحساب"))
                        .font(SportsFonts.headline(size: 24))
                        .foregroundStyle(SpTheme.onDark)
                    Text(L("إجراء نهائيّ لا يمكن التراجع عنه."))
                        .font(SportsFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SpTheme.crimson)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                // ماذا سيُحذف
                VStack(alignment: .leading, spacing: 8) {
                    Text(L("عند الحذف سيتمّ:"))
                        .font(SportsFonts.app(size: 14, weight: .heavy)).foregroundStyle(SpTheme.onDark)
                    ForEach([
                        L("حذف ملفّك الشخصي وبيانات دخولك نهائيًّا."),
                        L("حذف فِرقك المتابَعة وتفضيلات التنبيهات."),
                        L("حذف توقّعاتك ونقاطك في لوحة المتصدّرين."),
                        L("إلغاء تسجيل أجهزتك من الإشعارات."),
                    ], id: \.self) { line in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 12)).foregroundStyle(SpTheme.crimson).padding(.top, 2)
                            Text(line).font(SportsFonts.app(size: 13)).foregroundStyle(SpTheme.onDark)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous)
                    .fill(SpTheme.crimson.opacity(0.05))
                    .overlay(RoundedRectangle(cornerRadius: SpTheme.cardRadius, style: .continuous).stroke(SpTheme.crimson.opacity(0.30), lineWidth: 1)))

                // تأكيد كلمة المرور
                VStack(alignment: .leading, spacing: 10) {
                    Text(L("أدخل كلمة المرور للتأكيد"))
                        .font(SportsFonts.app(size: 13, weight: .bold)).foregroundStyle(SpTheme.onDarkDim)
                    HStack(spacing: 10) {
                        Image(systemName: "lock").font(.system(size: 14)).foregroundStyle(SpTheme.onDarkFaint).frame(width: 18)
                        SecureField("", text: $password, prompt: Text(L("كلمة المرور")).foregroundStyle(SpTheme.onDarkFaint))
                            .font(SportsFonts.app(size: 15)).foregroundStyle(SpTheme.onDark).tint(SpTheme.green)
                    }
                    .padding(.horizontal, 14).padding(.vertical, 13)
                    .background(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).fill(SpTheme.cardFill)
                        .overlay(RoundedRectangle(cornerRadius: SpTheme.tileRadius, style: .continuous).stroke(SpTheme.outline, lineWidth: 1)))
                }

                if let err = auth.errorMessage {
                    Text(err).font(SportsFonts.app(size: 12)).foregroundStyle(SpTheme.crimson)
                }

                Button { confirming = true } label: {
                    HStack(spacing: 8) {
                        if auth.isLoading { ProgressView().tint(.white) }
                        Text(L("حذف حسابي نهائيًّا")).font(SportsFonts.app(size: 15, weight: .bold))
                    }
                    .foregroundStyle(.white).frame(maxWidth: .infinity).frame(height: 50)
                    .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous)
                        .fill(password.isEmpty ? SpTheme.crimson.opacity(0.4) : SpTheme.crimson))
                }
                .buttonStyle(.plain)
                .disabled(password.isEmpty || auth.isLoading)
            }
            .padding(16)
            .padding(.bottom, 24)
        }
        .background(SpAmbientBackground())
        .navigationTitle(L("حذف الحساب"))
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(L("تأكيد حذف الحساب"), isPresented: $confirming, titleVisibility: .visible) {
            Button(L("حذف نهائيّ"), role: .destructive) {
                Task { if await auth.deleteAccount(password: password) { dismiss() } }
            }
            Button(L("إلغاء"), role: .cancel) {}
        } message: {
            Text(L("سيتمّ حذف حسابك وكل بياناتك نهائيًّا ولا يمكن استرجاعها."))
        }
    }
}
