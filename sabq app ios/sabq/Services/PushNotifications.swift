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
    case opinion(slug: String)
    case draft(id: String)
    case feedback(id: String)
    case match(id: Int)
    case asianCupMatch(id: Int)
    case roshn
    case roshnTeam(id: Int)
    case roshnMatch(id: Int)
    case survey(token: String)
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

    /// Refetch the unread count from the backend. Called on every push
    /// receipt (foreground + tap) and on app-becomes-active transitions
    /// so the bell's red dot stays in sync without needing a manual
    /// home-feed pull-to-refresh. Uses the lightweight count endpoint —
    /// the previous full-page fetch pulled the whole notifications list
    /// just to read `unread`. Safely no-ops when the user isn't signed
    /// in (the call returns 401 and we silently swallow it).
    func refreshUnreadCount() async {
        guard let count = try? await APIClient.shared.fetchUnreadCount() else { return }
        unreadCount = count
    }

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
            // Use just the BCP-47 language code (e.g. "ar", "en") so the value
            // fits in the backend's `push_devices.locale varchar(10)` column.
            // Locale.current.identifier on iOS 16+ can be as long as
            // "ar_SA@calendar=gregorian;numbers=latn" which overflowed the
            // column and produced a Postgres 22001 error on registration.
            let langCode = Locale.current.language.languageCode?.identifier ?? "ar"

            try await APIClient.shared.registerPushToken(
                token: token,
                provider: "apns",
                platform: "ios",
                deviceName: UIDevice.current.name,
                osVersion: UIDevice.current.systemVersion,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String,
                locale: langCode,
                timezone: TimeZone.current.identifier,
                installationId: UIDevice.current.identifierForVendor?.uuidString
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
        // Backend ships a `deeplink` field (canonical) and/or explicit
        // `articleSlug`/`article_slug` keys. A deeplink that fails to
        // parse must FALL THROUGH to the explicit keys — the previous
        // early-return here swallowed every article tap because campaign
        // deeplinks arrive as relative "/article/{slug}" paths that
        // parseSabqDeepLink rejected (فحص المرحلة 2، 2026-08-02).
        if let link = userInfo["deeplink"] as? String,
           let url = URL(string: link),
           let parsed = parseSabqDeepLink(url: url) {
            return parsed
        }
        if let slug = (userInfo["articleSlug"] ?? userInfo["article_slug"]) as? String,
           !slug.isEmpty {
            return .article(slug: slug)
        }
        if let id = userInfo["articleId"] as? String, !id.isEmpty {
            return .draft(id: id)
        }
        return nil
    }

    /// internal (لا private): يُستدعى أيضًا من onOpenURL في ContentView —
    /// ضغطة الـ Live Activity/Dynamic Island تصل كرابط sabq:// عبر النظام
    /// لا عبر userInfo الإشعارات، وكانت طريقًا مسدودًا قبل ربطها.
    func parseSabqDeepLink(url: URL) -> NotificationDeepLink? {
        // sabq://article/<slug>   — news article detail
        // sabq://opinion/<slug>   — opinion article detail
        // sabq://draft/<id>       — editorial notifications (draft surface)
        // sabq://feedback/<id>    — editorial notifications (feedback surface)
        // sabq://match/<id>              — match center (WC / sports alerts)
        // sabq://asian-cup/match/<id>    — Asian Cup match center
        // sabq://survey/<token>          — personal survey invitation (SurveyView)
        // Universal Links من الويب: نفس /roshn وصفحات الأندية تفتح التجربة
        // الأصلية بدل بدء التطبيق على الرئيسية.
        if url.scheme == "https", ["sabq.org", "www.sabq.org"].contains(url.host ?? "") {
            let parts = url.pathComponents.filter { $0 != "/" }
            if parts.count >= 2, parts[0] == "article", !parts[1].isEmpty {
                return .article(slug: parts[1])
            }
            if parts.first == "roshn" {
                if parts.count >= 3, parts[1] == "match", let id = Int(parts[2]) {
                    return .roshnMatch(id: id)
                }
                return .roshn
            }
            if parts.count >= 3, parts[0] == "sports", parts[1] == "team", let id = Int(parts[2]) {
                return .roshnTeam(id: id)
            }
            return nil
        }

        // مسار نسبي بلا scheme — صيغة حملات اللوحة القياسية "/article/{slug}"
        if url.scheme == nil {
            let parts = url.pathComponents.filter { $0 != "/" }
            if parts.count >= 2, parts[0] == "article", !parts[1].isEmpty {
                return .article(slug: parts[1])
            }
            return nil
        }

        guard url.scheme == "sabq" else { return nil }
        let host = url.host ?? ""
        let path = url.pathComponents.filter { $0 != "/" }
        let value = path.first ?? ""
        switch host {
        case "article" where !value.isEmpty: return .article(slug: value)
        case "opinion" where !value.isEmpty: return .opinion(slug: value)
        case "draft" where !value.isEmpty:   return .draft(id: value)
        case "feedback" where !value.isEmpty: return .feedback(id: value)
        case "survey" where !value.isEmpty: return .survey(token: value)
        case "match":
            if let id = Int(value) { return .match(id: id) }
            return nil
        case "asian-cup":
            // sabq://asian-cup/match/<id>
            if path.count >= 2, path[0] == "match", let id = Int(path[1]) {
                return .asianCupMatch(id: id)
            }
            return nil
        case "roshn":
            // sabq://roshn أو sabq://roshn/team/<id> أو /match/<id>
            if path.count >= 2, path[0] == "team", let id = Int(path[1]) {
                return .roshnTeam(id: id)
            }
            if path.count >= 2, path[0] == "match", let id = Int(path[1]) {
                return .roshnMatch(id: id)
            }
            return .roshn
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
        // FirebaseApp.configure() removed in 2026051806 alongside the
        // FirebaseAnalytics SPM package — we're isolating whether the
        // bundled Google/Firebase frameworks were the trigger for App
        // Review's automated rejections (ITMS-91053 territory).

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
    // even when the app is open. Also refresh the header bell's unread
    // count so the red dot appears immediately rather than waiting for
    // the next home-feed pull-to-refresh.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound, .badge])
        Task { @MainActor in
            await NotificationsStore.shared.refreshUnreadCount()
        }
    }

    // Tap from notification center / lock screen — extract deep link and
    // hand it to NotificationsStore for SwiftUI to react to. Also refresh
    // the unread count so the bell's red dot updates the moment the user
    // returns to the app from the notification banner.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        Task { @MainActor in
            let link = NotificationsStore.shared.extractDeepLink(from: userInfo)
            print("[Push] tap keys=\(userInfo.keys) → link=\(String(describing: link))")
            if let link {
                NotificationsStore.shared.pendingDeepLink = link
            }
            await NotificationsStore.shared.refreshUnreadCount()
            completionHandler()
        }
    }
}
