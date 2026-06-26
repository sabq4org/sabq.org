import SwiftUI

// شاشات تعريفية تُعرض عند أول تشغيل — تجربة خضراء غامرة (Aurora متحرّكة) تُبرز
// أهمّ مزايا التطبيق وتُعرّف أنه أحد منتجات صحيفة سبق الإلكترونية. تُربَط بـ
// AppStorage("ob_seen_v1") في RootTabView وتُستدعى مرّةً واحدة.
struct OnboardingView: View {
    var onFinish: () -> Void

    @State private var page = 0

    private let pages: [OBPage] = [
        OBPage(
            kind: .brand,
            title: "VARA",
            subtitle: "وجهتك الأولى لكرة القدم — السعودية والعربية والعالمية، بين يديك لحظةً بلحظة.",
            accent: SpTheme.greenSoft
        ),
        OBPage(
            kind: .symbol("sportscourt.fill"),
            title: "مركز المباراة الحيّ",
            subtitle: "خطّ زمن للأحداث، إحصاءات مفصّلة، تشكيلات على أرض الملعب، وتعليق لحظة بلحظة.",
            accent: SpTheme.greenSoft
        ),
        OBPage(
            kind: .symbol("dot.radiowaves.left.and.right"),
            title: "كل المباريات مباشرة",
            subtitle: "نتائج لحظية وعدّاد انطلاق — الجارية الآن تتصدّر، من كأس العالم إلى دوري روشن.",
            accent: Color(red: 0.16, green: 0.62, blue: 0.55)
        ),
        OBPage(
            kind: .symbol("trophy.fill"),
            title: "كل شيء عن البطولة",
            subtitle: "الترتيب، الهدّافون، الأخبار، وصفحات الأندية واللاعبين بتفاصيل غنية.",
            accent: SpTheme.gold
        ),
        OBPage(
            kind: .symbol("bell.badge.fill"),
            title: "تابع فريقك ولا تفوّت لحظة",
            subtitle: "فعّل التنبيهات لأهداف فريقك ومبارياته المفضّلة، واجعل سبق رفيقك في كل جولة.",
            accent: SpTheme.greenSoft
        ),
    ]

    private var isLast: Bool { page == pages.count - 1 }

