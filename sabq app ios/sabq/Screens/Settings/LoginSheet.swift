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
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var mode: LoginMode = .phone
    @State private var identifier = ""
    @State private var password = ""
    /// Legacy register form is gone — kept the flag only to honour the
    /// `LoginSheet(initialMode: true)` callers (DailyBriefView CTAs). When
    /// true on appear we immediately swap to the conversational signup.
    @State private var isRegisterMode: Bool
    @State private var showForgotPassword = false
    @State private var showAISignUp = false
    // 2FA code-entry step state (shown when authStore.pending2FAChallengeToken != nil).
    @State private var twoFactorCode = ""
    @State private var twoFactorBackupCode = ""
    @State private var useBackupCode = false

    init(initialMode: Bool = false) {
        _isRegisterMode = State(initialValue: initialMode)
    }

    private var awaitingName: Bool {
        authStore.isLoggedIn && authStore.needsDisplayName
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: SabqLayout.space24) {
                    if awaitingName {
                        CompleteNameForm(onDone: { dismiss() })
                    } else if authStore.pending2FAChallengeToken != nil {
                        twoFactorStepView
                    } else if authStore.registrationPending {
                        registrationSuccessView
                    } else {
                        loginFormView
                    }
                }
                .padding(.horizontal, SabqLayout.pageMargin)
                .padding(.vertical, SabqLayout.space24)
            }
            .sabqNavigationEdge()
            .background(SabqTheme.background)
            .sabqRTL()
            .interactiveDismissDisabled(awaitingName)
            .toolbar {
                if !awaitingName {
                    ToolbarItem(placement: .cancellationAction) {
                        Button {
                            authStore.clearMessages()
                            dismiss()
                        } label: {
                            Label("إغلاق", systemImage: "xmark")
                            .labelStyle(.iconOnly)
                        }
                    }
                }
            }
            .sheet(isPresented: $showForgotPassword) {
                ForgotPasswordSheet()
            }
            .sheet(isPresented: $showAISignUp, onDismiss: {
                // Conversational signup auto-logs the user in. If it
                // succeeded (and name is complete), close this login sheet too.
                if authStore.isLoggedIn && !authStore.needsDisplayName {
                    dismiss()
                }
            }) {
                SignUpFlowView()
                    .environment(authStore)
            }
            .onAppear {
                authStore.isAuthSheetPresented = true
                // Callers that wanted the register form (initialMode=true)
                // now skip straight to the conversational signup sheet.
                if isRegisterMode {
                    isRegisterMode = false
                    showAISignUp = true
                }
            }
            .onDisappear {
                authStore.isAuthSheetPresented = false
                // Drop any half-finished 2FA step so reopening the sheet starts clean.
                if authStore.pending2FAChallengeToken != nil { authStore.cancelTwoFactor() }
                twoFactorCode = ""
                twoFactorBackupCode = ""
                useBackupCode = false
            }
            .onChange(of: authStore.isLoggedIn) { _, loggedIn in
                if loggedIn && !authStore.needsDisplayName { dismiss() }
            }
            .onChange(of: authStore.needsDisplayName) { _, needs in
                if authStore.isLoggedIn && !needs { dismiss() }
            }
        }
    }

    // Two-factor code-entry step, shown mid-login when the account has TOTP
    // enabled. Reuses LoginOtpBoxes (QuickType-aware) for the 6-digit code, with
    // a fallback to a one-time backup code.
    private var twoFactorStepView: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                Text("التحقّق بخطوتين")
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                Text(useBackupCode
                     ? "أدخل أحد الرموز الاحتياطية"
                     : "أدخل الرمز المكوّن من ٦ أرقام من تطبيق المصادقة")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
            }

            if useBackupCode {
                TextField("الرمز الاحتياطي", text: $twoFactorBackupCode)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(SabqFonts.app(size: 18, weight: .semibold))
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .modifier(SabqInputSurface())
                    .environment(\.layoutDirection, .leftToRight)
            } else {
                LoginOtpBoxes(code: $twoFactorCode) {
                    Task { await submitTwoFactor() }
                }
            }

            if let error = authStore.errorMessage, authStore.errorSource == .credentials {
                Text(error)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.danger)
            }

            Button {
                Task { await submitTwoFactor() }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if authStore.isLoading { ProgressView().tint(SabqTheme.onAction) }
                    Text("تحقّق")
                        .font(SabqType.label)
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: SabqLayout.controlHeight)
                .foregroundStyle(authStore.isLoading ? SabqTheme.disabledInk : SabqTheme.onAction)
                .background((authStore.isLoading ? SabqTheme.disabledFill : SabqTheme.actionFill), in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .disabled(authStore.isLoading || (useBackupCode ? twoFactorBackupCode.isEmpty : twoFactorCode.count < 6))

            HStack {
                Button(useBackupCode ? "استخدام رمز التطبيق" : "استخدام رمز احتياطي") {
                    useBackupCode.toggle()
                    twoFactorCode = ""
                    twoFactorBackupCode = ""
                    authStore.clearMessages()
                }
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.primary)

                Spacer()

                Button("رجوع") {
                    twoFactorCode = ""
                    twoFactorBackupCode = ""
                    useBackupCode = false
                    authStore.cancelTwoFactor()
                }
                .sabqText(SabqType.metaEmphasis)
                .foregroundStyle(SabqTheme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @MainActor
    private func submitTwoFactor() async {
        let ok = await authStore.verifyTwoFactor(
            code: useBackupCode ? nil : twoFactorCode,
            backupCode: useBackupCode ? twoFactorBackupCode : nil
        )
        if ok {
            twoFactorCode = ""
            twoFactorBackupCode = ""
            useBackupCode = false
        } else {
            // Wrong code — clear the field for a fresh retry; the server keeps the
            // challenge alive so the user need not re-enter their password.
            twoFactorCode = ""
        }
    }

    private var registrationSuccessView: some View {
        VStack(spacing: SabqLayout.space24) {
            Spacer().frame(height: 40)

            Image(systemName: "envelope.badge.shield.half.filled")
                .font(SabqFonts.app(size: 60, weight: .light))
                .foregroundStyle(SabqTheme.success)

            Text("تم إنشاء الحساب")
                .sabqText(SabqType.leadTitle)
                .foregroundStyle(SabqTheme.textPrimary)

            Text(authStore.successMessage ?? "يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب")
                .sabqText(SabqType.excerpt)
                .foregroundStyle(SabqTheme.textSecondary)
                .multilineTextAlignment(.center)
                .lineSpacing(5)

            Button {
                authStore.clearMessages()
                isRegisterMode = false
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "arrow.forward.circle.fill")
                        .font(SabqFonts.app(size: 16))
                    Text("تسجيل الدخول")
                        .sabqText(SabqType.button)
                }
                .foregroundStyle(SabqTheme.onAction)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SabqLayout.controlHeight)
                .background(SabqTheme.actionFill, in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, SabqLayout.space8)
        }
        .frame(maxWidth: .infinity)
    }

    private var loginFormView: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space24) {
            VStack(spacing: SabqLayout.space12) {
                SabqBrandLogo(height: 48)

                Text("تسجيل الدخول")
                    .sabqText(SabqType.leadTitle)
                    .foregroundStyle(SabqTheme.textPrimary)

                Text("احفظ أخبارك وتابع اهتماماتك على كل أجهزتك.")
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
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

            SocialAuthButtons(onSuccess: {
                if !authStore.needsDisplayName { dismiss() }
            })

            if authStore.errorSource == .social, let error = authStore.errorMessage {
                credentialsErrorBanner(error)
            }

            Button {
                authStore.clearMessages()
                showAISignUp = true
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "sparkles")
                        .font(SabqFonts.app(size: 12, weight: .heavy))
                    Text("ليس لديك حساب؟ ابدأ التسجيل مع SABQ AI")
                        .sabqText(SabqType.metaEmphasis)
                }
                .foregroundStyle(SabqTheme.primary)
                .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    // مبدّل التبويبين — [الجوال] [البريد الإلكتروني] (تسميات الويب).
    private var modeTabs: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: SabqLayout.space4) {
                    modeTab("الجوال", icon: "iphone", value: .phone)
                    modeTab("البريد الإلكتروني", icon: "envelope", value: .email)
                }
            } else {
                HStack(spacing: SabqLayout.space4) {
                    modeTab("الجوال", icon: "iphone", value: .phone)
                    modeTab("البريد الإلكتروني", icon: "envelope", value: .email)
                }
            }
        }
        .padding(SabqLayout.space4)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    private func modeTab(_ title: String, icon: String, value: LoginMode) -> some View {
        let active = mode == value
        return Button {
            authStore.clearMessages()
            withAnimation(.easeOut(duration: 0.2)) { mode = value }
        } label: {
            HStack(spacing: SabqLayout.space4) {
                Image(systemName: icon)
                    .sabqText(SabqType.tag)
                Text(title)
                    .font(SabqType.label)
            }
            .foregroundStyle(active ? SabqTheme.onAction : SabqTheme.textSecondary)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SabqLayout.touchTarget)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                    .fill(active ? SabqTheme.actionFill : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private var emailFields: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                fieldLabel("البريد الإلكتروني أو الجوال")
                inputField(icon: "envelope", placeholder: "أدخل البريد الإلكتروني أو الجوال", text: $identifier)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }

            VStack(alignment: .leading, spacing: SabqLayout.space4) {
                fieldLabel("كلمة المرور")
                inputField(icon: "lock", placeholder: "أدخل كلمة المرور", text: $password, isSecure: true)
                    .textContentType(.password)
            }

            if authStore.errorSource == .credentials, let error = authStore.errorMessage {
                credentialsErrorBanner(error)
            }

            if let success = authStore.successMessage,
               authStore.pendingActivationEmail != nil || authStore.pendingActivationUserId != nil {
                HStack(spacing: SabqLayout.space8) {
                    Image(systemName: "checkmark.circle.fill")
                        .sabqText(SabqType.excerpt)
                    Text(success)
                        .sabqText(SabqType.meta)
                }
                .foregroundStyle(SabqTheme.success)
                .padding(.horizontal, SabqLayout.space12)
                .padding(.vertical, SabqLayout.space8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                        .fill(SabqTheme.surfaceMuted)
                )
            }

            Button {
                Task {
                    await authStore.loginWithCredentials(identifier: identifier, password: password)
                }
            } label: {
                HStack(spacing: SabqLayout.space8) {
                    if authStore.isLoading {
                        ProgressView().tint(SabqTheme.onAction)
                    }
                    Text("تسجيل الدخول")
                        .font(SabqType.label)
                }
                .foregroundStyle(authStore.isLoading ? SabqTheme.disabledInk : SabqTheme.onAction)
                .frame(maxWidth: .infinity)
                .frame(minHeight: SabqLayout.controlHeight)
                .background((authStore.isLoading ? SabqTheme.disabledFill : SabqTheme.actionFill), in: RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(authStore.isLoading)

            Button { showForgotPassword = true } label: {
                Text("نسيت كلمة المرور؟")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private func credentialsErrorBanner(_ error: String) -> some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            HStack(spacing: SabqLayout.space8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .sabqText(SabqType.excerpt)
                Text(error)
                    .sabqText(SabqType.meta)
            }
            .foregroundStyle(SabqTheme.danger)
            .frame(maxWidth: .infinity, alignment: .leading)

            if authStore.pendingActivationUserId != nil
                || authStore.pendingActivationEmail != nil {
                Button {
                    Task { await authStore.resendActivation() }
                } label: {
                    HStack(spacing: SabqLayout.space8) {
                        if authStore.isResendingActivation {
                            ProgressView()
                                .controlSize(.mini)
                                .tint(SabqTheme.danger)
                        } else {
                            Image(systemName: "envelope.arrow.triangle.branch")
                                .sabqText(SabqType.tag)
                        }
                        Text("إعادة إرسال رمز التفعيل")
                            .sabqText(SabqType.metaEmphasis)
                    }
                    .foregroundStyle(SabqTheme.danger)
                    .padding(.horizontal, SabqLayout.space12)
                    .padding(.vertical, SabqLayout.space8)
                    .background(
                        RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                            .stroke(SabqTheme.outline, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .disabled(authStore.isResendingActivation)
            }
        }
        .padding(.horizontal, SabqLayout.space12)
        .padding(.vertical, SabqLayout.space8)
        .background(
            RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                .fill(SabqTheme.surfaceMuted)
        )
    }

    private var dividerOr: some View {
        HStack(spacing: SabqLayout.space12) {
            Rectangle().fill(SabqTheme.separator).frame(height: 1)
            Text("أو")
                .sabqText(SabqType.tag)
                .foregroundStyle(SabqTheme.textTertiary)
            Rectangle().fill(SabqTheme.separator).frame(height: 1)
        }
    }

    private func inputField(icon: String, placeholder: String, text: Binding<String>, isSecure: Bool = false) -> some View {
        HStack(spacing: SabqLayout.space12) {
            Image(systemName: icon)
                .font(SabqFonts.app(size: 16, weight: .medium))
                .foregroundStyle(SabqTheme.primary)
                .frame(width: 20)
                .accessibilityHidden(true)

            if isSecure {
                SecureField(placeholder, text: text, prompt: Text(placeholder).foregroundStyle(SabqTheme.textTertiary))
                    .accessibilityLabel("كلمة المرور")
                    .font(SabqFonts.app(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.textPrimary)
            } else {
                TextField(placeholder, text: text, prompt: Text(placeholder).foregroundStyle(SabqTheme.textTertiary))
                    .accessibilityLabel("البريد الإلكتروني أو الجوال")
                    .font(SabqFonts.app(size: 16, weight: .medium))
                    .foregroundStyle(SabqTheme.textPrimary)
            }
        }
        .modifier(SabqInputSurface())
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title)
            .font(SabqType.label)
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
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

    // يحذف بادئات 00966/966/0 قبل القص — من يكتب رقمه بالصيغة المحلية المعتادة
    // (05XXXXXXXX) كان يُقص إلى 9 خانات بصفره فيبقى الزر معطلًا بصمت.
    private var normalized: String {
        var d = number.filter(\.isNumber)
        if d.hasPrefix("00966") { d.removeFirst(5) }
        else if d.hasPrefix("966") { d.removeFirst(3) }
        if d.hasPrefix("0") { d.removeFirst() }
        return String(d.prefix(9))
    }
    private var phoneValid: Bool { normalized.count == 9 && normalized.first == "5" }
    private var e164Display: String { "+966 " + normalized }

    var body: some View {
        VStack(spacing: SabqLayout.space12) {
            if step == .phone { phoneStep } else { codeStep }
        }
    }

    private var phoneStep: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            fieldLabel("رقم الجوال")
            HStack(spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space4) {
                    Text("🇸🇦").font(.system(size: 16))
                    Text("+966")
                        .sabqText(SabqType.rowTitle)
                        .foregroundStyle(SabqTheme.textPrimary)
                }
                .environment(\.layoutDirection, .leftToRight)
                Rectangle().fill(SabqTheme.outline).frame(width: 1, height: 22)
                // خط النظام للأرقام — الخط العربي المخصّص كان يخفي الأحرف أثناء الكتابة أحيانًا.
                TextField("", text: $number, prompt: Text(verbatim: "5XXXXXXXX").foregroundStyle(SabqTheme.textTertiary))
                    .accessibilityLabel("رقم الجوال")
                    .keyboardType(.numberPad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(SabqTheme.textPrimary)
                    .tint(SabqTheme.primary)
                    .multilineTextAlignment(.leading)
                    .focused($phoneFocused)
                    // سقف 14 لا 9: يستوعب 00966 + 9 خانات؛ حذف البادئات في normalized —
                    // القص المبكر إلى 9 كان يبتلع آخر خانة لمن يكتب 05XXXXXXXX.
                    .onChange(of: number) { _, v in number = String(v.filter(\.isNumber).prefix(14)) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .modifier(SabqInputSurface())
            .contentShape(Rectangle())
            .onTapGesture { phoneFocused = true }
            .onAppear { phoneFocused = true }

            Text("سنرسل رمز تحقّق برسالة نصية إلى جوالك.")
                .font(SabqType.caption)
                .foregroundStyle(SabqTheme.textTertiary)
                .frame(maxWidth: .infinity, alignment: .center)

            primaryButton("أرسل رمز التحقق", enabled: phoneValid) { Task { await send() } }
            errorText
        }
    }

    private var codeStep: some View {
        VStack(spacing: SabqLayout.space12) {
            VStack(spacing: SabqLayout.space4) {
                Text("أدخل رمز التحقق")
                    .sabqText(SabqType.rowTitle)
                    .foregroundStyle(SabqTheme.textPrimary)
                HStack(spacing: SabqLayout.space4) {
                    Text("أُرسل إلى")
                    Text(e164Display).environment(\.layoutDirection, .leftToRight)
                    Button("تعديل") {
                        withAnimation {
                            step = .phone
                            code = ""
                        }
                    }
                    .foregroundStyle(SabqTheme.primary)
                }
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.textSecondary)
            }

            LoginOtpBoxes(code: $code) { Task { await verify() } }

            if resend > 0 {
                Text("إعادة الإرسال خلال \(resend) ثانية")
                    .sabqText(SabqType.meta)
                    .foregroundStyle(SabqTheme.textTertiary)
            } else {
                Button("إعادة إرسال الرمز") { Task { await send() } }
                    .buttonStyle(.plain)
                    .sabqText(SabqType.metaEmphasis)
                    .foregroundStyle(SabqTheme.primary)
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

    private func fieldLabel(_ title: String) -> some View {
        Text(title)
            .font(SabqType.label)
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
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

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: SabqLayout.space8) {
                if auth.isLoading { ProgressView().tint(enabled ? SabqTheme.onAction : SabqTheme.disabledInk) }
                Text(title).font(SabqType.label)
            }
            .foregroundStyle(enabled && !auth.isLoading ? SabqTheme.onAction : SabqTheme.disabledInk)
            .frame(maxWidth: .infinity)
            .frame(minHeight: SabqLayout.controlHeight)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(enabled && !auth.isLoading ? SabqTheme.actionFill : SabqTheme.disabledFill)
            )
        }
        .buttonStyle(.plain)
        .disabled(!enabled || auth.isLoading)
    }

    @ViewBuilder private var errorText: some View {
        if auth.errorSource == .phone, let err = auth.errorMessage {
            Text(err)
                .sabqText(SabqType.meta)
                .foregroundStyle(SabqTheme.danger)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}

/// حقل رمز OTP — خانات مرئية + TextField فوقها ليفعّل شريط «من الرسائل»
/// (QuickType) عبر `.oneTimeCode`. يتطلّب أيضًا SMS بصيغة domain-bound:
/// السطر الأخير `@sabq.org #123456` + Associated Domains `webcredentials:sabq.org`.
private struct LoginOtpBoxes: View {
    @Binding var code: String
    var onComplete: () -> Void
    private let length = 6
    @FocusState private var focused: Bool
    @State private var didSubmit = false

    var body: some View {
        ZStack {
            HStack(spacing: SabqLayout.space8) {
                ForEach(0..<length, id: \.self) { i in box(i) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .allowsHitTesting(false)

            // حقل حقيقي فوق الخانات — لا تستخدم opacity=0 (iOS يتجاهل الاقتراح).
            // لا تُصفّر الـ tint/foreground بالكامل؛ بعض إصدارات iOS تحتاج
            // أن يبقى الحقل «مرئيًا» للنظام حتى يظهر شريط التعبئة.
            TextField("", text: $code)
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
                .foregroundStyle(Color.primary.opacity(0.01))
                .multilineTextAlignment(.center)
                .focused($focused)
                .opacity(0.02)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .accessibilityLabel("رمز التحقق")
                .onChange(of: code) { _, v in
                    let d = String(v.filter(\.isNumber).prefix(length))
                    if d != code { code = d; return }
                    if d.count < length { didSubmit = false }
                    guard d.count == length, !didSubmit else { return }
                    didSubmit = true
                    // أبقِ التركيز لحظة حتى يكتمل لصق التعبئة التلقائية
                    // قبل إخفاء الكيبورد واستدعاء التحقق.
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(50))
                        focused = false
                        onComplete()
                    }
                }
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
        .onAppear {
            didSubmit = false
            // تأخير بسيط بعد الانتقال من خطوة الجوال حتى يستقر الكيبورد
            // قبل وصول SMS — يزيد احتمال ظهور شريط التعبئة.
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(350))
                focused = true
            }
        }
    }

    private func box(_ i: Int) -> some View {
        let chars = Array(code)
        let digit: String = i < chars.count ? String(chars[i]) : ""
        let active = i == chars.count
        return Text(digit)
            .font(.system(size: 22, weight: .heavy, design: .rounded).monospacedDigit())
            .foregroundStyle(SabqTheme.textPrimary)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous)
                    .stroke(active ? SabqTheme.primary : SabqTheme.outline, lineWidth: active ? 2 : 1)
            )
    }
}
