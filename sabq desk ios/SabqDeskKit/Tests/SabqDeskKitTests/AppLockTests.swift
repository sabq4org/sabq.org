import XCTest
@testable import SabqDeskKit

final class AppLockTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    // MARK: - Policy

    func testGracePeriodIsSixtySeconds() {
        XCTAssertEqual(AppLockPolicy.backgroundGracePeriod, 60)
    }

    func testActiveOnlyWhenEnabledSignedInAndAuthenticatable() {
        XCTAssertTrue(AppLockPolicy.isActive(enabled: true, hasSession: true, canAuthenticate: true))
        XCTAssertFalse(AppLockPolicy.isActive(enabled: false, hasSession: true, canAuthenticate: true))
        XCTAssertFalse(AppLockPolicy.isActive(enabled: true, hasSession: false, canAuthenticate: true))
        XCTAssertFalse(AppLockPolicy.isActive(enabled: true, hasSession: true, canAuthenticate: false))
    }

    func testRequiresUnlockAfterGracePeriod() {
        XCTAssertFalse(AppLockPolicy.requiresUnlock(backgroundedAt: nil, now: t0))
        XCTAssertFalse(AppLockPolicy.requiresUnlock(backgroundedAt: t0, now: t0.addingTimeInterval(59.9)))
        XCTAssertTrue(AppLockPolicy.requiresUnlock(backgroundedAt: t0, now: t0.addingTimeInterval(60)))
        XCTAssertTrue(AppLockPolicy.requiresUnlock(backgroundedAt: t0, now: t0.addingTimeInterval(3600)))
    }

    func testClockMovingBackwardsLocks() {
        XCTAssertTrue(AppLockPolicy.requiresUnlock(backgroundedAt: t0, now: t0.addingTimeInterval(-5)))
    }

    // MARK: - State

    func testColdLaunchLocksWhenEnabled() {
        var state = AppLockState()
        state.coldLaunch(enabled: true, hasSession: true, canAuthenticate: true)
        XCTAssertTrue(state.isLocked)
        state.unlock()
        XCTAssertFalse(state.isLocked)
    }

    func testColdLaunchStaysOpenWhenDisabledSignedOutOrUnavailable() {
        var state = AppLockState()
        state.coldLaunch(enabled: false, hasSession: true, canAuthenticate: true)
        XCTAssertFalse(state.isLocked)
        state.coldLaunch(enabled: true, hasSession: false, canAuthenticate: true)
        XCTAssertFalse(state.isLocked)
        state.coldLaunch(enabled: true, hasSession: true, canAuthenticate: false)
        XCTAssertFalse(state.isLocked)
    }

    func testShortBackgroundDoesNotLock() {
        var state = AppLockState()
        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(30), enabled: true, hasSession: true, canAuthenticate: true)
        XCTAssertFalse(state.isLocked)
        XCTAssertNil(state.backgroundedAt)
    }

    func testLongBackgroundLocks() {
        var state = AppLockState()
        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(61), enabled: true, hasSession: true, canAuthenticate: true)
        XCTAssertTrue(state.isLocked)
    }

    func testLongBackgroundDoesNotLockWhenDisabledOrUnavailable() {
        var state = AppLockState()
        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(600), enabled: false, hasSession: true, canAuthenticate: true)
        XCTAssertFalse(state.isLocked)

        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(600), enabled: true, hasSession: true, canAuthenticate: false)
        XCTAssertFalse(state.isLocked)

        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(600), enabled: true, hasSession: false, canAuthenticate: true)
        XCTAssertFalse(state.isLocked)
    }

    func testRepeatedBackgroundKeepsEarliestTime() {
        var state = AppLockState()
        state.didEnterBackground(at: t0)
        state.didEnterBackground(at: t0.addingTimeInterval(50))
        state.willEnterForeground(at: t0.addingTimeInterval(65), enabled: true, hasSession: true, canAuthenticate: true)
        XCTAssertTrue(state.isLocked)
    }

    func testStaysLockedIfNotUnlockedBeforeNextForeground() {
        var state = AppLockState()
        state.coldLaunch(enabled: true, hasSession: true, canAuthenticate: true)
        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(5), enabled: true, hasSession: true, canAuthenticate: true)
        XCTAssertTrue(state.isLocked, "a short trip to the background must not clear an existing lock")
    }

    func testCustomGracePeriod() {
        var state = AppLockState(gracePeriod: 10)
        state.didEnterBackground(at: t0)
        state.willEnterForeground(at: t0.addingTimeInterval(10), enabled: true, hasSession: true, canAuthenticate: true)
        XCTAssertTrue(state.isLocked)
    }

    // MARK: - Availability copy

    func testAvailabilityTitlesAndReasons() {
        XCTAssertEqual(BiometricAvailability.available(.faceID).toggleTitle, "قفل التطبيق بـ Face ID")
        XCTAssertEqual(BiometricAvailability.available(.touchID).toggleTitle, "قفل التطبيق بـ Touch ID")
        XCTAssertEqual(BiometricAvailability.notAvailable.toggleTitle, "قفل التطبيق بـ Face ID")
        XCTAssertTrue(BiometricAvailability.available(.faceID).isAvailable)
        XCTAssertNil(BiometricAvailability.available(.faceID).unavailableReason)

        let unavailable: [BiometricAvailability] = [
            .notEnrolled(.faceID), .notEnrolled(nil), .passcodeNotSet, .lockedOut(.touchID), .notAvailable,
        ]
        for availability in unavailable {
            XCTAssertFalse(availability.isAvailable)
            XCTAssertFalse(availability.unavailableReason?.isEmpty ?? true, "\(availability)")
        }
        XCTAssertTrue(BiometricAvailability.notEnrolled(.touchID).unavailableReason?.contains("Touch ID") == true)
    }

    // MARK: - Preference

    func testPreferenceDefaultsOffAndPersists() throws {
        let suite = "AppLockTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        let preference = AppLockPreference(defaults: defaults)
        XCTAssertFalse(preference.isEnabled)
        preference.isEnabled = true
        XCTAssertTrue(AppLockPreference(defaults: defaults).isEnabled)
        preference.isEnabled = false
        XCTAssertFalse(AppLockPreference(defaults: defaults).isEnabled)
    }
}
