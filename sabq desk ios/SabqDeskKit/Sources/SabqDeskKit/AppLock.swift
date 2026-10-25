import Foundation

// Local Face ID / Touch ID app lock.
//
// This is an *extra* on-device lock in front of an already signed-in session.
// It never replaces the server login or the mandatory 2FA: the session token
// stays in the Keychain and every request is still authorised by the server.
// The types here are pure logic so they can be unit tested without
// LocalAuthentication; the app target maps `LAContext` results onto them.

/// The biometric sensor the device offers.
public enum BiometricKind: String, Sendable, Equatable, CaseIterable {
    case faceID
    case touchID
    case opticID

    /// Product name as Apple writes it (kept in Latin script inside Arabic UI).
    public var displayName: String {
        switch self {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        }
    }

    public var systemImage: String {
        switch self {
        case .faceID: return "faceid"
        case .touchID: return "touchid"
        case .opticID: return "opticid"
        }
    }
}

/// Whether the device can offer the biometric app lock, and why not.
public enum BiometricAvailability: Sendable, Equatable {
    case available(BiometricKind)
    /// The sensor exists but no face / finger is enrolled.
    case notEnrolled(BiometricKind?)
    /// No device passcode, so iOS disables biometrics entirely.
    case passcodeNotSet
    /// Temporarily locked out after too many failed attempts.
    case lockedOut(BiometricKind?)
    /// No sensor, or biometrics are restricted on this device.
    case notAvailable

    public var isAvailable: Bool {
        if case .available = self { return true }
        return false
    }

    public var kind: BiometricKind? {
        switch self {
        case .available(let kind): return kind
        case .notEnrolled(let kind), .lockedOut(let kind): return kind
        case .passcodeNotSet, .notAvailable: return nil
        }
    }

    /// Settings toggle title, e.g. «قفل التطبيق بـ Face ID».
    public var toggleTitle: String {
        "قفل التطبيق بـ \((kind ?? .faceID).displayName)"
    }

    /// Arabic explanation shown under a disabled toggle; nil when available.
    public var unavailableReason: String? {
        switch self {
        case .available:
            return nil
        case .notEnrolled(let kind):
            let name = (kind ?? .faceID).displayName
            return "لم يُعدّ \(name) على هذا الجهاز. فعّله من إعدادات iPhone ثم عُد إلى هنا."
        case .passcodeNotSet:
            return "يتطلب القفل رمز دخول للجهاز. عيّن رمز الدخول من إعدادات iPhone أولاً."
        case .lockedOut(let kind):
            let name = (kind ?? .faceID).displayName
            return "تم إيقاف \(name) مؤقتاً بعد محاولات فاشلة. افتح قفل الجهاز برمز الدخول ثم أعد المحاولة."
        case .notAvailable:
            return "هذا الجهاز لا يدعم القفل بالبصمة أو بالوجه."
        }
    }
}

/// When the app lock engages.
public enum AppLockPolicy {
    /// Returning from the background within this window does not ask again.
    public static let backgroundGracePeriod: TimeInterval = 60

    /// The lock only guards a signed-in session and only when the user turned
    /// it on and the device can actually authenticate (biometrics or passcode).
    /// If the device cannot authenticate at all we never lock, so a member is
    /// not stranded; the server session and 2FA still protect the account.
    public static func isActive(enabled: Bool, hasSession: Bool, canAuthenticate: Bool) -> Bool {
        enabled && hasSession && canAuthenticate
    }

    /// Whether coming back to the foreground must re-authenticate.
    /// A clock that moved backwards (`now < backgroundedAt`) locks, to be safe.
    public static func requiresUnlock(backgroundedAt: Date?, now: Date,
                                      gracePeriod: TimeInterval = backgroundGracePeriod) -> Bool {
        guard let backgroundedAt else { return false }
        let elapsed = now.timeIntervalSince(backgroundedAt)
        return elapsed < 0 || elapsed >= gracePeriod
    }
}

/// Lock state across launch, background and foreground transitions.
public struct AppLockState: Sendable, Equatable {
    public private(set) var isLocked: Bool = false
    public private(set) var backgroundedAt: Date?
    public let gracePeriod: TimeInterval

    public init(gracePeriod: TimeInterval = AppLockPolicy.backgroundGracePeriod) {
        self.gracePeriod = gracePeriod
    }

    /// Cold launch: lock immediately when the lock is active.
    public mutating func coldLaunch(enabled: Bool, hasSession: Bool, canAuthenticate: Bool) {
        backgroundedAt = nil
        isLocked = AppLockPolicy.isActive(enabled: enabled, hasSession: hasSession, canAuthenticate: canAuthenticate)
    }

    /// Remember when the app left the screen. Keeps the earliest time if the
    /// system reports background twice without a foreground in between.
    public mutating func didEnterBackground(at date: Date) {
        if backgroundedAt == nil { backgroundedAt = date }
    }

    /// Back in the foreground: lock if the grace period has passed.
    public mutating func willEnterForeground(at date: Date, enabled: Bool, hasSession: Bool, canAuthenticate: Bool) {
        defer { backgroundedAt = nil }
        guard AppLockPolicy.isActive(enabled: enabled, hasSession: hasSession, canAuthenticate: canAuthenticate) else {
            isLocked = false
            return
        }
        if AppLockPolicy.requiresUnlock(backgroundedAt: backgroundedAt, now: date, gracePeriod: gracePeriod) {
            isLocked = true
        }
    }

    /// Successful authentication, the lock was turned off, or the session ended.
    public mutating func unlock() {
        isLocked = false
        backgroundedAt = nil
    }
}

/// The user's choice, stored on this device only (not synced, not on the server).
public struct AppLockPreference: @unchecked Sendable {
    public static let defaultsKey = "sabqdesk.app-lock-enabled"
    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    public var isEnabled: Bool {
        get { defaults.bool(forKey: Self.defaultsKey) }
        nonmutating set { defaults.set(newValue, forKey: Self.defaultsKey) }
    }
}
