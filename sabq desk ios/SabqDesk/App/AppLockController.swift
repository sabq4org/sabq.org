import Foundation
import LocalAuthentication
import Observation
import SabqDeskKit

/// Optional Face ID / Touch ID lock in front of the signed-in app.
///
/// This is an extra, local-only lock. It does not touch the server session:
/// the token stays in the Keychain, the server still enforces login + 2FA on
/// every request, and unlocking here never signs anyone in. Policy and state
/// live in SabqDeskKit (`AppLockState`, `AppLockPolicy`) and are unit tested.
@MainActor
@Observable
final class AppLockController {
    private(set) var state = AppLockState()
    private(set) var availability: BiometricAvailability = .notAvailable
    private(set) var isAuthenticating = false
    private(set) var errorMessage: String?
    private(set) var isEnabled: Bool

    private let preference: AppLockPreference
    private let hasSession: () -> Bool
    /// Prompt automatically once per lock / foreground, not in a loop after a cancel.
    @ObservationIgnored private var autoPromptPending = false

    init(preference: AppLockPreference = AppLockPreference(), hasSession: @escaping () -> Bool) {
        self.preference = preference
        self.hasSession = hasSession
        self.isEnabled = preference.isEnabled
        refreshAvailability()
        state.coldLaunch(enabled: isEnabled, hasSession: hasSession(), canAuthenticate: Self.canAuthenticate())
        autoPromptPending = state.isLocked
    }

    var isLocked: Bool { state.isLocked }

    /// Whether the lock currently guards this session (used for the privacy cover).
    var isGuarding: Bool {
        AppLockPolicy.isActive(enabled: isEnabled, hasSession: hasSession(), canAuthenticate: Self.canAuthenticate())
    }

    // MARK: - Scene lifecycle

    func didEnterBackground() {
        state.didEnterBackground(at: Date())
    }

    /// Called whenever the scene becomes active (including the first time).
    func didBecomeActive() {
        refreshAvailability()
        if state.backgroundedAt != nil {
            state.willEnterForeground(at: Date(), enabled: isEnabled, hasSession: hasSession(),
                                      canAuthenticate: Self.canAuthenticate())
            if state.isLocked { autoPromptPending = true }
        }
        if state.isLocked, autoPromptPending {
            autoPromptPending = false
            Task { await unlock() }
        }
    }

    /// The session ended (sign-out or 401): nothing left to guard.
    func sessionEnded() {
        state.unlock()
        errorMessage = nil
    }

    // MARK: - Unlock

    func unlock() async {
        guard state.isLocked, !isAuthenticating else { return }
        // If the device can no longer authenticate at all (passcode removed),
        // drop the local lock rather than strand the member; the server
        // session and 2FA still protect the account.
        guard Self.canAuthenticate() else {
            state.unlock()
            return
        }
        errorMessage = nil
        if await authenticate(reason: "افتح مكتب سبق") {
            state.unlock()
        }
    }

    // MARK: - Settings toggle

    /// Turning the lock on requires one successful check first, so a member
    /// cannot enable a lock they are unable to open.
    func setEnabled(_ enabled: Bool) async {
        errorMessage = nil
        guard enabled != isEnabled else { return }
        if enabled {
            refreshAvailability()
            guard availability.isAvailable else { return }
            guard await authenticate(reason: "تأكيد تفعيل قفل التطبيق") else { return }
        }
        isEnabled = enabled
        preference.isEnabled = enabled
        if !enabled { state.unlock() }
    }

    // MARK: - Sensitive actions

    enum SensitiveCheck: Equatable {
        case confirmed
        case cancelled
        case failed(String)
    }

    /// Face ID (or the device passcode) before an irreversible action such as
    /// «انشر الآن», whether or not the app lock is turned on. A device with no
    /// passcode cannot confirm, so the action is refused.
    func confirmSensitiveAction(reason: String) async -> SensitiveCheck {
        guard !isAuthenticating else { return .cancelled }
        guard Self.canAuthenticate() else {
            return .failed(BiometricAvailability.passcodeNotSet.unavailableReason ?? "فعّل رمز قفل الجهاز أولًا.")
        }
        // Do not leave this check's error on the lock screen.
        let previous = errorMessage
        errorMessage = nil
        let ok = await authenticate(reason: reason)
        let message = errorMessage
        errorMessage = previous
        if ok { return .confirmed }
        if let message { return .failed(message) }
        return .cancelled
    }

    func refreshAvailability() {
        availability = Self.currentAvailability()
    }

    // MARK: - LocalAuthentication

    private func authenticate(reason: String) async -> Bool {
        isAuthenticating = true
        defer { isAuthenticating = false }
        let context = LAContext()
        context.localizedCancelTitle = "إلغاء"
        do {
            // Biometrics first, with the device passcode as the system fallback.
            return try await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)
        } catch let error as LAError {
            switch error.code {
            case .userCancel, .appCancel, .systemCancel:
                break
            case .passcodeNotSet:
                errorMessage = BiometricAvailability.passcodeNotSet.unavailableReason
            default:
                errorMessage = "تعذر التحقق. حاول مرة أخرى."
            }
            return false
        } catch {
            errorMessage = "تعذر التحقق. حاول مرة أخرى."
            return false
        }
    }

    /// Biometrics or the device passcode can be used at all.
    private static func canAuthenticate() -> Bool {
        LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    private static func currentAvailability() -> BiometricAvailability {
        let context = LAContext()
        var error: NSError?
        let canUseBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        let kind = BiometricKind(context.biometryType)
        if canUseBiometrics, let kind { return .available(kind) }
        guard let error, error.domain == LAErrorDomain, let code = LAError.Code(rawValue: error.code) else {
            return .notAvailable
        }
        switch code {
        case .biometryNotEnrolled: return .notEnrolled(kind)
        case .biometryLockout: return .lockedOut(kind)
        case .passcodeNotSet: return .passcodeNotSet
        default: return .notAvailable
        }
    }
}

private extension BiometricKind {
    init?(_ type: LABiometryType) {
        switch type {
        case .faceID: self = .faceID
        case .touchID: self = .touchID
        case .opticID: self = .opticID
        case .none: return nil
        @unknown default: return nil
        }
    }
}
