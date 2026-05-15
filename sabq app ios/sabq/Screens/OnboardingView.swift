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
                tint: SabqTheme.primaryEnd,
                title: "أهلاً بك في سبق",
                body: "صحيفتك العربية الذكية — قراءة هادئة، محتوى موثوق، ذكاء اصطناعي شفّاف."
            ),
            Slide(
                id: 1,
                icon: "checkmark.shield.fill",
                tint: Color(red: 0.16, green: 0.68, blue: 0.40),
                title: "جواز المحتوى",
                body: "كل خبر تشاهده مرفق بـ جواز يكشف: من كتبه، من راجعه، نسبة الذكاء الاصطناعي، ومصدر الخبر — بشفّافية كاملة."
            ),
            Slide(
                id: 2,
                icon: "textformat",
                tint: SabqTheme.sky,
                title: "اقرأ كما تحب",
                body: "تحكّم في حجم الخط وتباعد الأسطر، استخدم خطّ القراءة الهادئ، وفعّل وضع التركيز لتجربة قراءة خالية من المشتّتات."
            ),
            Slide(
                id: 3,
                icon: "sparkles",
                tint: SabqTheme.coral,
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
        VStack(spacing: 30) {
            Spacer()

            ZStack {
                Circle()
                    .fill(slide.tint.opacity(0.12))
                    .frame(width: 160, height: 160)
                Circle()
                    .stroke(slide.tint.opacity(0.20), lineWidth: 1)
                    .frame(width: 200, height: 200)
                Image(systemName: slide.icon)
                    .font(.system(size: 64, weight: .light))
                    .foregroundStyle(slide.tint)
                    .symbolRenderingMode(.hierarchical)
            }

            VStack(spacing: 14) {
                Text(slide.title)
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)
                    .multilineTextAlignment(.center)

                Text(slide.body)
                    .font(.system(size: 15))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 28)
            }

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var bottomBar: some View {
        VStack(spacing: 18) {
            indicators

            primaryButton

            if page < slides.count - 1 {
                Button {
                    SabqHaptics.light()
                    completed = true
                } label: {
                    Text("تخطّي")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            } else {
                // Reserve the same vertical space when the skip button is gone.
                Color.clear.frame(height: 18)
            }
        }
        .padding(.horizontal, 26)
        .padding(.bottom, 30)
        .padding(.top, 16)
    }

    private var indicators: some View {
        HStack(spacing: 8) {
            ForEach(slides) { slide in
                let isActive = page == slide.id
                Capsule()
                    .fill(isActive ? slides[page].tint : SabqTheme.outline.opacity(0.6))
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
                withAnimation(.easeOut(duration: 0.3)) {
                    completed = true
                }
            }
        } label: {
            Text(page < slides.count - 1 ? "التالي" : "ابدأ الآن")
                .font(.system(size: 16, weight: .heavy, design: .rounded))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    Capsule(style: .continuous)
                        .fill(LinearGradient(
                            colors: [SabqTheme.primaryStart, SabqTheme.primaryEnd],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ))
                )
                .shadow(color: SabqTheme.primaryEnd.opacity(0.25), radius: 14, x: 0, y: 6)
        }
        .buttonStyle(.plain)
    }
}
