import SwiftUI

enum GcMajlisOnboarding {
    private static let prefix = "gc.majlis.onboarding.seen.v1."

    private static func key(userId: String, majlisId: String) -> String {
        "\(prefix)\(userId).\(majlisId)"
    }

    static func shouldShow(userId: String, majlisId: String) -> Bool {
        !UserDefaults.standard.bool(forKey: key(userId: userId, majlisId: majlisId))
    }

    static func markSeen(userId: String, majlisId: String) {
        UserDefaults.standard.set(true, forKey: key(userId: userId, majlisId: majlisId))
    }
}

private struct GcMajlisOnboardingPage: Identifiable {
    let id: Int
    let icon: String
    let title: String
    let subtitle: String
}

struct GcMajlisOnboardingView: View {
    let userId: String
    let majlisId: String
    let onFinish: () -> Void
    let onPredictNow: () -> Void

    @State private var page = 0
    @State private var enableAlerts = true
    @State private var finishing = false

    private let pages = [
        GcMajlisOnboardingPage(
            id: 0,
            icon: "person.3.fill",
            title: L("majlis.onboarding.rank.title"),
            subtitle: L("majlis.onboarding.rank.body")
        ),
        GcMajlisOnboardingPage(
            id: 1,
            icon: "lock.open.fill",
            title: L("majlis.onboarding.reveal.title"),
            subtitle: L("majlis.onboarding.reveal.body")
        ),
        GcMajlisOnboardingPage(
            id: 2,
            icon: "paperplane.fill",
            title: L("majlis.onboarding.invite.title"),
            subtitle: L("majlis.onboarding.invite.body")
        ),
    ]

    var body: some View {
        ZStack {
            GcTheme.screenGradient.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    Button(L("majlis.onboarding.skip")) { finish(openPredictions: false) }
                        .font(GulfCupFonts.app(size: 13, weight: .bold))
                        .foregroundStyle(GcTheme.inkDim)
                        .frame(minWidth: 44, minHeight: 44)
                    Spacer()
                    GcEmblem(height: 50, glow: false)
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                TabView(selection: $page) {
                    ForEach(pages) { item in
                        pageView(item)
                            .tag(item.id)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))

                VStack(spacing: 16) {
                    HStack(spacing: 7) {
                        ForEach(pages.indices, id: \.self) { index in
                            Capsule()
                                .fill(index == page ? GcTheme.sky : GcTheme.outline)
                                .frame(width: index == page ? 24 : 7, height: 7)
                                .animation(.easeOut(duration: 0.2), value: page)
                        }
                    }
                    .accessibilityLabel(L("majlis.onboarding.progress", ["current": "\(page + 1)", "total": "\(pages.count)"]))

                    if page == pages.count - 1 {
                        Toggle(isOn: $enableAlerts) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(L("majlis.onboarding.alerts.title"))
                                    .font(GulfCupFonts.app(size: 13, weight: .bold))
                                    .foregroundStyle(GcTheme.ink)
                                Text(L("majlis.onboarding.alerts.body"))
                                    .font(GulfCupFonts.app(size: 10.5))
                                    .foregroundStyle(GcTheme.inkDim)
                            }
                        }
                        .tint(GcTheme.sky)
                        .padding(13)
                        .gcCard(radius: 14)
                    }

                    Button {
                        if page < pages.count - 1 {
                            withAnimation(.easeOut(duration: 0.25)) { page += 1 }
                        } else {
                            finish(openPredictions: true)
                        }
                    } label: {
                        HStack(spacing: 8) {
                            if finishing { ProgressView().tint(.white) }
                            Text(page == pages.count - 1
                                 ? L("majlis.onboarding.predictNow")
                                 : L("majlis.onboarding.next"))
                            Image(systemName: page == pages.count - 1 ? "sparkles" : "chevron.left")
                        }
                        .font(GulfCupFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .background(
                            RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous)
                                .fill(GcTheme.sky)
                        )
                    }
                    .buttonStyle(GcPressStyle())
                    .disabled(finishing)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
        }
        .interactiveDismissDisabled()
    }

    private func pageView(_ item: GcMajlisOnboardingPage) -> some View {
        VStack(spacing: 22) {
            ZStack {
                Circle().fill(GcTheme.sky.opacity(0.12)).frame(width: 150, height: 150)
                Circle().stroke(GcTheme.sky.opacity(0.25), lineWidth: 1).frame(width: 124, height: 124)
                Image(systemName: item.icon)
                    .font(.system(size: 52, weight: .semibold))
                    .foregroundStyle(GcTheme.skyDeep)
            }
            .accessibilityHidden(true)

            VStack(spacing: 10) {
                Text(item.title)
                    .font(GulfCupFonts.headline(size: 25))
                    .foregroundStyle(GcTheme.ink)
                    .multilineTextAlignment(.center)
                Text(item.subtitle)
                    .font(GulfCupFonts.app(size: 15))
                    .foregroundStyle(GcTheme.inkDim)
                    .multilineTextAlignment(.center)
                    .lineSpacing(5)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 28)
        .accessibilityElement(children: .combine)
    }

    private func finish(openPredictions: Bool) {
        guard !finishing else { return }
        finishing = true
        GcMajlisOnboarding.markSeen(userId: userId, majlisId: majlisId)
        Task {
            // «تخطّي» لا يعني موافقة على إشعارات لم يرها المستخدم. الإذن يُطلب
            // فقط من CTA الصفحة الأخيرة حيث يظهر الـToggle بوضوح.
            if openPredictions && enableAlerts {
                _ = await GcMajlisNotificationPreferenceStore.shared.setEnabled(true)
            } else {
                // لا موافقة ضمنية: التخطي أو إطفاء المفتاح يسجلان opt-out
                // صريحًا في الخادم من دون إظهار prompt النظام.
                _ = await GcMajlisNotificationPreferenceStore.shared.setEnabled(
                    false,
                    requestSystemPermission: false
                )
            }
            await MainActor.run {
                finishing = false
                if openPredictions { onPredictNow() }
                else { onFinish() }
            }
        }
    }
}
