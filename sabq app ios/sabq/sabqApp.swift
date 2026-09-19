import SwiftUI
import AVFoundation

@main
struct sabqApp: App {
    @AppStorage("appAppearance") private var appearanceRaw: String = AppAppearance.system.rawValue
    @AppStorage("sabqHasCompletedOnboardingV2") private var hasOnboarded: Bool = false
    @State private var showAnalyticsConsent = false
    /// حالة الثيم الموسمي — تُقرأ محليًا عند الإقلاع، وتُحدَّث من الخادم بعد
    /// أول إطار (انظر SeasonalThemeStore).
    @State private var seasonal = SeasonalThemeStore.shared
    /// الشاشة الترحيبية لليوم الوطني. تُحسم قيمتها في `init` من القيمة
    /// المحفوظة محليًا حتى لا يومض التطبيق بين حالتين أثناء الإقلاع.
    @State private var showNationalDayWelcome: Bool
    @Environment(\.scenePhase) private var scenePhase

    // Bridge UIApplicationDelegate so we can receive APNs callbacks
    // (didRegisterForRemoteNotifications + UNUserNotificationCenter
    // delegate methods) from the SwiftUI App lifecycle.
    @UIApplicationDelegateAdaptor(SabqAppDelegate.self) private var appDelegate

    init() {
        // بلا شبكة: آخر حالة معروفة للمفتاح. الجهاز غير المتصل يفتح على
        // الهوية التي كان عليها، لا على وميض من الافتراضي إلى الموسمي.
        _showNationalDayWelcome = State(
            initialValue: UserDefaults.standard.bool(forKey: NationalDayTheme.activeDefaultsKey)
        )

        SabqAnalytics.configureIfAvailable()
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
            ZStack {
                rootView

                if showNationalDayWelcome {
                    NationalDayWelcomeView { dismissNationalDayWelcome() }
                        .transition(.opacity)
                        .zIndex(10)
                }
            }
            // لو أطفأ محرّرٌ المفتاح بينما الترحيبية معروضة، أغلقها فورًا.
            .onChange(of: seasonal.isNationalDayActive) { _, active in
                if !active { showNationalDayWelcome = false }
            }
        }
        .onChange(of: scenePhase) { _, newPhase in
            SabqAnalytics.setAppActive(newPhase == .active)
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
                // يلتقط الجهازُ العاملُ تبديلَ المفتاح عند عودته للواجهة.
                Task { await seasonal.refreshIfStale() }
                // The user may have enabled notifications in Settings while
                // the app was backgrounded. Refresh the APNs token and link it
                // to the active account as soon as the app becomes active.
                Task { await ensurePushRegistration() }
            } else if newPhase == .background {
                SabqLiveStream.shared.stop()
            }
        }
    }

    /// جذر التطبيق. مفصول عن `body` كي تبقى طبقة الشاشة الترحيبية فوقه
    /// مقروءة بدل أن تُدفن داخل سلسلة المعدِّلات.
    private var rootView: some View {
        ContentView()
            .preferredColorScheme(AppAppearance(rawValue: appearanceRaw)?.colorScheme)
            .environment(SabqLiveStream.shared)
            .task {
                SabqLiveStream.shared.start()
                await ensurePushRegistration()
                // بعد أول إطار — لا يؤخّر الفتح.
                await seasonal.refreshIfStale()
            }
            // الترحيبية أولًا ثم التعريف بالتطبيق، حتى لا تغطّي شاشةُ التعريف
            // (تُعرض على مستوى النافذة) التحيةَ في أول تشغيل.
            .fullScreenCover(isPresented: .constant(!hasOnboarded && !showNationalDayWelcome)) {
                OnboardingView()
                    .preferredColorScheme(AppAppearance(rawValue: appearanceRaw)?.colorScheme)
                    .interactiveDismissDisabled(true)
            }
            .onAppear {
                SabqAnalytics.setAppActive(scenePhase == .active)
                if hasOnboarded && !SabqAnalytics.hasAnalyticsConsent {
                    showAnalyticsConsent = true
                }
            }
            .onChange(of: hasOnboarded) { _, completed in
                if completed && !SabqAnalytics.hasAnalyticsConsent {
                    showAnalyticsConsent = true
                }
            }
            .alert("تحليلات الاستخدام", isPresented: $showAnalyticsConsent) {
                Button("السماح") { SabqAnalytics.setAnalyticsConsent(true) }
                Button("لا، شكرًا", role: .cancel) { SabqAnalytics.setAnalyticsConsent(false) }
            } message: {
                Text("نستخدم بيانات الاستخدام لتحسين التطبيق. الاختيار اختياري ويمكن تغييره لاحقًا من الإعدادات.")
            }
    }

    /// إخفاء الشاشة الترحيبية. محروس من النداء المزدوج (المؤقّت ولمسة
    /// القارئ قد يصلان معًا).
    @MainActor
    private func dismissNationalDayWelcome() {
        guard showNationalDayWelcome else { return }
        withAnimation(.easeInOut(duration: 0.30)) {
            showNationalDayWelcome = false
        }
    }

    /// Ask once when permission is undetermined, then register with APNs on
    /// every launch/foreground transition when permission is already granted.
    /// Apple can rotate device tokens, and NotificationsStore intentionally
    /// does not persist them locally, so a returning authenticated session
    /// must request the current token again before the backend can target it.
    @MainActor
    private func ensurePushRegistration() async {
        guard hasOnboarded else { return }
        let status = await NotificationsStore.shared.currentAuthorizationStatus()
        switch status {
        case .notDetermined:
            _ = await NotificationsStore.shared.requestPermission()
        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
        case .denied:
            break
        @unknown default:
            break
        }
    }
}
