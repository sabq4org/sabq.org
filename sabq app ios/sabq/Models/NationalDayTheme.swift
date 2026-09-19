import SwiftUI
import UIKit

// MARK: - National Day theme (iOS only)

/// هوية «عزّنا بطبعنا» — اليوم الوطني السعودي الـ96 (الأربعاء 23 سبتمبر 2026).
/// المصدر الرسمي للشعار والهوية: الهيئة العامة للترفيه — https://www.gea.gov.sa/nd/
///
/// ثيم اختياري يتحكّم به مفتاح واحد في لوحة تحكم الصحيفة
/// (`/dashboard/ios-national-day-theme` ← `/api/system/ios-national-day-theme`).
/// يخصّ تطبيق iOS وحده: الموقع له ثيمه المستقل في
/// `client/src/components/seasonal/NationalDay96Theme.tsx`، وأندرويد خارج نطاقه.
///
/// التعطيل يعيد الهوية الأصلية كاملة: كل قيمة هنا تُقرأ فقط عندما يكون
/// `isActive == true`، فلا تبقى ألوان ولا خلفيات بعد إطفاء المفتاح.
nonisolated enum NationalDayTheme {

    /// مرآة محلية لحالة المفتاح البعيد. يكتبها `SeasonalThemeStore` وحده،
    /// وتُقرأ من `SabqTheme` على أي خيط — لذلك `UserDefaults` لا `@AppStorage`.
    static let activeDefaultsKey = "sabqNationalDayThemeActive"

    /// هل الثيم الموسمي مفعّل الآن؟ قراءة رخيصة (UserDefaults مخزّنة في الذاكرة)
    /// تُستدعى من كل لون في `SabqTheme`.
    static var isActive: Bool {
        UserDefaults.standard.bool(forKey: activeDefaultsKey)
    }

    /// اسم الأيقونة البديلة في كتالوج الأصول: خضرة الهوية والشعار أبيض.
    /// لا بد أن يطابق مجموعة `NationalDayAppIcon.appiconset` وإعداد البناء
    /// `ASSETCATALOG_COMPILER_ALTERNATE_APP_ICON_NAMES`.
    static let alternateIconName = "NationalDayAppIcon"

    // MARK: - Palette

    /// أخضر الهوية العميق ‏#0E5E43 — خلفية الشاشة الترحيبية.
    /// تباين النص الأبيض فوقه 7.78:1 (يتجاوز WCAG AA للنص العادي).
    static let canvas = Color(red: 0x0E / 255.0, green: 0x5E / 255.0, blue: 0x43 / 255.0)

    /// خيط السدو الفاتح فوق `canvas` ‏#16694D — فرق خفيف عمدًا كما في المرجع،
    /// زخرفة لا تنافس الشعار على الانتباه.
    static let saduThread = Color(red: 0x16 / 255.0, green: 0x69 / 255.0, blue: 0x4D / 255.0)

    /// لون التمييز الموسمي: أخضر عميق في الفاتح ‏#0E5E43 (تباين 7.78:1 على
    /// الأبيض)، وأخضر فاتح في الداكن ‏#5BD095 (تباين 9.71:1 على سطح الداكن).
    /// كلاهما أعلى تباينًا من الأزرق الافتراضي ‏#5CBDE8 (2.12:1).
    static let accent = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0x5B / 255.0, green: 0xD0 / 255.0, blue: 0x95 / 255.0, alpha: 1)
            : UIColor(red: 0x0E / 255.0, green: 0x5E / 255.0, blue: 0x43 / 255.0, alpha: 1)
    })

    /// النسخة الفاتحة من لون التمييز لتدرّجات الهوية (`brandGradient`).
    static let accentSoft = Color(UIColor { t in
        t.userInterfaceStyle == .dark
            ? UIColor(red: 0x7F / 255.0, green: 0xDD / 255.0, blue: 0xAE / 255.0, alpha: 1)
            : UIColor(red: 0x18 / 255.0, green: 0x76 / 255.0, blue: 0x53 / 255.0, alpha: 1)
    })

    // MARK: - Copy

    static let sloganArabic = "عزّنا بطبعنا"
    static let occasionArabic = "اليوم الوطني السعودي"
    static let occasionLatin = "SAUDI NATIONAL DAY"
}

// MARK: - Sadu weave

