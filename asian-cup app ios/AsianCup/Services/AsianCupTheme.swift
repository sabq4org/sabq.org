import SwiftUI

// هوية كأس آسيا 2027 البصرية — مستوحاة من ألوان البطولة الرسمية وصورة OG:
// أخضر زمردي داكن (لون آسيا + السعودية) + ذهبي + لمسة فيروزي. مطابقة لبنية WCTheme
// (dyn helper + adaptive surfaces) لكن بألوان البطولة.
//
// البطولة في يناير 2027 (وضع عدّ تنازلي الآن)، فالألوان تفضّل الإحساس «الرسمي
// الاحتفالي» لا «الحيّ المتوهّج» — خلفيات داكنة عميقة + ذهبي مضيء.
nonisolated enum AcTheme {
    // الألوان الأساسية
    static let emeraldDeep = Color(red: 0.04, green: 0.18, blue: 0.14)   // الأخضر الزمردي الداكن
    static let emerald     = Color(red: 0.10, green: 0.42, blue: 0.32)   // الزمردي الأساسي
    static let emeraldSoft = Color(red: 0.16, green: 0.56, blue: 0.42)   // اليشمي الفاتح
    static let teal        = Color(red: 0.12, green: 0.58, blue: 0.58)   // الفيروزي
    static let gold        = Color(red: 0.96, green: 0.78, blue: 0.24)   // الذهبي
    static let goldDeep    = Color(red: 0.84, green: 0.66, blue: 0.16)   // الذهبي الداكن
    static let crimson     = Color(red: 0.92, green: 0.20, blue: 0.27)   // أحمر المباشر/الإنذار

    // تدرّجات
    static var heroTop: Color { Color(red: 0.03, green: 0.13, blue: 0.10) }
    static var heroBottom: Color { Color(red: 0.06, green: 0.24, blue: 0.18) }

    static var heroGradient: LinearGradient {
        LinearGradient(
            colors: [heroTop, heroBottom],
            startPoint: .top, endPoint: .bottom
        )
    }

    static var sectionGradient: LinearGradient {
        LinearGradient(
            colors: [emeraldDeep.opacity(0.96), Color(red: 0.05, green: 0.20, blue: 0.15).opacity(0.96)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    /// تدرّج ذهبي↔زمردي لعناوين الأبطال (مطابق لـ «2027» في هيرو الويب).
    static var goldTitleGradient: LinearGradient {
        LinearGradient(
            colors: [gold, Color(red: 0.99, green: 0.90, blue: 0.55), emeraldSoft],
            startPoint: .topTrailing, endPoint: .bottomLeading
        )
    }

    /// تدرّج خلفية الشاشة كاملةً (أعمق من heroGradient، يملأ خلف التمرير كله).
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.01, green: 0.09, blue: 0.06),
                emeraldDeep,
                Color(red: 0.02, green: 0.12, blue: 0.09),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    // أسطح تكيّفية (نهاري/ليلي) — داكنة دائمًا لإحساس «البطولة الرسمي».
    static var surface: Color { Color(red: 0.06, green: 0.16, blue: 0.13) }
    static var surfaceRaised: Color { Color(red: 0.08, green: 0.20, blue: 0.16) }
    static var cardFill: Color { Color.white.opacity(0.05) }
    static var chipFill: Color { Color.white.opacity(0.08) }
    static var outline: Color { Color.white.opacity(0.10) }

    // حبر النص على الخلفيات الداكنة
    static var onDark: Color { Color.white }
    static var onDarkStrong: Color { Color.white }
    static var onDarkDim: Color { Color.white.opacity(0.70) }
    static var onDarkFaint: Color { Color.white.opacity(0.45) }

    // نصف قطر (مطابق لـ WCTheme لاتساق الإحساس عبر تطبيقات سبق)
    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}
