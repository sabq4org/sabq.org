import SwiftUI
import UIKit

/// الشاشة الترحيبية لليوم الوطني — تظهر بعد شاشة إقلاع iOS مباشرة، مرة واحدة
/// لكل تشغيل بارد، وفقط عندما يكون المفتاح في لوحة التحكم مفعّلًا.
///
/// **تمييز الشاشتين.** شاشة الإقلاع (`UILaunchScreen`) يرسمها iOS من إعدادات
/// الهدف قبل تشغيل أي كود، فلا يمكن تغييرها عن بُعد ولا تتأثر بهذا المفتاح —
/// تبقى كما هي في الحالتين. هذه الشاشة هي أول ما يرسمه التطبيق نفسه، ولذلك
/// وحدها القابلة للتحكم من اللوحة. النتيجة: خلفية الإقلاع الافتراضية ثم
/// الترحيبية الخضراء، بلا انتظار للشبكة في الحالتين (الحالة تُقرأ من التخزين
/// المحلي، انظر `SeasonalThemeStore`).
struct NationalDayWelcomeView: View {
    /// يُستدعى عند انتهاء العرض — بالمؤقّت أو بلمسة القارئ.
    var onFinish: () -> Void

    /// مدة العرض قبل الانتقال التلقائي. قصيرة عمدًا: شاشة تحية لا بوّابة.
    private static let displayDuration: TimeInterval = 1.9

    var body: some View {
        GeometryReader { geo in
            let side = geo.size.width * 0.14          // عرض شريط السدو
            let cell = side / CGFloat(SaduWeave.bandColumns)

            ZStack {
                NationalDayTheme.canvas

                // زخرفة السدو على الحافتين، تتلاشى نحو منتصف الشاشة فيبقى
                // الشعار وحده في المساحة الهادئة — كما في المرجع.
                HStack(spacing: 0) {
                    SaduBand(color: NationalDayTheme.saduThread, cell: cell)
                        .frame(width: side)
                    Spacer(minLength: 0)
                    SaduBand(color: NationalDayTheme.saduThread, cell: cell, mirrored: true)
                        .frame(width: side)
                }
                .frame(height: geo.size.height * 0.42, alignment: .top)
                .frame(maxHeight: .infinity, alignment: .top)

                // شعار سبق الأبيض — الأصل المتجهي نفسه بلون مقلوب، في موضع
                // هوية المرجع (منتصف الشاشة) وبحجم متوازن: يحدّه العرض على
                // الشاشات الضيقة والارتفاع على الطويلة.
                Image("SabqLogoWhite")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(
                        maxWidth: min(geo.size.width * 0.52, 320),
                        maxHeight: geo.size.height * 0.20
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("سبق")

                // هوية «عزّنا بطبعنا» أسفل الشاشة، فوق المساحة الآمنة.
                // العرض 32% من عرض الشاشة — نسبة القفل في المرجع نفسها
                // (422 من 1320 بكسل). السقف 150 نقطة لأن الأصل 424 بكسل،
                // أي 141 نقطة عند 3x؛ تجاوزه يبدأ بتليين الحواف.
                VStack {
                    Spacer(minLength: 0)
                    NationalDayLockup()
                        .frame(maxWidth: min(geo.size.width * 0.32, 150))
                        .padding(.bottom, geo.size.height * 0.045)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
        .sabqRTL()
        .contentShape(Rectangle())
        .onTapGesture { finish() }          // تخطٍّ فوري بلمسة
        .accessibilityElement(children: .combine)
        .accessibilityLabel("سبق — \(NationalDayTheme.sloganArabic)، \(NationalDayTheme.occasionArabic)")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("انقر للمتابعة")
        // تظهر مكتملة من أول إطار — لا تلاشٍ داخل، وإلا ومض ما تحتها.
        // التلاشي عند الخروج وحده، ويملكه `sabqApp` عبر `.transition(.opacity)`.
        .onAppear {
            Task {
                try? await Task.sleep(nanoseconds: UInt64(Self.displayDuration * 1_000_000_000))
                finish()
            }
        }
    }

    private func finish() {
        // `onFinish` يحرس نفسه من النداء المزدوج (المؤقّت + لمسة القارئ).
        onFinish()
    }
}

// MARK: - National Day lockup

/// شعار «عزّنا بطبعنا» الرسمي: العبارة داخل إطارها الشطرنجي، ثم «اليوم الوطني
/// السعودي» و`SAUDI NATIONAL DAY` — القفل كاملًا كما اعتمده المالك.
///
/// **مصدر الأصل.** مستخرَج من الصورة التي أرسلها المالك، بشفافية: الإطار نُقل
/// بألوانه كما هي، والسطران الأبيضان فُكّ مزجهما عن الخلفية الخضراء فلا تبقى
/// هالة حول الحروف. إعادة التركيب فوق خضرة الشاشة تطابق الأصل (فرق 7/255 عند
/// المئين 99). ليس رسمًا جديدًا ولا محاكاة للشعار.
///
/// **حدّ الدقة.** الأصل 424 بكسل عرضًا = 141 نقطة عند 3x، ولذلك يُعرض بحدّ
/// أقصى 150 نقطة (انظر موضع الاستدعاء). لو أراد المالك عرضه أكبر — أو أرادت
/// الصحيفة استعماله في مكان آخر — فالمصدر المتجهي الرسمي من الهيئة العامة
/// للترفيه <https://www.gea.gov.sa/nd/> (حزمة `Guideline.zip`) هو الأولى؛
/// يكفي استبدال ملفات هذا الـimageset بلا تعديل كود.
///
/// البديل النصّي أدناه يبقى شبكة أمان لو غاب الأصل عن حزمة البناء.
struct NationalDayLockup: View {
    @ScaledMetric(relativeTo: .caption) private var subtitleSize: CGFloat = 12
    @ScaledMetric(relativeTo: .caption2) private var latinSize: CGFloat = 8

    /// وجود الأصل لا يتغيّر أثناء التشغيل، وUIKit يخزّن نتيجة البحث،
    /// فالقراءة عند الرسم رخيصة ولا تحتاج تخزينًا ساكنًا.
    private var hasOfficialAsset: Bool { UIImage(named: "NationalDayLockup") != nil }

    var body: some View {
        if hasOfficialAsset {
            Image("NationalDayLockup")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .accessibilityLabel(
                    "\(NationalDayTheme.sloganArabic) — \(NationalDayTheme.occasionArabic)"
                )
        } else {
            VStack(spacing: 6) {
                Text(NationalDayTheme.sloganArabic)
                    .font(SabqFonts.app(size: 22, weight: .heavy))
                    .foregroundStyle(.white)

                Text(NationalDayTheme.occasionArabic)
                    .font(SabqFonts.app(size: subtitleSize, weight: .regular))
                    .foregroundStyle(.white.opacity(0.88))

                Text(NationalDayTheme.occasionLatin)
                    .font(SabqFonts.app(size: latinSize, weight: .regular))
                    .tracking(2)
                    .foregroundStyle(.white.opacity(0.70))
            }
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(
                "\(NationalDayTheme.sloganArabic) — \(NationalDayTheme.occasionArabic)"
            )
        }
    }
}

#if DEBUG
#Preview("الشاشة الترحيبية") {
    NationalDayWelcomeView(onFinish: {})
}
#endif