    var body: some View {
        ZStack {
            OBAurora(accent: pages[page].accent)
                .animation(.easeInOut(duration: 0.6), value: page)

            VStack(spacing: 0) {
                topBar
                TabView(selection: $page) {
                    ForEach(Array(pages.enumerated()), id: \.offset) { idx, p in
                        OBPageView(page: p)
                            .tag(idx)
                            .padding(.horizontal, 28)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .environment(\.layoutDirection, .leftToRight) // اتجاه تمرير ثابت للصفحات

                bottomControls
            }
        }
        .preferredColorScheme(.dark)
    }

    // شريط علوي: تخطّي.
    private var topBar: some View {
        HStack {
            Spacer()
            if !isLast {
                Button(action: finish) {
                    Text("تخطّي")
                        .font(SportsFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.8))
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .background(Capsule().fill(.white.opacity(0.12)))
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .frame(height: 44)
    }

    // مؤشّر الصفحات + الزر + هوية سبق.
    private var bottomControls: some View {
        VStack(spacing: 22) {
            HStack(spacing: 7) {
                ForEach(pages.indices, id: \.self) { i in
                    Capsule()
                        .fill(i == page ? Color.white : Color.white.opacity(0.3))
                        .frame(width: i == page ? 22 : 7, height: 7)
                        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: page)
                }
            }

            Button(action: advance) {
                HStack(spacing: 8) {
                    Text(isLast ? "ابدأ الآن" : "التالي")
                        .font(SportsFonts.app(size: 16, weight: .bold))
                    Image(systemName: isLast ? "checkmark" : "arrow.left")
                        .font(.system(size: 14, weight: .bold))
                }
                .foregroundStyle(SpTheme.greenDeep)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(.white)
                        .shadow(color: .black.opacity(0.18), radius: 16, y: 8)
                )
            }
            .padding(.horizontal, 28)

            brandFooter
        }
        .padding(.bottom, 24)
    }

    // هوية: أحد منتجات صحيفة سبق الإلكترونية.
    private var brandFooter: some View {
        HStack(spacing: 7) {
            Image(systemName: "sparkles")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(SpTheme.goldSoft)
            Text("أحد منتجات صحيفة سبق الإلكترونية")
                .font(SportsFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(.white.opacity(0.75))
        }
    }

    private func advance() {
        if isLast { finish() }
        else { withAnimation(.easeInOut(duration: 0.35)) { page += 1 } }
    }

    private func finish() {
        let haptic = UIImpactFeedbackGenerator(style: .soft)
        haptic.impactOccurred()
        onFinish()
    }
}

// MARK: - نموذج الصفحة

private struct OBPage {
    enum Kind { case brand; case symbol(String) }
    let kind: Kind
    let title: String
    let subtitle: String
    let accent: Color
}

// MARK: - محتوى صفحة واحدة (بطل متوهّج + عنوان + وصف، بظهور متدرّج)

private struct OBPageView: View {
    let page: OBPage
    @State private var shown = false

    var body: some View {
        VStack(spacing: 30) {
            Spacer(minLength: 0)

            OBHero(kind: page.kind, accent: page.accent)
                .scaleEffect(shown ? 1 : 0.8)
                .opacity(shown ? 1 : 0)

            VStack(spacing: 14) {
                Text(page.title)
                    .font(brandTitle ? .system(size: 44, weight: .black) : SportsFonts.app(size: 28, weight: .heavy))
                    .foregroundStyle(.white)
                    .tracking(brandTitle ? 3 : 0)
                    .environment(\.layoutDirection, brandTitle ? .leftToRight : .rightToLeft)
                    .multilineTextAlignment(.center)

                Text(page.subtitle)
                    .font(SportsFonts.app(size: 15.5))
                    .foregroundStyle(.white.opacity(0.82))
                    .multilineTextAlignment(.center)
                    .lineSpacing(5)
                    .padding(.horizontal, 6)
            }
            .offset(y: shown ? 0 : 18)
            .opacity(shown ? 1 : 0)

            Spacer(minLength: 0)
        }
        .onAppear {
            shown = false
            withAnimation(.easeOut(duration: 0.5).delay(0.05)) { shown = true }
        }
    }

    private var brandTitle: Bool { if case .brand = page.kind { return true } else { return false } }
}

// MARK: - البطل المتوهّج العائم

private struct OBHero: View {
    let kind: OBPage.Kind
    let accent: Color
    @State private var float = false

    var body: some View {
        ZStack {
            Circle().fill(accent.opacity(0.35)).frame(width: 230, height: 230).blur(radius: 45)
            Circle()
                .fill(.white.opacity(0.10))
                .frame(width: 168, height: 168)
                .overlay(Circle().stroke(.white.opacity(0.30), lineWidth: 1))
            Circle()
                .fill(.white.opacity(0.06))
                .frame(width: 132, height: 132)
                .overlay(Circle().stroke(.white.opacity(0.18), lineWidth: 1))

            content
        }
        .offset(y: float ? -9 : 9)
        .onAppear {
            withAnimation(.easeInOut(duration: 2.6).repeatForever(autoreverses: true)) { float = true }
        }
    }

    @ViewBuilder private var content: some View {
        switch kind {
        case .brand:
            Image("VaraLogo")
                .resizable().scaledToFill()
                .frame(width: 104, height: 104)
                .clipShape(Circle())
                .overlay(Circle().stroke(.white.opacity(0.35), lineWidth: 1.5))
                .shadow(color: .black.opacity(0.25), radius: 12, y: 6)
        case .symbol(let name):
            Image(systemName: name)
                .font(.system(size: 58, weight: .semibold))
                .foregroundStyle(.white)
                .shadow(color: accent.opacity(0.6), radius: 14)
        }
    }
}

// MARK: - خلفية Aurora متحرّكة

private struct OBAurora: View {
    let accent: Color
    @State private var animate = false

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.20, blue: 0.15),
                    Color(red: 0.07, green: 0.32, blue: 0.24),
                    Color(red: 0.05, green: 0.24, blue: 0.18),
                ],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )

            blob(accent.opacity(0.55), size: 340)
                .offset(x: animate ? -110 : -70, y: animate ? -250 : -300)
            blob(SpTheme.greenSoft.opacity(0.45), size: 300)
                .offset(x: animate ? 150 : 110, y: animate ? 280 : 330)
            blob(SpTheme.gold.opacity(0.20), size: 220)
                .offset(x: animate ? 120 : 160, y: animate ? -110 : -60)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) { animate = true }
        }
    }

    private func blob(_ color: Color, size: CGFloat) -> some View {
        Circle().fill(color).frame(width: size, height: size).blur(radius: 80)
    }
}
