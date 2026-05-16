import SwiftUI
import PhotosUI

import UIKit

struct SettingsView: View {
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(AuthStore.self) private var authStore
    @AppStorage("isDarkMode") private var darkModeEnabled = false
    @AppStorage("articleFontSize") private var textSize: Double = 17
    @AppStorage("appAccent") private var accentRaw: String = AppAccent.blue.rawValue
    @State private var showLogin = false
    @State private var showRoleDebug = false
    @State private var roleDebugMessage = ""
    @State private var showContact = false
    @State private var showNewsletter = false
    @State private var showEditProfile = false
    @State private var showChangePassword = false
    @State private var showDeleteAccount = false
    @State private var showForgotPassword = false

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 20) {
                CompactScreenHeader(
                    title: "المزيد",
                    subtitle: "إعدادات التطبيق وعن سبق"
                )

                profileSection
                displaySection
                subscriptionSection
                aboutSection
                appInfoSection
            }
            .padding(.horizontal, 16)
            .padding(.top, 18)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(SabqTheme.background)
        .sabqRTL()
        .sheet(isPresented: $showLogin) {
            LoginSheet()
        }
        .alert("بيانات الدور المستلمة", isPresented: $showRoleDebug) {
            Button("نسخ") {
                UIPasteboard.general.string = roleDebugMessage
            }
            Button("إغلاق", role: .cancel) { }
        } message: {
            Text(roleDebugMessage)
        }
        .sheet(isPresented: $showContact) {
            ContactSheet()
        }
        .sheet(isPresented: $showNewsletter) {
            NewsletterSheet()
        }
        .sheet(isPresented: $showEditProfile) {
            EditProfileSheet()
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordSheet()
        }
        .sheet(isPresented: $showDeleteAccount) {
            DeleteAccountSheet()
        }
        .sheet(isPresented: $showForgotPassword) {
            ForgotPasswordSheet()
        }
    }

    // MARK: - Profile / Auth

    private var profileSection: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            if authStore.isLoggedIn, let user = authStore.currentUser {
                VStack(spacing: 16) {
                    HStack(spacing: 14) {
                        profileAvatar(user: user, size: 64)

                        VStack(alignment: .leading, spacing: 5) {
                            HStack(spacing: 6) {
                                Text(user.displayName)
                                    .font(.system(size: 17, weight: .bold))
                                    .foregroundStyle(SabqTheme.ink)

                                if user.isVerified {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.system(size: 14))
                                        .foregroundStyle(SabqTheme.primaryEnd)
                                }
                            }

                            HStack(spacing: 6) {
                                Image(systemName: roleIcon(for: user.primaryRoleKey))
                                    .font(.system(size: 11))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                                Text(user.localizedRole)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(SabqTheme.primaryEnd)
                            }
                            // Long-press the role label to surface the raw
                            // role-payload the backend sent. Temporary
                            // diagnostic for the "قارئ" mismatch report.
                            .contentShape(Rectangle())
                            .onLongPressGesture(minimumDuration: 0.6) {
                                roleDebugMessage = user.roleDebugSummary
                                showRoleDebug = true
                            }

                            if let email = user.email, !email.isEmpty {
                                Text(email)
                                    .font(.system(size: 12, weight: .regular))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let jobTitle = user.jobTitle, !jobTitle.isEmpty, jobTitle != user.localizedRole {
                        HStack(spacing: 8) {
                            Image(systemName: "briefcase.fill")
                                .font(.system(size: 12))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                            Text(jobTitle)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(SabqTheme.secondaryInk)
                            if let dept = user.department, !dept.isEmpty {
                                Text("·")
                                    .foregroundStyle(SabqTheme.tertiaryInk)
                                Text(dept)
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let bio = user.bio, !bio.isEmpty {
                        Text(bio)
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineSpacing(4)
                            .lineLimit(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if user.emailVerified == false {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 13))
                            Text("لم يتم تأكيد البريد الإلكتروني بعد")
                                .font(.system(size: 13, weight: .medium))
                        }
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .fill(Color.orange.opacity(0.08))
                        )
                    }

                    HStack(spacing: 10) {
                        Button { showEditProfile = true } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "pencil")
                                    .font(.system(size: 13, weight: .semibold))
                                Text("تعديل الملف الشخصي")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(SabqTheme.primaryEnd)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(
                                Capsule().fill(SabqTheme.primaryEnd.opacity(0.1))
                            )
                        }
                        .buttonStyle(.plain)

                        Spacer()

                        Button {
                            Task { await authStore.logout() }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                    .font(.system(size: 13, weight: .semibold))
                                Text("خروج")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(SabqTheme.coral)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .background(
                                Capsule().fill(SabqTheme.coral.opacity(0.1))
                            )
                        }
                        .buttonStyle(.plain)
                    }

                    accountActionsSection
                }
            } else {
                HStack(spacing: 14) {
                    Circle()
                        .fill(SabqTheme.primaryEnd.opacity(0.1))
                        .frame(width: 56, height: 56)
                        .overlay {
                            Image(systemName: "person.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(SabqTheme.primaryEnd)
                        }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("تسجيل الدخول")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(SabqTheme.ink)
                        Text("سجّل دخولك لتجربة شخصية أفضل")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onTapGesture { showLogin = true }

                Button { showLogin = true } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 16))
                        Text("تسجيل الدخول")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private func profileAvatar(user: APIUser, size: CGFloat) -> some View {
        if let avatarURL = user.avatar, let url = URL(string: avatarURL) {
            CachedAsyncImage(url: url, contentMode: .fill) {
                profileInitial(user: user, size: size)
            }
            .frame(width: size, height: size)
            .clipShape(Circle())
        } else {
            profileInitial(user: user, size: size)
        }
    }

    private func profileInitial(user: APIUser, size: CGFloat) -> some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.15))
            .frame(width: size, height: size)
            .overlay {
                Text(String(user.displayName.prefix(1)))
                    .font(.system(size: size * 0.38, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    @ViewBuilder
    private var accountActionsSection: some View {
        VStack(spacing: 0) {
            Divider()
                .padding(.vertical, 4)

            Button { showChangePassword = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "lock.rotation")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .frame(width: 20)
                    Text("تغيير كلمة المرور")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer()
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)

            Button { showDeleteAccount = true } label: {
                HStack(spacing: 10) {
                    Image(systemName: "trash")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.coral)
                        .frame(width: 20)
                    Text("حذف الحساب")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.coral)
                    Spacer()
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
        }
    }

    private func roleIcon(for role: String?) -> String {
        switch role {
        case "admin": return "shield.fill"
        case "system_admin": return "shield.lefthalf.filled"
        case "editor", "editor-in-chief", "editor_in_chief", "senior-editor", "senior_editor", "managing_editor", "managing-editor", "editorial_manager", "editorial-manager": return "pencil.circle.fill"
        case "journalist", "reporter", "correspondent", "writer", "author", "article_writer", "article-writer", "article_author", "article-author", "opinion_author", "opinion-author": return "newspaper.fill"
        case "columnist": return "text.quote"
        case "photographer": return "camera.fill"
        case "moderator", "comments_moderator", "comments-moderator": return "flag.fill"
        case "publisher": return "megaphone.fill"
        case "contributor": return "person.text.rectangle"
        default: return "person.fill"
        }
    }

    // MARK: - Display

    private var displaySection: some View {
        SurfaceCard {
            SectionHeader(
                title: "العرض",
                subtitle: "تخصيص مظهر التطبيق",
                icon: "paintbrush.fill",
                tint: SabqTheme.primaryEnd
            )

            settingsToggle(
                title: "الوضع الداكن",
                subtitle: "تفعيل المظهر الداكن",
                icon: "moon.fill",
                tint: SabqTheme.primaryEnd,
                isOn: $darkModeEnabled
            )

            VStack(alignment: .leading, spacing: 12) {
                Text("لون التطبيق")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                HStack(spacing: 0) {
                    ForEach(AppAccent.allCases) { accent in
                        let isSelected = accentRaw == accent.rawValue
                        Button {
                            withAnimation(.spring(response: 0.3)) {
                                accentRaw = accent.rawValue
                            }
                        } label: {
                            VStack(spacing: 8) {
                                Circle()
                                    .fill(accent.color)
                                    .frame(width: 40, height: 40)
                                    .overlay(
                                        Circle()
                                            .stroke(Color.white, lineWidth: isSelected ? 3 : 0)
                                    )
                                    .overlay(
                                        Circle()
                                            .stroke(isSelected ? accent.color : Color.clear, lineWidth: isSelected ? 2 : 0)
                                            .padding(-3)
                                    )
                                    .shadow(color: accent.color.opacity(isSelected ? 0.4 : 0.15), radius: isSelected ? 6 : 3, y: 2)

                                Text(accent.title)
                                    .font(.system(size: 11, weight: isSelected ? .bold : .medium))
                                    .foregroundStyle(isSelected ? accent.color : SabqTheme.tertiaryInk)
                            }
                        }
                        .buttonStyle(.plain)
                        .frame(maxWidth: .infinity)
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("حجم الخط")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(SabqTheme.ink)

                        Text("حجم النص: \(Int(textSize))")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                    }

                    Spacer(minLength: 0)

                    SmallSquareBadge(systemImage: "textformat.size", tint: SabqTheme.primaryEnd)
                }

                HStack(spacing: 12) {
                    Text("أ")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(SabqTheme.tertiaryInk)

                    Slider(value: $textSize, in: 14...24, step: 1)
                        .tint(SabqTheme.primaryEnd)

                    Text("أ")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }

                Text("معاينة حجم الخط في المقالات")
                    .font(.system(size: CGFloat(textSize), weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineSpacing(5)
                    .padding(.top, 4)
            }
        }
    }

    // MARK: - Subscription

    private var subscriptionSection: some View {
        SurfaceCard(accent: SabqTheme.teal) {
            SectionHeader(
                title: "اشتراكات",
                subtitle: "ابقَ على اطلاع دائم",
                icon: "envelope.fill",
                tint: SabqTheme.teal
            )

            Button { showNewsletter = true } label: {
                settingsRow(
                    title: "النشرة البريدية",
                    subtitle: "اشترك في ملخص الأخبار اليومي",
                    icon: "envelope.open.fill",
                    tint: SabqTheme.teal
                )
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - About

    private var aboutSection: some View {
        SurfaceCard(accent: SabqTheme.primaryEnd) {
            SectionHeader(
                title: "عن سبق",
                subtitle: "صحيفة إلكترونية سعودية",
                icon: "info.circle.fill",
                tint: SabqTheme.primaryEnd
            )

            Text("سبق هي صحيفة إلكترونية سعودية تهدف إلى تقديم أحدث الأخبار والمعلومات الموثوقة باللغة العربية.")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.leading)
                .lineSpacing(5)

            settingsRow(
                title: "الموقع الإلكتروني",
                subtitle: "sabq.org",
                icon: "globe",
                tint: SabqTheme.primaryEnd
            )

            Button { showContact = true } label: {
                settingsRow(
                    title: "تواصل معنا",
                    subtitle: "أرسل رسالة أو استفسار",
                    icon: "envelope.fill",
                    tint: SabqTheme.teal
                )
            }
            .buttonStyle(.plain)

            NavigationLink(destination: PrivacyPolicyView()) {
                settingsRow(
                    title: "سياسة الخصوصية",
                    subtitle: "كيف نحمي بياناتك",
                    icon: "shield.lefthalf.filled",
                    tint: SabqTheme.leaf
                )
            }
            .buttonStyle(.plain)

            NavigationLink(destination: TermsOfUseView()) {
                settingsRow(
                    title: "الشروط والأحكام",
                    subtitle: "شروط استخدام التطبيق",
                    icon: "doc.text.fill",
                    tint: SabqTheme.sky
                )
            }
            .buttonStyle(.plain)

            settingsRow(
                title: "تويتر",
                subtitle: "@sababoroad",
                icon: "at",
                tint: SabqTheme.sky
            )
        }
    }

    // MARK: - App Info

    private var appInfoSection: some View {
        VStack(spacing: 16) {
            Image("SabqLogo")
                .renderingMode(.original)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 56)

            Text("الإصدار 1.0.0")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)

            Text("صنع بكل حب في السعودية 🇸🇦")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 10)
        .padding(.bottom, 20)
    }

    // MARK: - Helpers

    private func settingsToggle(title: String, subtitle: String, icon: String, tint: Color, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Toggle("", isOn: isOn)
                .tint(SabqTheme.primaryEnd)
                .labelsHidden()
        }
    }

    private func settingsRow(title: String, subtitle: String, icon: String, tint: Color) -> some View {
        HStack(spacing: 12) {
            SmallSquareBadge(systemImage: icon, tint: tint)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)

                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Image(systemName: "chevron.left")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Login Sheet

struct LoginSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    /// Legacy register form is gone — kept the flag only to honour the
    /// `LoginSheet(initialMode: true)` callers (DailyBriefView CTAs). When
    /// true on appear we immediately swap to the conversational signup.
    @State private var isRegisterMode: Bool
    @State private var showForgotPassword = false
    @State private var showAISignUp = false

    init(initialMode: Bool = false) {
        _isRegisterMode = State(initialValue: initialMode)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if authStore.registrationPending {
                        registrationSuccessView
                    } else {
                        loginFormView
                    }
                }
                .padding(24)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        authStore.clearMessages()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordSheet()
            }
            .sheet(isPresented: $showAISignUp, onDismiss: {
                // Conversational signup auto-logs the user in. If it
                // succeeded, close this login sheet too so the user lands
                // back on the dashboard logged in.
                if authStore.isLoggedIn {
                    dismiss()
                }
            }) {
                SignUpFlowView()
                    .environment(authStore)
            }
            .onAppear {
                // Callers that wanted the register form (initialMode=true)
                // now skip straight to the conversational signup sheet.
                if isRegisterMode {
                    isRegisterMode = false
                    showAISignUp = true
                }
            }
        }
    }

    private var registrationSuccessView: some View {
        VStack(spacing: 20) {
            Spacer().frame(height: 40)

            Image(systemName: "envelope.badge.shield.half.filled")
                .font(.system(size: 60, weight: .light))
                .foregroundStyle(SabqTheme.leaf)

            Text("تم إنشاء الحساب")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.ink)

            Text(authStore.successMessage ?? "يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب")
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(5)

            Button {
                authStore.clearMessages()
                isRegisterMode = false
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 16))
                    Text("تسجيل الدخول")
                        .font(.system(size: 16, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
    }

    private var loginFormView: some View {
        VStack(alignment: .leading, spacing: 24) {
            VStack(spacing: 12) {
                Image("SabqLogo")
                    .renderingMode(.original)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(height: 48)

                Text("تسجيل الدخول")
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .foregroundStyle(SabqTheme.ink)

                Text("سجّل دخولك للاستفادة من جميع الميزات")
                    .font(.system(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 16) {
                inputField(icon: "envelope", placeholder: "البريد الإلكتروني", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)

                inputField(icon: "lock", placeholder: "كلمة المرور", text: $password, isSecure: true)
                    .textContentType(.password)
            }

            if let error = authStore.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 14))
                    Text(error)
                        .font(.system(size: 13, weight: .medium))
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

            Button {
                Task {
                    await authStore.login(email: email, password: password)
                    if authStore.isLoggedIn { dismiss() }
                }
            } label: {
                HStack(spacing: 10) {
                    if authStore.isLoading {
                        ProgressView().tint(.white)
                    }
                    Text("تسجيل الدخول")
                        .font(.system(size: 17, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(authStore.isLoading)

            Button {
                authStore.clearMessages()
                showAISignUp = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12, weight: .heavy))
                    Text("ليس لديك حساب؟ ابدأ التسجيل مع SABQ AI")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            Button { showForgotPassword = true } label: {
                Text("نسيت كلمة المرور؟")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
    }

    private func inputField(icon: String, placeholder: String, text: Binding<String>, isSecure: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.6))
                .frame(width: 20)

            if isSecure {
                SecureField(placeholder, text: text)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
            } else {
                TextField(placeholder, text: text)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
            }
        }
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
    }
}

// MARK: - Contact Sheet

/// Contact form that mirrors sabq.org/contact end-to-end:
/// - Two contact-method cards at the top (WhatsApp + Email) for users who
///   prefer those channels over the form.
/// - 5-field form (name/phone/email/subject/message) submitted to
///   `POST /api/contact` (NOT under /api/v1), with messages landing in the
///   dashboard's "رسائل التواصل" inbox.
/// - `@FocusState` + `ScrollViewReader` ensures the focused field is always
///   above the keyboard, with `scrollDismissesKeyboard(.interactively)` so
///   the user can swipe to hide it.
/// - Submit errors auto-dismiss the keyboard and scroll the banner into view.
struct ContactSheet: View {
    /// Logical IDs for each scroll anchor — the focus listener uses these to
    /// scroll the active field above the keyboard.
    private enum Field: Hashable {
        case name, phone, email, subject, message, errorBanner
    }

    @Environment(\.dismiss) private var dismiss
    @Environment(AuthStore.self) private var authStore

    @State private var name = ""
    @State private var phone = "+966"
    @State private var email = ""
    @State private var subject: String = ""
    @State private var message = ""
    @State private var isSending = false
    @State private var isSent = false
    @State private var errorMessage: String?

    /// Tracks which form field has focus. We watch this and use a
    /// ScrollViewReader to bring the active field above the keyboard.
    @FocusState private var focusedField: Field?

    /// Canonical subjects — MUST match the backend Zod enum exactly, otherwise
    /// the POST returns 400 "بيانات غير صالحة". See `server/routes.ts` contact
    /// schema at the /api/contact handler.
    private static let subjectOptions = [
        "استفسار عام",
        "شراكات إعلامية",
        "شكوى",
        "اقتراح",
        "أخرى"
    ]

    /// Canonical contact methods — mirrors the two cards at the top of
    /// sabq.org/contact.
    private let whatsAppNumber = "+966 500 226 622"
    private let whatsAppURL = URL(string: "https://wa.me/966500226622")!
    private let supportEmail = "info@sabq.org"
    private var emailURL: URL { URL(string: "mailto:\(supportEmail)")! }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedMessage: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedPhone: String { phone.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Local mirror of the backend Zod constraints so we surface validation
    /// errors immediately instead of waiting on a round trip.
    private var isFormValid: Bool {
        guard trimmedName.count >= 2 else { return false }
        guard trimmedPhone.range(of: #"^\+966[0-9]{9}$"#, options: .regularExpression) != nil else { return false }
        guard trimmedEmail.contains("@"), trimmedEmail.contains(".") else { return false }
        guard Self.subjectOptions.contains(subject) else { return false }
        guard trimmedMessage.count >= 10 else { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    // Outer column: page header → contact-method cards →
                    // (visual gap) → form card. The form lives inside its
                    // own SurfaceCard with a separate SectionHeader so it
                    // reads as a distinct "send a message" surface, clearly
                    // separated from the quick-channel cards above.
                    VStack(alignment: .leading, spacing: 24) {
                        SectionHeader(
                            title: "تواصل معنا",
                            subtitle: "اختر طريقة التواصل الأنسب لك",
                            icon: "envelope.fill",
                            tint: SabqTheme.teal
                        )

                        // Two contact-method cards at the top — matches the
                        // web /contact page. Tapping opens WhatsApp / Mail.
                        contactMethodCards

                        // Extra breathing room above the form so the cards
                        // feel like their own row, not a header for the form.
                        Color.clear.frame(height: 8)

                        if isSent {
                            SurfaceCard(accent: SabqTheme.leaf) {
                                EmptyStateView(
                                    icon: "checkmark.circle.fill",
                                    tint: SabqTheme.leaf,
                                    title: "تم استلام رسالتك",
                                    subtitle: "شكراً لتواصلك معنا، سيتم الرد عليك قريباً"
                                )
                            }
                        } else {
                            SurfaceCard(accent: SabqTheme.primaryEnd) {
                                VStack(alignment: .leading, spacing: 16) {
                                    SectionHeader(
                                        title: "أرسل رسالة",
                                        subtitle: "املأ النموذج وسنرد عليك في أقرب وقت",
                                        icon: "square.and.pencil",
                                        tint: SabqTheme.primaryEnd
                                    )

                                    if let errorMessage {
                                        errorBanner(errorMessage)
                                            .id(Field.errorBanner)
                                    }

                                    labeledField(
                                        label: "الاسم الكامل",
                                        placeholder: "أدخل اسمك الكامل",
                                        text: $name,
                                        field: .name
                                    )
                                    .id(Field.name)

                                    labeledField(
                                        label: "رقم الهاتف",
                                        placeholder: "+966500000000",
                                        text: $phone,
                                        keyboard: .phonePad,
                                        disableAutocap: true,
                                        field: .phone
                                    )
                                    .id(Field.phone)

                                    labeledField(
                                        label: "البريد الإلكتروني",
                                        placeholder: "example@email.com",
                                        text: $email,
                                        keyboard: .emailAddress,
                                        disableAutocap: true,
                                        field: .email
                                    )
                                    .id(Field.email)

                                    subjectPicker
                                        .id(Field.subject)

                                    messageEditor
                                        .id(Field.message)

                                    sendButton
                                        .padding(.top, 4)
                                }
                            }

                            // Trailing spacer so the message editor's bottom
                            // edge can clear the keyboard when focused near
                            // the bottom of the sheet.
                            Color.clear.frame(height: 80)
                        }
                    }
                    .padding(20)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: focusedField) { _, newField in
                    guard let newField else { return }
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                        proxy.scrollTo(newField, anchor: .center)
                    }
                }
                .onChange(of: errorMessage) { _, newError in
                    guard newError != nil else { return }
                    focusedField = nil // dismiss keyboard so banner is visible
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                            proxy.scrollTo(Field.errorBanner, anchor: .top)
                        }
                    }
                }
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("تم") { focusedField = nil }
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
            .onAppear { prefillFromUser() }
        }
    }

    // MARK: - Contact-method cards (WhatsApp + Email — matches the web)

    private var contactMethodCards: some View {
        HStack(spacing: 12) {
            Link(destination: whatsAppURL) {
                contactMethodCard(
                    icon: "message.fill",
                    title: "واتساب",
                    value: whatsAppNumber,
                    tint: Color(red: 0.16, green: 0.74, blue: 0.42)
                )
            }
            .buttonStyle(.plain)

            Link(destination: emailURL) {
                contactMethodCard(
                    icon: "envelope.fill",
                    title: "البريد الإلكتروني",
                    value: supportEmail,
                    tint: SabqTheme.primaryEnd
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func contactMethodCard(icon: String, title: String, value: String, tint: Color) -> some View {
        VStack(spacing: 10) {
            Circle()
                .fill(tint)
                .frame(width: 44, height: 44)
                .overlay {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.white)
                }

            Text(title)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text(value)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(tint)
                .environment(\.layoutDirection, .leftToRight)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(tint.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(tint.opacity(0.20), lineWidth: 0.5)
        )
    }

    // MARK: - Field helpers

    private func labeledField(
        label: String,
        placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        disableAutocap: Bool = false,
        field: Field
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextField(placeholder, text: text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .keyboardType(keyboard)
                .textInputAutocapitalization(disableAutocap ? .never : .sentences)
                .autocorrectionDisabled(disableAutocap)
                .focused($focusedField, equals: field)
                .submitLabel(.next)
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(
                            focusedField == field ? SabqTheme.primaryEnd.opacity(0.4) : SabqTheme.outline,
                            lineWidth: focusedField == field ? 1 : 0.5
                        )
                )
        }
    }

    private var subjectPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("موضوع الرسالة")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            Menu {
                ForEach(Self.subjectOptions, id: \.self) { option in
                    Button(option) { subject = option }
                }
            } label: {
                HStack(spacing: 10) {
                    Text(subject.isEmpty ? "اختر موضوع الرسالة" : subject)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(subject.isEmpty ? SabqTheme.tertiaryInk : SabqTheme.ink)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
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
            }
            .buttonStyle(.plain)
        }
    }

    private var messageEditor: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الرسالة")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextEditor(text: $message)
                .font(.system(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.ink)
                .focused($focusedField, equals: .message)
                .frame(minHeight: 140)
                .scrollContentBackground(.hidden)
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .fill(SabqTheme.paleFill)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                        .stroke(
                            focusedField == .message ? SabqTheme.primaryEnd.opacity(0.4) : SabqTheme.outline,
                            lineWidth: focusedField == .message ? 1 : 0.5
                        )
                )
                .overlay(alignment: .topLeading) {
                    if message.isEmpty {
                        Text("اكتب رسالتك هنا...")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 20)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    private var sendButton: some View {
        Button {
            Task { await send() }
        } label: {
            HStack(spacing: 8) {
                if isSending { ProgressView().tint(.white) }
                Text("إرسال الرسالة")
                    .font(.system(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
            .opacity(isFormValid ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!isFormValid || isSending)
    }

    // MARK: - Behaviour

    private func prefillFromUser() {
        guard let user = authStore.currentUser else { return }
        if name.isEmpty {
            let combined = [user.firstName, user.lastName]
                .compactMap { $0 }
                .filter { !$0.isEmpty }
                .joined(separator: " ")
            name = combined
        }
        if email.isEmpty, let userEmail = user.email, !userEmail.isEmpty {
            email = userEmail
        }
        if phone == "+966", let userPhone = user.phoneNumber, userPhone.hasPrefix("+966") {
            phone = userPhone
        }
    }

    private func send() async {
        isSending = true
        errorMessage = nil
        do {
            try await APIClient.shared.sendContactMessage(
                name: trimmedName,
                phone: trimmedPhone,
                email: trimmedEmail,
                subject: subject,
                message: trimmedMessage
            )
            isSent = true
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSending = false
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14))
            Text(text)
                .font(.system(size: 13, weight: .medium))
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

// MARK: - Newsletter Sheet

struct NewsletterSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var isSubscribing = false
    @State private var isSubscribed = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                Image(systemName: "envelope.open.fill")
                    .font(.system(size: 60, weight: .light))
                    .foregroundStyle(SabqTheme.primaryEnd)

                if isSubscribed {
                    VStack(spacing: 12) {
                        Text("تم الاشتراك!")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.ink)
                        Text("ستصلك أهم الأخبار في بريدك الإلكتروني يومياً")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .multilineTextAlignment(.center)
                    }
                } else {
                    VStack(spacing: 12) {
                        Text("النشرة البريدية")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.ink)
                        Text("اشترك لتصلك أهم الأخبار يومياً في بريدك الإلكتروني")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .multilineTextAlignment(.center)
                    }

                    TextField("البريد الإلكتروني", text: $email)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundStyle(SabqTheme.ink)
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
                        .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding(.horizontal, 24)

                    if let errorMessage {
                        errorBanner(errorMessage)
                            .padding(.horizontal, 24)
                    }

                    Button {
                        Task { await subscribe() }
                    } label: {
                        HStack(spacing: 8) {
                            if isSubscribing { ProgressView().tint(.white) }
                            Text("اشتراك")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(email.isEmpty || isSubscribing)
                    .padding(.horizontal, 24)
                }

                Spacer()
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
        }
    }

    private func subscribe() async {
        isSubscribing = true
        errorMessage = nil
        do {
            try await APIClient.shared.subscribeNewsletter(email: email)
            isSubscribed = true
        } catch let apiError as APIError {
            errorMessage = apiError.errorDescription ?? apiError.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }
        isSubscribing = false
    }

    private func errorBanner(_ text: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 14))
            Text(text)
                .font(.system(size: 13, weight: .medium))
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

// MARK: - Edit Profile Sheet

struct EditProfileSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var bio = ""
    @State private var city = ""
    @State private var gender = ""
    @State private var saved = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var showUploadNotice = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    avatarSection

                    if saved {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 16))
                            Text("تم حفظ التغييرات بنجاح")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.leaf)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.leaf.opacity(0.08))
                        )
                    }

                    VStack(spacing: 16) {
                        editField(label: "الاسم الأول", placeholder: "أدخل الاسم الأول", text: $firstName)
                        editField(label: "اسم العائلة", placeholder: "أدخل اسم العائلة", text: $lastName)
                        editField(label: "المدينة", placeholder: "أدخل مدينتك", text: $city)
                        genderPicker

                        if let email = authStore.currentUser?.email, !email.isEmpty {
                            readOnlyField(label: "البريد الإلكتروني", value: email, icon: "envelope.fill")
                        }
                        if let phone = authStore.currentUser?.phoneNumber, !phone.isEmpty {
                            readOnlyField(label: "رقم الجوال", value: phone, icon: "phone.fill")
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("نبذة عنك")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            TextEditor(text: $bio)
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(SabqTheme.ink)
                                .frame(minHeight: 80)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.outline, lineWidth: 0.5)
                                )
                                .overlay(alignment: .topLeading) {
                                    if bio.isEmpty {
                                        Text("اكتب نبذة مختصرة عنك...")
                                            .font(.system(size: 15, weight: .regular))
                                            .foregroundStyle(SabqTheme.tertiaryInk)
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 20)
                                            .allowsHitTesting(false)
                                    }
                                }
                        }
                    }

                    if let error = authStore.errorMessage {
                        HStack(spacing: 8) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .font(.system(size: 14))
                            Text(error)
                                .font(.system(size: 13, weight: .medium))
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

                    Button {
                        Task {
                            await authStore.updateProfile(
                                firstName: firstName,
                                lastName: lastName,
                                bio: bio.isEmpty ? nil : bio,
                                city: city.isEmpty ? nil : city,
                                gender: gender.isEmpty ? nil : gender
                            )
                            if authStore.errorMessage == nil {
                                withAnimation { saved = true }
                                try? await Task.sleep(for: .seconds(1.5))
                                dismiss()
                            }
                        }
                    } label: {
                        HStack(spacing: 10) {
                            if authStore.isLoading {
                                ProgressView().tint(.white)
                            }
                            Text("حفظ التغييرات")
                                .font(.system(size: 16, weight: .bold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .disabled(firstName.isEmpty || authStore.isLoading)
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onAppear {
                if let user = authStore.currentUser {
                    firstName = user.firstName ?? ""
                    lastName = user.lastName ?? ""
                    bio = user.bio ?? ""
                    city = user.city ?? ""
                    let normalizedGender = (user.gender ?? "").lowercased()
                    gender = (normalizedGender == "male" || normalizedGender == "female") ? normalizedGender : ""
                }
            }
        }
    }

    private var avatarSection: some View {
        VStack(spacing: 16) {
            ZStack(alignment: .bottomTrailing) {
                if let selectedImage {
                    Image(uiImage: selectedImage)
                        .resizable()
                        .scaledToFill()
                        .frame(width: 90, height: 90)
                        .clipShape(Circle())
                } else if let user = authStore.currentUser, let avatarURL = user.avatar, let url = URL(string: avatarURL) {
                    CachedAsyncImage(url: url, contentMode: .fill) {
                        avatarPlaceholder
                    }
                    .frame(width: 90, height: 90)
                    .clipShape(Circle())
                } else {
                    avatarPlaceholder
                }

                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Circle()
                        .fill(SabqTheme.primaryEnd)
                        .frame(width: 30, height: 30)
                        .overlay {
                            Image(systemName: "camera.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        .shadow(color: .black.opacity(0.15), radius: 3, y: 1)
                }
                .buttonStyle(.plain)
            }
            .onChange(of: selectedPhoto) { _, newValue in
                Task {
                    if let data = try? await newValue?.loadTransferable(type: Data.self),
                       let uiImage = UIImage(data: data) {
                        selectedImage = uiImage
                        if let pngData = uiImage.pngData() {
                            await authStore.uploadAvatar(imageData: pngData)
                            if authStore.errorMessage == nil {
                                withAnimation { showUploadNotice = true }
                            }
                        }
                    }
                }
            }

            Text(authStore.currentUser?.displayName ?? "")
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            if authStore.isLoading {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("جاري رفع الصورة...")
                        .font(.system(size: 13, weight: .medium))
                }
                .foregroundStyle(SabqTheme.secondaryInk)
            }

            if showUploadNotice {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                    Text("تم تحديث الصورة الشخصية بنجاح")
                        .font(.system(size: 13, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.leaf)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.leaf.opacity(0.08))
                )
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    private var avatarPlaceholder: some View {
        Circle()
            .fill(SabqTheme.primaryEnd.opacity(0.12))
            .frame(width: 90, height: 90)
            .overlay {
                Text(String((authStore.currentUser?.displayName ?? "م").prefix(1)))
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }
    }

    private func editField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            TextField(placeholder, text: text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
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
        }
    }

    private var genderPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("الجنس")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            Picker("الجنس", selection: $gender) {
                Text("غير محدد").tag("")
                Text("ذكر").tag("male")
                Text("أنثى").tag("female")
            }
            .pickerStyle(.segmented)
        }
    }

    private func readOnlyField(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                Text(value)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 0)
                Image(systemName: "lock.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(SabqTheme.paleFill.opacity(0.6))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.5), lineWidth: 0.5)
            )
        }
    }
}

