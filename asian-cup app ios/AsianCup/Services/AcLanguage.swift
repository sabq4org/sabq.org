import SwiftUI

// MARK: - سجلّ اللغات (i18n)
// كل لغة هنا تمثّل لغة رسمية لأحد المنتخبات الـ24 المشاركة في كأس آسيا 2027،
// بالإضافة إلى العربية (لغة البطولة المضيفة) والإنجليزية (لغة احتياط عالمية).
// إضافة لغة جديدة = إضافة عنصر هنا + إسقاط ملف <code>.json داخل مجلد Localization.
struct AcLanguage: Identifiable, Hashable {
    /// رمز اللغة (يطابق اسم ملف JSON: ar.json, en.json, ja.json ...).
    let code: String
    /// الاسم كما يُكتب بلغته الأصلية (يظهر في قائمة الاختيار).
    let nativeName: String
    /// الاسم بالإنجليزية (للبحث/الترتيب الإداري).
    let englishName: String
    /// الاسم بالعربية (للعرض داخل سياق عربي).
    let arabicName: String
    /// هل تُكتب من اليمين لليسار؟
    let isRTL: Bool
    /// معرّف Locale لتنسيق التواريخ والأرقام لهذه اللغة.
    let localeIdentifier: String
    /// علم تمثيلي (إيموجي) — مجرد مؤشر بصري في القائمة.
    let flag: String

    var id: String { code }
    var direction: LayoutDirection { isRTL ? .rightToLeft : .leftToRight }
    // نفرض الأرقام اللاتينية (3455) في كل اللغات — قرار موحّد عبر التطبيق.
    var locale: Locale { Locale(identifier: "\(localeIdentifier)@numbers=latn") }
}

extension AcLanguage {
    /// اللغة الافتراضية (لغة البطولة المضيفة).
    static let arabic = AcLanguage(
        code: "ar", nativeName: "العربية", englishName: "Arabic", arabicName: "العربية",
        isRTL: true, localeIdentifier: "ar_SA", flag: "🇸🇦"
    )

    /// كل اللغات المدعومة — مرتّبة: العربية ثم الإنجليزية ثم بقية لغات المنتخبات أبجديًا بالاسم الأصلي.
    static let all: [AcLanguage] = [
        arabic,
        AcLanguage(code: "en", nativeName: "English", englishName: "English", arabicName: "الإنجليزية",
                   isRTL: false, localeIdentifier: "en_AU", flag: "🇦🇺"),
        AcLanguage(code: "fa", nativeName: "فارسی", englishName: "Persian", arabicName: "الفارسية",
                   isRTL: true, localeIdentifier: "fa_IR", flag: "🇮🇷"),
        AcLanguage(code: "ur", nativeName: "اردو", englishName: "Urdu", arabicName: "الأردية",
                   isRTL: true, localeIdentifier: "ur_PK", flag: "🇵🇰"),
        AcLanguage(code: "ja", nativeName: "日本語", englishName: "Japanese", arabicName: "اليابانية",
                   isRTL: false, localeIdentifier: "ja_JP", flag: "🇯🇵"),
        AcLanguage(code: "ko", nativeName: "한국어", englishName: "Korean", arabicName: "الكورية",
                   isRTL: false, localeIdentifier: "ko_KR", flag: "🇰🇷"),
        AcLanguage(code: "zh-Hans", nativeName: "中文", englishName: "Chinese (Simplified)", arabicName: "الصينية",
                   isRTL: false, localeIdentifier: "zh_Hans_CN", flag: "🇨🇳"),
        AcLanguage(code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", arabicName: "الفيتنامية",
                   isRTL: false, localeIdentifier: "vi_VN", flag: "🇻🇳"),
        AcLanguage(code: "th", nativeName: "ไทย", englishName: "Thai", arabicName: "التايلندية",
                   isRTL: false, localeIdentifier: "th_TH", flag: "🇹🇭"),
        AcLanguage(code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", arabicName: "الإندونيسية",
                   isRTL: false, localeIdentifier: "id_ID", flag: "🇮🇩"),
        AcLanguage(code: "ms", nativeName: "Bahasa Melayu", englishName: "Malay", arabicName: "الماليزية",
                   isRTL: false, localeIdentifier: "ms_MY", flag: "🇲🇾"),
        AcLanguage(code: "hi", nativeName: "हिन्दी", englishName: "Hindi", arabicName: "الهندية",
                   isRTL: false, localeIdentifier: "hi_IN", flag: "🇮🇳"),
        AcLanguage(code: "uz", nativeName: "Oʻzbekcha", englishName: "Uzbek", arabicName: "الأوزبكية",
                   isRTL: false, localeIdentifier: "uz_UZ", flag: "🇺🇿"),
        AcLanguage(code: "tg", nativeName: "Тоҷикӣ", englishName: "Tajik", arabicName: "الطاجيكية",
                   isRTL: false, localeIdentifier: "tg_TJ", flag: "🇹🇯"),
        AcLanguage(code: "ky", nativeName: "Кыргызча", englishName: "Kyrgyz", arabicName: "القرغيزية",
                   isRTL: false, localeIdentifier: "ky_KG", flag: "🇰🇬"),
        AcLanguage(code: "bn", nativeName: "বাংলা", englishName: "Bengali", arabicName: "البنغالية",
                   isRTL: false, localeIdentifier: "bn_BD", flag: "🇧🇩"),
    ]

    /// لا نعرض لغة قبل وجود ملف ترجمتها فعليًا داخل الحزمة. يمنع هذا الوعد
    /// المضلّل بدعم 16 لغة بينما يسقط بعضها صامتًا إلى الإنجليزية.
    static var available: [AcLanguage] {
        all.filter { language in
            Bundle.main.url(forResource: language.code, withExtension: "json", subdirectory: "Localization") != nil
                || Bundle.main.url(forResource: language.code, withExtension: "json") != nil
        }
    }

    static func find(_ code: String?) -> AcLanguage? {
        guard let code else { return nil }
        return available.first { $0.code == code }
    }
}
