import XCTest
@testable import SabqDeskKit

final class PushRegistrationStateTests: XCTestCase {
    func testNothingToRegisterWithoutTokenOrUser() {
        var state = PushRegistrationState()
        XCTAssertNil(state.tokenToRegister(for: "user-a"))
        state.receive(deviceToken: "apns-1")
        XCTAssertNil(state.tokenToRegister(for: nil))
        XCTAssertNil(state.tokenToRegister(for: ""))
    }

    func testRegistersOncePerUser() {
        var state = PushRegistrationState()
        state.receive(deviceToken: "apns-1")
        XCTAssertEqual(state.tokenToRegister(for: "user-a"), "apns-1")
        state.markRegistered(token: "apns-1", userID: "user-a")
        XCTAssertNil(state.tokenToRegister(for: "user-a"))
    }

    func testAnotherUserRegistersSameToken() {
        var state = PushRegistrationState()
        state.receive(deviceToken: "apns-1")
        state.markRegistered(token: "apns-1", userID: "user-a")
        XCTAssertEqual(state.tokenToRegister(for: "user-b"), "apns-1")
    }

    func testSessionLossThenSameUserRegistersAgain() {
        var state = PushRegistrationState()
        state.receive(deviceToken: "apns-1")
        state.markRegistered(token: "apns-1", userID: "user-a")
        state.resetBinding()
        XCTAssertNil(state.registeredToken)
        XCTAssertNil(state.registeredUserID)
        XCTAssertEqual(state.deviceToken, "apns-1")
        XCTAssertEqual(state.tokenToRegister(for: "user-a"), "apns-1")
    }

    func testRotatedDeviceTokenRegistersAgain() {
        var state = PushRegistrationState()
        state.receive(deviceToken: "apns-1")
        state.markRegistered(token: "apns-1", userID: "user-a")
        state.receive(deviceToken: "apns-2")
        XCTAssertEqual(state.tokenToRegister(for: "user-a"), "apns-2")
    }
}
