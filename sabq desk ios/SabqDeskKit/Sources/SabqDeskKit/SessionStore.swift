import Foundation
import Security

/// Where the member session lives between launches.
public protocol SessionStore: AnyObject, Sendable {
    func load() -> StaffSession?
    func save(_ session: StaffSession) throws
    func clear()
}

public enum SessionStoreError: Error, Equatable {
    case keychain(OSStatus)
}

/// Keychain-backed store. The item is device-only and readable after first
/// unlock so a notification tap on a locked phone can still load the inbox.
public final class KeychainSessionStore: SessionStore, @unchecked Sendable {
    private let service: String
    private let account: String
    private let lock = NSLock()

    public init(service: String = "com.sabq.desk.session", account: String = "member") {
        self.service = service
        self.account = account
    }

    private var baseQuery: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account]
    }

    public func load() -> StaffSession? {
        lock.lock(); defer { lock.unlock() }
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(StaffSession.self, from: data)
    }

    public func save(_ session: StaffSession) throws {
        lock.lock(); defer { lock.unlock() }
        let data = try JSONEncoder().encode(session)
        SecItemDelete(baseQuery as CFDictionary)
        var attributes = baseQuery
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else { throw SessionStoreError.keychain(status) }
    }

    public func clear() {
        lock.lock(); defer { lock.unlock() }
        SecItemDelete(baseQuery as CFDictionary)
    }
}

public final class InMemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var session: StaffSession?

    public init(session: StaffSession? = nil) {
        self.session = session
    }

    public func load() -> StaffSession? {
        lock.lock(); defer { lock.unlock() }
        return session
    }

    public func save(_ session: StaffSession) throws {
        lock.lock(); defer { lock.unlock() }
        self.session = session
    }

    public func clear() {
        lock.lock(); defer { lock.unlock() }
        session = nil
    }
}

/// A random per-install identifier sent as `X-Installation-Id` and stored with
/// the push token. Kept in UserDefaults so it resets on reinstall, matching
/// how the server treats a fresh install as a new device.
public enum InstallationID {
    private static let defaultsName = "sabqdesk.installation-id"

    public static func current(defaults: UserDefaults = .standard) -> String {
        if let existing = defaults.string(forKey: defaultsName), !existing.isEmpty {
            return existing
        }
        let fresh = UUID().uuidString.lowercased()
        defaults.set(fresh, forKey: defaultsName)
        return fresh
    }
}
