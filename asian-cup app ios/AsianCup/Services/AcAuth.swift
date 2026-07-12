import AuthenticationServices
import Foundation
import Observation
import Security
import SwiftUI

private struct AcFlexKey: CodingKey {
    var stringValue: String
    var intValue: Int?
    init(_ value: String) { stringValue = value; intValue = nil }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

struct AcMember: Decodable, Hashable {
    let id: String
    let name: String?
    let email: String?
    let avatar: String?

    init(id: String, name: String?, email: String?, avatar: String?) {
        self.id = id; self.name = name; self.email = email; self.avatar = avatar
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AcFlexKey.self)
        id = (try? c.decode(String.self, forKey: AcFlexKey("id")))
            ?? (try? c.decode(String.self, forKey: AcFlexKey("userId"))) ?? ""
        let first = try? c.decode(String.self, forKey: AcFlexKey("firstName"))
        let last = try? c.decode(String.self, forKey: AcFlexKey("lastName"))
        let combined = [first, last].compactMap { $0 }.joined(separator: " ")
        name = (try? c.decode(String.self, forKey: AcFlexKey("name")))
            ?? (combined.isEmpty ? nil : combined)
        email = try? c.decode(String.self, forKey: AcFlexKey("email"))
        avatar = (try? c.decode(String.self, forKey: AcFlexKey("profileImageUrl")))
            ?? (try? c.decode(String.self, forKey: AcFlexKey("avatar")))
    }
}

private struct AcStoredMember: Codable {
    let id: String
    let name: String?
    let email: String?
    let avatar: String?
}

private struct AcLoginResponse: Decodable {
    let token: String?
    let member: AcMember?
    let message: String?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: AcFlexKey.self)
        token = (try? c.decode(String.self, forKey: AcFlexKey("token")))
            ?? (try? c.decode(String.self, forKey: AcFlexKey("access_token")))
        member = (try? c.decode(AcMember.self, forKey: AcFlexKey("user")))
            ?? (try? c.decode(AcMember.self, forKey: AcFlexKey("member")))
        message = try? c.decode(String.self, forKey: AcFlexKey("message"))
    }
}

private struct AcDeviceInfo: Encodable {
    let platform: String
    let osVersion: String
    let appVersion: String
    let deviceName: String
}

private struct AcAppleRequest: Encodable {
    struct FullName: Encodable { let firstName: String?; let lastName: String? }
    let identityToken: String
    let fullName: FullName?
    let email: String?
    let deviceInfo: AcDeviceInfo
}

extension APIClient {
    fileprivate func loginWithApple(
        identityToken: String,
        firstName: String?,
        lastName: String?,
        email: String?
    ) async throws -> AcLoginResponse {
        let bundle = Bundle.main
        let version = (bundle.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "?"
        let build = (bundle.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
        let fullName = firstName != nil || lastName != nil
            ? AcAppleRequest.FullName(firstName: firstName, lastName: lastName) : nil
        let body = AcAppleRequest(
            identityToken: identityToken,
            fullName: fullName,
            email: email,
            deviceInfo: AcDeviceInfo(
                platform: "ios",
                osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
                appVersion: "\(version) (\(build))",
                deviceName: "iPhone"
            )
        )
        return try await post(
            AcLoginResponse.self,
            path: "/auth/apple",
            body: body,
            apiRoot: URLConstants.mobileAPI
        )
    }

    fileprivate func fetchAcMemberProfile() async throws -> AcMember? {
        struct Response: Decodable {
            let member: AcMember?
            init(from decoder: Decoder) throws {
                let c = try decoder.container(keyedBy: AcFlexKey.self)
                member = (try? c.decode(AcMember.self, forKey: AcFlexKey("user")))
                    ?? (try? c.decode(AcMember.self, forKey: AcFlexKey("member")))
                    ?? (try? AcMember(from: decoder))
            }
        }
        return try await get(
            Response.self,
            path: "/members/profile",
            ignoreCache: true,
            apiRoot: URLConstants.mobileAPI
        ).member
    }
}

@MainActor
@Observable
final class AcAuthStore {
    static let shared = AcAuthStore()

    private(set) var member: AcMember?
    private(set) var token: String?
    var isLoading = false
    var errorMessage: String?

    var isLoggedIn: Bool { token != nil }

    private let tokenKey = "sabq.asiancup.session.token"
    private let memberKey = "sabq.asiancup.session.member"
    private var coordinator: AcAppleSignInCoordinator?

    private init() {}

    func restore() async {
        if let storedToken = AcKeychain.load(tokenKey) {
            token = storedToken
            await APIClient.shared.setAuthToken(storedToken)
        }
        if let data = UserDefaults.standard.data(forKey: memberKey),
           let stored = try? JSONDecoder().decode(AcStoredMember.self, from: data) {
            member = AcMember(id: stored.id, name: stored.name, email: stored.email, avatar: stored.avatar)
        }
        if token != nil { await refreshProfile() }
    }

    func completeAppleSignIn(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                errorMessage = L("auth.error.apple")
                return
            }
            handleApple(credential)
        case .failure(let error): handleAppleFailure(error)
        }
    }

