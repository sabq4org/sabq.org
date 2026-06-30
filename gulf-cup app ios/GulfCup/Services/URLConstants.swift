import Foundation

// جذور الـ API — تطبيق خليجي 27 يستهلك نفس خادم سبق (الـ backend موجود فعلاً).
// نقاط خليجي 27 عامة (بلا مصادقة) تحت /api/gulf-cup/* = publicAPI.
enum URLConstants {
    static let webOrigin = "https://sabq.org"

    private static let apiOrigin = "https://api.sabq.org"

    /// `https://api.sabq.org/api` — نقاط خليجي 27 العامة (overview/teams/fixtures/
    /// standings) بلا مصادقة. نفس جذر الويب.
    static let publicAPI = "\(apiOrigin)/api"

    /// `https://api.sabq.org/api/v1` — محجوز لاحقًا للتوقعات/المصادقة (Apple Sign-In
    /// + Bearer) في PR-B3. النسخة الأولى من التطبيق بلا تسجيل دخول.
    static let mobileAPI = "\(apiOrigin)/api/v1"
}
