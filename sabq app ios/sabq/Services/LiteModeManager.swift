import Foundation
import Network
import Observation

// MARK: - Browsing mode enum

/// Three explicit modes the user picks from Settings.
/// Default is `.full` (everything renders normally).
enum SabqBrowsingMode: String, CaseIterable, Identifiable {
    case full = "full"
    case lite = "lite"
    case auto = "auto"

    var id: String { rawValue }

    var arabicLabel: String {
        switch self {
        case .full: return "التصفح الكامل"
        case .lite: return "سبق Lite"
        case .auto: return "تلقائي"
        }
    }

    var arabicSubtitle: String {
        switch self {
        case .full: return "كل الميزات والبلوكات"
        case .lite: return "أخبار فقط — أسرع وأخف"
        case .auto: return "يتبدّل حسب سرعة الاتصال"
        }
    }
}

// MARK: - Supporting types

enum LiteModeTrigger: String, Equatable {
    case manual, auto, none
}

enum NetworkQuality: String, Equatable {
    case good, poor, unknown
}

enum LiteBanner: Equatable {
    case autoActivated
    case recoveryOffered
}

// MARK: - Manager

@Observable
final class LiteModeManager {

    static let shared = LiteModeManager()

    // MARK: - Published state

    private(set) var isLiteActive: Bool = false
    private(set) var trigger: LiteModeTrigger = .none
    private(set) var networkQuality: NetworkQuality = .unknown
    private(set) var banner: LiteBanner?

    /// The user's explicit choice — persisted.
    var browsingMode: SabqBrowsingMode {
        didSet {
            UserDefaults.standard.set(browsingMode.rawValue, forKey: storageKey)
            applyMode()
        }
    }

    // MARK: - Storage

    private let storageKey = "sabqBrowsingMode"

    // MARK: - Auto-trigger state

    private var autoActive: Bool = false
    private var consecutiveGoodChecks: Int = 0

    // MARK: - Network probe

    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.sabq.lite-monitor")
    private var isMonitoring = false
    private var probeTask: Task<Void, Never>?

    private let probeURL = URL(string: "https://sabq.org/favicon.ico")!
    private let probeIntervalSeconds: UInt64 = 30
    private let poorLatencyMs: Double = 3000
    private let goodLatencyMs: Double = 1000

    // MARK: - Init

    private init() {
        let raw = UserDefaults.standard.string(forKey: storageKey) ?? "full"
        self.browsingMode = SabqBrowsingMode(rawValue: raw) ?? .full
        // Migrate legacy toggle users: if old key was true → treat as .lite
        if UserDefaults.standard.bool(forKey: "sabqLiteModeEnabled") {
            self.browsingMode = .lite
            UserDefaults.standard.removeObject(forKey: "sabqLiteModeEnabled")
            UserDefaults.standard.set("lite", forKey: storageKey)
        }
        applyMode()
    }

    // MARK: - Public API

    func startMonitoring() {
        guard !isMonitoring else { return }
        isMonitoring = true
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            if path.status != .satisfied {
                Task { @MainActor in
                    self.networkQuality = .poor
                    self.handleProbeResult(.poor)
                }
            } else {
                Task { @MainActor in await self.runProbeOnce() }
            }
        }
        monitor.start(queue: monitorQueue)
        if browsingMode == .auto { startProbeLoop() }
    }

    func stopMonitoring() {
        monitor.cancel()
        isMonitoring = false
        probeTask?.cancel()
        probeTask = nil
    }

    @MainActor
    func checkNetworkQuality() async -> NetworkQuality {
        await runProbeOnce()
        return networkQuality
    }

    func acceptRecovery() {
        autoActive = false
        consecutiveGoodChecks = 0
        banner = nil
        applyMode()
        SabqAnalytics.liteModeDeactivated()
    }

    func dismissRecovery() {
        banner = nil
        consecutiveGoodChecks = 0
    }

    func clearActivationBanner() {
        if banner == .autoActivated { banner = nil }
    }

    var shouldSuppressBehaviorTracking: Bool { isLiteActive }

    // MARK: - Internal

    private func applyMode() {
        switch browsingMode {
        case .full:
            isLiteActive = false
            trigger = .none
            autoActive = false
            banner = nil
            probeTask?.cancel()
            probeTask = nil
        case .lite:
            isLiteActive = true
            trigger = .manual
            autoActive = false
            banner = nil
            probeTask?.cancel()
            probeTask = nil
            SabqAnalytics.liteModeActivated(trigger: "manual")
        case .auto:
            isLiteActive = autoActive
            trigger = autoActive ? .auto : .none
            if isMonitoring { startProbeLoop() }
        }
    }

    private func startProbeLoop() {
        probeTask?.cancel()
        probeTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.runProbeOnce()
                try? await Task.sleep(nanoseconds: (self?.probeIntervalSeconds ?? 30) * 1_000_000_000)
            }
        }
    }

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
                verdict = networkQuality == .unknown ? .good : networkQuality
            }
            await MainActor.run {
                self.networkQuality = verdict
                self.handleProbeResult(verdict)
            }
        } catch {
            await MainActor.run {
                self.networkQuality = .poor
                self.handleProbeResult(.poor)
            }
        }
    }

    @MainActor
    private func handleProbeResult(_ quality: NetworkQuality) {
        guard browsingMode == .auto else { return }

        switch quality {
        case .poor:
            consecutiveGoodChecks = 0
            if !autoActive {
                autoActive = true
                applyMode()
                banner = .autoActivated
                SabqAnalytics.liteModeActivated(trigger: "auto")
            }
        case .good:
            if autoActive {
                consecutiveGoodChecks += 1
                if consecutiveGoodChecks >= 2 {
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
