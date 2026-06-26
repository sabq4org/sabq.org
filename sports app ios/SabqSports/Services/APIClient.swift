import Foundation

// عميل شبكة عام لتطبيق سبق الرياضي — نمط مطابق لتطبيق كأس آسيا (نقاط البوابة
// عامة بلا مصادقة في v1). يدعم:
//   - جلسة افتراضية بـ URLCache (ذاكرة 10ميجا + قرص 50ميجا).
//   - جلسة ephemeral بلا كاش (للتحديث اليدوي / pull-to-refresh عبر ignoreCache).
//   - get/post جنيسين مع apiRoot override (نستخدم publicAPI افتراضيًا).
// الـ actor يعزل حالة التوكن/CSRF (محجوزة للتوقّعات في v1.1). كل الأنواع
// nonisolated لأن SWIFT_DEFAULT_ACTOR_ISOLATION=MainActor على مستوى المشروع.
actor APIClient {
    static let shared = APIClient()

    private let baseURL = URLConstants.publicAPI
    private let session: URLSession
    private let ephemeralSession: URLSession
    private let decoder: JSONDecoder
    private var authToken: String?
    private var csrfToken: String?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        config.urlCache = URLCache(memoryCapacity: 10_000_000, diskCapacity: 50_000_000)
        config.httpMaximumConnectionsPerHost = 8
        config.requestCachePolicy = .useProtocolCachePolicy
        config.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "ar",
        ]
        session = URLSession(configuration: config)

        let ephemeralConfig = URLSessionConfiguration.ephemeral
        ephemeralConfig.timeoutIntervalForRequest = 15
        ephemeralConfig.timeoutIntervalForResource = 30
        ephemeralConfig.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        ephemeralConfig.urlCache = nil
        ephemeralConfig.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "ar",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
        ]
        ephemeralSession = URLSession(configuration: ephemeralConfig)

        decoder = JSONDecoder()
    }

    func setAuthToken(_ token: String?) { authToken = token }
    func setCsrfToken(_ token: String?) { csrfToken = token }

    func get<T: Decodable>(
        _ type: T.Type,
        path: String,
        query: [String: String] = [:],
        ignoreCache: Bool = false,
        apiRoot: String? = nil
    ) async throws -> T {
        var finalQuery = query
        if ignoreCache {
            finalQuery["_t"] = String(Int(Date().timeIntervalSince1970 * 1000))
            finalQuery["_nc"] = UUID().uuidString.prefix(8).lowercased()
        }
        let url = try buildURL(path: path, query: finalQuery, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        applyHeaders(&request)
        if ignoreCache {
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("no-cache, no-store, must-revalidate", forHTTPHeaderField: "Cache-Control")
            request.setValue("no-cache", forHTTPHeaderField: "Pragma")
            return try await decode(type, from: ephemeralSession, request: request)
        }
        return try await perform(request, as: type)
    }

    /// POST بجسم JSON — للمصادقة والمتابعة (يطبّق Bearer إن وُجد).
    func post<T: Decodable, B: Encodable>(
        _ type: T.Type,
        path: String,
        body: B,
        apiRoot: String? = nil
    ) async throws -> T {
        let url = try buildURL(path: path, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyHeaders(&request)
        request.httpBody = try JSONEncoder().encode(body)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return try await decode(type, from: session, request: request)
    }

    /// طلب بلا قراءة جسم الاستجابة (POST/DELETE للمتابعة). jsonBody مُرمَّز مسبقًا.
    @discardableResult
    func send(
        method: String,
        path: String,
        jsonBody: Data? = nil,
        query: [String: String] = [:],
        apiRoot: String? = nil
    ) async throws -> Int {
        let url = try buildURL(path: path, query: query, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = method
        applyHeaders(&request)
        if let jsonBody { request.httpBody = jsonBody }
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        try ensureSuccess(http, data: data)
        return http.statusCode
    }

    /// طلب بأي HTTP method يقرأ ويفكّ جسم الاستجابة (PUT للتفضيلات).
    func requestJSON<T: Decodable, B: Encodable>(
        _ type: T.Type,
        method: String,
        path: String,
        body: B,
        apiRoot: String? = nil
    ) async throws -> T {
        let url = try buildURL(path: path, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = method
        applyHeaders(&request)
        request.httpBody = try JSONEncoder().encode(body)
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        return try await decode(type, from: session, request: request)
    }

    static func deviceInfo() -> SpDeviceInfo {
        let b = Bundle.main
        let v = (b.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "?"
        let build = (b.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
        return SpDeviceInfo(
            platform: "ios",
            osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
            appVersion: "\(v) (\(build))",
            deviceName: "iPhone",
            deviceId: nil
        )
    }

    // MARK: - Internals

    private func buildURL(path: String, query: [String: String] = [:], apiRoot: String? = nil) throws -> URL {
        let sanitizedPath = path
            .components(separatedBy: "/")
            .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? $0 }
            .joined(separator: "/")
        let fullPath = sanitizedPath.hasPrefix("/") ? sanitizedPath : "/\(sanitizedPath)"
        let root = apiRoot ?? baseURL
        guard var components = URLComponents(string: root + fullPath) else { throw APIError.invalidURL }
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw APIError.invalidURL }
        return url
    }

    private func applyHeaders(_ request: inout URLRequest) {
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let csrf = csrfToken {
            request.setValue(csrf, forHTTPHeaderField: "X-CSRF-TOKEN")
        }
    }

    private func perform<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        try await decode(type, from: session, request: request)
    }

    private func decode<T: Decodable>(_ type: T.Type, from session: URLSession, request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        try ensureSuccess(http, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[APIClient] decode failed for \(request.url?.path ?? "?"): \(error)")
            #endif
            throw APIError.decoding(error)
        }
    }

    private func ensureSuccess(_ http: HTTPURLResponse, data: Data) throws {
        switch http.statusCode {
        case 200..<300: return
        case 401: throw APIError.unauthorized
        case 403: throw APIError.forbidden
        case 404: throw APIError.notFound
        case 429: throw APIError.rateLimited
        default:
            let message = (try? JSONDecoder().decode(ApiMessage.self, from: data))?.message
            throw APIError.server(http.statusCode, message)
        }
    }
}

nonisolated enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case decoding(Error)
    case server(Int, String?)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "رابط غير صالح"
        case .invalidResponse: return "استجابة غير صالحة من الخادم"
        case .unauthorized: return "انتهت جلستك، يرجى تسجيل الدخول"
        case .forbidden: return "ليس لديك صلاحية"
        case .notFound: return "غير موجود"
        case .rateLimited: return "طلبات كثيرة، حاول لاحقًا"
        case .decoding: return "تعذّر قراءة البيانات"
        case .server(let code, let msg): return msg ?? "خطأ في الخادم (\(code))"
        }
    }
}

private struct ApiMessage: Decodable { let message: String? }
