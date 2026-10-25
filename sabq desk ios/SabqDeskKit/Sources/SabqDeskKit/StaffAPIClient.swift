import Foundation

public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, URLResponse)
}

extension URLSession: HTTPTransport {
    public func send(_ request: URLRequest) async throws -> (Data, URLResponse) {
        try await data(for: request)
    }
}

/// Client for the Sabq Desk endpoints: member auth (`/api/v1/auth/*`), the
/// staff API (`/api/v1/staff/*`) and device registration
/// (`/api/v1/members/push-token`). Uses only the personal member session;
/// bot publisher tokens are never accepted here.
public struct StaffAPIClient: Sendable {
    public static let bundleID = "com.sabq.desk"
    public static let productionBaseURL = URL(string: "https://api.sabq.org")!

    public struct Configuration: Sendable {
        public var baseURL: URL
        public var installationID: String
        public var appVersion: String?

        public init(baseURL: URL = StaffAPIClient.productionBaseURL, installationID: String, appVersion: String? = nil) {
            self.baseURL = baseURL
            self.installationID = installationID
            self.appVersion = appVersion
        }
    }

    public let configuration: Configuration
    public let sessionStore: SessionStore
    private let transport: HTTPTransport

    public init(configuration: Configuration, sessionStore: SessionStore, transport: HTTPTransport = URLSession.shared) {
        self.configuration = configuration
        self.sessionStore = sessionStore
        self.transport = transport
    }

    public var hasSession: Bool {
        guard let session = sessionStore.load() else { return false }
        return !session.isExpired()
    }

    // MARK: - Auth

    /// `identifier` is an email when it contains `@`, otherwise a phone number.
    /// Clears any pre-existing session first so an interrupted or two-step login
    /// never falls back to a stale token in the store.
    public func login(identifier: String, password: String) async throws -> StaffLoginResult {
        sessionStore.clear()
        let trimmed = DeskInput.loginIdentifier(identifier)
        let body = LoginBody(email: trimmed.contains("@") ? trimmed : nil,
                             phone: trimmed.contains("@") ? nil : trimmed,
                             password: password,
                             deviceInfo: deviceInfo)
        let response: MemberAuthResponse = try await send("POST", "/api/v1/auth/login", body: body, authorized: false)
        return try handleAuth(response)
    }

    public func verifyTwoFactor(challengeToken: String, factor: StaffSecondFactor) async throws -> StaffSession {
        let body: VerifyBody
        switch factor {
        case .code(let code):
            body = VerifyBody(challengeToken: challengeToken, token: DeskInput.otpCode(code), backupCode: nil, deviceInfo: deviceInfo)
        case .backupCode(let code):
            body = VerifyBody(challengeToken: challengeToken, token: nil,
                              backupCode: DeskInput.backupCode(code), deviceInfo: deviceInfo)
        }
        let response: MemberAuthResponse = try await send("POST", "/api/v1/auth/verify-2fa", body: body, authorized: false)
        guard case .signedIn(let session) = try handleAuth(response) else {
            throw StaffAPIError.validation(message: response.message)
        }
        return session
    }

    /// Ends the server session; the local copy is cleared even if the call fails.
    public func logout() async {
        defer { sessionStore.clear() }
        let _: Ack? = try? await send("POST", "/api/v1/auth/logout", body: EmptyBody())
    }

    private func handleAuth(_ response: MemberAuthResponse) throws -> StaffLoginResult {
        if response.requires2FA == true, let challenge = response.challengeToken, !challenge.isEmpty {
            return .needsTwoFactor(challengeToken: challenge, message: response.message)
        }
        guard response.success == true, let token = response.token, let userId = response.user?.id else {
            throw StaffAPIError.validation(message: response.message)
        }
        let session = StaffSession(token: token, expiresAt: response.expiresAt, userId: userId)
        try sessionStore.save(session)
        return .signedIn(session)
    }

    // MARK: - Staff

    public func me() async throws -> StaffMe {
        try await send("GET", "/api/v1/staff/me")
    }

    public func inbox(_ query: StaffInboxQuery) async throws -> StaffInboxPage {
        try await send("GET", "/api/v1/staff/inbox", query: query.queryItems)
    }

    public func unreadCounts() async throws -> StaffUnreadCounts {
        try await send("GET", "/api/v1/staff/unread-counts")
    }

    public func ticket(id: String) async throws -> StaffTicketDetail {
        try await send("GET", "/api/v1/staff/tickets/\(try pathID(id))")
    }

