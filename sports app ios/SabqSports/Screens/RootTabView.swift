import SwiftUI

// جذر التطبيق — خمسة تبويبات. المباريات (جدول المونديال بالتواريخ) · روشن (هب
// الدوري = الرئيسية) · البطولات (بقية البطولات) · عالمية (كل مباريات العالم
// الجارية الآن) · حسابي. «التوقّعات» (نظام البركة المتدرّجة المعمّم) تُفتح من
// داخل صفحة «حسابي». مركز المباراة وصفحات النادي/اللاعب تُفتح من داخل التبويبات.
struct RootTabView: View {
    @Environment(SpTabBarVisibility.self) private var tabBarVis

    init() {
        // شريط تبويب أبيض نظيف (تصميم كأس آسيا الأبيض على الويب).
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    private var tabBarVisibility: Visibility { tabBarVis.hidden ? .hidden : .visible }

    var body: some View {
        TabView {
            MatchesView()
                .tabItem { Label("المباريات", systemImage: "soccerball") }
                .toolbar(tabBarVisibility, for: .tabBar)

            HomeView()
                .tabItem { Label("روشن", systemImage: "trophy.fill") }
                .toolbar(tabBarVisibility, for: .tabBar)

            CompetitionsView()
                .tabItem { Label("البطولات", systemImage: "sportscourt.fill") }
                .toolbar(tabBarVisibility, for: .tabBar)

            LiveView()
                .tabItem { Label("عالمية", systemImage: "globe") }
                .toolbar(tabBarVisibility, for: .tabBar)

            AccountView()
                .tabItem { Label("حسابي", systemImage: "person.crop.circle") }
                .toolbar(tabBarVisibility, for: .tabBar)
        }
        .tint(SpTheme.green)
    }
}
