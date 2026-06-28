import SwiftUI
import Combine

// MARK: - مدير الترجمة (i18n)
// محرك خفيف يحمّل ملفات JSON المسطّحة (key → value) من حزمة التطبيق وقت التشغيل،
// مع سلسلة احتياط: اللغة المختارة ← الإنجليزية ← المفتاح نفسه.
// التبديل يحدث وقت التشغيل (مستقل عن لغة النظام) ويُحفظ في UserDefaults.
@MainActor
final class AcLocalization: ObservableObject {
    static let shared = AcLocalization()

    private static let storageKey = "ac.language.code"
    private static let bundleSubdir = "Localization"

    @Published private(set) var language: AcLanguage
    private var table: [String: String] = [:]          // قاموس اللغة المختارة
    private var fallback: [String: String] = [:]        // الإنجليزية كاحتياط
    private var teamNames: [String: [String: String]] = [:] // teamId → { code → name }

    private init() {
        // التطبيق «عربي أولًا»: العربية هي الافتراضية عند أول تشغيل،
        // ويُحترم اختيار المستخدم المحفوظ بعد ذلك.
        let saved = UserDefaults.standard.string(forKey: Self.storageKey)
        let initial = AcLanguage.find(saved) ?? .arabic
        self.language = initial
        self.fallback = Self.loadTable("en")
        self.table = initial.code == "en" ? fallback : Self.loadTable(initial.code)
        self.teamNames = Self.loadTeams()
    }

    // MARK: تبديل اللغة
    func setLanguage(_ lang: AcLanguage) {
        guard lang.code != language.code else { return }
        table = lang.code == "en" ? fallback : Self.loadTable(lang.code)
        language = lang
        UserDefaults.standard.set(lang.code, forKey: Self.storageKey)
    }

    var isRTL: Bool { language.isRTL }
    var direction: LayoutDirection { language.direction }
    var locale: Locale { language.locale }

    // MARK: ترجمة سلسلة
    /// يعيد الترجمة للمفتاح المعطى وفق سلسلة الاحتياط.
    func t(_ key: String) -> String {
        if let v = table[key], !v.isEmpty { return v }
        if let v = fallback[key], !v.isEmpty { return v }
        return key
    }

    /// ترجمة مع استبدال متغيرات بصيغة {name}.
    func t(_ key: String, _ args: [String: String]) -> String {
        var out = t(key)
        for (k, v) in args { out = out.replacingOccurrences(of: "{\(k)}", with: v) }
        return out
    }

    // MARK: أسماء الأدوار
    // نُعرّب انطلاقًا من roundEn القانوني (من API-Football)، ونحتفظ بالاحتياط للنص الخام.
    private static let roundKeys: [String: String] = [
        "Group Stage - 1": "round.matchday1",
        "Group Stage - 2": "round.matchday2",
        "Group Stage - 3": "round.matchday3",
        "Round of 16": "round.r16",
        "Quarter-finals": "round.qf",
        "Semi-finals": "round.sf",
        "3rd Place Final": "round.third",
        "Final": "round.final",
    ]

    func round(_ roundEn: String, fallback: String) -> String {
        if let key = Self.roundKeys[roundEn] { return t(key) }
        return fallback
    }

    // MARK: أسماء المجموعات
    // الخادم يولّد الاسم ترتيبيًا («المجموعة الأولى») حسب موقع المجموعة، فنعرّبه
    // وفق الموقع (1-أساس) عبر مفاتيح group.1…group.N، مع احتياط لنص الخادم.
    func groupName(index: Int, fallback: String) -> String {
        let key = "group.\(index)"
        if let v = table[key], !v.isEmpty { return v }
        if let v = self.fallback[key], !v.isEmpty { return v }
        return fallback
    }

    // MARK: أسماء المنتخبات
    /// اسم المنتخب باللغة الحالية، مع احتياط (الإنجليزية ثم اسم الـAPI الممرَّر).
    func teamName(id: String?, fallback apiName: String) -> String {
        guard let id, let entry = teamNames[id] else { return apiName }
        if let v = entry[language.code], !v.isEmpty { return v }
        if let v = entry["en"], !v.isEmpty { return v }
        if let v = entry["ar"], !v.isEmpty { return v }
        return apiName
    }

    // MARK: تحميل الموارد
    private static func loadTable(_ code: String) -> [String: String] {
        guard let dict: [String: String] = loadJSON(code) else { return [:] }
        return dict
    }

    private static func loadTeams() -> [String: [String: String]] {
        loadJSON("teams") ?? [:]
    }

    private static func loadJSON<T: Decodable>(_ name: String) -> T? {
        let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: bundleSubdir)
            ?? Bundle.main.url(forResource: name, withExtension: "json")
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - اختصارات عالمية للاستخدام في الواجهات
// نقرأ من المفرد المشترك؛ إعادة بناء الشجرة عند تبديل اللغة تتم عبر .id(language.code) في الجذر.
@MainActor func L(_ key: String) -> String { AcLocalization.shared.t(key) }
@MainActor func L(_ key: String, _ args: [String: String]) -> String { AcLocalization.shared.t(key, args) }
@MainActor func LTeam(_ id: String?, fallback: String) -> String { AcLocalization.shared.teamName(id: id, fallback: fallback) }
@MainActor func LRound(_ roundEn: String, fallback: String) -> String { AcLocalization.shared.round(roundEn, fallback: fallback) }
@MainActor func LGroup(_ index: Int, fallback: String) -> String { AcLocalization.shared.groupName(index: index, fallback: fallback) }

// اسم لاعب/مدرّب: العربية تأخذ النقل الصوتي العربي؛ بقية اللغات تأخذ الاسم
// الأصلي اللاتيني (الأكثر قابلية للقراءة عالميًّا) مع احتياط للعربي إن غاب.
@MainActor func LName(_ ar: String, _ en: String?) -> String {
    if AcLocalization.shared.language.code == "ar" {
        return ar.isEmpty ? (en ?? "") : ar
    }
    let latin = en ?? ""
    return latin.isEmpty ? ar : latin
}

// رسالة خطأ معرّبة وفق اللغة الحالية — تُستدعى من طبقة الواجهة (MainActor)،
// فتتجاوز أوصاف APIError الثابتة بالعربية وتُترجم أخطاء الشبكة الشائعة.
@MainActor func LError(_ error: Error) -> String {
    if let api = error as? APIError {
        switch api {
        case .invalidURL: return L("error.invalidURL")
        case .invalidResponse: return L("error.invalidResponse")
        case .unauthorized: return L("error.unauthorized")
        case .forbidden: return L("error.forbidden")
        case .notFound: return L("error.notFound")
        case .rateLimited: return L("error.rateLimited")
        case .decoding: return L("error.decoding")
        case .server(_, let msg): return msg ?? L("error.server")
        }
    }
    if let urlError = error as? URLError {
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
            return L("error.offline")
        case .timedOut:
            return L("error.timeout")
        default:
            break
        }
    }
    return L("error.generic")
}
