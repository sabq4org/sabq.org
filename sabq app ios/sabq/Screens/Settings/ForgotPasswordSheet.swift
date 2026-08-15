import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Forgot Password Sheet

struct ForgotPasswordSheet: View {
    enum Step { case email, code, done }

    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var step: Step = .email
    @State private var email = ""
    @State private var code = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""

    private var canSendEmail: Bool {
        !email.trimmingCharacters(in: .whitespaces).isEmpty && !authStore.isLoading
    }

    private var canSubmitReset: Bool {
        code.count == 6
            && newPassword.count >= 8
            && newPassword == confirmPassword
            && !authStore.isLoading
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    Spacer().frame(height: 20)

                    Image(systemName: step == .done ? "checkmark.circle.fill" : "envelope.badge.shield.half.filled")
                        .font(SabqFonts.app(size: 48, weight: .light))
                        .foregroundStyle(step == .done ? SabqTheme.leaf : SabqTheme.primaryEnd)

                    Text(step == .done ? "تم تغيير كلمة المرور" : "نسيت كلمة المرور؟")
                        .font(SabqFonts.app(size: 22, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)

                    switch step {
                    case .email: emailStep
                    case .code:  codeStep
                    case .done:  doneStep
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
                            .font(SabqFonts.app(size: 22))
                            .foregroundStyle(SabqTheme.tertiaryInk)
                    }
                }
            }
            .onDisappear { authStore.clearMessages() }
        }
    }

    // MARK: Step 1 — email

    @ViewBuilder
    private var emailStep: some View {
        Text("أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق لإعادة تعيين كلمة المرور")
            .font(SabqFonts.app(size: 15, weight: .regular))
            .foregroundStyle(SabqTheme.secondaryInk)
            .multilineTextAlignment(.center)
            .lineSpacing(5)

        textInput("البريد الإلكتروني", text: $email, keyboard: .emailAddress, capitalize: false)
            .padding(.horizontal, 24)

        inlineError

        Button {
            Task {
                await authStore.forgotPassword(email: email)
                if authStore.errorMessage == nil {
                    withAnimation { step = .code }
                }
            }
        } label: {
            primaryLabel(text: "إرسال رمز التحقق")
        }
        .buttonStyle(.plain)
        .disabled(!canSendEmail)
        .opacity(canSendEmail ? 1 : 0.5)
        .padding(.horizontal, 24)
    }

    // MARK: Step 2 — code + new password

    @ViewBuilder
    private var codeStep: some View {
        VStack(spacing: 4) {
            Text("أدخل الرمز المرسَل إلى:")
                .font(SabqFonts.app(size: 14, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Text(email)
                .font(SabqFonts.app(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
        }

        textInput(
            "رمز التحقق (6 أرقام)",
            text: $code,
            keyboard: .numberPad,
            // .oneTimeCode lets iOS auto-fill the code from Mail/SMS
            // AND fixes the paste-doesn't-render-until-tap SwiftUI
            // bug the editor reported on 2026-05-19. Confirmed by
            // pasting then immediately scrolling: the value appears
            // straight away.
            contentType: .oneTimeCode
        )
        .padding(.horizontal, 24)
        .onChange(of: code) { _, new in
            let digits = new.filter(\.isNumber)
            code = String(digits.prefix(6))
        }

        textInput(
            "كلمة المرور الجديدة (٨ أحرف فأكثر)",
            text: $newPassword,
            isSecure: true,
            contentType: .newPassword
        )
        .padding(.horizontal, 24)

        textInput(
            "تأكيد كلمة المرور",
            text: $confirmPassword,
            isSecure: true,
            contentType: .newPassword
        )
        .padding(.horizontal, 24)

        if !confirmPassword.isEmpty && newPassword != confirmPassword {
            Text("كلمتا المرور غير متطابقتين")
                .font(SabqFonts.app(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.coral)
        }

        inlineError

        Button {
            Task {
                let ok = await authStore.resetPasswordWithCode(
                    email: email, code: code, newPassword: newPassword
                )
                if ok {
                    withAnimation { step = .done }
                }
            }
        } label: {
            primaryLabel(text: "تعيين كلمة المرور")
        }
        .buttonStyle(.plain)
        .disabled(!canSubmitReset)
        .opacity(canSubmitReset ? 1 : 0.5)
        .padding(.horizontal, 24)

        Button("إعادة إرسال الرمز") {
            Task {
                code = ""
                await authStore.forgotPassword(email: email)
            }
        }
        .font(SabqFonts.app(size: 13, weight: .medium))
        .foregroundStyle(SabqTheme.primaryEnd)
        .padding(.top, 4)
    }

    // MARK: Step 3 — done

    @ViewBuilder
    private var doneStep: some View {
        Text(authStore.successMessage ?? "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.")
            .font(SabqFonts.app(size: 15, weight: .regular))
            .foregroundStyle(SabqTheme.secondaryInk)
            .multilineTextAlignment(.center)
            .lineSpacing(5)
            .padding(.horizontal, 24)

        Button {
            dismiss()
        } label: {
            primaryLabel(text: "حسناً")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 24)
    }

    // MARK: Shared bits

    @ViewBuilder
    private var inlineError: some View {
        if let error = authStore.errorMessage {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(SabqFonts.app(size: 14))
                Text(error)
                    .font(SabqFonts.app(size: 13, weight: .medium))
            }
            .foregroundStyle(SabqTheme.coral)
            .padding(.horizontal, 36)
        }
    }

    private func primaryLabel(text: String) -> some View {
        HStack(spacing: 10) {
            if authStore.isLoading {
                ProgressView().tint(.white)
            }
            Text(text)
                .font(SabqFonts.app(size: 16, weight: .bold))
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 15)
        .background(SabqTheme.brandGradient, in: RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous))
    }

    @ViewBuilder
    private func textInput(
        _ placeholder: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        capitalize: Bool = true,
        isSecure: Bool = false,
        contentType: UITextContentType? = nil
    ) -> some View {
        Group {
            if isSecure {
                SecureField(placeholder, text: text)
                    .textContentType(contentType)
            } else {
                TextField(placeholder, text: text)
                    .keyboardType(keyboard)
                    .textInputAutocapitalization(capitalize ? .sentences : .never)
                    .autocorrectionDisabled()
                    .textContentType(contentType)
            }
        }
        .font(SabqFonts.app(size: 16, weight: .medium))
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
