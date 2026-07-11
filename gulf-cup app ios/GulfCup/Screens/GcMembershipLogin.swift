import SwiftUI

// دخول بعضوية سبق — نفس عقود VARA/سبق: جوال OTP · بريد/جوال+كلمة مرور · Apple.

enum GcLoginMode { case phone, membership }

/// مكوّن الدخول الكامل لشاشة «حسابي» وورقة الدخول — ترويسة ترحيب بأسلوب VARA.
struct GcMembershipLogin: View {
    @Environment(GcAuthStore.self) private var auth
    /// ترحيب + تنويه سبب الدخول (مثل VARA). يُطفأ في السياقات الضيّقة إن لزم.
    var showWelcome: Bool = true
    @State private var mode: GcLoginMode = .phone
    @State private var identifier = ""
    @State private var password = ""

    var body: some View {
        VStack(spacing: 14) {
            if showWelcome {
                welcomeHeader
            }

            modeTabs

            if mode == .phone {
                GcPhoneLoginFlow()
            } else {
                membershipFields
            }

            dividerOr

            GcAppleSignInButton()
                .disabled(auth.isLoading)

            if auth.errorSource == .apple, let err = auth.errorMessage {
                Text(err)
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.crimson)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    /// ترحيب + ختم سبق + تنويه الغرض — مطابق منطقيًا لـ SpMembershipLogin في VARA.
    private var welcomeHeader: some View {
        VStack(spacing: 12) {
            HStack(spacing: 6) {
                Text(L("auth.welcome.prefix"))
                    .font(GulfCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                Text(L("app.title"))
                    .font(GulfCupFonts.app(size: 20, weight: .bold))
                    .foregroundStyle(GcTheme.skyDeep)
            }

            HStack(spacing: 7) {
                Text(L("auth.welcome.product"))
                    .font(GulfCupFonts.app(size: 11, weight: .semibold))
                    .foregroundStyle(GcTheme.inkFaint)
                Rectangle().fill(GcTheme.line).frame(width: 1, height: 11)
                Text(L("auth.welcome.sabq"))
                    .font(GulfCupFonts.app(size: 11, weight: .bold))
                    .foregroundStyle(GcTheme.sky)
            }

            Text(L("auth.welcome.note"))
                .font(GulfCupFonts.app(size: 13))
                .foregroundStyle(GcTheme.inkDim)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
    }

    private var modeTabs: some View {
        HStack(spacing: 6) {
            modeTab(L("auth.tab.phone"), icon: "iphone", value: .phone)
            modeTab(L("auth.tab.membership"), icon: "person.text.rectangle", value: .membership)
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous).fill(GcTheme.chipFill))
    }

    private func modeTab(_ title: String, icon: String, value: GcLoginMode) -> some View {
        let active = mode == value
        return Button {
            withAnimation(.easeOut(duration: 0.2)) { mode = value }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon).font(.system(size: 12, weight: .bold))
                Text(title).font(GulfCupFonts.app(size: 13, weight: .bold))
            }
            .foregroundStyle(active ? GcTheme.skyDeep : GcTheme.inkDim)
            .frame(maxWidth: .infinity).frame(height: 38)
            .background(
                RoundedRectangle(cornerRadius: GcTheme.tileRadius - 2, style: .continuous)
                    .fill(active ? GcTheme.skyLite : Color.clear)
            )
        }
        .buttonStyle(.plain)
    }

    private var membershipFields: some View {
        VStack(spacing: 12) {
            field(text: $identifier, placeholder: L("auth.field.identifier"), icon: "person", secure: false)
            field(text: $password, placeholder: L("auth.field.password"), icon: "lock", secure: true)

            Button {
                Task { await auth.loginWithCredentials(identifier: identifier, password: password) }
            } label: {
                HStack(spacing: 8) {
                    if auth.isLoading && auth.errorSource != .phone {
                        ProgressView().tint(.white)
                    }
                    Text(L("auth.cta.membership"))
                        .font(GulfCupFonts.app(size: 15, weight: .bold))
                }
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity).frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous)
                        .fill(GcTheme.sky)
                )
            }
            .buttonStyle(GcPressStyle())
            .disabled(auth.isLoading)

