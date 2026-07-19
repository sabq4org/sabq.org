import Foundation

// جذور الـ API — تطبيق VARA الرياضي يستهلك نفس خادم سبق (الـ backend جاهز فعلاً
// تحت /api/sports/*). نقاط البوابة الرياضية عامة (بلا مصادقة) = publicAPI.
nonisolated enum URLConstants {
    static let webOrigin = "https://sabq.org"

    private static let apiOrigin = "https://api.sabq.org"

    /// `https://api.sabq.org/api` — نقاط البوابة الرياضية العامة:
    /// `/sports/competitions`, `/sports/:comp/matches·standings·scorers`,
    /// `/sports/today`, `/sports/live`, `/sports/match/:id` … بلا مصادقة.
    static let publicAPI = "\(apiOrigin)/api"

    /// `https://api.sabq.org/api/v1` — التوقّعات/المتابعة/التنبيهات (Bearer).
    static let mobileAPI = "\(apiOrigin)/api/v1"

    /// يحوّل رابط صورة نسبيًّا (مثل `/uploads/...`) إلى مطلق على `sabq.org`
    /// (نظير absolutize في التطبيق الرئيسي) — روابط profileImageUrl قد تكون نسبية.
    static func absolutize(_ raw: String) -> String {
        if raw.hasPrefix("http") { return raw }
        return "\(webOrigin)\(raw.hasPrefix("/") ? "" : "/")\(raw)"
    }

    // ── روابط المشاركة الاجتماعية (روابط عميقة لموقع سبق) ──
    // تطابق صفحات الويب القائمة: /sports/match·team·player/:id.
    static func matchShareURL(_ id: Int) -> URL? { URL(string: "\(webOrigin)/sports/match/\(id)") }
    static func teamShareURL(_ id: Int) -> URL? { URL(string: "\(webOrigin)/sports/team/\(id)") }
    static func playerShareURL(_ id: Int) -> URL? { URL(string: "\(webOrigin)/sports/player/\(id)") }
}
