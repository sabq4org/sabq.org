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
                .sportsRTL()
                .preferredColorScheme(.light)
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
