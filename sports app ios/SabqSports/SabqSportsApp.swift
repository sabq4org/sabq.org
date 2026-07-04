import SwiftUI

@main
struct SabqSportsApp: App {
    @UIApplicationDelegateAdaptor(SpAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @State private var auth = SpAuthStore.shared
    @State private var favorites = SpFavorites.shared
    @State private var matchFollows = SpMatchFollows.shared
    @State private var tabBarVis = SpTabBarVisibility.shared
    @State private var liveActivity = SpLiveActivityManager.shared
    @State private var themeMode = SpThemeMode.shared
    @State private var accent = SpAccentTheme.shared
    @State private var liveStream = SpLiveStream.shared

    init() {
        // سجّل خط IBM Plex Sans Arabic قبل أي واجهة تستعمله.
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(auth)
                .environment(favorites)
                .environment(matchFollows)
                .environment(tabBarVis)
                .environment(liveActivity)
                .environment(themeMode)
                .environment(accent)
                .environment(liveStream)
                // إعادة بناء الشجرة عند تبديل لون النادي أو نمط الألوان كي تلتقط
                // كل الشاشات القيم الجديدة فورًا (تُقرأ من الحوامل العامة أثناء الرسم).
                .id("\(accent.paletteId)|\(accent.styleId)")
                .sportsRTL()
                .preferredColorScheme(themeMode.colorScheme)
                .task { await auth.restore() }
                // استطلاع دوري مستقل لـ«مبارياتي» والنشاط الحيّ أثناء وجود التطبيق
                // أمامياً — يمنع تجمّد البطاقة/الويدجت حين لا تكون على مركز المباراة.
                .task { matchFollows.startAutoRefresh() }
                // البث الحيّ (SSE) — نتائج/أحداث فورية؛ يعمل بالمقدّمة فقط.
                .task { liveStream.start() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active {
                        matchFollows.startAutoRefresh()
                        liveStream.start()
                    } else {
                        matchFollows.stopAutoRefresh()
                        liveStream.stop()
                    }
                }
            // مظهر فاتح نظيف مفروض — تصميم كأس آسيا الأبيض (أبيض + أخضر مقتصد، لا غوامق).
        }
    }
}