// MARK: - Change Password Sheet

struct ChangePasswordSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var success = false

    private var isValid: Bool {
        !currentPassword.isEmpty && newPassword.count >= 6 && newPassword == confirmPassword
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        Image(systemName: "lock.rotation")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(SabqTheme.primaryEnd)

                        Text("تغيير كلمة المرور")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.ink)
                    }
                    .frame(maxWidth: .infinity)

                    if success {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 16))
                            Text("تم تغيير كلمة المرور بنجاح")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundStyle(SabqTheme.leaf)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(SabqTheme.leaf.opacity(0.08))
                        )
                    } else {
                        VStack(spacing: 16) {
                            secureField(label: "كلمة المرور الحالية", placeholder: "أدخل كلمة المرور الحالية", text: $currentPassword)
                            secureField(label: "كلمة المرور الجديدة", placeholder: "6 أحرف على الأقل", text: $newPassword)
                            secureField(label: "تأكيد كلمة المرور", placeholder: "أعد إدخال كلمة المرور الجديدة", text: $confirmPassword)

                            if !newPassword.isEmpty && !confirmPassword.isEmpty && newPassword != confirmPassword {
                                HStack(spacing: 6) {
                                    Image(systemName: "exclamationmark.triangle.fill")
                                        .font(.system(size: 12))
                                    Text("كلمتا المرور غير متطابقتين")
                                        .font(.system(size: 13, weight: .medium))
                                }
                                .foregroundStyle(SabqTheme.coral)
                            }
                        }

                        if let error = authStore.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 14))
                                Text(error)
                                    .font(.system(size: 13, weight: .medium))
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

                        Button {
                            Task {
                                await authStore.changePassword(currentPassword: currentPassword, newPassword: newPassword)
                                if authStore.errorMessage == nil {
                                    withAnimation { success = true }
                                    try? await Task.sleep(for: .seconds(1.5))
                                    dismiss()
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("تغيير كلمة المرور")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(!isValid || authStore.isLoading)
                        .opacity(isValid ? 1 : 0.5)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }

    private func secureField(label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)

            SecureField(placeholder, text: text)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(SabqTheme.ink)
                .textContentType(.password)
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
        }
    }
}