/// هندسة نسيج السدو: شبكة خلايا مربّعة — وهي الطريقة التي يُنسج بها السدو
/// فعلًا — تحمل سلسلتين متراكزتين: معيّنات صغيرة تلاصق حافة الشاشة، وسلسلة
/// معيّنات متداخلة («العين») تملأ بقية الشريط.
///
/// مرسومة هندسيًا لا منقولة من صورة: `Canvas` يرسمها متجهيًا فتبقى حادة على
/// أي كثافة شاشة، ويظل الشريط نفسه صالحًا لأي ارتفاع.
///
/// ملاحظة أصول: هذه زخرفة مستمدة من نمط السدو التراثي، وليست شعار الهوية
/// الرسمي. لو أراد المالك مطابقة الزخرفة الرسمية حرفيًا فمصدرها ملفات الهيئة
/// العامة للترفيه (انظر `NationalDayLockup` أدناه).
nonisolated enum SaduWeave {
    static let bandColumns = 24
    static let edgeColumns = 5
    static let edgePeriod = 6
    static let edgeRadius: Double = 2.0

    static let gutter = 1
    static let motifRows = 40
    static let mainRadius: Double = 8.5
    static let mainInner: Double = 5.0
    static let mainCore: Double = 1.2
    static let stroke: Double = 1.0

    /// السدو يُنسج على نول أطول منه عرضًا، فالمعيّن ممدود رأسيًا لا مربّع.
    /// القيمة مضبوطة على نسبة المعيّن في المرجع المرفق (~2.2:1).
    static let verticalScale: Double = 0.45

    /// هل خلية النسيج عند (العمود، الصف) خيط فاتح؟
    /// `column` يُقاس من حافة الشاشة إلى الداخل.
    static func cellIsThread(column: Int, row: Int) -> Bool {
        // سلسلة الحافة: معيّنات صغيرة متتابعة
        let edgeC = abs(Double(column) - Double(edgeColumns - 1) / 2.0)
        let edgeR = abs(Double(row % edgePeriod) - Double(edgePeriod - 1) / 2.0)
        if column < edgeColumns && (edgeC + edgeR) <= edgeRadius { return true }

        // السلسلة الرئيسية: معيّنات متداخلة ممدودة
        let first = edgeColumns + gutter
        let inner = bandColumns - first
        guard column >= first, inner > 0 else { return false }

        let c = abs(Double(column - first) - Double(inner - 1) / 2.0)
        let r = abs(Double(row % motifRows) - Double(motifRows - 1) / 2.0) * verticalScale
        let d = c + r

        if abs(d - mainRadius) <= stroke { return true }   // الحدّ الخارجي
        if abs(d - mainInner) <= stroke { return true }    // الحدّ الداخلي
        if d <= mainCore { return true }                   // «العين»
        // أسنان صغيرة بين الحدّين تُعطي حافة النسيج تسنينها المعروف
        if abs(d - (mainRadius - 2.4)) <= 0.5 && (row + column) % 2 == 0 { return true }
        if c <= stroke && d > mainRadius { return true }   // العمود الواصل
        return false
    }
}

/// شريط سدو عمودي واحد. `mirrored` يقلب اتجاه النمو ليُستعمل على الحافة المقابلة
/// فتتناظر الحافتان كما في المرجع.
struct SaduBand: View {
    var color: Color
    var cell: CGFloat
    var mirrored: Bool = false
    /// الارتفاع الذي يبدأ عنده التلاشي، كنسبة من ارتفاع الشريط.
    var fadeStart: Double = 0.62

    var body: some View {
        Canvas { context, size in
            let columns = SaduWeave.bandColumns
            let rows = Int(ceil(size.height / cell)) + 1

            for row in 0..<rows {
                for column in 0..<columns {
                    guard SaduWeave.cellIsThread(column: column, row: row) else { continue }

                    // التلاشي التدريجي نحو الأسفل — يترك وسط الشاشة هادئًا
                    // للشعار كما في المرجع.
                    let progress = Double(row) * Double(cell) / Double(max(size.height, 1))
                    let opacity: Double
                    if progress <= fadeStart {
                        opacity = 1
                    } else {
                        opacity = max(0, 1 - (progress - fadeStart) / (1 - fadeStart))
                    }
                    guard opacity > 0.01 else { continue }

                    let x = mirrored
                        ? size.width - CGFloat(column + 1) * cell
                        : CGFloat(column) * cell
                    let rect = CGRect(x: x, y: CGFloat(row) * cell, width: cell, height: cell)
                    context.fill(Path(rect), with: .color(color.opacity(opacity)))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// شريط سدو أفقي رفيع — اللمسة الخفيفة في رأس الرئيسية.
///
/// يستعمل سلسلة الحافة وحدها (المعيّنات الصغيرة) منقولةً إلى الأفق، فيبقى
/// زخرفة هامشية لا تنافس العناوين. يوضع تحت الرأس لا خلف نصوص الأخبار،
/// ويُخفى عن قارئ الشاشة لأنه لا يحمل معنى.
struct SaduStrip: View {
    var color: Color
    var cell: CGFloat = 3

    private var rows: Int { SaduWeave.edgeColumns }

    var body: some View {
        Canvas { context, size in
            let columns = Int(ceil(size.width / cell)) + 1
            for row in 0..<rows {
                for column in 0..<columns {
                    // منقول: محور المعيّنات الصغيرة يصير أفقيًا.
                    guard SaduWeave.cellIsThread(column: row, row: column) else { continue }
                    let rect = CGRect(
                        x: CGFloat(column) * cell,
                        y: CGFloat(row) * cell,
                        width: cell,
                        height: cell
                    )
                    context.fill(Path(rect), with: .color(color))
                }
            }
        }
        .frame(height: cell * CGFloat(rows))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// اللمسة الموسمية في رأس الرئيسية: تظهر فقط عند تفعيل المفتاح، وتختفي
/// بلا أثر عند إطفائه.
struct NationalDayHeaderAccent: View {
    var body: some View {
        if NationalDayTheme.isActive {
            SaduStrip(color: SabqTheme.primaryEnd.opacity(0.28))
                .padding(.top, 2)
        }
    }
}

/// شعار سبق في واجهات التطبيق.
///
/// أثناء الموسم يُرسم الشعار بلون واحد هو أخضر الهوية (`template`) — وهو ما
/// يفعله ثيم الموقع أيضًا حين يقلبه إلى الأبيض فوق الرأس الأخضر. التباين على
/// الخلفية الفاتحة 7.78:1، وعلى الداكنة 9.71:1.
///
/// خارج الموسم يعود `original` بأزرق العلامة ورماديّها كما هو، فلا يترك
/// الإطفاءُ أثرًا.
struct SabqBrandLogo: View {
    var height: CGFloat

    var body: some View {
        Group {
            if NationalDayTheme.isActive {
                Image("SabqLogo")
                    .renderingMode(.template)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .foregroundStyle(SabqTheme.primaryEnd)
            } else {
                Image("SabqLogo")
                    .renderingMode(.original)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
            }
        }
        .frame(height: height)
        .accessibilityLabel("سبق")
    }
}
