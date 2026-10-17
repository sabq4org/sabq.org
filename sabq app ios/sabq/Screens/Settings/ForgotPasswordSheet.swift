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
                VStack(spacing: SabqLayout.space24) {
                    Spacer().frame(height: 20)

                    Image(systemName: step == .done ? "checkmark.circle.fill" : "envelope.badge.shield.half.filled")
                        .font(SabqFonts.app(size: 48, weight: .light))
                        .foregroundStyle(step == .done ? SabqTheme.success : SabqTheme.primary)

                    Text(step == .done ? "تم تغيير كلمة المرور" : "نسيت كلمة المرور؟")
                        .sabqText(SabqType.leadTitle)
                        .foregroundStyle(SabqTheme.textPrimary)

                    switch step {
                    case .email: emailStep
                    case .code:  codeStep
                    case .done:  doneStep
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.vertical, SabqLayout.space24)
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
            .onDisappear { authStore.clearMessages() }
        }
    }

    // MARK: Step 1 — email

    @ViewBuilder
    private var emailStep: some View {
        Text("أدخل بريدك الإلكتروني وسنرسل لك رمز التحقق لإعادة تعيين كلمة المرور")
            .sabqText(SabqType.excerpt)
            .foregroundStyle(SabqTheme.textSecondary)
            .multilineTextAlignment(.center)
            .lineSpacing(5)

        textInput("البريد الإلكتروني", text: $email, keyboard: .emailAddress, capitalize: false)
            .padding(.horizontal, SabqLayout.space24)

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
        .padding(.horizontal, SabqLayout.space24)
    }

    // MARK: Step 2 — code + new password

    @ViewBuilder
    private var codeStep: some View {
        VStack(spacing: SabqLayout.space4) {
            Text("أدخل الرمز المرسَل إلى:")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
            Text(email)
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textPrimary)
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
        .padding(.horizontal, SabqLayout.space24)
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
        .padding(.horizontal, SabqLayout.space24)

        textInput(
            "تأكيد كلمة المرور",
            text: $confirmPassword,
            isSecure: true,
            contentType: .newPassword
        )
        .padding(.horizontal, SabqLayout.space24)

        if !confirmPassword.isEmpty && newPassword != confirmPassword {
            Text("كلمتا المرور غير متطابقتين")
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.danger)
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
        .padding(.horizontal, SabqLayout.space24)

        Button("إعادة إرسال الرمز") {
            Task {
                code = ""
                await authStore.forgotPassword(email: email)
            }
        }
        .sabqText(SabqType.meta)
        .foregroundStyle(SabqTheme.primary)
        .padding(.top, SabqLayout.space4)
    }

    // MARK: Step 3 — done

    @ViewBuilder
    private var doneStep: some View {
        Text(authStore.successMessage ?? "تم تغيير كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول.")
            .sabqText(SabqType.excerpt)
            .foregroundStyle(SabqTheme.textSecondary)
            .multilineTextAlignment(.center)
            .lineSpacing(5)
            .padding(.horizontal, SabqLayout.space24)

        Button {
            dismiss()
        } label: {
            primaryLabel(text: "حسناً")
        }
        .buttonStyle(.plain)
        .padding(.horizontal, SabqLayout.space24)
    }

    // MARK: Shared bits

    @ViewBuilder
    private var inlineError: some View {
        if let error = authStore.errorMessage {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .sabqText(SabqType.excerpt)
                Text(error)
                    .sabqText(SabqType.meta)
            }
            .foregroundStyle(SabqTheme.danger)
            .padding(.horizontal, SabqLayout.space40)
        }
    }

    private func primaryLabel(text: String) -> some View {
        HStack(spacing: SabqLayout.space8) {
            if authStore.isLoading {
                ProgressView().tint(SabqTheme.onAction)
            }
            Text(text)
                .sabqText(SabqType.button)
        }
        .foregroundStyle(SabqTheme.onAction)
        .frame(maxWidth: .infinity, minHeight: SabqLayout.controlHeight)
        .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
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
        .foregroundStyle(SabqTheme.textPrimary)
        .padding(.horizontal, SabqLayout.space16)
        .padding(.vertical, SabqLayout.space12)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .stroke(SabqTheme.outline, lineWidth: 1)
        )
    }
}
