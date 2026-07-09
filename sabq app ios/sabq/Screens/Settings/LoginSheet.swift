import SwiftUI
import PhotosUI
import UIKit

// كانت هذه الورقة جزءًا من SettingsView.swift (3394 سطرًا = 8 شاشات
// في ملف واحد) — فُكّكت إلى Screens/Settings/ في تدقيق 2026-07-01.

// MARK: - Login Sheet

private enum LoginMode { case phone, email }

struct LoginSheet: View {
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @State private var mode: LoginMode = .phone
    @State private var identifier = ""
    @State private var password = ""
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
            .onChange(of: authStore.isLoggedIn) { _, loggedIn in
                if loggedIn { dismiss() }
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

            modeTabs

            if mode == .phone {
                PhoneLoginFlow()
            } else {
                emailFields
            }

            dividerOr

            SocialAuthButtons(onSuccess: { dismiss() })

            if authStore.errorSource == .social, let error = authStore.errorMessage {
                credentialsErrorBanner(error)
            }

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
        }
    }

    // مبدّل التبويبين — [الجوال] [البريد الإلكتروني] (تسميات الويب).
    private var modeTabs: some View {
        HStack(spacing: 6) {
            modeTab("الجوال", icon: "iphone", value: .phone)
            modeTab("البريد الإلكتروني", icon: "envelope", value: .email)
        }
        .padding(4)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
    }

    private func modeTab(_ title: String, icon: String, value: LoginMode) -> some View {
        let active = mode == value
        return Button {
            authStore.clearMessages()
            withAnimation(.easeOut(duration: 0.2)) { mode = value }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(SabqFonts.app(size: 12, weight: .bold))
                Text(title)
                    .font(SabqFonts.app(size: 13.5, weight: .bold))
            }
            .foregroundStyle(active ? .white : SabqTheme.secondaryInk)
            .frame(maxWidth: .infinity)
            .frame(height: 38)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius - 2, style: .continuous)
                    .fill(active ? SabqTheme.primaryEnd : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private var emailFields: some View {
        VStack(spacing: 16) {
            inputField(icon: "envelope", placeholder: "البريد الإلكتروني أو الجوال", text: $identifier)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)

            inputField(icon: "lock", placeholder: "كلمة المرور", text: $password, isSecure: true)
                .textContentType(.password)

            if authStore.errorSource == .credentials, let error = authStore.errorMessage {
                credentialsErrorBanner(error)
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
                    await authStore.loginWithCredentials(identifier: identifier, password: password)
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

            Button { showForgotPassword = true } label: {
                Text("نسيت كلمة المرور؟")
                    .font(SabqFonts.app(size: 13, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private func credentialsErrorBanner(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(SabqFonts.app(size: 14))
                Text(error)
                    .font(SabqFonts.app(size: 13, weight: .medium))
            }
            .foregroundStyle(SabqTheme.coral)
            .frame(maxWidth: .infinity, alignment: .leading)

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

    private var dividerOr: some View {
        HStack(spacing: 12) {
            Rectangle().fill(SabqTheme.outline).frame(height: 1)
            Text("أو")
                .font(SabqFonts.app(size: 12, weight: .semibold))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Rectangle().fill(SabqTheme.outline).frame(height: 1)
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

// MARK: - تدفّق الدخول بالجوال (Twilio Verify)

/// إدخال الجوال (🇸🇦 +966 افتراضيًا، رقم بلا صفر) ← رمز تحقّق من 6 أرقام مع تعبئة
/// آلية عند وصول الرسالة. النجاح يُصدر جلسة عضو (يُنشئ الحساب إن لزم).
private struct PhoneLoginFlow: View {
    @Environment(AuthStore.self) private var auth
    private enum Step { case phone, code }
    @State private var step: Step = .phone
    @State private var number = ""
    @State private var code = ""
    @State private var resend = 0
    @FocusState private var phoneFocused: Bool

    private var normalized: String { String(number.filter(\.isNumber).prefix(9)) }
    private var phoneValid: Bool { normalized.count == 9 && normalized.first == "5" }
    private var e164Display: String { "+966 " + normalized }

    var body: some View {
        VStack(spacing: 12) {
            if step == .phone { phoneStep } else { codeStep }
        }
    }

    private var phoneStep: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                HStack(spacing: 5) {
                    Text("🇸🇦").font(.system(size: 16))
                    Text("+966")
                        .font(SabqFonts.app(size: 15, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                }
                .environment(\.layoutDirection, .leftToRight)
                Rectangle().fill(SabqTheme.outline).frame(width: 1, height: 22)
                // خط النظام للأرقام — الخط العربي المخصّص كان يخفي الأحرف أثناء الكتابة أحيانًا.
                TextField("", text: $number, prompt: Text(verbatim: "5XXXXXXXX").foregroundStyle(SabqTheme.tertiaryInk))
                    .keyboardType(.numberPad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(SabqTheme.ink)
                    .tint(SabqTheme.primaryEnd)
                    .multilineTextAlignment(.leading)
                    .focused($phoneFocused)
                    .onChange(of: number) { _, v in number = String(v.filter(\.isNumber).prefix(9)) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .padding(.horizontal, 14)
            .padding(.vertical, 13)
            .background(fieldBg)
            .contentShape(Rectangle())
            .onTapGesture { phoneFocused = true }
            .onAppear { phoneFocused = true }

            Text("سنرسل رمز تحقّق برسالة نصية إلى جوالك.")
                .font(SabqFonts.app(size: 11.5))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .frame(maxWidth: .infinity, alignment: .center)

            primaryButton("أرسل رمز التحقق", enabled: phoneValid) { Task { await send() } }
            errorText
        }
    }

    private var codeStep: some View {
        VStack(spacing: 14) {
            VStack(spacing: 4) {
                Text("أدخل رمز التحقق")
                    .font(SabqFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(SabqTheme.ink)
                HStack(spacing: 5) {
                    Text("أُرسل إلى")
                    Text(e164Display).environment(\.layoutDirection, .leftToRight)
                    Button("تعديل") {
                        withAnimation {
                            step = .phone
                            code = ""
                        }
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(SabqTheme.secondaryInk)
            }

            LoginOtpBoxes(code: $code) { Task { await verify() } }

            if resend > 0 {
                Text("إعادة الإرسال خلال \(resend) ثانية")
                    .font(SabqFonts.app(size: 12))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            } else {
                Button("إعادة إرسال الرمز") { Task { await send() } }
                    .buttonStyle(.plain)
                    .font(SabqFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
            }

            primaryButton("تحقّق ودخول", enabled: code.count == 6) { Task { await verify() } }
            errorText
        }
    }

    private func send() async {
        let r = await auth.sendPhoneCode(normalized)
        if r.ok {
            withAnimation { step = .code }
            startResend()
        }
    }

    private func verify() async {
        guard code.count == 6 else { return }
        _ = await auth.verifyPhoneCode(normalized, code: code)
    }

    private func startResend() {
        resend = 60
        Task { @MainActor in
            while resend > 0 {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                if resend > 0 { resend -= 1 }
            }
        }
    }

    private var fieldBg: some View {
        RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
            .fill(SabqTheme.paleFill)
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.outline, lineWidth: 0.5)
            )
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if auth.isLoading { ProgressView().tint(.white) }
                Text(title).font(SabqFonts.app(size: 16, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.buttonRadius, style: .continuous)
                    .fill(enabled ? SabqTheme.primaryEnd : SabqTheme.primaryEnd.opacity(0.4))
            )
        }
        .buttonStyle(.plain)
        .disabled(!enabled || auth.isLoading)
    }

    @ViewBuilder private var errorText: some View {
        if auth.errorSource == .phone, let err = auth.errorMessage {
            Text(err)
                .font(SabqFonts.app(size: 12))
                .foregroundStyle(SabqTheme.coral)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}

/// حقل رمز OTP — خانات مرئية + TextField فوقها بشفافية منخفضة جدًا ليفعّل شريط
/// «من الرسائل» (QuickType) عند وصول SMS مع `.oneTimeCode`.
private struct LoginOtpBoxes: View {
    @Binding var code: String
    var onComplete: () -> Void
    private let length = 6
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            HStack(spacing: 8) {
                ForEach(0..<length, id: \.self) { i in box(i) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .allowsHitTesting(false)

            // فوق الخانات وبشفافية شبه معدومة — iOS يرفض opacity=0 تمامًا لاقتراح الرمز.
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(.clear)
                .tint(.clear)
                .multilineTextAlignment(.center)
                .focused($focused)
                .opacity(0.02)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .onChange(of: code) { _, v in
                    let d = String(v.filter(\.isNumber).prefix(length))
                    if d != code { code = d }
                    if d.count == length { focused = false; onComplete() }
                }
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear { focused = true }
    }

    private func box(_ i: Int) -> some View {
        let chars = Array(code)
        let digit: String = i < chars.count ? String(chars[i]) : ""
        let active = i == chars.count
        return Text(digit)
            .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
            .foregroundStyle(SabqTheme.ink)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(SabqTheme.paleFill)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(active ? SabqTheme.primaryEnd : SabqTheme.outline, lineWidth: active ? 2 : 1)
            )
    }
}
