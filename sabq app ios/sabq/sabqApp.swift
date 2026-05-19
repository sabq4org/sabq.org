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

        // Configure (but DO NOT activate) the shared AVAudioSession for
        // spoken-audio playback. `.playback` with `.spokenAudio` is
        // what overrides the silent switch and lets article-summary /
        // newsletter audio play on a muted phone.
        //
        // The previous version of this init also called
        // setActive(true), which interrupted whatever the user was
        // listening to on CarPlay the moment they opened sabq —
        // before they even tapped play on anything (bug filed
        // 2026-05-19). Activation is now delayed to SabqAudioSession
        // .activate(), invoked by each player right before .play(),
        // and reversed via SabqAudioSession.deactivate() when audio
        // stops so other apps (CarPlay) can resume.
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .spokenAudio,
                policy: .longFormAudio,
                options: []
            )
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