            if auth.errorSource == .credentials, let err = auth.errorMessage {
                Text(err)
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.crimson)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    @ViewBuilder
    private func field(text: Binding<String>, placeholder: String, icon: String, secure: Bool) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(GcTheme.inkFaint)
                .frame(width: 18)
            Group {
                if secure {
                    SecureField("", text: text, prompt: Text(placeholder).foregroundStyle(GcTheme.inkFaint))
                } else {
                    TextField("", text: text, prompt: Text(placeholder).foregroundStyle(GcTheme.inkFaint))
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.emailAddress)
                }
            }
            .font(GulfCupFonts.app(size: 15))
            .foregroundStyle(GcTheme.ink)
            .tint(GcTheme.sky)
        }
        .padding(.horizontal, 14).padding(.vertical, 13)
        .background(
            RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                .fill(GcTheme.cardBg)
                .overlay(
                    RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                        .stroke(GcTheme.line, lineWidth: 1)
                )
        )
    }

    private var dividerOr: some View {
        HStack(spacing: 12) {
            Rectangle().fill(GcTheme.line).frame(height: 1)
            Text(L("auth.or")).font(GulfCupFonts.app(size: 12, weight: .semibold)).foregroundStyle(GcTheme.inkFaint)
            Rectangle().fill(GcTheme.line).frame(height: 1)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - جوال OTP

struct GcPhoneLoginFlow: View {
    @Environment(GcAuthStore.self) private var auth
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
                    Text("+966").font(GulfCupFonts.app(size: 15, weight: .bold)).foregroundStyle(GcTheme.ink)
                }
                .environment(\.layoutDirection, .leftToRight)
                Rectangle().fill(GcTheme.line).frame(width: 1, height: 22)
                TextField("", text: $number, prompt: Text(verbatim: "5XXXXXXXX").foregroundStyle(GcTheme.inkFaint))
                    .keyboardType(.numberPad)
                    .textContentType(.telephoneNumber)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .font(.system(size: 17, weight: .semibold, design: .rounded).monospacedDigit())
                    .foregroundStyle(GcTheme.ink)
                    .tint(GcTheme.sky)
                    .multilineTextAlignment(.leading)
                    .focused($phoneFocused)
                    .onChange(of: number) { _, v in number = String(v.filter(\.isNumber).prefix(9)) }
            }
            .environment(\.layoutDirection, .leftToRight)
            .padding(.horizontal, 14).padding(.vertical, 13)
            .background(fieldBg)
            .contentShape(Rectangle())
            .onTapGesture { phoneFocused = true }
            .onAppear { phoneFocused = true }

            Text(L("auth.phone.hint"))
                .font(GulfCupFonts.app(size: 11.5))
                .foregroundStyle(GcTheme.inkFaint)
                .frame(maxWidth: .infinity, alignment: .center)

            primaryButton(L("auth.phone.send"), enabled: phoneValid) { Task { await send() } }
            phoneError
        }
    }

    private var codeStep: some View {
        VStack(spacing: 14) {
            VStack(spacing: 4) {
                Text(L("auth.phone.enterCode"))
                    .font(GulfCupFonts.app(size: 15, weight: .bold))
                    .foregroundStyle(GcTheme.ink)
                HStack(spacing: 5) {
                    Text(L("auth.phone.sentTo"))
                    Text(e164Display).environment(\.layoutDirection, .leftToRight)
                    Button(L("auth.phone.edit")) {
                        withAnimation { step = .phone; code = "" }
                    }
                    .foregroundStyle(GcTheme.sky)
                }
                .font(GulfCupFonts.app(size: 12))
                .foregroundStyle(GcTheme.inkDim)
            }

            GcOtpBoxes(code: $code) { Task { await verify() } }

            if resend > 0 {
                Text(L("auth.phone.resendIn", ["n": "\(resend)"]))
                    .font(GulfCupFonts.app(size: 12))
                    .foregroundStyle(GcTheme.inkFaint)
            } else {
                Button(L("auth.phone.resend")) { Task { await send() } }
                    .buttonStyle(.plain)
                    .font(GulfCupFonts.app(size: 13, weight: .bold))
                    .foregroundStyle(GcTheme.sky)
            }

            primaryButton(L("auth.phone.verify"), enabled: code.count == 6) { Task { await verify() } }
            phoneError
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
        RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
            .fill(GcTheme.cardBg)
            .overlay(
                RoundedRectangle(cornerRadius: GcTheme.tileRadius, style: .continuous)
                    .stroke(GcTheme.line, lineWidth: 1)
            )
    }

    private func primaryButton(_ title: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if auth.isLoading { ProgressView().tint(.white) }
                Text(title).font(GulfCupFonts.app(size: 15, weight: .bold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(
                RoundedRectangle(cornerRadius: GcTheme.buttonRadius, style: .continuous)
                    .fill(enabled ? GcTheme.sky : GcTheme.sky.opacity(0.4))
            )
        }
        .buttonStyle(GcPressStyle())
        .disabled(!enabled || auth.isLoading)
    }

    @ViewBuilder private var phoneError: some View {
        if auth.errorSource == .phone, let err = auth.errorMessage {
            Text(err)
                .font(GulfCupFonts.app(size: 12))
                .foregroundStyle(GcTheme.crimson)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}

/// خانات OTP مع TextField شفاف لاقتراح «من الرسائل».
struct GcOtpBoxes: View {
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
            .foregroundStyle(GcTheme.ink)
            .frame(maxWidth: .infinity).frame(height: 54)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(GcTheme.chipFill))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(active ? GcTheme.sky : GcTheme.line, lineWidth: active ? 2 : 1)
            )
    }
}

/// زر مختصر يفتح ورقة الدخول — للاستخدام في التوقعات وغيرها.
struct GcSignInPromptButton: View {
    var title: String = L("auth.cta.signin")
    @State private var showSheet = false

    var body: some View {
        Button { showSheet = true } label: {
            Text(title)
                .font(GulfCupFonts.app(size: 14, weight: .bold))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 13)
                .background(Capsule().fill(GcTheme.sky))
        }
        .buttonStyle(GcPressStyle())
        .sheet(isPresented: $showSheet) {
            GcLoginSheet()
        }
    }
}

struct GcLoginSheet: View {
    @Environment(GcAuthStore.self) private var auth
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                GcMembershipLogin()
                    .padding(20)
            }
            .background(GcTheme.appBg.ignoresSafeArea())
            .navigationTitle(L("auth.cta.signin"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L("auth.close")) { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .onChange(of: auth.isLoggedIn) { _, loggedIn in
            if loggedIn { dismiss() }
        }
    }
}
