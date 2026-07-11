import SwiftUI
import AuthenticationServices
import Security

// جلسة العضو — Apple / جوال OTP / عضوية سبق → Bearer على /api/v1/*
@MainActor
@Observable
final class GcAuthStore {
    static let shared = GcAuthStore()

    private(set) var member: GcMember?
    private(set) var token: String?
    var isLoading = false
    var errorMessage: String?
    var errorSource: GcAuthErrorSource = .none

    var isLoggedIn: Bool { token != nil }

    private let tokenKey = "sabqgulfcup.session.token"
    private let memberKey = "sabqgulfcup.session.member"
    private var appleCoordinator: GcAppleSignInCoordinator?

    private init() {}

    func restore() async {
        if let t = GcKeychain.load(tokenKey) {
            token = t
            await APIClient.shared.setAuthToken(t)
        }
        if let data = UserDefaults.standard.data(forKey: memberKey),
           let stored = try? JSONDecoder().decode(GcStoredMember.self, from: data) {
            member = GcMember(id: stored.id, name: stored.name, email: stored.email, avatar: stored.avatar)
        }
        if token != nil {
            await refreshProfile()
        }
    }

    func completeAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
                handleApple(credential)
            } else {
                errorMessage = "تعذّر قراءة بيانات Apple"
                errorSource = .apple
            }
        case .failure(let error):
            handleAppleFailure(error)
        }
    }

    func startAppleSignIn() {
        errorMessage = nil
        errorSource = .none
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        let coordinator = GcAppleSignInCoordinator(
            onSuccess: { [weak self] credential in
                Task { @MainActor in self?.handleApple(credential) }
            },
            onFailure: { [weak self] error in
                Task { @MainActor in self?.handleAppleFailure(error) }
            },
            onFinish: { [weak self] in
                Task { @MainActor in self?.appleCoordinator = nil }
            }
        )
        appleCoordinator = coordinator

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
    }

    private func handleApple(_ credential: ASAuthorizationAppleIDCredential) {
        guard let data = credential.identityToken,
              let identityToken = String(data: data, encoding: .utf8) else {
            errorMessage = "تعذّر قراءة بيانات Apple"
            errorSource = .apple
            return
        }
        Task {
            await exchange(
                identityToken: identityToken,
                firstName: credential.fullName?.givenName,
                lastName: credential.fullName?.familyName,
                email: credential.email
            )
        }
    }

    private func handleAppleFailure(_ error: Error) {
        if let asError = error as? ASAuthorizationError, asError.code == .canceled { return }
        errorMessage = "تعذّر تسجيل الدخول عبر Apple"
        errorSource = .apple
    }

    private func exchange(identityToken: String, firstName: String?, lastName: String?, email: String?) async {
        isLoading = true
        errorMessage = nil
        errorSource = .none
        do {
            let resp = try await APIClient.shared.loginWithApple(
                identityToken: identityToken,
                firstName: firstName,
                lastName: lastName,
                email: email
            )
            try await applySession(resp)
        } catch {
            errorMessage = friendly(error)
            errorSource = .apple
        }
        isLoading = false
    }

    // MARK: عضوية سبق (بريد/جوال + كلمة مرور)

    func loginWithCredentials(identifier: String, password: String) async {
        let id = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !id.isEmpty, !password.isEmpty else {
            errorMessage = L("auth.error.emptyCredentials")
            errorSource = .credentials
            return
        }
        isLoading = true
        errorMessage = nil
        errorSource = .none
        do {
            let resp = try await APIClient.shared.loginWithIdentifier(id, password: password)
            try await applySession(resp)
        } catch {
            errorMessage = friendly(error)
            errorSource = .credentials
        }
        isLoading = false
    }

    // MARK: جوال OTP

    func sendPhoneCode(_ phone: String) async -> (ok: Bool, message: String) {
        isLoading = true
        errorMessage = nil
        errorSource = .none
        defer { isLoading = false }
        do {
            let resp = try await APIClient.shared.sendPhoneCode(phone)
            let msg = resp.message ?? (resp.success ? L("auth.phone.sent") : L("auth.phone.sendFailed"))
            if !resp.success {
                errorMessage = msg
                errorSource = .phone
            }
            return (resp.success, msg)
        } catch {
            let msg = friendly(error)
            errorMessage = msg
            errorSource = .phone
            return (false, msg)
        }
    }

    func verifyPhoneCode(_ phone: String, code: String) async -> Bool {
        isLoading = true
        errorMessage = nil
        errorSource = .phone
        defer { isLoading = false }
        do {
            let resp = try await APIClient.shared.verifyPhoneCode(phone, code: code)
            try await applySession(resp)
            return true
        } catch {
            errorMessage = friendly(error)
            errorSource = .phone
            return false
        }
    }

    private func applySession(_ resp: GcLoginResponse) async throws {
        guard let t = resp.token, !t.isEmpty else {
            throw NSError(domain: "gulfcup", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: resp.message ?? "تعذّر تسجيل الدخول"])
        }
        token = t
        if let m = resp.member { persistMember(m) }
        errorSource = .none
        errorMessage = nil
        GcKeychain.save(tokenKey, value: t)
        await APIClient.shared.setAuthToken(t)
        await refreshProfile()
        await GcPushManager.shared.syncWithSession()
    }

    /// يجلب الصورة والاسم من /members/profile (حساب سبق المشترك).
    func refreshProfile() async {
        guard token != nil else { return }
        if let m = try? await APIClient.shared.fetchMemberProfile(), !m.id.isEmpty {
            persistMember(m)
        }
    }

    private func persistMember(_ m: GcMember) {
        member = m
        if let data = try? JSONEncoder().encode(GcStoredMember(id: m.id, name: m.name, email: m.email, avatar: m.avatar)) {
            UserDefaults.standard.set(data, forKey: memberKey)
        }
    }

    func signOut() {
        let shouldUnregisterPush = token != nil
        token = nil
        member = nil
        errorMessage = nil
        errorSource = .none
        GcKeychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: memberKey)
        Task {
            // APIClient still carries the departing Bearer token here, so the
            // server can deactivate this device before the session is cleared.
            if shouldUnregisterPush {
                await GcPushManager.shared.unregisterCurrentDevice()
            }
            // Do not wipe a newer session if the member signed back in while
            // the best-effort unregister request was in flight.
            guard token == nil else { return }
            await APIClient.shared.setAuthToken(nil)
        }
    }

    private func friendly(_ error: Error) -> String {
        if let e = error as? APIError {
            switch e {
            case .unauthorized: return L("auth.error.unauthorized")
            case .rateLimited: return L("auth.error.rateLimited")
            default: return e.errorDescription ?? L("auth.error.generic")
            }
        }
        return error.localizedDescription
    }
}

