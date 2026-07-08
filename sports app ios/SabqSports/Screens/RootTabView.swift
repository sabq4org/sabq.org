import SwiftUI

// جذر التطبيق — خمسة تبويبات. المباريات (مركز المباريات الموحّد لكل البطولات) ·
// روشن (هب الدوري = الرئيسية) · البطولات (بقية البطولات) · عالمية (كل مباريات
// العالم الجارية الآن) · حسابي. «التوقّعات» (نظام البركة المتدرّجة المعمّم) تُفتح
// من داخل صفحة «حسابي». مركز المباراة وصفحات النادي/اللاعب تُفتح من داخل التبويبات.
struct RootTabView: View {
    @Environment(SpTabBarVisibility.self) private var tabBarVis
    @Environment(SpAppRouter.self) private var router

    // شاشات الترحيب — تظهر مرّة واحدة عند أول تشغيل (مفتاح جديد كي تظهر أيضًا
    // لمن حدّث من نسخة سابقة بلا Onboarding).
    @AppStorage("sabqsports.onboarding.seen.v2") private var onboardingSeen = false
    @State private var showOnboarding = false

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
        .fullScreenCover(isPresented: $showOnboarding) {
            SpOnboardingView { onboardingSeen = true; showOnboarding = false }
        }
        .onAppear { if !onboardingSeen { showOnboarding = true } }
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

// MARK: - شاشات الترحيب (Onboarding) — أول تشغيل

private struct SpOnboardPage: Identifiable {
    let id: Int
    let icon: String
    let title: String
    let subtitle: String
}

/// جولة تعريفية إبداعية بهوية VARA تُعرَض مرّة عند أول تشغيل: ترحيب + أبرز
/// المميزات، مع ختم «أحد منتجات صحيفة سبق». صفحات قابلة للسحب + زر تقدّم.
struct SpOnboardingView: View {
    let onFinish: () -> Void
    @State private var page = 0

    private var pages: [SpOnboardPage] {
        [
            SpOnboardPage(id: 1, icon: "soccerball.inverse",
                          title: L("كل المباريات في مكان واحد"),
                          subtitle: L("جدول موحّد لكل البطولات، ومركز مباراة غنيّ بالأحداث والإحصائيات والتشكيلات والتقييمات.")),
            SpOnboardPage(id: 2, icon: "sparkles",
                          title: L("توقّع VARA الذكي"),
                          subtitle: L("خوارزمية ديناميكية تحسب احتمالات النتيجة من الترتيب والفورمة وأفضلية الأرض — ونافس على لوحة المتصدّرين.")),
            SpOnboardPage(id: 3, icon: "bell.badge.fill",
                          title: L("تابع فريقك ولا تفوّت لحظة"),
                          subtitle: L("تنبيهات فورية للأهداف والبطاقات وحالات الفار، وبطاقة «مبارياتي» بعدّاد تنازليّ حيّ.")),
        ]
    }

    private var isLast: Bool { page >= pages.count }

    var body: some View {
        ZStack {
            SpAmbientBackground().ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button(L("تخطّي")) { onFinish() }
                        .font(SportsFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(SpTheme.onDarkDim)
                    Spacer()
                }
                .padding(.horizontal, 20).padding(.top, 12)

                TabView(selection: $page) {
                    welcomePage.tag(0)
                    ForEach(Array(pages.enumerated()), id: \.element.id) { idx, p in
                        featurePage(p).tag(idx + 1)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.easeInOut, value: page)

                dots.padding(.vertical, 18)

                Button {
                    if isLast { onFinish() }
                    else { withAnimation(.easeInOut(duration: 0.3)) { page += 1 } }
                } label: {
                    Text(isLast ? L("ابدأ الآن") : L("التالي"))
                        .font(SportsFonts.app(size: 16, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity).frame(height: 52)
                        .background(RoundedRectangle(cornerRadius: SpTheme.buttonRadius, style: .continuous).fill(SpTheme.green))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20).padding(.bottom, 28)
            }
        }
    }

    // الصفحة الأولى — الترحيب + الختم.
    private var welcomePage: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle().fill(SpTheme.green.opacity(0.12)).frame(width: 150, height: 150)
                Circle().stroke(SpTheme.green.opacity(0.25), lineWidth: 2).frame(width: 178, height: 178)
                SpWordmark(size: 44)
            }
            VStack(spacing: 10) {
                Text(L("مرحبًا بك في VARA"))
                    .font(SportsFonts.headline(size: 26))
                    .foregroundStyle(SpTheme.onDark)
                Text(L("دقّة الرياضة في راحة يدك — مباريات، بطولات، وتوقّعات ذكية في تطبيق واحد."))
                    .font(SportsFonts.app(size: 15))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 34)
            }
            HStack(spacing: 7) {
                Text(L("أحد منتجات"))
                    .font(SportsFonts.app(size: 12, weight: .semibold))
                    .foregroundStyle(SpTheme.onDarkFaint)
                Rectangle().fill(SpTheme.outline).frame(width: 1, height: 12)
                Text(L("صحيفة سبق"))
                    .font(SportsFonts.app(size: 12, weight: .heavy))
                    .foregroundStyle(SpTheme.green)
            }
            .padding(.top, 4)
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private func featurePage(_ p: SpOnboardPage) -> some View {
        VStack(spacing: 22) {
            Spacer()
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [SpTheme.green.opacity(0.16), SpTheme.gold.opacity(0.12)],
                                         startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 150, height: 150)
                Image(systemName: p.icon)
                    .font(.system(size: 60, weight: .bold))
                    .foregroundStyle(SpTheme.green)
            }
            VStack(spacing: 12) {
                Text(p.title)
                    .font(SportsFonts.headline(size: 23))
                    .foregroundStyle(SpTheme.onDark)
                    .multilineTextAlignment(.center)
                Text(p.subtitle)
                    .font(SportsFonts.app(size: 15))
                    .foregroundStyle(SpTheme.onDarkDim)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 30)
            }
            Spacer()
        }
        .padding(.horizontal, 20)
    }

    private var dots: some View {
        HStack(spacing: 7) {
            ForEach(0...pages.count, id: \.self) { i in
                Capsule()
                    .fill(i == page ? SpTheme.green : SpTheme.outline.opacity(0.6))
                    .frame(width: i == page ? 22 : 7, height: 7)
                    .animation(.easeInOut(duration: 0.25), value: page)
            }
        }
    }
}
