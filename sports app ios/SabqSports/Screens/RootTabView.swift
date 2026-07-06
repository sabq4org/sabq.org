import SwiftUI

// جذر التطبيق — خمسة تبويبات. المباريات (مركز المباريات الموحّد لكل البطولات) ·
// روشن (هب الدوري = الرئيسية) · البطولات (بقية البطولات) · عالمية (كل مباريات
// العالم الجارية الآن) · حسابي. «التوقّعات» (نظام البركة المتدرّجة المعمّم) تُفتح
// من داخل صفحة «حسابي». مركز المباراة وصفحات النادي/اللاعب تُفتح من داخل التبويبات.
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
            MatchesCenterView()
                .tabItem { Label("المباريات", systemImage: "soccerball") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.matches)

            HomeView()
                .tabItem { Label("روشن", systemImage: "trophy.fill") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.roshn)

            CompetitionsView()
                .tabItem { Label("البطولات", systemImage: "sportscourt.fill") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.competitions)

            LiveView()
                .tabItem { Label("عالمية", systemImage: "globe") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.world)

            AccountView()
                .tabItem { Label("حسابي", systemImage: "person.crop.circle") }
                .toolbar(tabBarVisibility, for: .tabBar)
                .tag(SpTab.account)
        }
        .tint(SpTheme.green)
        // ورقة الدخول العامّة — تُفتح من أي شاشة عبر SpAppRouter.requestLogin().
        .sheet(isPresented: $router.showLogin) { SpLoginSheet() }
    }
}
