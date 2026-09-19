import Foundation
import Observation
import UIKit

/// شكل ردّ `/api/system/ios-national-day-theme`.
nonisolated struct IosNationalDayThemeFlag: Decodable, Sendable {
    let enabled: Bool
}

/// يملك حالة الثيم الموسمي في التطبيق: يقرأها من الخادم، يخزّنها محليًا،
/// ويعرضها للواجهات.
///
/// قواعد التصميم التي تحكم هذا الملف:
///
/// 1. **لا يؤخَّر فتح التطبيق انتظارًا للشبكة.** القيمة الأولية تُقرأ من
///    `UserDefaults` فورًا في `init`، فالإقلاع لا يلمس الشبكة إطلاقًا. الجلب
///    يجري بعد ظهور أول إطار، ويبدّل الهوية بهدوء إن تغيّرت.
/// 2. **الفشل يُبقي آخر حالة معروفة.** انقطاع الشبكة أو خطأ الخادم لا يعيد
///    الجهاز للوضع الافتراضي — لأن «معطّل» و«تعذّر الجلب» ليسا الشيء نفسه.
/// 3. **التحديث دوري لا لحظي.** لا يوجد دفع فوري لهذا المفتاح: التبديل يصل
///    عند فتح التطبيق، ثم كل ست ساعات أثناء الاستخدام. الجهاز غير المتصل لا
///    يستقبل التبديل حتى يتصل.
/// 4. **أيقونة التطبيق تتبع الحالة.** تبديلها يمرّ بـ`setAlternateIconName`،
///    وهو الطريق الوحيد المعلن من آبل. يعرض النظام تنبيهًا للمستخدم عند كل
///    تبديل ناجح، ولا سبيل لكتمه بواجهة معلنة — انظر `syncAppIcon`.
@MainActor
@Observable
final class SeasonalThemeStore {

    static let shared = SeasonalThemeStore()

    /// هل ثيم اليوم الوطني مفعّل؟ المصدر الوحيد للواجهات.
    private(set) var isNationalDayActive: Bool

    private var lastSuccessfulFetch: Date?
    private var inFlight = false

    /// ست ساعات — كافية ليصل تبديل من اللوحة في اليوم نفسه، بلا استنزاف
    /// بطارية ولا حِمل على الخادم.
    private static let refreshInterval: TimeInterval = 6 * 60 * 60

    private init() {
        // القيمة المحفوظة من آخر تشغيل — بلا شبكة، بلا انتظار.
        isNationalDayActive = UserDefaults.standard.bool(forKey: NationalDayTheme.activeDefaultsKey)
    }

    /// تُستدعى عند الإقلاع وعند كل عودة للواجهة. تتجاهل النداء إن كانت آخر
    /// قراءة ناجحة حديثة.
    func refreshIfStale() async {
        if let last = lastSuccessfulFetch,
           Date().timeIntervalSince(last) < Self.refreshInterval {
            return
        }
        await refresh()
    }

    /// جلب صريح يتجاوز فحص القِدَم.
    func refresh() async {
        guard !inFlight else { return }
        inFlight = true
        defer { inFlight = false }

        do {
            let flag = try await APIClient.shared.fetchIosNationalDayTheme()
            lastSuccessfulFetch = Date()
            apply(enabled: flag.enabled)
        } catch {
            // مقصود: نُبقي آخر حالة معروفة. التعطيل قرار إداري صريح،
            // لا نتيجة جانبية لانقطاع اتصال.
            #if DEBUG
            print("[sabq] seasonal theme fetch failed — keeping last known state: \(error)")
            #endif
        }
    }

    private func apply(enabled: Bool) {
        // اكتب دائمًا حتى تبقى المرآة التي يقرأها `SabqTheme` صحيحة بعد
        // إعادة التشغيل، ولو لم تتغيّر الحالة.
        UserDefaults.standard.set(enabled, forKey: NationalDayTheme.activeDefaultsKey)
        syncAppIcon(enabled: enabled)
        guard enabled != isNationalDayActive else { return }
        isNationalDayActive = enabled
    }

    /// يوائم أيقونة الشاشة الرئيسية مع حالة الثيم.
    ///
    /// يقارن دائمًا بالأيقونة المركّبة فعلًا لا بالحالة السابقة في الذاكرة،
    /// فلو فشل تبديل سابق (يرفض النظام التبديل والتطبيق في الخلفية) صحّحه
    /// النداء التالي من تلقائه.
    ///
    /// **تنبيه النظام:** عند كل تبديل ناجح يعرض iOS تنبيهًا يخبر المستخدم أن
    /// أيقونة التطبيق تغيّرت. هذا سلوك النظام منذ iOS 10.3 ولا يمكن إلغاؤه
    /// بواجهة معلنة، فلا تُعامل ظهوره على أنه خطأ.
    private func syncAppIcon(enabled: Bool) {
        let app = UIApplication.shared
        guard app.supportsAlternateIcons else { return }

        let desired: String? = enabled ? NationalDayTheme.alternateIconName : nil
        guard app.alternateIconName != desired else { return }

        app.setAlternateIconName(desired) { error in
            #if DEBUG
            if let error {
                print("[sabq] alternate app icon change failed: \(error)")
            }
            #endif
        }
    }
}
