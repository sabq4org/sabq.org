import SwiftUI

// جذر التطبيق — خمسة تبويبات. روشن (هب الدوري = الرئيسية) · البطولات (بقية
// البطولات) · المباريات (جدول المونديال بالتواريخ) · عالمية (كل مباريات العالم
// الجارية الآن) · حسابي. أُزيل تبويب «الأخبار» (تبقى كقسم في روشن) و«المباشر»
// أُعيد كـ«عالمية» (محتواه العالمي الحيّ فقط). مركز المباراة وصفحات النادي/اللاعب
// تُفتح من داخل هذه التبويبات.
struct RootTabView: View {
    // يُضبط بعد إتمام/تخطّي الشاشات التعريفية — يمنع ظهورها ثانيةً.
    @AppStorage("ob_seen_v1") private var onboardingSeen = false
    @State private var showOnboarding = false
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
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView {
                onboardingSeen = true
                showOnboarding = false
            }
        }
        .onAppear { if !onboardingSeen { showOnboarding = true } }
    }
}
