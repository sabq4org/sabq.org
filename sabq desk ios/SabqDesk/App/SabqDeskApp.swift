import SabqDeskDesign
import SabqDeskKit
import SwiftUI
import UIKit
import UserNotifications

@main
struct SabqDeskApp: App {
    @UIApplicationDelegateAdaptor(DeskAppDelegate.self) private var appDelegate
    @State private var model = AppModel.shared
    @State private var appLock = AppLockController(hasSession: { AppModel.shared.client.hasSession })

    init() {
        DeskFonts.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            #if DEBUG
            if let shot = DeskScreenshotScene.current {
                DeskScreenshotHost(scene: shot)
            } else {
                app
            }
            #else
            app
            #endif
        }
    }

    private var app: some View {
        RootView()
            .environment(model)
            .environment(appLock)
            .environment(\.layoutDirection, .rightToLeft)
            .environment(\.locale, RiyadhTime.locale)
            .tint(DeskInk.link)
            // The approved desk design is light only.
            .preferredColorScheme(.light)
            .onOpenURL { model.open($0) }
    }
}

/// APNs registration and notification taps, bridged to `AppModel`.
final class DeskAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
            AppModel.shared.open(pushPayload: userInfo)
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        AppModel.shared.didReceivePushToken(token)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        #if DEBUG
        print("[Push] registration failed:", error.localizedDescription)
        #endif
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound, .badge])
        Task { @MainActor in
            await AppModel.shared.refreshUnread()
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        completionHandler()
        Task { @MainActor in
            AppModel.shared.open(pushPayload: userInfo)
            await AppModel.shared.refreshUnread()
        }
    }
}
