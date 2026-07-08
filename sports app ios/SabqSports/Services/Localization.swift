import SwiftUI

// MARK: - نظام اللغة (عربي / إنجليزي)
//
// التطبيق ثنائي اللغة: العربية هي المصدر (النصوص المكتوبة في الكود عربية)،
// والإنجليزية طبقة تُركّب فوقها عبر قاموس مفتاحه النص العربي نفسه
// (`SpEnglishStrings.map`). أي مفتاح غير مترجَم يسقط تلقائيًا للعربية.
//
// النمط مطابق لـ `SpThemeMode`/`SpAccentTheme`: مُفرد `@Observable` يُحقن في
// البيئة، الاختيار محفوظ في `UserDefaults`، وتبديل اللغة يعيد بناء الشجرة عبر
// `.id(...)` في `SabqSportsApp` كي تلتقط كل الشاشات الاتجاه واللغة الجديدين.
@MainActor
@Observable
final class SpLanguage {
    static let shared = SpLanguage()

    nonisolated enum Lang: String, CaseIterable, Identifiable {
        case arabic = "ar"
        case english = "en"

        var id: String { rawValue }

        /// اسم اللغة بلغتها الأصلية (يُعرض في المُنتقي).
        var nativeName: String { self == .arabic ? "العربية" : "English" }

        /// علم توضيحي للمُنتقي.
        var flag: String { self == .arabic ? "🇸🇦" : "🇬🇧" }

        var isRTL: Bool { self == .arabic }
        var layoutDirection: LayoutDirection { isRTL ? .rightToLeft : .leftToRight }
        var locale: Locale { Locale(identifier: rawValue) }
    }

    private let key = "sabqsports.app.language"

    var lang: Lang {
        didSet {
            guard oldValue != lang else { return }
            UserDefaults.standard.set(lang.rawValue, forKey: key)
            applyToBackend()
        }
    }

    private init() {
        lang = Lang(rawValue: UserDefaults.standard.string(forKey: key) ?? "") ?? .arabic
        applyToBackend()
    }

    /// يمرّر اللغة الحالية لعميل الشبكة (`Accept-Language`) ويُفرّغ كاش الاستجابات
    /// كي لا تُقدَّم استجابات باللغة السابقة بعد التبديل. التبديل نادر فالتفريغ آمن.
    private func applyToBackend() {
        let code = lang.rawValue
        spActiveLangCode = code
        SpFormat.displayLangCode = code
        Task { await APIClient.shared.setPreferredLanguage(code) }
        URLCache.shared.removeAllCachedResponses()
    }

    var isEnglish: Bool { lang == .english }
}

// MARK: - دوال الترجمة (nonisolated)
//
// `L`/`Lf` تقرآن رمز اللغة من مرآة عامة `spActiveLangCode` بدل `SpLanguage.shared`
// (الذي هو @MainActor) — فتُستدعيان من أي سياق عزل (بُنى `nonisolated`، مُعدِّلات،
// دوال ساكنة). لا حاجة لأن تُنشئ `L` تبعية مراقبة لإعادة الرسم لأن شجرة الواجهة
// كلها تُعاد بناؤها عند تبديل اللغة عبر `.id(...)` في SabqSportsApp.
//
// تُكتب المرآة من MainActor فقط (SpLanguage.applyToBackend) وتُقرأ أثناء الرسم —
// nonisolated(unsafe) كافٍ (نص بسيط، بلا تسابق فعلي).
nonisolated(unsafe) var spActiveLangCode: String =
    UserDefaults.standard.string(forKey: "sabqsports.app.language") ?? "ar"

/// يعيد النص باللغة النشطة. المصدر عربي (النص المُمرَّر)؛ في الوضع الإنجليزي
/// يُبحث عنه في `SpEnglishStrings.map` ويسقط للعربية إن لم يوجد.
func L(_ arabic: String) -> String {
    guard spActiveLangCode == "en" else { return arabic }
    return SpEnglishStrings.map[arabic] ?? arabic
}

/// نسخة تدعم القوالب: `Lf("%d مباراة", count)` — يُترجَم القالب ثم يُطبَّق.
/// القالب الإنجليزي يجب أن يحمل نفس محدّدات التنسيق بالترتيب نفسه.
func Lf(_ arabicFormat: String, _ args: CVarArg...) -> String {
    let en = spActiveLangCode == "en"
    let template = en ? (SpEnglishStrings.map[arabicFormat] ?? arabicFormat) : arabicFormat
    return String(format: template, locale: Locale(identifier: spActiveLangCode), arguments: args)
}

extension String {
    /// اختصار للترجمة داخل السلاسل: `"المباريات".loc`.
    var loc: String { L(self) }
}
