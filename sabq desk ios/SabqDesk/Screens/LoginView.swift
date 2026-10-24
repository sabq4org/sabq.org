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

    private enum Field { case identifier, password, code }

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
        VStack(alignment: .leading, spacing: DeskLayout.space8) {
            Image("SabqLogo")
                .resizable()
                .scaledToFit()
                .frame(height: 40)
                .accessibilityLabel("سبق")
            Text("ديسك سبق")
                .deskText(DeskType.pageTitle)
                .foregroundStyle(DeskTheme.textPrimary)
            Text("للمنسوبين: استفسارات الكتّاب ومقترحات النشر في مكان واحد")
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textSecondary)
        }
        .padding(.bottom, DeskLayout.space8)
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
            .buttonStyle(DeskPrimaryButtonStyle())
            .disabled(identifier.trimmingCharacters(in: .whitespaces).isEmpty || password.isEmpty)
            Text("يتطلب الديسك تفعيل المصادقة الثنائية على حسابك.")
                .deskText(DeskType.meta)
                .foregroundStyle(DeskTheme.textTertiary)
        }
    }

    private func secondFactorForm(hint: String?) -> some View {
        VStack(alignment: .leading, spacing: DeskLayout.space12) {
            Text(useBackupCode ? "أدخل أحد رموز الاسترداد الاحتياطية" : (hint ?? "أدخل رمز التحقق من تطبيق المصادقة"))
                .deskText(DeskType.excerpt)
                .foregroundStyle(DeskTheme.textSecondary)
            TextField(useBackupCode ? "رمز الاسترداد" : "000000", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(useBackupCode ? .asciiCapable : .numberPad)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .multilineTextAlignment(.center)
                .environment(\.layoutDirection, .leftToRight)
                .font(DeskFonts.app(size: 22, weight: .semibold))
                .monospacedDigit()
                .focused($focused, equals: .code)
                .onSubmit(verify)
                .modifier(DeskInputSurface())
            Button(action: verify) {
                busyLabel("تحقق")
            }
            .buttonStyle(DeskPrimaryButtonStyle())
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
            .foregroundStyle(DeskTheme.primary)
        }
        .onAppear { focused = .code }
        .onChange(of: code) { _, value in
            if !useBackupCode, value.filter(\.isNumber).count == 6, !isBusy { verify() }
        }
    }

    private var isCodeComplete: Bool {
        useBackupCode ? code.trimmingCharacters(in: .whitespaces).count >= 6 : code.filter(\.isNumber).count == 6
    }

    private func busyLabel(_ title: String) -> some View {
        HStack(spacing: DeskLayout.space8) {
            if isBusy { ProgressView().tint(DeskTheme.onAction) }
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
