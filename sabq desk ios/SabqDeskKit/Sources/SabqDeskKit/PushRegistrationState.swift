import Foundation

/// Tracks which account this device's APNs token is bound to on the server.
/// The server upserts `push_devices` by token, so re-registering the same
/// token under another account moves it; the app must therefore register
/// again whenever the signed-in user differs from the last registered one.
public struct PushRegistrationState: Sendable, Equatable {
    public private(set) var deviceToken: String?
    public private(set) var registeredToken: String?
    public private(set) var registeredUserID: String?

    public init() {}

    public mutating func receive(deviceToken: String) {
        self.deviceToken = deviceToken
    }

    /// The token to send for `userID`, or nil when it is already bound to that user.
    public func tokenToRegister(for userID: String?) -> String? {
        guard let deviceToken, let userID, !userID.isEmpty else { return nil }
        if deviceToken == registeredToken, userID == registeredUserID { return nil }
        return deviceToken
    }

    public mutating func markRegistered(token: String, userID: String) {
        registeredToken = token
        registeredUserID = userID
    }

    /// Forget the server binding (sign-out or any session loss) but keep the
    /// device token so the next account can claim it.
    public mutating func resetBinding() {
        registeredToken = nil
        registeredUserID = nil
    }
}