enum GcAuthErrorSource {
    case none, credentials, apple, phone
}

struct GcStoredMember: Codable {
    let id: String
    let name: String?
    let email: String?
    let avatar: String?
}

extension GcMember {
    init(id: String, name: String?, email: String?, avatar: String?) {
        self.id = id
        self.name = name
        self.email = email
        self.avatar = avatar
    }
}

enum GcKeychain {
    static func save(_ key: String, value: String) {
        let data = Data(value.utf8)
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        var attrs = base
        attrs[kSecValueData as String] = data
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func load(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ] as CFDictionary)
    }
}

final class GcAppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let onSuccess: (ASAuthorizationAppleIDCredential) -> Void
    private let onFailure: (Error) -> Void
    private let onFinish: () -> Void

    init(
        onSuccess: @escaping (ASAuthorizationAppleIDCredential) -> Void,
        onFailure: @escaping (Error) -> Void,
        onFinish: @escaping () -> Void
    ) {
        self.onSuccess = onSuccess
        self.onFailure = onFailure
        self.onFinish = onFinish
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        defer { onFinish() }
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            onSuccess(credential)
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onFailure(error)
        onFinish()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scene = UIApplication.shared.connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .first { $0.activationState == .foregroundActive }
            return scene?.windows.first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }
}
