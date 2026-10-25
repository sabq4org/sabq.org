import SabqDeskDesign
import SabqDeskKit
import SwiftUI

/// Email/phone + password, then the mandatory second factor.
struct LoginView: View {
    @Environment(AppModel.self) private var model

    private enum Step: Equatable {
        case credentials
        case secondFactor(challengeToken: String, hint: String?)
    }

    @State private var step: Step = .credentials
    @State private var identifier = ""
    @State private var password = ""
    @State private var code = ""
    @State private var useBackupCode = false
    @State private var isBusy = false
    @State private var errorMessage: String?
    @FocusState private var focused: Field?

    fileprivate enum Field { case identifier, password, code }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DeskLayout.space16) {
                header
                switch step {
                case .credentials:
                    credentialsForm
                case .secondFactor(_, let hint):
                    secondFactorForm(hint: hint)
                }
                if let errorMessage {
                    ErrorLine(message: errorMessage)
                }
            }
            .padding(.horizontal, DeskLayout.space24)
            .padding(.vertical, DeskLayout.space32)
            .frame(maxWidth: 480)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(DeskTheme.background)
        .disabled(isBusy)
    }

    private var header: some View {
        VStack(spacing: DeskLayout.space16) {
            DeskMascot(size: 150)
                .frame(maxWidth: .infinity)
            VStack(spacing: 2) {
                Text("مكتب سبق")
                    .deskText(DeskType.pageTitle)
                    .foregroundStyle(DeskTheme.textPrimary)
                    .accessibilityAddTraits(.isHeader)
                Text(verbatim: "SABQ DESK")
                    .font(DeskFonts.app(size: 12, weight: .semibold))
                    .tracking(2)
                    .foregroundStyle(DeskInk.link)
            }
            .frame(maxWidth: .infinity)
            AssistantBubble(text: bubbleText)
        }
        .padding(.bottom, DeskLayout.space8)
    }

    private var bubbleText: String {
        switch step {
        case .credentials:
            return "أهلًا بك. أنا مساعد المكتب: أجمع لك مقترحات النشر ورسائل الكتّاب في مكان واحد. سجّل دخولك بحساب سبق."
        case .secondFactor:
            return useBackupCode ? "اكتب أحد رموز الاسترداد الاحتياطية." : "خطوة أخيرة: اكتب الرمز المكوّن من 6 أرقام من تطبيق المصادقة."
        }
    }

    private var credentialsForm: some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            TextField("البريد الإلكتروني أو رقم الجوال", text: $identifier)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focused, equals: .identifier)
                .submitLabel(.next)
                .onSubmit { focused = .password }
                .modifier(DeskInputSurface())
            SecureField("كلمة المرور", text: $password)
                .textContentType(.password)
                .focused($focused, equals: .password)
                .submitLabel(.go)
                .onSubmit(signIn)
                .modifier(DeskInputSurface())
            Button(action: signIn) {
                busyLabel("تسجيل الدخول")
            }
            .buttonStyle(DeskBigButtonStyle())
            .disabled(identifier.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            Text("يتطلب المكتب تفعيل المصادقة الثنائية على حسابك.")
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textTertiary)
        }
    }

    private func secondFactorForm(hint: String?) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            if useBackupCode {
                TextField("رمز الاسترداد", text: $code)
                    .textContentType(.oneTimeCode)
                    .keyboardType(.asciiCapable)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .multilineTextAlignment(.center)
                    .environment(\.layoutDirection, .leftToRight)
                    .font(DeskFonts.app(size: 22, weight: .semibold))
                    .focused($focused, equals: .code)
                    .onSubmit(verify)
                    .modifier(DeskInputSurface())
            } else {
                OTPBoxes(code: $code, focused: $focused)
                if let hint {
                    Text(hint)
                        .deskText(DeskType.meta)
                        .foregroundStyle(DeskTheme.textSecondary)
                }
            }
            Button(action: verify) {
                busyLabel("تحقق")
            }
            .buttonStyle(DeskBigButtonStyle())
            .disabled(!isCodeComplete)
            HStack {
                Button(useBackupCode ? "استخدام رمز التطبيق" : "استخدام رمز احتياطي") {
                    useBackupCode.toggle()
                    code = ""
                    errorMessage = nil
                }
                Spacer()
                Button("رجوع") {
                    step = .credentials
                    code = ""
                    errorMessage = nil
                }
            }
            .deskText(DeskType.metaEmphasis)
            .foregroundStyle(DeskInk.link)
        }
        .onAppear { focused = .code }
        .onChange(of: code) { _, value in
            if !useBackupCode, DeskInput.otpCode(value).count == 6, !isBusy { verify() }
        }
    }

    private var isCodeComplete: Bool {
        useBackupCode ? code.trimmingCharacters(in: .whitespaces).count >= 6 : DeskInput.otpCode(code).count == 6
    }

    private func busyLabel(_ title: String) -> some View {
        HStack(spacing: DeskLayout.space8) {
            if isBusy { ProgressView().tint(Color.white) }
            Text(title)
        }
    }

    private func signIn() {
        guard !isBusy else { return }
        errorMessage = nil
        isBusy = true
        Task {
            defer { isBusy = false }
            do {
                switch try await model.client.login(identifier: identifier, password: password) {
                case .needsTwoFactor(let challenge, let hint):
                    password = ""
                    step = .secondFactor(challengeToken: challenge, hint: hint)
                case .signedIn:
                    password = ""
                    await enter()
                }
            } catch {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    private func verify() {
        guard !isBusy, isCodeComplete, case .secondFactor(let challenge, _) = step else { return }
        errorMessage = nil
        isBusy = true
        let factor: StaffSecondFactor = useBackupCode ? .backupCode(code) : .code(code)
        Task {
            defer { isBusy = false }
            do {
                _ = try await model.client.verifyTwoFactor(challengeToken: challenge, factor: factor)
                await enter()
            } catch {
                code = ""
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    /// A session without 2FA lands on the 2FA-required screen via `handle`.
    private func enter() async {
        do {
            try await model.loadIdentity()
        } catch {
            if !model.handle(error) {
                errorMessage = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }
}

/// Six boxes over one hidden field, so paste and the keyboard's code
/// suggestion still fill it in one go.
private struct OTPBoxes: View {
    @Binding var code: String
    var focused: FocusState<LoginView.Field?>.Binding

    private var digits: [Character] { Array(DeskInput.otpCode(code).prefix(6)) }

    var body: some View {
        ZStack {
            TextField("", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .focused(focused, equals: .code)
                .foregroundStyle(Color.clear)
                .tint(Color.clear)
                .frame(height: 56)
                .accessibilityLabel("رمز التحقق")
            HStack(spacing: DeskLayout.space8) {
                ForEach(0..<6, id: \.self) { index in
                    let isCurrent = index == digits.count
                    Text(verbatim: index < digits.count ? String(digits[index]) : "")
                        .font(DeskFonts.app(size: 24, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(DeskTheme.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(DeskInk.chip, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(isCurrent ? DeskInk.action : Color.clear, lineWidth: 2))
                }
            }
            .environment(\.layoutDirection, .leftToRight)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused.wrappedValue = .code }
        .onChange(of: code) { _, value in
            let clean = String(DeskInput.otpCode(value).prefix(6))
            if clean != value { code = clean }
        }
    }
}
