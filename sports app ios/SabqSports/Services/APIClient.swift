import Foundation
#if canImport(UIKit)
import UIKit
#endif

extension Notification.Name {
    nonisolated static let spSessionUnauthorized = Notification.Name("com.sabq.sports.sessionUnauthorized")
}

// عميل شبكة عام لتطبيق VARA الرياضي — نمط مطابق لتطبيق كأس آسيا (نقاط البوابة
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
    // لغة الواجهة الحالية — تُمرَّر كـ Accept-Language لكل طلب فتُفضّل البوابة
    // المحتوى الإنجليزي عند دعمه. تُحدَّث من SpLanguage عبر setPreferredLanguage.
    private var preferredLanguage: String = "ar"
    /// يمنع عاصفة 401 من مسح الجلسة قبل التأكد من /members/profile.
    private var unauthorizedProbeTask: Task<Void, Never>?

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
    func setPreferredLanguage(_ code: String) { preferredLanguage = code }

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
        try ensureSuccess(http, data: data, request: request)
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
        #if canImport(UIKit)
        let installationId = UIDevice.current.identifierForVendor?.uuidString
        let osVersion = UIDevice.current.systemVersion
        let deviceName = UIDevice.current.model
        #else
        let installationId: String? = nil
        let osVersion = ProcessInfo.processInfo.operatingSystemVersionString
        let deviceName = "iPhone"
        #endif
        return SpDeviceInfo(
            platform: "ios",
            osVersion: osVersion,
            appVersion: "\(v) (\(build))",
            deviceName: deviceName,
            deviceId: installationId
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
        // يتجاوز الـ Accept-Language الثابت في إعداد الجلسة باللغة النشطة.
        request.setValue(preferredLanguage, forHTTPHeaderField: "Accept-Language")
        // Bearer فقط لمسارات عضوية الموبايل (/api/v1). إرفاقه ببوابة /api/sports
        // العامة كان يسبب خروجًا قسريًا: نقاط مثل /match/:id/preview و/story
        // محمية بجلسة Passport للتحرير فترجع 401، والعميل كان يفسّر أي
        // Bearer+401 كـ«انتهت الجلسة» ويمسح Keychain خلال دقائق من الدخول.
        if let token = authToken, isMobileMemberAPI(request) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let csrf = csrfToken {
            request.setValue(csrf, forHTTPHeaderField: "X-CSRF-TOKEN")
        }
    }

    /// مسارات `/api/v1/*` فقط — عضوية Bearer. الباقي (بوابة الرياضة العامة) زائر.
    private func isMobileMemberAPI(_ request: URLRequest) -> Bool {
        let path = request.url?.path ?? ""
        return path.hasPrefix("/api/v1/") || path == "/api/v1"
    }

    private func perform<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        try await decode(type, from: session, request: request)
    }

    private func decode<T: Decodable>(_ type: T.Type, from session: URLSession, request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        try ensureSuccess(http, data: data, request: request)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[APIClient] decode failed for \(request.url?.path ?? "?"): \(error)")
            #endif
            throw APIError.decoding(error)
        }
    }

    private func ensureSuccess(_ http: HTTPURLResponse, data: Data, request: URLRequest) throws {
        switch http.statusCode {
        case 200..<300: return
        case 401:
            // 401 في مسارات الدخول / حذف الحساب / تغيير كلمة المرور = اعتماد خاطئ،
            // لا انتهاء الجلسة. غيرها من /api/v1 مع Bearer → نؤكّد قبل المسح.
            let path = request.url?.path ?? ""
            let isCredentialCheck =
                path.contains("/auth/")
                || path.hasSuffix("/members/account")
                || path.contains("/members/change-password")
            let hadBearer = request.value(forHTTPHeaderField: "Authorization") != nil
            if hadBearer && isMobileMemberAPI(request) && !isCredentialCheck {
                scheduleUnauthorizedConfirmation()
            }
            throw APIError.unauthorized
        case 403: throw APIError.forbidden
        case 404: throw APIError.notFound
        case 429: throw APIError.rateLimited
        default:
            let message = (try? JSONDecoder().decode(ApiMessage.self, from: data))?.message
            throw APIError.server(http.statusCode, message)
        }
    }

    /// لا نمسح الجلسة من أول 401: نعِد التحقق من /members/profile. إن بقي التوكن
    /// صالحًا نتجاهل الإنذار (401 زائف/مسار فرعي). وإلا نُبلّغ AuthStore.
    private func scheduleUnauthorizedConfirmation() {
        guard authToken != nil else { return }
        guard unauthorizedProbeTask == nil else { return }
        unauthorizedProbeTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)
            let stillInvalid = await self.probeSessionStillUnauthorized()
            await self.clearUnauthorizedProbeTask()
            guard stillInvalid else { return }
            await self.wipeAuthTokenAndNotify()
        }
    }

    private func clearUnauthorizedProbeTask() {
        unauthorizedProbeTask = nil
    }

    private func probeSessionStillUnauthorized() async -> Bool {
        guard let token = authToken else { return true }
        guard let url = URL(string: URLConstants.mobileAPI + "/members/profile") else { return false }
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue(preferredLanguage, forHTTPHeaderField: "Accept-Language")
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        do {
            let (_, response) = try await ephemeralSession.data(for: req)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            // 401/403 فقط = رفض جلسة مؤكّد. أخطاء الشبكة/5xx لا تطرد العضو.
            return code == 401 || code == 403
        } catch {
            return false
        }
    }

    private func wipeAuthTokenAndNotify() {
        guard authToken != nil else { return }
        authToken = nil
        Task { @MainActor in
            NotificationCenter.default.post(name: .spSessionUnauthorized, object: nil)
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
        case .invalidURL: return L("رابط غير صالح")
        case .invalidResponse: return L("استجابة غير صالحة من الخادم")
        case .unauthorized: return L("انتهت جلستك، يرجى تسجيل الدخول")
        case .forbidden: return L("ليس لديك صلاحية")
        case .notFound: return L("غير موجود")
        case .rateLimited: return L("طلبات كثيرة، حاول لاحقًا")
        case .decoding: return L("تعذّر قراءة البيانات")
        case .server(let code, let msg): return msg ?? Lf("خطأ في الخادم (%d)", code)
        }
    }
}

private nonisolated struct ApiMessage: Decodable { let message: String? }
