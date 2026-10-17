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
                VStack(spacing: SabqLayout.space24) {
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
                            tint: SabqTheme.success,
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
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.top, SabqLayout.space24)
                .padding(.bottom, SabqLayout.space40)
            }
            .sabqNavigationEdge()
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Label("إغلاق", systemImage: "xmark")
                            .labelStyle(.iconOnly)
                    }
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Hero variants

    private var pitchHero: some View {
        VStack(spacing: SabqLayout.space12) {
            // Animated envelope with subtle pulse
            ZStack {
                Circle()
                    .fill(SabqTheme.surfaceMuted)
                    .frame(width: 110, height: 110)
                Image(systemName: "sparkles")
                    .sabqText(SabqType.button)
                    .foregroundStyle(SabqTheme.primary)
                    .offset(x: 38, y: -34)
                Image(systemName: "envelope.open.fill")
                    .font(SabqFonts.app(size: 52, weight: .regular))
                    .foregroundStyle(SabqTheme.primary)
            }

            HStack(spacing: SabqLayout.space4) {
                Image(systemName: "sparkles")
                    .sabqText(SabqType.tag)
                Text("SABQ AI")
                    .sabqText(SabqType.tag)
                    .tracking(0.8)
            }
            .foregroundStyle(SabqTheme.primary)
            .padding(.horizontal, SabqLayout.space8)
            .padding(.vertical, SabqLayout.space4)
            .background(Capsule().fill(SabqTheme.surfaceMuted))

            Text("النشرة الذكية")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text("أخبار مختارة بعناية، يصيغها الذكاء الاصطناعي لذوقك تحديداً.")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, SabqLayout.space12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space16)
    }

    private func successHero(title: String, message: String) -> some View {
        VStack(spacing: SabqLayout.space12) {
            ZStack {
                Circle()
                    .fill(SabqTheme.surfaceMuted)
                    .frame(width: 110, height: 110)
                Image(systemName: "checkmark.circle.fill")
                    .font(SabqFonts.app(size: 56, weight: .regular))
                    .foregroundStyle(SabqTheme.success)
                    .scaleEffect(celebrationScale)
            }

            Text(title)
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.center)

            Text(message)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, SabqLayout.space12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space16)
        .onAppear {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.7)) {
                celebrationScale = 1.0
            }
            let feedback = UINotificationFeedbackGenerator()
            feedback.notificationOccurred(.success)
        }
    }

    private func infoHero(icon: String, tint: Color, title: String, message: String) -> some View {
        VStack(spacing: SabqLayout.space12) {
            ZStack {
                Circle()
                    .fill(SabqTheme.surfaceMuted)
                    .frame(width: 110, height: 110)
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 50, weight: .regular))
                    .foregroundStyle(tint)
            }

            Text(title)
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text(message)
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, SabqLayout.space12)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, SabqLayout.space16)
    }

    // MARK: - Feature grid (the AI value proposition)

    private var featureGrid: some View {
        LazyVGrid(columns: SabqGrid.adaptive(spacing: SabqLayout.space12), spacing: SabqLayout.space12) {
            featureCard(
                icon: "brain.head.profile",
                tint: SabqTheme.primary,
                title: "اختيار ذكي",
                desc: "SABQ AI يحلل المحتوى ويختار لك الأهم"
            )
            featureCard(
                icon: "person.crop.circle.badge.checkmark",
                tint: SabqTheme.primary,
                title: "مخصصة لك",
                desc: "ملخصات تناسب اهتماماتك وتطورها مع تفاعلك"
            )
            featureCard(
                icon: "clock.badge.checkmark.fill",
                tint: SabqTheme.primary,
                title: "توقيت ذكي",
                desc: "تصل في الوقت الذي يناسب يومك"
            )
            featureCard(
                icon: "hand.thumbsup.fill",
                tint: SabqTheme.primary,
                title: "إلغاء بنقرة",
                desc: "تحكم كامل، بدون رسائل مزعجة"
            )
        }
    }

    private func featureCard(icon: String, tint: Color, title: String, desc: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: icon)
                    .sabqText(SabqType.button)
                    .foregroundStyle(tint)
                Text(title)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.textPrimary)
                Spacer(minLength: 0)
            }
            Text(desc)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(SabqLayout.space12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    // MARK: - Form card

    private var formCard: some View {
        SurfaceCard(accent: SabqTheme.primary) {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                Text("ابدأ الاشتراك")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)

                Text("اشتراك مجاني · بدون رسائل ترويجية · إلغاء فوري")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)

                if let errorMessage {
                    errorBanner(errorMessage)
                }

                TextField("البريد الإلكتروني", text: $email)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textPrimary)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .modifier(SabqInputSurface())

                Button {
                    Task { await subscribe() }
                } label: {
                    HStack(spacing: SabqLayout.space8) {
                        if screenState == .subscribing {
                            ProgressView().tint(SabqTheme.onAction)
                        } else {
                            Image(systemName: "sparkles")
                                .font(SabqFonts.app(size: 14, weight: .heavy))
                        }
                        Text(screenState == .subscribing ? "جاري الاشتراك..." : "اشترك في النشرة")
                            .sabqText(SabqType.button)
                    }
                    .foregroundStyle(isEmailValid ? SabqTheme.onAction : SabqTheme.disabledInk)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .background(isEmailValid ? SabqTheme.actionFill : SabqTheme.disabledFill,
                                in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(!isEmailValid || screenState == .subscribing)

                Text("نحترم خصوصيتك. مزيد من التفاصيل في سياسة الخصوصية.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: - Manage subscription card (post-subscribe / already-member)

    private var manageCard: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: SabqLayout.space12) {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "envelope.badge.fill")
                        .sabqText(SabqType.button)
                        .foregroundStyle(SabqTheme.primary)
                    Text("إدارة الاشتراك")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }

                VStack(alignment: .leading, spacing: SabqLayout.space8) {
                    Text("البريد المشترك")
                        .sabqText(SabqType.meta)
                        .foregroundStyle(SabqTheme.textSecondary)
                    Text(trimmedEmail)
                        .sabqText(SabqType.metaEmphasis)
                        .foregroundStyle(SabqTheme.textPrimary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .padding(SabqLayout.space12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surface)
                )

                if let errorMessage {
                    errorBanner(errorMessage)
                }

                Button {
                    Task { await unsubscribe() }
                } label: {
                    HStack(spacing: SabqLayout.space8) {
                        if screenState == .unsubscribing {
                            ProgressView().tint(SabqTheme.danger)
                        } else {
                            Image(systemName: "xmark.circle.fill")
                                .font(SabqFonts.app(size: 14, weight: .heavy))
                        }
                        Text("إلغاء الاشتراك")
                            .sabqText(SabqType.rowTitle)
                    }
                    .foregroundStyle(SabqTheme.danger)
                    .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .fill(SabqTheme.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                            .stroke(SabqTheme.outline, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(screenState == .unsubscribing)

                Text("سيتم إيقاف جميع الرسائل فوراً. تقدر تشترك مرة ثانية في أي وقت.")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
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
        HStack(spacing: SabqLayout.space8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .sabqText(SabqType.excerpt)
            Text(text)
                .sabqText(SabqType.meta)
        }
        .foregroundStyle(SabqTheme.danger)
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }
}