// MARK: - Delete Account Sheet

struct DeleteAccountSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmText = ""
    @State private var showConfirmation = false

    private let confirmWord = "حذف"

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 48, weight: .light))
                            .foregroundStyle(SabqTheme.coral)

                        Text("حذف الحساب")
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(SabqTheme.coral)
                    }
                    .frame(maxWidth: .infinity)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("تحذير: هذا الإجراء لا يمكن التراجع عنه")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(SabqTheme.coral)

                        Text("سيتم حذف حسابك وجميع بياناتك بشكل نهائي. لن تتمكن من استعادة الحساب بعد الحذف.")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .lineSpacing(5)
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(SabqTheme.coral.opacity(0.06))
                    )

                    if !showConfirmation {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("كلمة المرور")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            SecureField("أدخل كلمة المرور للتأكيد", text: $password)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(SabqTheme.ink)
                                .textContentType(.password)
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
                        }

                        Button {
                            withAnimation { showConfirmation = true }
                        } label: {
                            Text("متابعة")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 15)
                                .background(SabqTheme.coral, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(password.isEmpty)
                        .opacity(password.isEmpty ? 0.5 : 1)
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("اكتب \"\(confirmWord)\" للتأكيد")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)

                            TextField(confirmWord, text: $confirmText)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundStyle(SabqTheme.ink)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .fill(SabqTheme.paleFill)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                                        .stroke(SabqTheme.coral.opacity(0.3), lineWidth: 1)
                                )
                        }

                        if let error = authStore.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 14))
                                Text(error)
                                    .font(.system(size: 13, weight: .medium))
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

                        Button {
                            Task {
                                await authStore.deleteAccount(password: password)
                                if authStore.isLoggedIn == false && authStore.errorMessage == nil {
                                    dismiss()
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("حذف الحساب نهائياً")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.coral, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(confirmText != confirmWord || authStore.isLoading)
                        .opacity(confirmText == confirmWord ? 1 : 0.5)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }
}

// MARK: - Forgot Password Sheet

struct ForgotPasswordSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var sent = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    Spacer().frame(height: 20)

                    Image(systemName: "envelope.badge.shield.half.filled")
                        .font(.system(size: 48, weight: .light))
                        .foregroundStyle(SabqTheme.primaryEnd)

                    Text("نسيت كلمة المرور؟")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)

                    if sent {
                        VStack(spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 40, weight: .light))
                                .foregroundStyle(SabqTheme.leaf)

                            Text(authStore.successMessage ?? "تم إرسال رابط إعادة تعيين كلمة المرور")
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(SabqTheme.secondaryInk)
                                .multilineTextAlignment(.center)
                                .lineSpacing(5)
                        }
                    } else {
                        Text("أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .multilineTextAlignment(.center)
                            .lineSpacing(5)

                        TextField("البريد الإلكتروني", text: $email)
                            .font(.system(size: 16, weight: .medium))
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
                            .padding(.horizontal, 24)

                        if let error = authStore.errorMessage {
                            HStack(spacing: 8) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 14))
                                Text(error)
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundStyle(SabqTheme.coral)
                            .padding(.horizontal, 36)
                        }

                        Button {
                            Task {
                                await authStore.forgotPassword(email: email)
                                if authStore.errorMessage == nil {
                                    withAnimation { sent = true }
                                }
                            }
                        } label: {
                            HStack(spacing: 10) {
                                if authStore.isLoading {
                                    ProgressView().tint(.white)
                                }
                                Text("إرسال")
                                    .font(.system(size: 16, weight: .bold))
                            }
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(email.isEmpty || authStore.isLoading)
                        .opacity(email.isEmpty ? 0.5 : 1)
                        .padding(.horizontal, 24)
                    }
                }
                .padding(20)
            }
            .background(SabqTheme.background)
            .sabqRTL()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }
}
