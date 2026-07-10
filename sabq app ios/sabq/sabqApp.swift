import SwiftUI
import AVFoundation

@main
struct sabqApp: App {
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
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

        // Start passive NWPathMonitor so `LiteModeManager.networkQuality`
        // reflects the current connection from the first frame. The
        // active speed probe + auto-trigger land in Phase 3 of #81;
        // today this just keeps the API surface warm.
        LiteModeManager.shared.startMonitoring()

        // Migrate `isDarkMode` Bool to `appAppearance` enum (3-state)
        // so users who set light/dark before the picker landed keep their
        // choice instead of being silently flipped onto "system".
        AppAppearance.migrateLegacyIfNeeded()

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
                .preferredColorScheme(AppAppearance(rawValue: appearanceRaw)?.colorScheme)
                .environment(SabqLiveStream.shared)
                .task {
                    SabqLiveStream.shared.start()
                    await requestPushPermissionIfNeeded()
                }
                .fullScreenCover(isPresented: .constant(!hasOnboarded)) {
                    OnboardingView()
                        .preferredColorScheme(AppAppearance(rawValue: appearanceRaw)?.colorScheme)
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
            // أوقف SSE في الخلفية لتوفير البطارية؛ يُعاد عند العودة.
            if newPhase == .active {
                SabqLiveStream.shared.start()
            } else if newPhase == .background {
                SabqLiveStream.shared.stop()
            }
        }
    }

    /// Safety net for users who completed onboarding under an older build (or
    /// browse without signing in): on launch, if the notification permission
    /// is still undetermined we surface the system prompt once. Guarded by
    /// `hasOnboarded` so it never fires while the onboarding cover is up —
    /// the onboarding flow itself requests permission on completion. Calling
    /// requestAuthorization when the status is already granted/denied is a
    /// no-op (no prompt), so this is idempotent.
    @MainActor
    private func requestPushPermissionIfNeeded() async {
        guard hasOnboarded else { return }
        let status = await NotificationsStore.shared.currentAuthorizationStatus()
        if status == .notDetermined {
            _ = await NotificationsStore.shared.requestPermission()
        }
    }
}