    func startAppleSignIn() {
        errorMessage = nil
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        let coordinator = AcAppleSignInCoordinator(
            onSuccess: { [weak self] credential in
                Task { @MainActor in self?.handleApple(credential) }
            },
            onFailure: { [weak self] error in
                Task { @MainActor in self?.handleAppleFailure(error) }
            },
            onFinish: { [weak self] in Task { @MainActor in self?.coordinator = nil } }
        )
        self.coordinator = coordinator
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = coordinator
        controller.presentationContextProvider = coordinator
        controller.performRequests()
    }

    private func handleApple(_ credential: ASAuthorizationAppleIDCredential) {
        guard let data = credential.identityToken,
              let identityToken = String(data: data, encoding: .utf8) else {
            errorMessage = L("auth.error.apple")
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
        if let appleError = error as? ASAuthorizationError, appleError.code == .canceled { return }
        errorMessage = L("auth.error.apple")
    }

    private func exchange(identityToken: String, firstName: String?, lastName: String?, email: String?) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.loginWithApple(
                identityToken: identityToken,
                firstName: firstName,
                lastName: lastName,
                email: email
            )
            guard let receivedToken = response.token, !receivedToken.isEmpty else {
                throw APIError.unauthorized
            }
            token = receivedToken
            AcKeychain.save(tokenKey, value: receivedToken)
            await APIClient.shared.setAuthToken(receivedToken)
            if let member = response.member { persist(member) }
            await refreshProfile()
            await AcPushManager.shared.syncWithSession()
        } catch {
            errorMessage = LError(error)
        }
    }

    func refreshProfile() async {
        guard token != nil else { return }
        if let profile = try? await APIClient.shared.fetchAcMemberProfile(), !profile.id.isEmpty {
            persist(profile)
        }
    }

    private func persist(_ member: AcMember) {
        self.member = member
        let stored = AcStoredMember(id: member.id, name: member.name, email: member.email, avatar: member.avatar)
        if let data = try? JSONEncoder().encode(stored) {
            UserDefaults.standard.set(data, forKey: memberKey)
        }
    }

    func signOut() {
        let shouldUnregisterPush = token != nil
        token = nil
        member = nil
        errorMessage = nil
        AcKeychain.delete(tokenKey)
        UserDefaults.standard.removeObject(forKey: memberKey)
        Task {
            if shouldUnregisterPush { await AcPushManager.shared.unregisterCurrentDevice() }
            guard token == nil else { return }
            await APIClient.shared.setAuthToken(nil)
        }
    }
}

private enum AcKeychain {
    static func save(_ key: String, value: String) {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(base as CFDictionary)
        var attributes = base
        attributes[kSecValueData as String] = Data(value.utf8)
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
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

nonisolated final class AcAppleSignInCoordinator: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding {
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

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        defer { onFinish() }
        if let credential = authorization.credential as? ASAuthorizationAppleIDCredential {
            onSuccess(credential)
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        onFailure(error); onFinish()
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
