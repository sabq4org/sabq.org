import SwiftUI

@main
struct sabqApp: App {
    @AppStorage("isDarkMode") private var isDarkMode = false
    @AppStorage("sabqHasCompletedOnboardingV2") private var hasOnboarded: Bool = false

    // Bridge UIApplicationDelegate so we can receive APNs callbacks
    // (didRegisterForRemoteNotifications + UNUserNotificationCenter
    // delegate methods) from the SwiftUI App lifecycle.
    @UIApplicationDelegateAdaptor(SabqAppDelegate.self) private var appDelegate

    init() {
        // Register bundled IBM Plex Sans Arabic before any SwiftUI view
        // tries to look it up via .font(.custom(...)).
        SabqFonts.registerAll()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(isDarkMode ? .dark : .light)
                .fullScreenCover(isPresented: .constant(!hasOnboarded)) {
                    OnboardingView()
                        .preferredColorScheme(isDarkMode ? .dark : .light)
                        .interactiveDismissDisabled(true)
                }
        }
    }
}
