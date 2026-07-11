import Foundation
import Observation
import UIKit
@preconcurrency import UserNotifications

private struct GcPushTokenBody: Encodable {
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

private struct GcPushTokenResponse: Decodable {
    let success: Bool
}

private struct GcPushTokenDeleteBody: Encodable {
    let token: String
}

extension APIClient {
    fileprivate func registerGcPushToken(_ body: GcPushTokenBody) async throws {
        _ = try await post(
            GcPushTokenResponse.self,
            path: "/members/push-token",
            body: body,
            apiRoot: URLConstants.mobileAPI
        )
    }

    fileprivate func unregisterGcPushToken(_ token: String) async throws {
        _ = try await delete(
            GcPushTokenResponse.self,
            path: "/members/push-token",
            body: GcPushTokenDeleteBody(token: token),
            apiRoot: URLConstants.mobileAPI
        )
    }
}

@MainActor
@Observable
final class GcPushManager {
    static let shared = GcPushManager()

    private(set) var deviceToken: String?
    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private(set) var isUploading = false

    private let tokenKey = "gc.push.deviceToken"
    private let installationKey = "gc.push.installationId"

    private init() {
        deviceToken = UserDefaults.standard.string(forKey: tokenKey)
    }

    /// لا يعرض نافذة النظام عند الإقلاع؛ يعيد التسجيل فقط إن كان الإذن قائمًا.
    func prepare() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
        if settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    /// يُستدعى من سياق واضح للمستخدم (Onboarding المجلس أو مفتاح الإعدادات).
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
            return false
        } catch {
            return false
        }
    }

    func setDeviceToken(_ token: String) {
        deviceToken = token
        UserDefaults.standard.set(token, forKey: tokenKey)
        Task { await syncWithSession() }
    }

    func syncWithSession() async {
        guard GcAuthStore.shared.isLoggedIn, let deviceToken, !deviceToken.isEmpty else { return }
        isUploading = true
        defer { isUploading = false }

        let bundle = Bundle.main
        let version = bundle.infoDictionary?["CFBundleShortVersionString"] as? String ?? "?"
        let build = bundle.infoDictionary?["CFBundleVersion"] as? String ?? "?"
        let body = GcPushTokenBody(
            token: deviceToken,
            provider: "apns",
            platform: "ios",
            deviceName: UIDevice.current.name,
            osVersion: UIDevice.current.systemVersion,
            appVersion: "\(version) (\(build))",
            locale: "ar",
            timezone: TimeZone.current.identifier,
            bundleId: bundle.bundleIdentifier ?? "com.sabq.gulfcup",
            installationId: installationId
        )
        try? await APIClient.shared.registerGcPushToken(body)
    }

    /// يفصل الجهاز عن الحساب المغادر، مع إبقاء APNs token محليًا للحساب التالي.
    func unregisterCurrentDevice() async {
        guard let deviceToken, !deviceToken.isEmpty else { return }
        try? await APIClient.shared.unregisterGcPushToken(deviceToken)
    }

    private var installationId: String {
        if let existing = UserDefaults.standard.string(forKey: installationKey) { return existing }
        let value = UUID().uuidString.lowercased()
        UserDefaults.standard.set(value, forKey: installationKey)
        return value
    }
}

final class GcAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in await GcPushManager.shared.prepare() }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let value = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in GcPushManager.shared.setDeviceToken(value) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        #if DEBUG
        print("[GulfCup Push] registration failed: \(error.localizedDescription)")
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
        if let raw = info["deeplink"] as? String, let url = URL(string: raw) {
            await MainActor.run { GcAppRouter.shared.handle(url: url) }
            return
        }
        if let code = info["majlisCode"] as? String {
            await MainActor.run { GcAppRouter.shared.openMajlisInvite(code: code) }
            return
        }
        if let id = info["majlisId"] as? String {
            await MainActor.run { GcAppRouter.shared.openMajlis(id: id) }
        }
    }
}
