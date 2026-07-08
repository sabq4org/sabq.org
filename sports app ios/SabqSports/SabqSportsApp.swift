import SwiftUI

@main
struct SabqSportsApp: App {
    @UIApplicationDelegateAdaptor(SpAppDelegate.self) private var appDelegate

    init() {
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            SpStartupShell()
        }
    }
}

private struct SpStartupShell: View {
    @State private var ready = false

    var body: some View {
        Group {
            if ready {
                SpAppEnvironmentRoot()
            } else {
                Color(red: 0.039, green: 0.267, blue: 0.192)
                    .ignoresSafeArea()
            }
        }
        .task {
            await Task.yield()
            ready = true
        }
    }
}

private struct SpAppEnvironmentRoot: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var auth = SpAuthStore.shared
    @State private var favorites = SpFavorites.shared
    @State private var competitionFavorites = SpCompetitionFavorites.shared
    @State private var matchFollows = SpMatchFollows.shared
    @State private var tabBarVis = SpTabBarVisibility.shared
    @State private var liveActivity = SpLiveActivityManager.shared
    @State private var themeMode = SpThemeMode.shared
    @State private var accent = SpAccentTheme.shared
    @State private var liveStream = SpLiveStream.shared
    @State private var router = SpAppRouter.shared
    @State private var language = SpLanguage.shared

    var body: some View {
        RootTabView()
            .environment(auth)
            .environment(favorites)
            .environment(competitionFavorites)
            .environment(matchFollows)
            .environment(tabBarVis)
            .environment(liveActivity)
            .environment(themeMode)
            .environment(accent)
            .environment(liveStream)
            .environment(router)
            .environment(language)
            // إعادة بناء الشجرة عند تبديل لون التطبيق أو اللغة كي تلتقط
            // كل الشاشات القيم الجديدة فورًا (تُقرأ من الحوامل العامة أثناء الرسم).
            .id("\(accent.paletteId)|\(accent.styleId)|\(language.lang.rawValue)")
            .sportsRTL(language.lang)
            .preferredColorScheme(themeMode.colorScheme)
            .task {
                await Task.yield()
                try? await Task.sleep(nanoseconds: 350_000_000)
                await auth.restore()
            }
            // استطلاع دوري مستقل لـ«مبارياتي» والنشاط الحيّ أثناء وجود التطبيق
            // أمامياً — يمنع تجمّد البطاقة/الويدجت حين لا تكون على مركز المباراة.
            .task {
                await Task.yield()
                try? await Task.sleep(nanoseconds: 500_000_000)
                matchFollows.loadStoredIfNeeded()
                matchFollows.startAutoRefresh()
            }
            // البث الحيّ (SSE) — نتائج/أحداث فورية؛ يعمل بالمقدّمة فقط.
            .task {
                await Task.yield()
                try? await Task.sleep(nanoseconds: 500_000_000)
                liveActivity.adoptExistingIfNeeded()
                liveStream.start()
            }
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
