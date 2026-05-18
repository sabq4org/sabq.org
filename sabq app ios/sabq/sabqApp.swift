import SwiftUI
import AVFoundation

@main
struct sabqApp: App {
    @AppStorage("isDarkMode") private var isDarkMode = false
    @AppStorage("sabqHasCompletedOnboardingV2") private var hasOnboarded: Bool = false
    @Environment(\.scenePhase) private var scenePhase

    // Bridge UIApplicationDelegate so we can receive APNs callbacks
    // (didRegisterForRemoteNotifications + UNUserNotificationCenter
    // delegate methods) from the SwiftUI App lifecycle.
    @UIApplicationDelegateAdaptor(SabqAppDelegate.self) private var appDelegate

    init() {
        // Register bundled IBM Plex Sans Arabic before any SwiftUI view
        // tries to look it up via .font(.custom(...)).
        SabqFonts.registerAll()

        // Configure the shared AVAudioSession for spoken-audio playback.
        // The default category is .soloAmbient, which mutes when the
        // hardware ring/silent switch is on — readers who keep their
        // phone on silent (typical default) would hear nothing from the
        // article summary, opinion-summary, or audio-newsletter players
        // even though the UI appeared to be "playing". `.playback` with
        // `.spokenAudio` overrides the silent switch and ducks well with
        // other apps. Set once at launch; AVPlayer instances created
        // later inherit it.
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                options: []
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[sabq] AVAudioSession setup failed: \(error)")
        }
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
        .onChange(of: scenePhase) { _, newPhase in
            // Flush any queued loyalty events when the app backgrounds.
            // The queue's 30s timer still runs while in foreground, so
            // this is only the safety net for "app suspended before
            // next timer fired" cases.
            if newPhase == .background || newPhase == .inactive {
                Task { await LoyaltyEventQueue.shared.flushNow() }
            }
        }
    }
}
