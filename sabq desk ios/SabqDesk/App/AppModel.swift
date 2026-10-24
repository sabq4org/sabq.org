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
        phase = me.capabilities.canOpenInbox ? .ready(me) : .noAccess
        guard me.capabilities.canOpenInbox else { return }
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
        guard me != nil else { return }
        do {
            unread = try await client.unreadCounts()
            try? await UNUserNotificationCenter.current().setBadgeCount(unread.total)
        } catch {
            handle(error)
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
