import Foundation

// جذور الـ API — تطبيق سبق الرياضي يستهلك نفس خادم سبق (الـ backend جاهز فعلاً
// تحت /api/sports/*). نقاط البوابة الرياضية عامة (بلا مصادقة) = publicAPI.
nonisolated enum URLConstants {
    static let webOrigin = "https://sabq.org"

    private static let apiOrigin = "https://api.sabq.org"

    /// `https://api.sabq.org/api` — نقاط البوابة الرياضية العامة:
    /// `/sports/competitions`, `/sports/:comp/matches·standings·scorers`,
    /// `/sports/today`, `/sports/live`, `/sports/match/:id` … بلا مصادقة.
    static let publicAPI = "\(apiOrigin)/api"

    /// `https://api.sabq.org/api/v1` — محجوز للتوقّعات/المتابعة/التنبيهات
    /// (Apple Sign-In + Bearer) في v1.1. النسخة الأولى تصفّح فقط بلا تسجيل دخول.
    static let mobileAPI = "\(apiOrigin)/api/v1"
}
