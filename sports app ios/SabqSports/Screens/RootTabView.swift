import SwiftUI

// جذر التطبيق — خمسة تبويبات. الرئيسية (نظرة موحّدة) · البطولات (روشن افتراضي) ·
// المباشر (لوحة مباشرة شاملة) · المجتمع (توقّعات/متصدّرون — v1.1) · حسابي (v1.1).
// مركز المباراة وصفحات النادي/اللاعب تُفتح كـ push/sheet من داخل هذه التبويبات.
struct RootTabView: View {
    init() {
        // مظهر شريط التبويب داكن متناسق مع الخلفية الفاخرة.
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(red: 0.03, green: 0.10, blue: 0.08, alpha: 1)
        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }

    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("الرئيسية", systemImage: "house.fill") }

            CompetitionsView()
                .tabItem { Label("البطولات", systemImage: "trophy.fill") }

            LiveView()
                .tabItem { Label("المباشر", systemImage: "dot.radiowaves.left.and.right") }

            CommunityView()
                .tabItem { Label("المجتمع", systemImage: "person.2.fill") }

            AccountView()
                .tabItem { Label("حسابي", systemImage: "person.crop.circle") }
        }
        .tint(SpTheme.gold)
    }
}
