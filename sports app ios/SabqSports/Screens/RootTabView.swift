import SwiftUI

// جذر التطبيق — خمسة تبويبات. المباريات (مركز المباريات الموحّد لكل البطولات) ·
// روشن (هب الدوري = الرئيسية) · البطولات (بقية البطولات) · عالمية (كل مباريات
// العالم الجارية الآن) · حسابي. «التوقّعات» (نظام البركة المتدرّجة المعمّم) تُفتح
// من داخل صفحة «حسابي». مركز المباراة وصفحات النادي/اللاعب تُفتح من داخل التبويبات.
//
// قرار 2026-07-09 (أ1): لا Onboarding — التطبيق يفتح مباشرة على التبويبات (Guest-first).
struct RootTabView: View {
    @Environment(SpTabBarVisibility.self) private var tabBarVis
    @Environment(SpAppRouter.self) private var router

    init() {
        // شريط تبويب أبيض نظيف (تصميم كأس آسيا الأبيض على الويب).
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    private var tabBarVisibility: Visibility { tabBarVis.hidden ? .hidden : .visible }

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedTab) {
            SpLazyTab(active: router.selectedTab == .matches) {
                MatchesCenterView()
            }
                .tabItem { Label(L("المباريات"), systemImage: "soccerball") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.matches)

            SpLazyTab(active: router.selectedTab == .roshn) {
                HomeView()
            }
                .tabItem { Label(L("روشن"), systemImage: "trophy.fill") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.roshn)

            SpLazyTab(active: router.selectedTab == .competitions) {
                CompetitionsView()
            }
                .tabItem { Label(L("البطولات"), systemImage: "sportscourt.fill") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.competitions)

            SpLazyTab(active: router.selectedTab == .world) {
                LiveView()
            }
                .tabItem { Label(L("عالمية"), systemImage: "globe") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.world)

            SpLazyTab(active: router.selectedTab == .account) {
                AccountView()
            }
                .tabItem { Label(L("حسابي"), systemImage: "person.crop.circle") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.account)
        }
        .tint(SpTheme.green)
        // ورقة الدخول العامّة — تُفتح من أي شاشة عبر SpAppRouter.requestLogin().
        .sheet(isPresented: $router.showLogin) { SpLoginSheet() }
        .onOpenURL { router.handle(url: $0) }
    }
}

private struct SpLazyTab<Content: View>: View {
    let active: Bool
    @ViewBuilder let content: () -> Content
    @State private var loaded = false

    var body: some View {
        Group {
            if active || loaded {
                content()
            } else {
                SpTabPlaceholder()
            }
        }
        .onAppear {
            if active { loaded = true }
        }
        .onChange(of: active) { _, nowActive in
            if nowActive { loaded = true }
        }
    }
}

private struct SpTabPlaceholder: View {
    var body: some View {
        ZStack {
            SpAmbientBackground().ignoresSafeArea()
            ProgressView()
                .tint(SpTheme.green)
        }
    }
}
