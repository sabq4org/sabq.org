import Foundation
import UIKit
import SwiftUI
import UserNotifications

/// Editorial-event types we receive as targeted pushes.
/// Mirrors the backend's `EditorialEvent` union.
enum EditorialPushEvent: String {
    case scheduled
    case published
    case rejected
    case needsRevision = "needs_revision"
}

/// Deep-link target inferred from a notification's userInfo. The
/// NotificationsStore publishes these so any view in the app can react
/// (e.g. the home tab can push the article detail, the settings tab can
/// open the feedback screen).
enum NotificationDeepLink: Hashable {
    case article(slug: String)
    case draft(id: String)
    case feedback(id: String)
}

/// Coordinator owned by `sabqApp` — exposes the latest APNs device token
/// the user has on this device + a pending deep link the UI should
/// consume. Designed as an `@Observable` singleton so SwiftUI views
/// (NotificationsView, AuthStore) can react without polling.
@Observable
@MainActor
final class NotificationsStore {
    static let shared = NotificationsStore()
    private init() {}

    /// Latest APNs hex token we obtained from `application:didRegister`.
    /// Stored so AuthStore can re-register it after login when no token
    /// arrived during the unauthenticated window.
    private(set) var deviceToken: String?

    /// Set by `UNUserNotificationCenter` when the user taps a
    /// notification — consumed by whichever screen handles routing.
    var pendingDeepLink: NotificationDeepLink?

    /// In-memory unread counter, updated after every history fetch.
    var unreadCount: Int = 0

    func setDeviceToken(_ token: String) {
        deviceToken = token
        Task { await registerWithBackend(token: token) }
    }

    func clearDeviceToken() {
        deviceToken = nil
    }

    /// Send the token to the backend. Safe to call repeatedly — the
    /// endpoint upserts on (token) so duplicate calls don't create
    /// duplicate rows. Silently no-ops when the user isn't signed in.
    func registerWithBackend(token: String) async {
        do {
            try await APIClient.shared.registerPushToken(
                token: token,
                provider: "apns",
                platform: "ios",
                deviceName: await UIDevice.current.name,
                osVersion: await UIDevice.current.systemVersion,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
                locale: Locale.current.identifier,
                timezone: TimeZone.current.identifier
            )
            print("[Push] APNs token registered with backend")
        } catch {
            // Likely 401 — user not signed in yet. AuthStore will retry
            // after login completes by reading `deviceToken`.
            print("[Push] register failed (likely no session yet):", error.localizedDescription)
        }
    }

    func unregisterCurrentToken() async {
        guard let token = deviceToken else { return }
        try? await APIClient.shared.unregisterPushToken(token: token)
    }

    func extractDeepLink(from userInfo: [AnyHashable: Any]) -> NotificationDeepLink? {
        // Backend ships either a `deeplink` field (canonical) or sets
        // `articleSlug` / `articleId` on the userInfo dictionary.
        if let link = userInfo["deeplink"] as? String,
           let url = URL(string: link) {
            return parseSabqDeepLink(url: url)
        }
        if let slug = userInfo["articleSlug"] as? String, !slug.isEmpty {
            return .article(slug: slug)
        }
        if let id = userInfo["articleId"] as? String, !id.isEmpty {
            return .draft(id: id)
        }
        return nil
    }

    private func parseSabqDeepLink(url: URL) -> NotificationDeepLink? {
        // sabq://article/<slug>
        // sabq://draft/<id>
        // sabq://feedback/<id>
        guard url.scheme == "sabq" else { return nil }
        let host = url.host ?? ""
        let path = url.pathComponents.filter { $0 != "/" }
        let value = path.first ?? ""
        switch host {
        case "article" where !value.isEmpty: return .article(slug: value)
        case "draft" where !value.isEmpty:   return .draft(id: value)
        case "feedback" where !value.isEmpty: return .feedback(id: value)
        default: return nil
        }
    }

    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            let granted = try await center.requestAuthorization(options: [.alert, .badge, .sound])
            if granted {
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            return granted
        } catch {
            print("[Push] permission request failed:", error)
            return false
        }
    }

    func currentAuthorizationStatus() async -> UNAuthorizationStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus
    }
}

/// UIApplicationDelegate bridge for native APNs registration. Connected to
/// SwiftUI via `@UIApplicationDelegateAdaptor` in `sabqApp.swift`.
final class SabqAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self

        // If iOS launched the app *because* the user tapped a notification,
        // capture the deep link so the UI can consume it on first render.
        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            Task { @MainActor in
                if let link = NotificationsStore.shared.extractDeepLink(from: userInfo) {
                    NotificationsStore.shared.pendingDeepLink = link
                }
            }
        }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let tokenString = deviceToken.map { String(format: "%02x", $0) }.joined()
        print("[Push] received APNs token: \(tokenString.prefix(16))…")
        Task { @MainActor in
            NotificationsStore.shared.setDeviceToken(tokenString)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[Push] failed to register for remote notifications:", error.localizedDescription)
    }

    // Foreground delivery — show banner + play sound so the user sees it
    // even when the app is open.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound, .badge])
    }

    // Tap from notification center / lock screen — extract deep link and
    // hand it to NotificationsStore for SwiftUI to react to.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        Task { @MainActor in
            if let link = NotificationsStore.shared.extractDeepLink(from: userInfo) {
                NotificationsStore.shared.pendingDeepLink = link
            }
            completionHandler()
        }
    }
}
