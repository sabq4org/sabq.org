import SwiftUI
import AuthenticationServices
import Security

// جلسة العضو — Apple Sign-In → Bearer على /api/v1/*
@MainActor
@Observable
final class GcAuthStore {
    static let shared = GcAuthStore()

    private(set) var member: GcMember?
    private(set) var token: String?
    var isLoading = false
    var errorMessage: String?

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
    }

    func startAppleSignIn() {
        errorMessage = nil
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
    }

    private func exchange(identityToken: String, firstName: String?, lastName: String?, email: String?) async {
        isLoading = true
        errorMessage = nil
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
        }
        isLoading = false
    }

    private func applySession(_ resp: GcLoginResponse) async throws {
        guard let t = resp.token, !t.isEmpty else {
            throw NSError(domain: "gulfcup", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: resp.message ?? "تعذّر تسجيل الدخول"])
        }
        token = t
        member = resp.member
        GcKeychain.save(tokenKey, value: t)
        if let m = resp.member,
           let data = try? JSONEncoder().encode(GcStoredMember(id: m.id, name: m.name, email: m.email, avatar: m.avatar)) {
            UserDefaults.standard.set(data, forKey: memberKey)
        }
        await APIClient.shared.setAuthToken(t)
    }

    func signOut() {
        token = nil
        member = nil
        GcKeychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: memberKey)
        Task { await APIClient.shared.setAuthToken(nil) }
    }

    private func friendly(_ error: Error) -> String {
        if let e = error as? APIError {
            switch e {
            case .unauthorized: return "تعذّر التحقق من Apple — حاول مجددًا"
            case .rateLimited: return "محاولات كثيرة، حاول بعد قليل"
            default: return e.errorDescription ?? "تعذّر تسجيل الدخول"
            }
        }
        return error.localizedDescription
    }
}

struct GcStoredMember: Codable {
    let id: String
    let name: String?
    let email: String?
    let avatar: String?
}

extension GcMember {
    fileprivate init(id: String, name: String?, email: String?, avatar: String?) {
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

nonisolated final class GcAppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
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
