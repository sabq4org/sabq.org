import Foundation

// جذور الـ API — تطبيق كأس آسيا يستهلك نفس خادم سبق (الـ backend موجود فعلاً).
// نقاط كأس آسيا عامة (بلا مصادقة) تحت /api/asian-cup/* = publicAPI.
nonisolated enum URLConstants {
    static let webOrigin = "https://sabq.org"

    private static let apiOrigin = "https://api.sabq.org"

    /// `https://api.sabq.org/api` — نقاط كأس آسيا العامة (overview/teams/fixtures/
    /// standings) بلا مصادقة. نفس جذر الويب.
    static let publicAPI = "\(apiOrigin)/api"

    /// `https://api.sabq.org/api/v1` — محجوز لاحقًا للتوقعات/المصادقة (Apple Sign-In
    /// + Bearer) في PR-B3. النسخة الأولى من التطبيق بلا تسجيل دخول.
    static let mobileAPI = "\(apiOrigin)/api/v1"
}
