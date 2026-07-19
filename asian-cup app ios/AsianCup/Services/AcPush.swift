import Foundation
import Observation
import UIKit
@preconcurrency import UserNotifications

extension Notification.Name {
    static let acDeepLink = Notification.Name("AsianCupDeepLink")
}

private struct AcPushTokenBody: Encodable {
    let token: String
    let provider: String
    let platform: String
    let deviceName: String
    let osVersion: String
    let appVersion: String
    let locale: String
    let timezone: String
    let bundleId: String
    let installationId: String
}

private struct AcPushTokenDeleteBody: Encodable { let token: String }
private struct AcPushResponse: Decodable { let success: Bool }

extension APIClient {
    fileprivate func registerAcPushToken(_ body: AcPushTokenBody) async throws {
        _ = try await post(
            AcPushResponse.self,
            path: "/members/push-token",
            body: body,
            apiRoot: URLConstants.mobileAPI
        )
    }

    fileprivate func unregisterAcPushToken(_ token: String) async throws {
        _ = try await delete(
            AcPushResponse.self,
            path: "/members/push-token",
            body: AcPushTokenDeleteBody(token: token),
            apiRoot: URLConstants.mobileAPI
        )
    }
}

@MainActor
@Observable
final class AcPushManager {
    static let shared = AcPushManager()

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private(set) var deviceToken: String?
    private(set) var isUploading = false
    var isAuthorized: Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    private let tokenKey = "ac.push.deviceToken"
    private let installationKey = "ac.push.installationId"

    private init() { deviceToken = UserDefaults.standard.string(forKey: tokenKey) }

    func prepare() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    @discardableResult
    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            authorizationStatus = settings.authorizationStatus
            if granted || settings.authorizationStatus == .provisional {
                UIApplication.shared.registerForRemoteNotifications()
                return true
            }
        } catch {}
        return false
    }

    func setDeviceToken(_ token: String) {
        deviceToken = token
        UserDefaults.standard.set(token, forKey: tokenKey)
        Task { await syncWithSession() }
    }

    func syncWithSession() async {
        guard AcAuthStore.shared.isLoggedIn, let deviceToken, !deviceToken.isEmpty else { return }
        isUploading = true
        defer { isUploading = false }
        let bundle = Bundle.main
        let version = bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = bundle.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        let body = AcPushTokenBody(
            token: deviceToken,
            provider: "apns",
            platform: "ios",
            deviceName: UIDevice.current.name,
            osVersion: UIDevice.current.systemVersion,
            appVersion: "\(version) (\(build))",
            locale: UserDefaults.standard.string(forKey: "ac.language.code") ?? "ar",
            timezone: TimeZone.current.identifier,
            bundleId: bundle.bundleIdentifier ?? "com.sabq.asiancup",
            installationId: installationId
        )
        try? await APIClient.shared.registerAcPushToken(body)
    }

    func unregisterCurrentDevice() async {
        guard let deviceToken, !deviceToken.isEmpty else { return }
        try? await APIClient.shared.unregisterAcPushToken(deviceToken)
    }

    private var installationId: String {
        if let existing = UserDefaults.standard.string(forKey: installationKey) { return existing }
        let value = UUID().uuidString.lowercased()
        UserDefaults.standard.set(value, forKey: installationKey)
        return value
    }
}

final class AcAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in await AcPushManager.shared.prepare() }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let value = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in AcPushManager.shared.setDeviceToken(value) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        #if DEBUG
        print("[AsianCup Push] registration failed: \(error.localizedDescription)")
        #endif
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let info = response.notification.request.content.userInfo
        guard let raw = info["deeplink"] as? String, let url = URL(string: raw) else { return }
        await MainActor.run {
            NotificationCenter.default.post(name: .acDeepLink, object: url)
        }
    }
}
