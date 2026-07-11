import SwiftUI

@main
struct GulfCupApp: App {
    @UIApplicationDelegateAdaptor(GcAppDelegate.self) private var appDelegate
    @State private var auth = GcAuthStore.shared
    @State private var router = GcAppRouter.shared

    init() {
        FontRegistration.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            GulfCupView()
                .environment(auth)
                .environment(router)
                .gulfCupRTL()
                .task {
                    await auth.restore()
                    await GcPushManager.shared.syncWithSession()
                }
        }
    }
}
