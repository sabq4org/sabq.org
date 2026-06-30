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
                // إعادة بناء الشجرة عند تبديل لون النادي كي تلتقط كل الشاشات اللون
                // الجديد فورًا (اللون المحوري يُقرأ من spActivePalette أثناء الرسم).
                .id(accent.paletteId)
                .sportsRTL()
                .preferredColorScheme(themeMode.colorScheme)
                .task { await auth.restore() }
                // استطلاع دوري مستقل لـ«مبارياتي» والنشاط الحيّ أثناء وجود التطبيق
                // أمامياً — يمنع تجمّد البطاقة/الويدجت حين لا تكون على مركز المباراة.
                .task { matchFollows.startAutoRefresh() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { matchFollows.startAutoRefresh() }
                    else { matchFollows.stopAutoRefresh() }
                }
            // مظهر فاتح نظيف مفروض — تصميم كأس آسيا الأبيض (أبيض + أخضر مقتصد، لا غوامق).
        }
    }
}
