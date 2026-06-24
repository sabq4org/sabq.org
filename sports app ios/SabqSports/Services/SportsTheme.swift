import SwiftUI

// هوية «سبق الرياضي» البصرية — قاعدة داكنة فحمية فاخرة + أخضر سعودي أساسي
// (لون الكرة السعودية + روشن) + ذهبي للإبرازات + قرمزي للمباشر. مبنية على نفس
// بنية WCTheme/AcTheme (مساعدات + أسطح تكيّفية) لاتساق الإحساس عبر تطبيقات سبق،
// لكن بلوحة ألوان «الرياضة السعودية» المميّزة.
nonisolated enum SpTheme {
    // الألوان الأساسية
    static let greenDeep = Color(red: 0.02, green: 0.20, blue: 0.13)   // الأخضر السعودي الداكن
    static let green     = Color(red: 0.06, green: 0.42, blue: 0.26)   // الأخضر الأساسي
    static let greenSoft = Color(red: 0.18, green: 0.62, blue: 0.40)   // الأخضر الفاتح
    static let teal      = Color(red: 0.10, green: 0.54, blue: 0.52)   // فيروزي مساعد
    static let gold      = Color(red: 0.96, green: 0.78, blue: 0.24)   // الذهبي
    static let goldDeep  = Color(red: 0.84, green: 0.66, blue: 0.16)   // الذهبي الداكن
    static let crimson   = Color(red: 0.92, green: 0.20, blue: 0.27)   // أحمر المباشر/الإنذار

    // تدرّجات
    static var heroTop: Color { Color(red: 0.03, green: 0.15, blue: 0.10) }
    static var heroBottom: Color { Color(red: 0.05, green: 0.26, blue: 0.17) }

    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    /// تدرّج أخضر↔ذهبي لعناوين الأبطال/الإبرازات.
    static var goldTitleGradient: LinearGradient {
        LinearGradient(
            colors: [gold, Color(red: 0.99, green: 0.90, blue: 0.55), greenSoft],
            startPoint: .topTrailing, endPoint: .bottomLeading
        )
    }

    /// خلفية الشاشة كاملةً — قاعدة شبه سوداء بلمسة خضراء عميقة تملأ خلف التمرير.
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.02, green: 0.07, blue: 0.06),
                Color(red: 0.03, green: 0.13, blue: 0.10),
                Color(red: 0.02, green: 0.09, blue: 0.07),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    // أسطح تكيّفية — داكنة دائمًا لإحساس «المنصّة الرياضية» الفاخر.
    static var surface: Color { Color(red: 0.06, green: 0.13, blue: 0.11) }
    static var surfaceRaised: Color { Color(red: 0.08, green: 0.17, blue: 0.14) }

    /// لون البطاقة الصلب (بديل الشفافية الباهتة السابقة white·0.05 التي جعلت
    /// البطاقات تبدو مسطّحة بلا عمق). تعبئة خضراء داكنة دافئة.
    static var card: Color { Color(red: 0.085, green: 0.185, blue: 0.150) }
    /// تدرّج البطاقة لإضافة عمق ولمعان خفيف من أعلى.
    static var cardGradient: LinearGradient {
        LinearGradient(
            colors: [Color(red: 0.10, green: 0.215, blue: 0.170),
                     Color(red: 0.055, green: 0.135, blue: 0.105)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
    static var cardStroke: Color { Color.white.opacity(0.10) }
    static var cardFill: Color { Color.white.opacity(0.05) }
    static var chipFill: Color { Color.white.opacity(0.08) }
    static var outline: Color { Color.white.opacity(0.10) }

    /// لون/نصف قطر ظل البطاقات الموحّد.
    static var cardShadow: Color { Color.black.opacity(0.28) }

    // حبر النص على الخلفيات الداكنة
    static var onDark: Color { Color.white }
    static var onDarkStrong: Color { Color.white }
    static var onDarkDim: Color { Color.white.opacity(0.70) }
    static var onDarkFaint: Color { Color.white.opacity(0.45) }

    // نصف قطر (مطابق لـ WCTheme/AcTheme لاتساق الإحساس عبر تطبيقات سبق)
    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}
