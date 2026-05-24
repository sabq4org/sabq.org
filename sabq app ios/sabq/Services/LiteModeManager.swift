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

@Observable
final class LiteModeManager {

    static let shared = LiteModeManager()

    // MARK: - Published state

    /// Whether the UI should render the Lite tree right now.
    /// Combination of manual toggle + active auto-trigger.
    private(set) var isLiteActive: Bool = false

    /// Why Lite is currently on. `.none` when off.
    private(set) var trigger: LiteModeTrigger = .none

    /// Last sampled network quality. Probe arrives in Phase 3.
    private(set) var networkQuality: NetworkQuality = .unknown

    // MARK: - Storage

    private let storageKey = "sabqLiteModeEnabled"

    private var manualEnabled: Bool {
        get { UserDefaults.standard.bool(forKey: storageKey) }
        set {
            UserDefaults.standard.set(newValue, forKey: storageKey)
            recompute()
        }
    }

    // MARK: - Network monitor (handle only — probe in Phase 3)

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.sabq.lite-monitor")
    private var isMonitoring = false

    private init() {
        // Seed from persisted preference so the very first frame after
        // a cold launch reflects the user's choice without a flash.
        self.isLiteActive = UserDefaults.standard.bool(forKey: storageKey)
        if self.isLiteActive { self.trigger = .manual }
    }

    // MARK: - Public API

    /// Begin observing network path changes. Safe to call multiple
    /// times. Phase 3 will layer the speed probe + auto-trigger on top
    /// of this; today it only records `networkQuality` based on path
    /// status so consumers can render hints if they want.
    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            // Coarse path-only signal until Phase 3 adds the probe:
            // satisfied → good (subject to override by the probe later),
            // anything else → poor.
            let q: NetworkQuality = path.status == .satisfied ? .good : .poor
            Task { @MainActor in
                self.networkQuality = q
            }
        }
        monitor.start(queue: monitorQueue)
    }

    func stopMonitoring() {
        monitor.cancel()
        isMonitoring = false
    }

    /// User flipped the Settings toggle ON. Activates Lite mode
    /// permanently (auto-detection becomes a no-op while manual is on).
    func enableManually() {
        manualEnabled = true
        SabqAnalytics.liteModeActivated(trigger: "manual")
    }

    /// User flipped the Settings toggle OFF. Auto-detection resumes.
    func disableManually() {
        manualEnabled = false
        SabqAnalytics.liteModeDeactivated()
    }

    /// Settings binding helper — keeps the toggle and the persisted
    /// flag in sync without duplicating the analytics-firing logic.
    func setManualEnabled(_ enabled: Bool) {
        if enabled { enableManually() } else { disableManually() }
    }

    /// Probe the network on demand. Placeholder until Phase 3 wires
    /// the HEAD-request speed probe; today it returns the cached
    /// `networkQuality`.
    @MainActor
    func checkNetworkQuality() async -> NetworkQuality {
        return networkQuality
    }

    /// Whether behavior-tracking events should fire. Caller side
    /// (BehaviorTracker) reads this; in Phase 1 it's a no-op gate the
    /// rest of the codebase can opt into.
    var shouldSuppressBehaviorTracking: Bool {
        isLiteActive
    }

    // MARK: - Internal

    /// Recompute the public `isLiteActive` / `trigger` from the
    /// persisted manual flag. Auto-trigger plumbing layers on later.
    private func recompute() {
        let manual = UserDefaults.standard.bool(forKey: storageKey)
        isLiteActive = manual
        trigger = manual ? .manual : .none
    }
}
