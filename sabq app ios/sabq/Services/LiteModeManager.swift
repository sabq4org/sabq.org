import Foundation
import Network
import Observation

/// "سبق Lite" mode — strips the app to the essentials (headline,
/// image, body, share) for slow networks or when the user explicitly
/// prefers a lighter experience.
///
/// Phase 1 of the rollout (issue #81). Surfaces the manual toggle in
/// Settings, the published `isLiteActive` flag, and analytics events.
/// The auto-detection probe + recovery banner land in Phase 3 — the
/// `startMonitoring` / `checkNetworkQuality` API surface is here so
/// callers can wire in early without churning later.
///
/// Injected into the SwiftUI environment from `ContentView`; consumed
/// via `@Environment(LiteModeManager.self)`.

enum LiteModeTrigger: String, Equatable {
    case manual
    case auto
    case none
}

enum NetworkQuality: String, Equatable {
    case good
    case poor
    case unknown
}

/// Banner that LiteBannerView consumes. The manager raises one of
/// these on auto-activation or when recovery becomes possible; the
/// banner view auto-dismisses on a timer or on user interaction.
enum LiteBanner: Equatable {
    /// Auto-activation: "الاتصال بطيء — تم التحويل لتصفح سبق Lite ⚡"
    case autoActivated
    /// Recovery prompt: "الاتصال تحسّن — العودة للوضع الطبيعي؟"
    case recoveryOffered
}

@Observable
final class LiteModeManager {

    static let shared = LiteModeManager()

    // MARK: - Published state

    /// Whether the UI should render the Lite tree right now.
    /// Combination of manual toggle + active auto-trigger.
    private(set) var isLiteActive: Bool = false

    /// Why Lite is currently on. `.none` when off.
    private(set) var trigger: LiteModeTrigger = .none

    /// Last sampled network quality (path-only fallback when the speed
    /// probe hasn't run yet; speed-probe verdict otherwise).
    private(set) var networkQuality: NetworkQuality = .unknown

    /// Top-of-screen banner state. `nil` while the banner is hidden.
    /// LiteBannerView observes this and animates on changes.
    private(set) var banner: LiteBanner?

    // MARK: - Storage

    private let storageKey = "sabqLiteModeEnabled"

    /// Persisted "user explicitly wants Lite" preference. Exposed so
    /// the Settings toggle binds to THIS, not to `isLiteActive`. If the
    /// toggle bound to the combined `isLiteActive`, the auto-trigger
    /// could keep it stuck "on" — user reported they couldn't switch
    /// back to Normal from Settings because the toggle re-armed itself
    /// against the `auto` half of the OR. (Reported 2026-05-24.)
    private(set) var manualEnabled: Bool {
        didSet { UserDefaults.standard.set(manualEnabled, forKey: storageKey); recompute() }
    }

    /// Suppress the auto-trigger for a short window after the user
    /// explicitly turns Lite off. Without this, a single slow probe a
    /// few seconds later would flip them right back to Lite — the
    /// opposite of what they just asked for. 5-minute cooldown matches
    /// the user's typical "I just changed networks" window.
    private var autoSuppressedUntil: Date?
    private let autoSuppressSeconds: TimeInterval = 5 * 60

    // MARK: - Auto-trigger state

    /// True when the auto-trigger fired Lite on. Independent of
    /// `manualEnabled`. `isLiteActive == manualEnabled || autoActive`.
    private var autoActive: Bool = false

    /// Consecutive "good" probe results — recovery prompt fires after
    /// two in a row so a single low-latency blip on a still-flaky
    /// connection doesn't flicker the banner.
    private var consecutiveGoodChecks: Int = 0

    // MARK: - Network monitor + speed probe

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.sabq.lite-monitor")
    private var isMonitoring = false
    private var probeTask: Task<Void, Never>?

    /// Tiny static asset on the same origin — used for HEAD timing.
    /// Picked because Cloudflare caches it aggressively, so a healthy
    /// path returns in well under 1s and the threshold logic stays
    /// meaningful.
    private let probeURL = URL(string: "https://sabq.org/favicon.ico")!
    private let probeIntervalSeconds: UInt64 = 30
    private let poorLatencyMs: Double = 3000
    private let goodLatencyMs: Double = 1000

    private init() {
        // Seed from persisted preference so the very first frame after
        // a cold launch reflects the user's choice without a flash.
        self.manualEnabled = UserDefaults.standard.bool(forKey: storageKey)
        self.isLiteActive = self.manualEnabled
        if self.isLiteActive { self.trigger = .manual }
    }

    // MARK: - Public API

