import Foundation
import Observation
import SabqDeskKit
import UIKit
import UserNotifications

/// App-wide session state: who is signed in, what they may do, the unread
/// badge, and the deep link waiting to be opened.
@Observable
final class AppModel {
    static let shared = AppModel()

    enum Phase: Equatable {
        case launching
        case signedOut
        /// The account has no 2FA; the desk refuses every request until it does.
        case twoFactorRequired(message: String?)
        case noAccess
        case failed(message: String)
        case ready(StaffMe)
    }

    private(set) var phase: Phase = .launching
    private(set) var unread = StaffUnreadCounts()
    var pendingLink: DeskDeepLink?
    /// Admins: the push switches for AI status and admin alerts.
    private(set) var alertPrefs: StaffAlertPrefs?
    /// Last failure saving `alertPrefs`, shown under the toggles.
    private(set) var alertPrefsError: String?
    /// Admins: urgent «تنبيهات الإدارة», the badge on «النظام».
    private(set) var urgentAlerts = 0

    let client: StaffAPIClient
    private var push = PushRegistrationState()

    init(client: StaffAPIClient? = nil) {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        self.client = client ?? StaffAPIClient(
            configuration: .init(installationID: InstallationID.current(), appVersion: version),
            sessionStore: KeychainSessionStore())
    }

    var me: StaffMe? {
        if case .ready(let me) = phase { return me }
        return nil
    }

    var capabilities: StaffCapabilities { me?.capabilities ?? .none }

    // MARK: - Session

    func bootstrap() async {
        guard client.hasSession else {
            phase = .signedOut
            return
        }
        await reloadIdentity()
    }

    func reloadIdentity() async {
        do {
            try await loadIdentity()
        } catch {
            if !handle(error) {
                phase = .failed(message: (error as? StaffAPIError)?.userMessage ?? error.localizedDescription)
            }
        }
    }

    /// Fetches `/me` and enters the app. Session-level errors are applied to
    /// `phase` by the caller through `handle(_:)`.
    func loadIdentity() async throws {
        let me = try await client.me()
        phase = me.capabilities.canOpenApp ? .ready(me) : .noAccess
        guard me.capabilities.canOpenApp else { return }
        alertPrefs = me.alertPrefs ?? alertPrefs
        await refreshUnread()
        await requestPushAuthorization()
        await registerPushTokenIfNeeded()
    }

    func signOut() async {
        if let token = push.registeredToken {
            try? await client.unregisterPushToken(token)
        }
        push.resetBinding()
        await client.logout()
        unread = StaffUnreadCounts()
        pendingLink = nil
        alertPrefs = nil
        alertPrefsError = nil
        urgentAlerts = 0
        phase = .signedOut
        try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }

    /// Central reaction to errors that change the whole app, not one screen.
    /// Returns true when the error was consumed.
    @discardableResult
    func handle(_ error: Error) -> Bool {
        guard let error = error as? StaffAPIError else { return false }
        switch error {
        case .unauthorized:
            push.resetBinding()
            phase = .signedOut
            return true
        case .twoFactorRequired(let message):
            phase = .twoFactorRequired(message: message)
            return true
        default:
            return false
        }
    }

    func refreshUnread() async {
        guard let me else { return }
        if me.capabilities.canOpenInbox {
            do {
                unread = try await client.unreadCounts()
                try? await UNUserNotificationCenter.current().setBadgeCount(unread.total)
            } catch {
                handle(error)
            }
        }
        if me.capabilities.canAdminAlerts {
            await refreshUrgentAlerts()
        }
    }

    // MARK: - System (admins)

    func refreshUrgentAlerts() async {
        guard capabilities.canAdminAlerts else { return }
        do {
            urgentAlerts = try await client.adminAlerts().urgentCount
        } catch {
            handle(error)
        }
    }

    /// Called by the alerts screen after its own load, so the badge matches the list.
    func setUrgentAlerts(_ count: Int) {
        urgentAlerts = max(count, 0)
    }

    func loadAlertPrefsIfNeeded() async {
        guard alertPrefs == nil, capabilities.canSystemTab else { return }
        do {
            alertPrefs = try await client.alertPrefs()
        } catch {
            handle(error)
        }
    }

    /// Applies the change at once and rolls it back if the server refuses.
    func updateAlertPrefs(_ update: StaffAlertPrefsUpdate) async {
        let previous = alertPrefs
        var optimistic = alertPrefs ?? StaffAlertPrefs()
        if let value = update.aiAlerts { optimistic.aiAlerts = value }
        if let value = update.adminAlerts { optimistic.adminAlerts = value }
        alertPrefs = optimistic
        alertPrefsError = nil
        do {
            alertPrefs = try await client.updateAlertPrefs(update)
        } catch {
            alertPrefs = previous
            if !handle(error) {
                alertPrefsError = (error as? StaffAPIError)?.userMessage ?? error.localizedDescription
            }
        }
    }

    // MARK: - Deep links

    func open(_ url: URL) {
        if let link = DeskDeepLink(url: url) { pendingLink = link }
    }

    func open(pushPayload userInfo: [AnyHashable: Any]) {
        if let link = DeskDeepLink(pushPayload: userInfo) { pendingLink = link }
    }

    // MARK: - Push

    private func requestPushAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        switch settings.authorizationStatus {
        case .notDetermined:
            let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) ?? false
            if granted { UIApplication.shared.registerForRemoteNotifications() }
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        default:
            break
        }
    }

    func didReceivePushToken(_ token: String) {
        push.receive(deviceToken: token)
        Task { await registerPushTokenIfNeeded() }
    }

    private func registerPushTokenIfNeeded() async {
        guard let me, let token = push.tokenToRegister(for: me.id) else { return }
        do {
            let device = UIDevice.current
            try await client.registerPushToken(token, deviceName: device.model, osVersion: device.systemVersion)
            push.markRegistered(token: token, userID: me.id)
        } catch {
            handle(error)
        }
    }
}

#if DEBUG
extension AppModel {
    /// SwiftUI previews only: a signed-in model with fixed counts, no `/me`
    /// round-trip, no push registration.
    static func preview(me: StaffMe, unread: StaffUnreadCounts, client: StaffAPIClient) -> AppModel {
        let model = AppModel(client: client)
        model.phase = .ready(me)
        model.unread = unread
        return model
    }
}
#endif
