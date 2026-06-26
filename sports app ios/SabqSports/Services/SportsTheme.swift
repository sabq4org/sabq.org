import SwiftUI

// هوية «سبق الرياضي» البصرية — مطابقة لتصميم صفحة كأس آسيا على الويب (sabq.org):
// «أبيض نظيف + أخضر مقتصد». خلفية بيضاء فاتحة، بطاقات بيضاء بحدود رمادية خفيفة،
// نص أسود/رمادي، والأخضر الزمردي لمسة واحدة فقط (ترويسات الجداول، الإبراز، الأزرار
// الفعّالة، الأيقونات). لا غوامق، لا كثرة ألوان، لا توهّجات. مساحات بيضاء واسعة.
// كل أسماء الرموز محفوظة لاتساق الشاشات؛ تغيّرت القيم فقط لتعكس التصميم الأبيض النظيف.
nonisolated enum SpTheme {
    /// مُعرّف المنتخب السعودي (api-sports) — للإبراز السعودي.
    static let saudiId = 23

    // ── ألوان العلامة: الأخضر الزمردي لمسة واحدة، الذهبي للميداليات فقط ──
    static let ink       = Color(red: 0.08, green: 0.24, blue: 0.18) // أخضر داكن (لتدرّجات الأيقونات)
    static let greenDeep = Color(red: 0.06, green: 0.30, blue: 0.22) // أخضر عميق (ترويسات/أعماق)
    static let green     = Color(red: 0.09, green: 0.43, blue: 0.32) // الأخضر الزمردي الأساسي (العلامة)
    static let greenSoft = Color(red: 0.16, green: 0.56, blue: 0.42) // أخضر يشمي فاتح (إبراز ثانوي)
    static let teal      = Color(red: 0.12, green: 0.55, blue: 0.52) // فيروزي مساعد (نادر الاستخدام)
    static let gold      = Color(red: 0.82, green: 0.62, blue: 0.16) // ذهبي للميداليات/تمييز نادر
    static let goldDeep  = Color(red: 0.70, green: 0.52, blue: 0.12) // ذهبي داكن
    static let goldSoft  = Color(red: 0.93, green: 0.80, blue: 0.42) // ذهبي فاتح
    static let crimson   = Color(red: 0.86, green: 0.18, blue: 0.24) // أحمر المباشر/الإنذار (مقروء على أبيض)
    static let leaf      = Color(red: 0.16, green: 0.62, blue: 0.38) // أخضر إيجابي

    /// أخضر العلامة للإبراز/الأيقونات على الخلفية الفاتحة.
    static let emeraldDeep = Color(red: 0.09, green: 0.43, blue: 0.32)

    // ── الترويسات الخضراء (شرائط علوية بنص أبيض — مثل ترويسات جداول المجموعات) ──
    static var heroTop: Color { Color(red: 0.10, green: 0.44, blue: 0.33) }
    static var heroBottom: Color { Color(red: 0.07, green: 0.34, blue: 0.25) }
    static var stadiumTop: Color { Color(red: 0.08, green: 0.37, blue: 0.28) }
    static var stadiumBottom: Color { Color(red: 0.06, green: 0.28, blue: 0.21) }

    /// تدرّج الترويسة الخضراء (نص أبيض دائمًا).
    static var heroGradient: LinearGradient {
        LinearGradient(colors: [heroTop, heroBottom], startPoint: .top, endPoint: .bottom)
    }

    /// تدرّج الكتلة الخضراء السعودية البارزة (نص أبيض).
    static var saudiBlockGradient: LinearGradient {
        LinearGradient(colors: [green, greenDeep],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// تدرّج ذهبي↔أخضر لعناوين الأبطال (نادر — للتتويج فقط).
    static var goldTitleGradient: LinearGradient {
        LinearGradient(colors: [gold, goldSoft, greenSoft],
                       startPoint: .topTrailing, endPoint: .bottomLeading)
    }

    /// خلفية الشاشة — رمادي فاتح جدًّا نظيف (يفصل البطاقات البيضاء بهدوء).
    static var screenGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.965, green: 0.970, blue: 0.975),
                Color(red: 0.952, green: 0.958, blue: 0.964),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }

    // ── أسطح بيضاء نظيفة بحدود رمادية خفيفة ──
    static var surface: Color { .white }
    static var surfaceRaised: Color { .white }

    /// سطح البطاقة — أبيض ناصع.
    static var card: Color { .white }

    /// تدرّج البطاقة — أبيض شبه مسطّح (عمق خفيف جدًّا).
    static var cardGradient: LinearGradient {
        LinearGradient(
            colors: [.white, Color(red: 0.992, green: 0.994, blue: 0.996)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }

    static var cardStroke: Color { Color(red: 0.835, green: 0.851, blue: 0.875) } // حدّ حادّ فاتح #D5D9DF
    static var cardFill: Color { .white }
    static var chipFill: Color { Color(red: 0.945, green: 0.955, blue: 0.965) }  // شريحة رمادية فاتحة
    static var outline: Color { Color(red: 0.89, green: 0.905, blue: 0.920) }     // فاصل صفوف داخليّ أخفّ

    /// لا ظلّ للبطاقات — تصميم مسطّح هادئ يعتمد الحدّ الحادّ الفاتح للفصل.
    static var cardShadow: Color { .clear }

    // ── حبر النص على الخلفيات البيضاء: أسود/رمادي ──
    static var onDark: Color { Color(red: 0.11, green: 0.13, blue: 0.16) }        // أساسي (شبه أسود)
    static var onDarkStrong: Color { Color(red: 0.06, green: 0.07, blue: 0.09) }  // أقوى (أسود)
    static var onDarkDim: Color { Color(red: 0.43, green: 0.46, blue: 0.50) }     // ثانوي (رمادي)
    static var onDarkFaint: Color { Color(red: 0.62, green: 0.65, blue: 0.69) }   // باهت (رمادي فاتح)

    // نصف قطر (مطابق لبقية تطبيقات سبق لاتساق الإحساس)
    static let cardRadius: CGFloat = 24
    static let tileRadius: CGFloat = 18
    static let chipRadius: CGFloat = 12
    static let buttonRadius: CGFloat = 16
}