    /// Begin observing network path changes + start the 30-second
    /// speed probe. Safe to call multiple times.
    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            // Coarse path-only fallback. When `.satisfied` the speed
            // probe (below) decides good vs. poor based on latency; if
            // the path goes unsatisfied entirely, force `.poor` so
            // auto-trigger can fire without waiting for the next probe.
            if path.status != .satisfied {
                Task { @MainActor in
                    self.networkQuality = .poor
                    self.handleProbeResult(.poor)
                }
            } else {
                // Kick a probe right away so the new path is graded
                // without waiting up to 30s for the next tick.
                Task { @MainActor in
                    await self.runProbeOnce()
                }
            }
        }
        monitor.start(queue: monitorQueue)
        startProbeLoop()
    }

    func stopMonitoring() {
        monitor.cancel()
        isMonitoring = false
        probeTask?.cancel()
        probeTask = nil
    }

    /// User flipped the Settings toggle ON. Activates Lite mode
    /// permanently (auto-detection becomes a no-op while manual is on).
    func enableManually() {
        manualEnabled = true
        SabqAnalytics.liteModeActivated(trigger: "manual")
    }

    /// User flipped the Settings toggle OFF. Clears the auto-trigger
    /// state too — the explicit OFF tap should mean "out of Lite right
    /// now", not "out of manual but still in auto-Lite". Suppresses
    /// the auto-trigger for 5 minutes so a single slow probe doesn't
    /// snap them right back. Auto resumes after the cooldown.
    func disableManually() {
        manualEnabled = false
        autoActive = false
        consecutiveGoodChecks = 0
        banner = nil
        autoSuppressedUntil = Date().addingTimeInterval(autoSuppressSeconds)
        SabqAnalytics.liteModeDeactivated()
    }

    /// Settings binding helper — keeps the toggle and the persisted
    /// flag in sync without duplicating the analytics-firing logic.
    func setManualEnabled(_ enabled: Bool) {
        if enabled { enableManually() } else { disableManually() }
    }

    /// Run a single speed probe right now and return the resulting
    /// grade. Callers usually rely on the background loop started by
    /// `startMonitoring`; this is exposed for "Refresh" buttons and
    /// for the recovery banner's "stay" → re-evaluate path.
    @MainActor
    func checkNetworkQuality() async -> NetworkQuality {
        await runProbeOnce()
        return networkQuality
    }

    /// User tapped "العودة للوضع الطبيعي" on the recovery banner.
    func acceptRecovery() {
        autoActive = false
        consecutiveGoodChecks = 0
        banner = nil
        recompute()
        SabqAnalytics.liteModeDeactivated()
    }

    /// User tapped "ابقَ في Lite" — keep Lite on, suppress further
    /// recovery prompts for a while by zeroing the streak counter.
    func dismissRecovery() {
        banner = nil
        consecutiveGoodChecks = 0
    }

    /// LiteBannerView tells the manager the auto-activated banner's
    /// dismiss timer fired.
    func clearActivationBanner() {
        if banner == .autoActivated { banner = nil }
    }

    /// Whether behavior-tracking events should fire. Caller side
    /// (BehaviorTracker) reads this; in Phase 1 it's a no-op gate the
    /// rest of the codebase can opt into.
    var shouldSuppressBehaviorTracking: Bool {
        isLiteActive
    }

    // MARK: - Internal

    /// Recompute the public `isLiteActive` / `trigger` from the
    /// in-memory `manualEnabled` combined with the auto-trigger.
    private func recompute() {
        isLiteActive = manualEnabled || autoActive
        trigger = manualEnabled ? .manual : (autoActive ? .auto : .none)
    }

    // MARK: - Speed probe

    /// Long-running task that re-runs the probe every 30s. Stops on
    /// `stopMonitoring()`. Each probe call is awaited so a slow one
    /// doesn't stack up behind itself.
    private func startProbeLoop() {
        probeTask?.cancel()
        probeTask = Task { [weak self] in
            // First probe fires immediately so launch grades the path
            // before the user touches anything.
            while !Task.isCancelled {
                await self?.runProbeOnce()
                try? await Task.sleep(nanoseconds: (self?.probeIntervalSeconds ?? 30) * 1_000_000_000)
            }
        }
    }

    /// HEAD `probeURL` and measure round-trip ms. Posts the result to
    /// `handleProbeResult` on the main actor.
    private func runProbeOnce() async {
        var request = URLRequest(url: probeURL)
        request.httpMethod = "HEAD"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.timeoutInterval = 10

        let start = Date()
        do {
            _ = try await URLSession.shared.data(for: request)
            let elapsedMs = Date().timeIntervalSince(start) * 1000
            let verdict: NetworkQuality
            if elapsedMs > poorLatencyMs {
                verdict = .poor
            } else if elapsedMs < goodLatencyMs {
                verdict = .good
            } else {
                // Middle band — keep last verdict so we don't flip on
                // every probe. Default to current if it's set, else
                // unknown.
                verdict = networkQuality == .unknown ? .good : networkQuality
            }
            await MainActor.run {
                self.networkQuality = verdict
                self.handleProbeResult(verdict)
            }
        } catch {
            // Network error counts as poor for the trigger logic.
            await MainActor.run {
                self.networkQuality = .poor
                self.handleProbeResult(.poor)
            }
        }
    }

    /// Apply auto-trigger thresholds to a fresh probe verdict.
    @MainActor
    private func handleProbeResult(_ quality: NetworkQuality) {
        // Manual override wins — never auto-fiddle while the user has
        // explicitly opted in.
        guard !manualEnabled else { return }
        // Cooldown after an explicit OFF tap — see `disableManually`.
        if let until = autoSuppressedUntil, Date() < until { return }

        switch quality {
        case .poor:
            consecutiveGoodChecks = 0
            if !autoActive {
                autoActive = true
                recompute()
                banner = .autoActivated
                SabqAnalytics.liteModeActivated(trigger: "auto")
            }
        case .good:
            if autoActive {
                consecutiveGoodChecks += 1
                if consecutiveGoodChecks >= 2 {
                    // Offer recovery — keep `autoActive` true until the
                    // user confirms so a brief good streak followed by
                    // another bad probe doesn't snap them out.
                    banner = .recoveryOffered
                }
            } else {
                consecutiveGoodChecks = 0
            }
        case .unknown:
            break
        }
    }
}
