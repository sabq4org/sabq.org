import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Newsletter Sheet

/// Pitch + subscribe surface for the smart newsletter. Communicates the AI
/// pipeline (interest-driven persona, daily summaries) via four feature
/// chips, prefills the email from the signed-in user, and gives a single
/// celebratory success state with a prominent one-tap unsubscribe button so
/// users never feel locked in.
struct NewsletterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var email = ""
    @State private var firstName = ""
    @State private var screenState: ScreenState = .form
    @State private var errorMessage: String?
    @State private var celebrationScale: CGFloat = 0.0

    enum ScreenState {
        case form           // Pitch + email field + subscribe button
        case subscribing    // Loading
        case subscribed     // Success celebration
        case alreadyMember  // Email already subscribed (different copy)
        case unsubscribing
        case unsubscribed
    }

    private var trimmedEmail: String {
        email.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var isEmailValid: Bool {
        trimmedEmail.contains("@") && trimmedEmail.contains(".")
    }

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 22) {
                    switch screenState {
                    case .form, .subscribing:
                        pitchHero
                        featureGrid
                        formCard
                    case .subscribed:
                        successHero(
                            title: "أهلاً بك في النشرة الذكية! 🎉",
                            message: "سيصلك أول إصدار قريباً مع أهم الأخبار المختارة لك بواسطة SABQ AI."
                        )
                        manageCard
                    case .alreadyMember:
                        infoHero(
                            icon: "checkmark.seal.fill",
                            tint: SabqTheme.leaf,
                            title: "أنت مشترك بالفعل 👋",
                            message: "هذا البريد مسجّل في نشرتنا الذكية. تقدر تلغي الاشتراك متى ما تبي بدون أي التزام."
                        )
                        manageCard
                    case .unsubscribing:
                        ProgressView()
                            .padding(.top, 80)
                    case .unsubscribed:
                        successHero(
                            title: "تم إلغاء الاشتراك 👋",
                            message: "نأمل عودتك قريباً. تقدر تشترك من جديد في أي وقت."
                        )
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 60)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Hero variants

    private var pitchHero: some View {
        VStack(spacing: 14) {
            // Animated envelope with subtle pulse
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd.opacity(0.08))
                    .frame(width: 110, height: 110)
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .offset(x: 38, y: -34)
                Image(systemName: "envelope.open.fill")
                    .font(SabqFonts.app(size: 52, weight: .regular))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }

            HStack(spacing: 5) {
                Image(systemName: "sparkles")
                    .font(SabqFonts.app(size: 10, weight: .heavy))
                Text("SABQ AI")
                    .font(SabqFonts.app(size: 11, weight: .heavy))
                    .tracking(0.8)
            }
            .foregroundStyle(SabqTheme.primaryEnd)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(Capsule().fill(SabqTheme.primaryEnd.opacity(0.10)))
            .overlay(Capsule().stroke(SabqTheme.primaryEnd.opacity(0.25), lineWidth: 0.5))

            Text("النشرة الذكية")
                .font(SabqFonts.headline(size: 24))
                .foregroundStyle(SabqTheme.ink)

            Text("أخبار مختارة بعناية، يصيغها الذكاء الاصطناعي لذوقك تحديداً.")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
    }

    private func successHero(title: String, message: String) -> some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(SabqTheme.leaf.opacity(0.10))
                    .frame(width: 110, height: 110)
                Image(systemName: "checkmark.circle.fill")
                    .font(SabqFonts.app(size: 56, weight: .regular))
                    .foregroundStyle(SabqTheme.leaf)
                    .scaleEffect(celebrationScale)
            }

            Text(title)
                .font(SabqFonts.app(size: 22, weight: .bold))
                .foregroundStyle(SabqTheme.ink)
                .multilineTextAlignment(.center)

            Text(message)
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                celebrationScale = 1.0
            }
            let feedback = UINotificationFeedbackGenerator()
            feedback.notificationOccurred(.success)
        }
    }

    private func infoHero(icon: String, tint: Color, title: String, message: String) -> some View {
        VStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.10))
                    .frame(width: 110, height: 110)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 50, weight: .regular))
                    .foregroundStyle(tint)
            }

            Text(title)
                .font(SabqFonts.app(size: 22, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text(message)
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 16)
    }

    // MARK: - Feature grid (the AI value proposition)

    private var featureGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            featureCard(
                icon: "brain.head.profile",
                tint: SabqTheme.primaryEnd,
                title: "اختيار ذكي",
                desc: "SABQ AI يحلل المحتوى ويختار لك الأهم"
            )
            featureCard(
                icon: "person.crop.circle.badge.checkmark",
                tint: SabqTheme.teal,
                title: "مخصصة لك",
                desc: "ملخصات تناسب اهتماماتك وتطورها مع تفاعلك"
            )
            featureCard(
                icon: "clock.badge.checkmark.fill",
                tint: SabqTheme.sky,
                title: "توقيت ذكي",
                desc: "تصل في الوقت الذي يناسب يومك"
            )
            featureCard(
                icon: "hand.thumbsup.fill",
                tint: SabqTheme.leaf,
                title: "إلغاء بنقرة",
                desc: "تحكم كامل، بدون رسائل مزعجة"
            )
        }
    }

    private func featureCard(icon: String, tint: Color, title: String, desc: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer(minLength: 0)
            }
            Text(desc)
                .font(SabqFonts.app(size: 11, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .lineSpacing(3)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(tint.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: - Form card

    private var formCard: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            VStack(alignment: .leading, spacing: 14) {
                Text("ابدأ الاشتراك")
                    .font(SabqFonts.app(size: 16, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                Text("اشتراك مجاني · بدون رسائل ترويجية · إلغاء فوري")
                    .font(SabqFonts.app(size: 12, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)

                if let errorMessage {
                    errorBanner(errorMessage)
                }

                TextField("البريد الإلكتروني", text: $email)
                    .font(SabqFonts.app(size: 15, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .fill(SabqTheme.paleFill)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                            .stroke(SabqTheme.outline, lineWidth: 0.5)
                    )

                Button {
                    Task { await subscribe() }
                } label: {
                    HStack(spacing: 8) {
                        if screenState == .subscribing {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "sparkles")
                                .font(SabqFonts.app(size: 14, weight: .heavy))
                        }
                        Text(screenState == .subscribing ? "جاري الاشتراك..." : "اشترك في النشرة")
                            .font(SabqFonts.app(size: 16, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    .opacity((isEmailValid && screenState != .subscribing) ? 1.0 : 0.55)
                }
                .buttonStyle(.plain)
                .disabled(!isEmailValid || screenState == .subscribing)

                Text("نحترم خصوصيتك. مزيد من التفاصيل في سياسة الخصوصية.")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Manage subscription card (post-subscribe / already-member)

    private var manageCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "envelope.badge.fill")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("إدارة الاشتراك")
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("البريد المشترك")
                        .font(SabqFonts.app(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                    Text(trimmedEmail)
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.6))
                )

                if let errorMessage {
                    errorBanner(errorMessage)
                }

                Button {
                    Task { await unsubscribe() }
                } label: {
                    HStack(spacing: 8) {
                        if screenState == .unsubscribing {
                            ProgressView().tint(SabqTheme.coral)
                        } else {
                            Image(systemName: "xmark.circle.fill")
                                .font(SabqFonts.app(size: 14, weight: .heavy))
                        }
                        Text("إلغاء الاشتراك")
                            .font(SabqFonts.app(size: 15, weight: .bold))
                    }
                    .foregroundStyle(SabqTheme.coral)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
                    .background(
                        RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                            .fill(SabqTheme.coral.opacity(0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                            .stroke(SabqTheme.coral.opacity(0.30), lineWidth: 0.5)
                    )
                }
                .buttonStyle(.plain)
                .disabled(screenState == .unsubscribing)

                Text("سيتم إيقاف جميع الرسائل فوراً. تقدر تشترك مرة ثانية في أي وقت.")
                    .font(SabqFonts.app(size: 11, weight: .regular))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Behaviour

    private func prefillFromUser() {
        guard let user = authStore.currentUser, let userEmail = user.email, !userEmail.isEmpty else { return }
        if email.isEmpty { email = userEmail }
        let first = user.firstName ?? ""
        if firstName.isEmpty, !first.isEmpty { firstName = first }

        // Check whether the signed-in user is already subscribed so we land
        // on the manage screen instead of the pitch.
        Task {
            let isSubscribed = await APIClient.shared.checkNewsletterStatus(email: userEmail)
            if isSubscribed {
                await MainActor.run {
                    withAnimation { screenState = .alreadyMember }
                }
            }
        }
    }

    private func subscribe() async {
        errorMessage = nil
        screenState = .subscribing
        do {
            try await APIClient.shared.subscribeNewsletter(
                email: trimmedEmail,
                firstName: firstName.isEmpty ? nil : firstName
            )
            await MainActor.run {
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    screenState = .subscribed
                }
            }
        } catch APIClient.NewsletterError.alreadySubscribed {
            await MainActor.run {
                withAnimation { screenState = .alreadyMember }
            }
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
            screenState = .form
        } catch {
            errorMessage = error.localizedDescription
            screenState = .form
        }
    }

    private func unsubscribe() async {
        errorMessage = nil
        screenState = .unsubscribing
        do {
            try await APIClient.shared.unsubscribeNewsletter(email: trimmedEmail)
            await MainActor.run {
                celebrationScale = 0
                withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) {
                    screenState = .unsubscribed
                }
            }
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
            screenState = .alreadyMember
        } catch {
            errorMessage = error.localizedDescription
            screenState = .alreadyMember
        }
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(SabqFonts.app(size: 14))
            Text(text)
                .font(SabqFonts.app(size: 13, weight: .medium))
        }
        .foregroundStyle(SabqTheme.coral)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(SabqTheme.coral.opacity(0.08))
        )
    }
}
