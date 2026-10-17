import SwiftUI

// 4-step welcome flow shown once per major version. Persisted via
// @AppStorage("sabqHasCompletedOnboardingV2") so existing users see it
// on first launch of this build, then it disappears for good unless
// the key is rotated in a future redesign.
struct OnboardingView: View {
    @AppStorage("sabqHasCompletedOnboardingV2") private var completed: Bool = false

    @State private var page: Int = 0
    @Namespace private var indicatorNamespace

    private struct Slide: Identifiable {
        let id: Int
        let icon: String
        let tint: Color
        let title: String
        let body: String
    }

    private var slides: [Slide] {
        [
            Slide(
                id: 0,
                icon: "newspaper.fill",
                tint: SabqTheme.primary,
                title: "أهلاً بك في سبق",
                body: "صحيفتك العربية الذكية — قراءة هادئة، محتوى موثوق، ذكاء اصطناعي شفّاف."
            ),
            Slide(
                id: 1,
                icon: "checkmark.shield.fill",
                tint: SabqTheme.primary,
                title: "جواز المحتوى",
                body: "كل خبر تشاهده مرفق بـ جواز يكشف: من كتبه، من راجعه، نسبة الذكاء الاصطناعي، ومصدر الخبر — بشفّافية كاملة."
            ),
            Slide(
                id: 2,
                icon: "textformat",
                tint: SabqTheme.primary,
                title: "اقرأ كما تحب",
                body: "تحكّم في حجم الخط وتباعد الأسطر، استخدم خطّ القراءة الهادئ، وفعّل وضع التركيز لتجربة قراءة خالية من المشتّتات."
            ),
            Slide(
                id: 3,
                icon: "sparkles",
                tint: SabqTheme.primary,
                title: "اكتشاف ذكي",
                body: "تقويم الأحداث، تحليلات عميقة بالذكاء الاصطناعي، نشرات صوتية يومية، وموجز شخصي بناءً على اهتماماتك."
            )
        ]
    }

    var body: some View {
        ZStack {
            SabqTheme.background.ignoresSafeArea()

            VStack(spacing: 0) {
                TabView(selection: $page) {
                    ForEach(slides) { slide in
                        slideView(slide)
                            .tag(slide.id)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.5, dampingFraction: 0.86), value: page)

                bottomBar
            }
        }
        .sabqRTL()
        .preferredColorScheme(.none)
    }

    private func slideView(_ slide: Slide) -> some View {
        VStack(spacing: SabqLayout.space32) {
            Spacer()

            ZStack {
                Circle()
                    .fill(SabqTheme.surfaceMuted)
                    .frame(width: 160, height: 160)
                Image(systemName: slide.icon)
                    .font(SabqFonts.app(size: 64, weight: .light))
                    .foregroundStyle(slide.tint)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(spacing: SabqLayout.space12) {
                Text(slide.title)
                    .sabqText(SabqType.articleTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)

                Text(slide.body)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, SabqLayout.space32)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var bottomBar: some View {
        VStack(spacing: SabqLayout.space16) {
            indicators

            primaryButton

            if page < slides.count - 1 {
                Button {
                    SabqHaptics.light()
                    finishOnboarding()
                } label: {
                    Text("تخطّي")
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.textSecondary)
                        .frame(minHeight: SabqLayout.touchTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                // Reserve the same vertical space when the skip button is gone.
                Color.clear.frame(height: SabqLayout.touchTarget)
            }
        }
        .padding(.horizontal, SabqLayout.space24)
        .padding(.bottom, SabqLayout.space32)
        .padding(.top, SabqLayout.space16)
    }

    /// Finish onboarding for both paths (skip + "ابدأ الآن"). Asks for
    /// notification permission here — independent of login — so the system
    /// prompt fires on first run and Sabq registers an APNs token + appears
    /// in iOS notification settings. Previously the prompt only fired after
    /// sign-in (AuthStore.registerPushTokenAfterAuth), so users who browsed
    /// without an account were never asked and Sabq was absent from the
    /// notification center (bug 2026-06-24). The token is stored locally and
    /// re-linked to the account after login.
    private func finishOnboarding() {
        Task { _ = await NotificationsStore.shared.requestPermission() }
        withAnimation(.easeOut(duration: 0.3)) {
            completed = true
        }
    }

    private var indicators: some View {
        HStack(spacing: SabqLayout.space8) {
            ForEach(slides) { slide in
                let isActive = page == slide.id
                Capsule()
                    .fill(isActive ? SabqTheme.primary : SabqTheme.outline)
                    .frame(width: isActive ? 24 : 8, height: 8)
                    .animation(.spring(response: 0.4, dampingFraction: 0.85), value: page)
            }
        }
    }

    private var primaryButton: some View {
        Button {
            SabqHaptics.medium()
            if page < slides.count - 1 {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                    page += 1
                }
            } else {
                finishOnboarding()
            }
        } label: {
            Text(page < slides.count - 1 ? "التالي" : "ابدأ الآن")
                .sabqText(SabqType.button)
                .foregroundStyle(SabqTheme.onAction)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.actionFill)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
