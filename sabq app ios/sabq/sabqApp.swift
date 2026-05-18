import SwiftUI
import AVFoundation
import AppTrackingTransparency

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
                .task {
                    // App Tracking Transparency — match the live App Store
                    // version (built via Expo) which prompts on first launch.
                    // The prompt is required whenever the app links against
                    // the ATT framework and Info.plist declares
                    // NSUserTrackingUsageDescription. Status doesn't affect
                    // current functionality because Firebase Analytics 11+
                    // ships with IDFA collection disabled by default; we
                    // honour the user's choice and never override.
                    await requestTrackingAuthorizationIfNeeded()
                }
        }
    }

    private func requestTrackingAuthorizationIfNeeded() async {
        guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else { return }
        // Small delay so the prompt doesn't fight a splash transition.
        try? await Task.sleep(nanoseconds: 600_000_000)
        _ = await ATTrackingManager.requestTrackingAuthorization()
    }
}