    public func replyToTicket(id: String, message: String, parentMessageID: String? = nil) async throws -> StaffTicketReplyResult {
        let text = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw StaffAPIError.validation(message: "نص الرسالة مطلوب") }
        return try await send("POST", "/api/v1/staff/tickets/\(try pathID(id))/reply",
                              body: ReplyBody(message: text, parentMessageId: parentMessageID))
    }

    public func setTicketStatus(id: String, status: StaffTicketStatus) async throws -> StaffTicket {
        let envelope: StaffTicketEnvelope = try await send("PATCH", "/api/v1/staff/tickets/\(try pathID(id))/status",
                                                           body: StatusBody(status: status))
        return envelope.ticket
    }

    public func socialPost(id: String) async throws -> StaffSocialDetail {
        try await send("GET", "/api/v1/staff/social/\(try pathID(id))")
    }

    public func publishSocialPost(id: String) async throws -> StaffSocialPost {
        let envelope: StaffSocialPostEnvelope = try await send("POST", "/api/v1/staff/social/\(try pathID(id))/publish",
                                                               body: EmptyBody())
        return envelope.post
    }

    public func scheduleSocialPost(id: String, at date: Date) async throws -> StaffSocialPost {
        let body = ScheduleBody(scheduledAt: RiyadhTime.isoString(date))
        let envelope: StaffSocialPostEnvelope = try await send("POST", "/api/v1/staff/social/\(try pathID(id))/schedule",
                                                               body: body)
        return envelope.post
    }

    /// `reason` is required by the server unless the editor withdraws their own
    /// post; a blank one is omitted so the server answers 400 `validation_error`.
    public func rejectSocialPost(id: String, reason: String) async throws -> StaffSocialPost {
        let trimmed = reason.trimmingCharacters(in: .whitespacesAndNewlines)
        let body = RejectBody(reason: trimmed.isEmpty ? nil : String(trimmed.prefix(1000)))
        let envelope: StaffSocialPostEnvelope = try await send("POST", "/api/v1/staff/social/\(try pathID(id))/reject",
                                                               body: body)
        return envelope.post
    }

    /// Back to «بانتظار القرار»: unschedules a `scheduled` post or undoes the
    /// rejection of a `canceled` one. The server refuses any other status (409).
    public func returnSocialPostToDraft(id: String) async throws -> StaffSocialPost {
        let envelope: StaffSocialPostEnvelope = try await send("POST", "/api/v1/staff/social/\(try pathID(id))/return-to-draft",
                                                               body: EmptyBody())
        return envelope.post
    }

    // MARK: - System (admins)

    /// «حالة النظام»: AI model health and monthly budgets. 403 without `canSystemHealth`.
    public func systemHealth() async throws -> StaffSystemHealth {
        try await send("GET", "/api/v1/staff/system/health")
    }

    /// «تنبيهات الإدارة», urgent first. 403 without `canAdminAlerts`.
    public func adminAlerts() async throws -> StaffAdminAlerts {
        try await send("GET", "/api/v1/staff/alerts")
    }

    public func alertPrefs() async throws -> StaffAlertPrefs {
        try await send("GET", "/api/v1/staff/me/alert-prefs")
    }

    /// Sends only the switches being changed; returns both as stored.
    public func updateAlertPrefs(_ update: StaffAlertPrefsUpdate) async throws -> StaffAlertPrefs {
        try await send("PUT", "/api/v1/staff/me/alert-prefs", body: update)
    }

    // MARK: - Model balances (admins)

    /// «أرصدة النماذج», most urgent first. 403 without `canSystemHealth`.
    public func systemBalances() async throws -> StaffAIBalances {
        try await send("GET", "/api/v1/staff/system/balances")
    }

    /// One provider with its 30-day series and top-up history.
    public func systemBalance(provider: String) async throws -> StaffAIBalance {
        try await send("GET", "/api/v1/staff/system/balances/\(try balanceProvider(provider))")
    }

    /// «احفظ الرصيد»: a new top-up, the dashboard balance, or Gemini's budget.
    public func topUpBalance(provider: String, _ topup: StaffBalanceTopup) async throws -> StaffAIBalance {
        try await send("POST", "/api/v1/staff/system/balances/\(try balanceProvider(provider))/topup", body: topup)
    }

    /// «حدود التنبيه»: the low threshold (critical is a quarter of it).
    public func updateBalanceThreshold(provider: String, threshold: Double) async throws -> StaffAIBalance {
        try await send("PUT", "/api/v1/staff/system/balances/\(try balanceProvider(provider))/threshold",
                       body: StaffBalanceThresholdUpdate(threshold: threshold))
    }

    private func balanceProvider(_ provider: String) throws -> String {
        guard DeskBalanceCopy.isKnownProvider(provider) else { throw StaffAPIError.notFound(message: nil) }
        return provider
    }

    // MARK: - Push

    public func registerPushToken(_ token: String, deviceName: String?, osVersion: String?) async throws {
        let body = PushTokenBody(token: token,
                                 deviceName: deviceName,
                                 osVersion: osVersion,
                                 appVersion: configuration.appVersion,
                                 locale: Locale.current.language.languageCode?.identifier ?? "ar",
                                 timezone: TimeZone.current.identifier,
                                 bundleId: Self.bundleID,
                                 installationId: configuration.installationID)
        let _: Ack = try await send("POST", "/api/v1/members/push-token", body: body)
    }

    public func unregisterPushToken(_ token: String) async throws {
        let _: Ack = try await send("DELETE", "/api/v1/members/push-token", body: TokenOnlyBody(token: token))
    }

    // MARK: - Transport

    func makeRequest(_ method: String, _ path: String, query: [URLQueryItem] = [], body: Data? = nil,
                     authorized: Bool = true) throws -> URLRequest {
        guard var components = URLComponents(url: configuration.baseURL.appendingPathComponent(path),
                                             resolvingAgainstBaseURL: false) else {
            throw StaffAPIError.validation(message: nil)
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw StaffAPIError.validation(message: nil) }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(configuration.installationID, forHTTPHeaderField: "X-Installation-Id")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorized {
            guard let session = sessionStore.load(), !session.isExpired() else {
                sessionStore.clear()
                throw StaffAPIError.unauthorized(message: nil)
            }
            request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func send<Response: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = [],
                                           authorized: Bool = true) async throws -> Response {
        try await perform(makeRequest(method, path, query: query, authorized: authorized), authorized: authorized)
    }

    private func send<Response: Decodable, Body: Encodable>(_ method: String, _ path: String, body: Body,
                                                             authorized: Bool = true) async throws -> Response {
        let data = try StaffJSON.makeEncoder().encode(body)
        return try await perform(makeRequest(method, path, body: data, authorized: authorized), authorized: authorized)
    }

    private func perform<Response: Decodable>(_ request: URLRequest, authorized: Bool) async throws -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await transport.send(request)
        } catch {
            throw StaffAPIError.network(message: error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw StaffAPIError.network(message: "no HTTP response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let error = StaffAPIError.from(status: http.statusCode, data: data)
            if authorized, error.requiresSignIn { sessionStore.clear() }
            throw error
        }
        do {
            return try StaffJSON.makeDecoder().decode(Response.self, from: data)
        } catch {
            throw StaffAPIError.decoding(message: String(describing: error))
        }
    }

    /// Ids come from push payloads and URLs; anything outside the id alphabet
    /// is refused before it reaches a request path.
    private func pathID(_ id: String) throws -> String {
        guard DeskDeepLink.isValidID(id) else { throw StaffAPIError.notFound(message: nil) }
        return id
    }

    private var deviceInfo: DeviceInfo {
        DeviceInfo(platform: "ios", app: Self.bundleID, appVersion: configuration.appVersion,
                   installationId: configuration.installationID)
    }
}

// MARK: - Request bodies

private struct EmptyBody: Encodable {}
private struct Ack: Decodable {}

private struct DeviceInfo: Encodable {
    var platform: String
    var app: String
    var appVersion: String?
    var installationId: String
}

private struct LoginBody: Encodable {
    var email: String?
    var phone: String?
    var password: String
    var deviceInfo: DeviceInfo
}

private struct VerifyBody: Encodable {
    var challengeToken: String
    var token: String?
    var backupCode: String?
    var deviceInfo: DeviceInfo
}

private struct ReplyBody: Encodable {
    var message: String
    var parentMessageId: String?
}

private struct StatusBody: Encodable {
    var status: StaffTicketStatus
}

private struct ScheduleBody: Encodable {
    var scheduledAt: String
}

private struct RejectBody: Encodable {
    var reason: String?
}

private struct PushTokenBody: Encodable {
    var token: String
    var provider = "apns"
    var platform = "ios"
    var deviceName: String?
    var osVersion: String?
    var appVersion: String?
    var locale: String
    var timezone: String
    var bundleId: String
    var installationId: String
}

private struct TokenOnlyBody: Encodable {
    var token: String
}
