import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

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
                            .font(SabqFonts.app(size: 22))
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
                .font(SabqFonts.app(size: 60, weight: .light))
                .foregroundStyle(SabqTheme.leaf)

            Text("تم إنشاء الحساب")
                .font(SabqFonts.app(size: 24, weight: .bold))
                .foregroundStyle(SabqTheme.ink)

            Text(authStore.successMessage ?? "يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب")
                .font(SabqFonts.app(size: 15, weight: .regular))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
                .lineSpacing(5)

            Button {
                authStore.clearMessages()
                isRegisterMode = false
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.forward.circle.fill")
                        .font(SabqFonts.app(size: 16))
                    Text("تسجيل الدخول")
                        .font(SabqFonts.app(size: 16, weight: .bold))
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
                    .font(SabqFonts.app(size: 24, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)

                Text("سجّل دخولك للاستفادة من جميع الميزات")
                    .font(SabqFonts.app(size: 15, weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)

            SocialAuthButtons(onSuccess: { dismiss() })

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
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(SabqFonts.app(size: 14))
                        Text(error)
                            .font(SabqFonts.app(size: 13, weight: .medium))
                    }
                    .foregroundStyle(SabqTheme.coral)
                    .frame(maxWidth: .infinity, alignment: .leading)

                    // Account is pending activation — offer to resend
                    // the activation email so the user can finish
                    // verifying without leaving the login sheet.
                    if authStore.pendingActivationUserId != nil
                        || authStore.pendingActivationEmail != nil {
                        Button {
                            Task { await authStore.resendActivation() }
                        } label: {
                            HStack(spacing: 6) {
                                if authStore.isResendingActivation {
                                    ProgressView()
                                        .controlSize(.mini)
                                        .tint(SabqTheme.coral)
                                } else {
                                    Image(systemName: "envelope.arrow.triangle.branch")
                                        .font(SabqFonts.app(size: 12, weight: .bold))
                                }
                                Text("إعادة إرسال رمز التفعيل")
                                    .font(SabqFonts.app(size: 13, weight: .semibold))
                            }
                            .foregroundStyle(SabqTheme.coral)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(SabqTheme.coral.opacity(0.35), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .disabled(authStore.isResendingActivation)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.coral.opacity(0.08))
                )
            }

            if let success = authStore.successMessage,
               authStore.pendingActivationEmail != nil || authStore.pendingActivationUserId != nil {
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(SabqFonts.app(size: 14))
                    Text(success)
                        .font(SabqFonts.app(size: 13, weight: .medium))
                }
                .foregroundStyle(SabqTheme.leaf)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(SabqTheme.leaf.opacity(0.10))
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
                        .font(SabqFonts.app(size: 17, weight: .bold))
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
                        .font(SabqFonts.app(size: 12, weight: .heavy))
                    Text("ليس لديك حساب؟ ابدأ التسجيل مع SABQ AI")
                        .font(SabqFonts.app(size: 14, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)

            Button { showForgotPassword = true } label: {
                Text("نسيت كلمة المرور؟")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
    }

    private func inputField(icon: String, placeholder: String, text: Binding<String>, isSecure: Bool = false) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 16, weight: .medium))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.6))
                .frame(width: 20)

            if isSecure {
                SecureField(placeholder, text: text)
                    .font(SabqFonts.app(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.ink)
            } else {
                TextField(placeholder, text: text)
                    .font(SabqFonts.app(size: 16, weight: .medium))
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
