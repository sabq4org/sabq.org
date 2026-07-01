import Foundation
import Security
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Keychain Helper

nonisolated private enum KeychainHelper {
    static func save(_ value: String, forKey key: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "org.sabq.app"
        ]
        SecItemDelete(query as CFDictionary)
        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    static func load(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "org.sabq.app",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecAttrService as String: "org.sabq.app"
        ]
        SecItemDelete(query as CFDictionary)
    }
}

actor APIClient {
    static let shared = APIClient()

    private let baseURL = URLConstants.mobileAPI
    private let publicAPIBaseURL = URLConstants.publicAPI
    private let session: URLSession
    private let ephemeralSession: URLSession
    /// For slow endpoints (multi-image upload, AI generation). The default
    /// session caps the WHOLE request at `timeoutIntervalForResource = 30s`,
    /// which silently kills 30s+ AI calls (e.g. image generation ~32s) even
    /// when the caller passes a longer per-request `timeoutInterval`. This
    /// session lifts the resource cap so those calls can complete.
    private let longSession: URLSession
    private let decoder: JSONDecoder
    private var authToken: String?
    private var csrfToken: String?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        // 30/100 MB was too generous for a news app dominated by image-rich
        // responses — each paginated payload is 5-10 MB so we churned the
        // cache constantly without keeping much value. 10/50 MB matches
        // the working set (one home feed + ~5 recent article details) and
        // halves the memory footprint on cold start.
        config.urlCache = URLCache(
            memoryCapacity: 10_000_000,
            diskCapacity: 50_000_000
        )
        config.httpMaximumConnectionsPerHost = 8
        config.requestCachePolicy = .useProtocolCachePolicy
        config.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "ar"
        ]
        session = URLSession(configuration: config)
        decoder = JSONDecoder()

        let ephemeralConfig = URLSessionConfiguration.ephemeral
        ephemeralConfig.timeoutIntervalForRequest = 15
        ephemeralConfig.timeoutIntervalForResource = 30
        ephemeralConfig.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        ephemeralConfig.urlCache = nil
        ephemeralConfig.httpCookieStorage = HTTPCookieStorage.shared
        ephemeralConfig.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "ar",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache"
        ]
        ephemeralSession = URLSession(configuration: ephemeralConfig)

        let longConfig = URLSessionConfiguration.default
        longConfig.timeoutIntervalForRequest = 210
        longConfig.timeoutIntervalForResource = 210
        longConfig.urlCache = nil
        longConfig.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        longConfig.httpAdditionalHeaders = [
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Accept-Language": "ar"
        ]
        longSession = URLSession(configuration: longConfig)

        // Migrate from UserDefaults to Keychain (one-time)
        if let legacyToken = UserDefaults.standard.string(forKey: "sabq_auth_token") {
            KeychainHelper.save(legacyToken, forKey: "sabq_auth_token")
            UserDefaults.standard.removeObject(forKey: "sabq_auth_token")
            authToken = legacyToken
        } else {
            authToken = KeychainHelper.load(forKey: "sabq_auth_token")
        }
    }

    // MARK: - Auth

    func setAuthToken(_ token: String?) {
        authToken = token
        if let token {
            KeychainHelper.save(token, forKey: "sabq_auth_token")
        } else {
            KeychainHelper.delete(forKey: "sabq_auth_token")
        }
    }

    func getAuthToken() -> String? { authToken }

    /// Retained as a no-op for callsite compatibility — `setAuthToken`
    /// already persists the Bearer token to Keychain, which is the only
    /// signal `hasSession` consults now. The previous implementation
    /// wrote a `sabq_is_authenticated` boolean to UserDefaults; that
    /// flag was both redundant (token presence is the truth) and a
    /// tamper-risk (plaintext, manipulable from the Settings app).
    func markAuthenticated() {
        // Intentionally empty — see Keychain-token-driven `hasSession`.
        // Migration: clear the legacy UserDefaults key if it's still there.
        UserDefaults.standard.removeObject(forKey: "sabq_is_authenticated")
    }

    func markLoggedOut() {
        authToken = nil
        csrfToken = nil
        KeychainHelper.delete(forKey: "sabq_auth_token")
        // Also drop the legacy boolean in case an older build wrote it.
        UserDefaults.standard.removeObject(forKey: "sabq_is_authenticated")
        guard let url = URL(string: baseURL) else { return }
        if let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            for cookie in cookies { HTTPCookieStorage.shared.deleteCookie(cookie) }
        }
    }

    /// True when a Bearer token is held in memory (loaded from Keychain
    /// on init). Replaces the prior UserDefaults flag — keychain
    /// presence is now the single source of truth so the session can't
    /// be flipped on by editing UserDefaults from outside the app.
    var hasSession: Bool {
        authToken != nil
    }

    // MARK: - CSRF

    private func ensureCSRF() async {
        guard csrfToken == nil else { return }
        guard let url = URL(string: URLConstants.csrfToken) else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let (data, _) = try? await session.data(for: request),
           let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let token = dict["csrfToken"] as? String {
            csrfToken = token
        }
    }

    // MARK: - Generic Requests

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

    func post<T: Decodable>(_ type: T.Type, path: String, body: Encodable? = nil, apiRoot: String? = nil, timeout: TimeInterval? = nil) async throws -> T {
        let url = try buildURL(path: path, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyHeaders(&request)
        // Per-request override for slow endpoints (e.g. image-heavy article
        // submission). The shared session default is 15s which is fine for
        // JSON reads but kills multi-image uploads mid-flight → "انتهت مهلة
        // الطلب". Callers can pass a longer budget without slowing the rest.
        if let timeout {
            request.timeoutInterval = timeout
            if let body {
                request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
            }
            // Use the long-timeout session so the 30s session-level resource
            // cap doesn't abort genuinely slow calls (AI generation, uploads).
            return try await decode(type, from: longSession, request: request)
        }
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        return try await perform(request, as: type)
    }

    /// Single shared helper that converts a `URLResponse` into either a
    /// success ack or a thrown `APIError`. Replaces the five copies of
    /// `guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { throw APIError.serverError(...) }`
    /// that drifted across the file (postRaw, deleteRaw ×2, pushTokenDelete,
    /// updateNotificationPreferences). Centralising means future status-code
    /// handling (e.g. surfacing 401 as APIError.unauthorized) lives in one
    /// spot.
    private func ensureSuccess(_ response: URLResponse) throws {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 500
        if (200...299).contains(status) { return }
        if status == 401 { throw APIError.unauthorized }
        if status == 403 { throw APIError.forbidden }
        if status == 404 { throw APIError.notFound }
        if status == 429 { throw APIError.rateLimited }
        throw APIError.serverError(status)
    }

    func postRaw(path: String, body: Encodable? = nil, apiRoot: String? = nil) async throws {
        let url = try buildURL(path: path, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (_, response) = try await session.data(for: request)
        try ensureSuccess(response)
    }

    func deleteRaw(path: String, apiRoot: String? = nil) async throws {
        let url = try buildURL(path: path, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        applyHeaders(&request)
        let (_, response) = try await session.data(for: request)
        try ensureSuccess(response)
    }

    func patch<T: Decodable>(_ type: T.Type, path: String, body: Encodable? = nil) async throws -> T {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        return try await perform(request, as: type)
    }

    func put<T: Decodable>(_ type: T.Type, path: String, body: Encodable? = nil) async throws -> T {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        return try await perform(request, as: type)
    }

    func deleteRequest<T: Decodable>(_ type: T.Type, path: String, body: Encodable? = nil) async throws -> T {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        return try await perform(request, as: type)
    }

    func deleteRaw(path: String, body: Encodable? = nil) async throws {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (_, response) = try await session.data(for: request)
        try ensureSuccess(response)
    }

    // MARK: - Homepage

    func fetchHomepage(ignoreCache: Bool = false) async throws -> APIHomepageResponse {
        try await get(APIHomepageResponse.self, path: "/homepage", ignoreCache: ignoreCache)
    }

    func fetchHomepageLite() async throws -> APIHomepageResponse {
        try await get(APIHomepageResponse.self, path: "/homepage-lite")
    }

    // MARK: - Articles

    func fetchArticles(page: Int = 1, perPage: Int = 20) async throws -> APIPaginatedList<APIArticle> {
        try await get(APIPaginatedList<APIArticle>.self, path: "/articles", query: [
            "page": "\(page)",
            "per_page": "\(perPage)",
            "limit": "\(perPage)",
            "offset": "\((page - 1) * perPage)"
        ])
    }

    func fetchFeatured() async throws -> [APIArticle] {
        try await get(WrappedArray<APIArticle>.self, path: "/articles/featured").items
    }

    func fetchArticle(slug: String) async throws -> APIArticle {
        // PUBLIC API is the source of truth for article detail — it returns
        // the full HTML `content` field that the rich-text renderer needs.
        // v1 returns `{"error":"NOT_FOUND"}` for short-hash slugs like
        // `8myc61P`, and even when v1 succeeds its payload omits the rich
        // HTML body. Public-first, v1 fallback only when public misses.
        do {
            return try await get(
                APIArticle.self,
                path: "/articles/\(slug)",
                apiRoot: publicAPIBaseURL
            )
        } catch where Self.isFallbackWorthy(error) {
            // Fallback: v1 wrapped shape. Used for content that's not on the
            // public surface (rare).
            return try await get(WrappedObject<APIArticle>.self, path: "/articles/\(slug)").item
        }
    }

    func fetchRelated(slug: String) async throws -> [APIArticle] {
        // Public API returns a bare JSON array; v1 doesn't have this
        // endpoint (404). Mirror fetchArticle: public-first, v1 fallback.
        do {
            return try await get(
                [APIArticle].self,
                path: "/articles/\(slug)/related",
                apiRoot: publicAPIBaseURL
            )
        } catch where Self.isFallbackWorthy(error) {
            do {
                return try await get(
                    WrappedArray<APIArticle>.self,
                    path: "/articles/\(slug)/related",
                    apiRoot: publicAPIBaseURL
                ).items
            } catch where Self.isFallbackWorthy(error) {
                return try await get(
                    WrappedArray<APIArticle>.self,
                    path: "/articles/\(slug)/related"
                ).items
            }
        }
    }

    /// Content Passport (digital fingerprint). Lives at /api/articles/:slug/passport,
    /// NOT under v1, so route through publicAPIBaseURL.
    func fetchPassport(slug: String) async throws -> APIPassport {
        try await get(APIPassport.self, path: "/articles/\(slug)/passport", apiRoot: publicAPIBaseURL)
    }

    func fetchComments(slug: String) async throws -> [APIComment] {
        // v1 mirror at `/api/v1/articles/:slug/comments` returns a bare array
        // of top-level comments with `replies: []` nested. We use v1 (not the
        // public surface) so the same Bearer auth used elsewhere can be
        // applied — though this GET is public, keeping it on v1 lets us share
        // any future auth-conditional fields (own pending comments, etc.).
        try await get(
            WrappedArray<APIComment>.self,
            path: "/articles/\(slug)/comments"
        ).items
    }

    // ملاحظة: /articles/:slug/summary-audio يعيد بايتات MP3 خامًا لا JSON —
    // fetchAudioSummary القديمة كانت تفشل فكًّا دائمًا وتشغّل توليدًا صوتيًا
    // عبثًا مع كل فتح مقال، فحُذفت. التشغيل يتم بتمرير الرابط لـ AVPlayer مباشرة.

    func fetchAIInsights(slug: String) async throws -> [String: String] {
        try await get([String: String].self, path: "/articles/\(slug)/ai-insights")
    }

    // MARK: - Sections (Categories)

    func fetchCategories() async throws -> [APICategory] {
        try await get(WrappedArray<APICategory>.self, path: "/sections").items
    }

    /// Per-category article list. `slug` is matched on the backend against
    /// `categories.slug` first, falling back to UUID; v1 was the broken path
    /// before (slug passed against `categoryId` UUID column — never matched).
    /// Default `perPage` bumped from 20 → 50 per user direction so the
    /// CategoryArticlesSheet shows a meaningful first page even for very
    /// active sections.
    func fetchCategoryArticles(slug: String, page: Int = 1, perPage: Int = 50) async throws -> APIPaginatedList<APIArticle> {
        try await get(APIPaginatedList<APIArticle>.self, path: "/articles", query: [
            "section": slug,
            "limit": "\(perPage)",
            "offset": "\((page - 1) * perPage)"
        ])
    }

    /// Author profile + recent articles in a single round-trip. The mobile
    /// `AuthorArticlesView` resolves writers by their byline string (we don't
    /// have slugs in the article payload yet), so this endpoint matches on
    /// `first_name + ' ' + last_name`.
    func fetchAuthorPage(name: String) async throws -> APIAuthorPage {
        try await get(APIAuthorPage.self, path: "/authors/by-name", query: ["name": name])
    }

    // MARK: - Breaking News

    /// Dashboard-managed breaking-news strip (شريط الأخبار العاجلة). Hits the
    /// public `/api/breaking-ticker/active` route (NOT the v1 mobile root) and
    /// returns `nil` when no topic is active — the endpoint answers `200 null`
    /// in that case, which decodes cleanly into the optional.
    func fetchBreakingTicker() async throws -> APIBreakingTicker? {
        try await get(APIBreakingTicker?.self, path: "/breaking-ticker/active", apiRoot: publicAPIBaseURL)
    }

    // MARK: - Search

    func search(query: String, page: Int = 1) async throws -> APISearchResponse {
        try await get(APISearchResponse.self, path: "/search", query: [
            "q": query,
            "page": "\(page)"
        ])
    }

    func searchSuggestions(query: String) async throws -> [String] {
        let result = try await get(WrappedArray<APISearchSuggestion>.self, path: "/search/suggestions", query: ["q": query])
        return result.items.map(\.text)
    }

    func fetchTrending() async throws -> [String] {
        try await get(APITrendingResponse.self, path: "/search/trending").keywords
    }

    func fetchTrendingKeywords() async throws -> [String] {
        try await get(APITrendingResponse.self, path: "/trending-keywords").keywords
    }

    // MARK: - Trending Page

    func fetchTrendingPage() async throws -> APITrendingPageResponse {
        try await get(APITrendingPageResponse.self, path: "/trending")
    }

    // MARK: - Live Coverage

    func fetchLive(country: String? = nil, limit: Int = 50, offset: Int = 0, since: String? = nil) async throws -> APILiveResponse {
        var query: [String: String] = [
            "limit": "\(limit)",
            "offset": "\(offset)"
        ]
        if let country { query["country"] = country }
        if let since { query["since"] = since }
        return try await get(APILiveResponse.self, path: "/live", query: query)
    }

    func fetchLiveStats() async throws -> APILiveStats {
        try await get(APILiveStats.self, path: "/live/stats")
    }

    func fetchLiveEvent(id: String) async throws -> APILiveEventDetail {
        try await get(APILiveEventDetail.self, path: "/live/\(id)")
    }

    /// Moment-by-moment news feed — published articles in reverse-chronological
    /// order. Backed by `/api/live/updates` (public API root, not v1). Mirrors
    /// the web's `MomentByMoment.tsx` page; distinct from `fetchLive` which
    /// queries the separate live-events table.
    func fetchMomentByMomentUpdates(cursor: String? = nil, filter: String? = nil, limit: Int = 20) async throws -> APILiveUpdatesResponse {
        var query: [String: String] = ["limit": "\(limit)"]
        if let cursor { query["cursor"] = cursor }
        if let filter { query["filter"] = filter }
        return try await get(
            APILiveUpdatesResponse.self,
            path: "/live/updates",
            query: query,
            apiRoot: publicAPIBaseURL
        )
    }

    // MARK: - Paginated News

    func fetchPaginatedNews(page: Int = 1, ignoreCache: Bool = false) async throws -> APIPaginatedList<APIArticle> {
        try await get(APIPaginatedList<APIArticle>.self, path: "/news/paginated", query: [
            "page": "\(page)"
        ], ignoreCache: ignoreCache)
    }

    // MARK: - Stories

    func fetchStories() async throws -> [APIStory] {
        try await get(WrappedArray<APIStory>.self, path: "/stories").items
    }

    func fetchStory(id: Int) async throws -> APIStory {
        try await get(WrappedObject<APIStory>.self, path: "/stories/\(id)").item
    }

    // MARK: - Opinions

    /// Opinion-articles list. `sort = "views"` returns the most-read
    /// opinions first; any other value (including `nil`) falls back to the
    /// backend default of newest-first.
    func fetchOpinions(page: Int = 1, limit: Int = 30, sort: String? = nil) async throws -> [APIOpinion] {
        var query: [String: String] = [
            "page": "\(page)",
            "limit": "\(limit)"
        ]
        if let sort, !sort.isEmpty { query["sort"] = sort }

        do {
            return try await get(
                WrappedArray<APIOpinion>.self,
                path: "/opinion",
                query: query,
                apiRoot: publicAPIBaseURL
            ).items
        } catch where Self.isFallbackWorthy(error) {
            return try await get(
                WrappedArray<APIOpinion>.self,
                path: "/opinion",
                query: query
            ).items
        }
    }

    func fetchOpinion(slug: String) async throws -> APIOpinion {
        do {
            return try await get(WrappedObject<APIOpinion>.self, path: "/opinion/\(slug)", apiRoot: publicAPIBaseURL).item
        } catch where Self.isFallbackWorthy(error) {
            return try await get(WrappedObject<APIOpinion>.self, path: "/opinion/\(slug)").item
        }
    }

    func fetchDashboardOpinions() async throws -> [APIOpinion] {
        try await get(WrappedArray<APIOpinion>.self, path: "/dashboard/opinion", apiRoot: publicAPIBaseURL).items
    }

    func fetchDashboardOpinion(id: String) async throws -> APIOpinion {
        try await get(WrappedObject<APIOpinion>.self, path: "/dashboard/opinion/\(id)", apiRoot: publicAPIBaseURL).item
    }

    // MARK: - Audio Briefs

    func fetchAudioBriefs() async throws -> [APIAudioSummary] {
        try await get(WrappedArray<APIAudioSummary>.self, path: "/audio-briefs").items
    }

    // MARK: - Tags

    func fetchTags() async throws -> [APITag] {
        try await get(WrappedArray<APITag>.self, path: "/tags").items
    }

    func fetchSEOKeywords(slug: String) async -> [String] {
        guard let article = try? await get(WrappedObject<APIArticle>.self, path: "/articles/\(slug)", apiRoot: publicAPIBaseURL).item else {
            return []
        }
        return (article.keywords ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
    }

    func fetchArticlesByKeyword(_ keyword: String) async throws -> [APIArticle] {
        // لا ترميز مسبق هنا: buildURL يرمّز كل مقطع بنفسه، والترميز المزدوج
        // يجعل الخادم يبحث عن "%D8%B1..." حرفيًا فتعود كل كلمة عربية فارغة
        do {
            return try await get(
                WrappedArray<APIArticle>.self,
                path: "/keyword/\(keyword)",
                apiRoot: publicAPIBaseURL
            ).items
        } catch where Self.isFallbackWorthy(error) {
            return try await get(WrappedArray<APIArticle>.self, path: "/keyword/\(keyword)").items
        }
    }

    // MARK: - User Interactions (Auth Required)

    func trackView(articleId: String) async throws {
        try await postRaw(path: "/articles/\(articleId)/view")
    }

    func reactToArticle(articleId: String) async throws {
        try await postRaw(path: "/articles/\(articleId)/react")
    }

    func bookmarkArticle(articleId: String) async throws {
        try await postRaw(path: "/articles/\(articleId)/bookmark")
    }

    func postComment(slug: String, content: String, parentId: String? = nil) async throws -> APIComment {
        // v1 mobile endpoint authenticates via the Bearer token returned by
        // `/api/v1/auth/login` (table `appMemberSessions`). The public route
        // at `/api/articles/...` uses Passport sessions which iOS doesn't
        // own, so we'd get 401 there. Body schema is `{ content, parentId? }`.
        // Default DB status is "pending"; the AI moderation job (GPT-4o-mini)
        // runs async after this returns and may flip to approved/rejected.
        let body = CommentSubmitBody(content: content, parentId: parentId)
        return try await post(
            APIComment.self,
            path: "/articles/\(slug)/comments",
            body: body
        )
    }

    // MARK: - Auth

    func login(email: String, password: String) async throws -> APILoginResponse {
        await ensureCSRF()
        return try await post(APILoginResponse.self, path: "/auth/login", body: APILoginRequest(email: email, password: password))
    }

    func register(name: String, email: String, password: String) async throws -> APILoginResponse {
        await ensureCSRF()
        return try await post(APILoginResponse.self, path: "/auth/register", body: APIRegisterRequest(
            name: name, email: email, password: password, passwordConfirmation: password
        ))
    }

    /// Exchange a Google ID token for a SABQ session. Backend route is
    /// `POST /api/v1/auth/google` — verifies the token against the
    /// configured iOS/web audiences, creates or links the user, and
    /// returns a Bearer token in `APILoginResponse.token`.
    func loginWithGoogle(idToken: String) async throws -> APILoginResponse {
        await ensureCSRF()
        let deviceInfo = await Self.currentDeviceInfo()
        return try await post(
            APILoginResponse.self,
            path: "/auth/google",
            body: APIGoogleAuthRequest(idToken: idToken, deviceInfo: deviceInfo)
        )
    }

    /// Exchange an Apple identity token for a SABQ session. Apple only
    /// shares `fullName` and `email` on the FIRST authorization; pass nil
    /// on subsequent sign-ins. Backend route is `POST /api/v1/auth/apple`.
    func loginWithApple(
        identityToken: String,
        firstName: String?,
        lastName: String?,
        email: String?
    ) async throws -> APILoginResponse {
        await ensureCSRF()
        let fullName: APIAppleAuthRequest.AppleFullName? = (firstName != nil || lastName != nil)
            ? .init(firstName: firstName, lastName: lastName)
            : nil
        let deviceInfo = await Self.currentDeviceInfo()
        return try await post(
            APILoginResponse.self,
            path: "/auth/apple",
            body: APIAppleAuthRequest(
                identityToken: identityToken,
                fullName: fullName,
                email: email,
                deviceInfo: deviceInfo
            )
        )
    }

    private static func currentDeviceInfo() async -> APIDeviceInfo {
        let bundle = Bundle.main
        let appVersion = (bundle.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "unknown"
        let build = (bundle.infoDictionary?["CFBundleVersion"] as? String) ?? "unknown"
        #if canImport(UIKit)
        let (osVersion, deviceName, deviceId) = await MainActor.run {
            let device = UIDevice.current
            return (device.systemVersion, device.model, device.identifierForVendor?.uuidString)
        }
        return APIDeviceInfo(
            platform: "ios",
            osVersion: osVersion,
            appVersion: "\(appVersion) (\(build))",
            deviceName: deviceName,
            deviceId: deviceId
        )
        #else
        return APIDeviceInfo(
            platform: "ios",
            osVersion: "unknown",
            appVersion: "\(appVersion) (\(build))",
            deviceName: nil,
            deviceId: nil
        )
        #endif
    }

    func fetchCurrentUser() async throws -> APIUser {
        try await get(WrappedOrDirect<APIUser>.self, path: "/members/profile").value
    }

    /// Replace the authenticated user's interest list with the supplied
    /// category ids (sorted by priority). Backend wipes prior rows and
    /// inserts the new ones — see `mobileApiRoutes.updateMemberInterests`.
    /// Returns nothing; caller should refetch profile.
    func updateMemberInterests(categoryIds: [String]) async throws {
        struct Body: Encodable { let interestIds: [String] }
        try await postRaw(path: "/members/interests", body: Body(interestIds: categoryIds))
    }

    func updateProfile(firstName: String, lastName: String, bio: String?, city: String?, gender: String?) async throws -> APIUser {
        await ensureCSRF()
        var body: [String: String] = [
            "firstName": firstName,
            "lastName": lastName
        ]
        if let bio { body["bio"] = bio }
        if let city { body["city"] = city }
        if let gender { body["gender"] = gender }
        // The backend response is `{success, message, user}` — use the
        // WrappedOrDirect unwrapper so we get the embedded APIUser back.
        // The previous `put(APIUser.self, ...)` call decoded the outer
        // envelope as APIUser directly, producing an empty user object
        // (no id/role/email) that wiped the cached `currentUser` to a
        // blank "مستخدم / قارئ" state on every profile save.
        return try await put(WrappedOrDirect<APIUser>.self, path: "/members/profile", body: body).value
    }

    func uploadAvatar(imageData: Data, filename: String = "avatar.png") async throws -> APIUser {
        // The v1 mobile endpoint expects a base64 data-URI in the JSON
        // body (`{ "image": "data:image/png;base64,..." }`), NOT the
        // multipart form payload this method used to send. The multipart
        // version always failed with "الصورة مطلوبة (base64)" because
        // `req.body.image` was undefined.
        let base64 = imageData.base64EncodedString()
        let mime = Self.detectImageMimeType(imageData) ?? "image/png"
        struct Body: Encodable { let image: String }
        let body = Body(image: "data:\(mime);base64,\(base64)")
        return try await post(APIAvatarUploadResponse.self, path: "/members/profile/image", body: body).user
    }

    func deleteAvatar() async throws {
        await ensureCSRF()
        try await deleteRaw(path: "/members/profile/image")
    }

    func logout() async throws {
        await ensureCSRF()
        try? await postRaw(path: "/auth/logout")
        markLoggedOut()
    }

    // MARK: - Password & Account

    func changePassword(currentPassword: String, newPassword: String) async throws {
        await ensureCSRF()
        try await postRaw(path: "/members/change-password", body: [
            "currentPassword": currentPassword,
            "newPassword": newPassword
        ])
    }

    func forgotPassword(email: String) async throws {
        try await postRaw(path: "/auth/forgot-password", body: ["email": email])
    }

    /// Re-trigger the account-activation email for a user whose login
    /// failed with `requiresActivation: true`. The backend accepts
    /// either `userId` or `email` and replies 200 with
    /// `{ success, message, emailSent }`. We pass both when available
    /// so the server can pick the most reliable lookup. See
    /// `mobileApiRoutes.ts /auth/resend-activation`.
    func resendActivation(userId: String?, email: String?) async throws -> ResendActivationResponse {
        struct Body: Encodable {
            let userId: String?
            let email: String?
        }
        return try await post(
            ResendActivationResponse.self,
            path: "/auth/resend-activation",
            body: Body(userId: userId, email: email)
        )
    }

    func resetPassword(email: String, code: String, newPassword: String) async throws {
        try await postRaw(path: "/auth/reset-password", body: [
            "email": email,
            "code": code,
            "newPassword": newPassword
        ])
    }

    func deleteAccount(password: String) async throws {
        await ensureCSRF()
        try await deleteRaw(path: "/members/account", body: ["password": password])
        markLoggedOut()
    }

    // MARK: - Notifications

    func fetchNotifications() async throws -> [APINotification] {
        try await get(WrappedArray<APINotification>.self, path: "/notifications").items
    }

    func fetchUnreadCount() async throws -> Int {
        let result = try await get([String: Int].self, path: "/notifications/unread-count")
        return result["count"] ?? result["unread_count"] ?? 0
    }

    func markNotificationRead(id: String) async throws {
        try await postRaw(path: "/notifications/\(id)/read")
    }

    func markAllNotificationsRead() async throws {
        try await postRaw(path: "/notifications/mark-all-read")
    }

    // MARK: - Push token + editorial notifications

    /// Register the APNs device token + device metadata with the backend so
    /// targeted editorial pushes (scheduled / published / rejected /
    /// needs_revision) can reach this device. Idempotent — calling
    /// repeatedly with the same token just refreshes `lastActiveAt`.
    func registerPushToken(
        token: String,
        provider: String = "apns",
        platform: String = "ios",
        deviceName: String? = nil,
        osVersion: String? = nil,
        appVersion: String? = nil,
        locale: String? = nil,
        timezone: String? = nil
    ) async throws {
        struct Body: Encodable {
            let token: String
            let provider: String
            let platform: String
            let deviceName: String?
            let osVersion: String?
            let appVersion: String?
            let locale: String?
            let timezone: String?
        }
        try await postRaw(path: "/members/push-token", body: Body(
            token: token, provider: provider, platform: platform,
            deviceName: deviceName, osVersion: osVersion, appVersion: appVersion,
            locale: locale, timezone: timezone
        ))
    }

    /// Tell the backend to stop targeting this device — called on sign-out
    /// or when the user revokes notification permission.
    func unregisterPushToken(token: String) async throws {
        struct Body: Encodable { let token: String }
        let url = try buildURL(path: "/members/push-token")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        applyHeaders(&request)
        request.httpBody = try JSONEncoder().encode(Body(token: token))
        let (_, response) = try await session.data(for: request)
        try ensureSuccess(response)
    }

    // MARK: - Live Activity (push-to-update) tokens

    /// Register the ActivityKit push token for a live match so the backend can
    /// push lock-screen updates (score/minute) via APNs while the app is
    /// closed/locked. The token differs from the device push token and rotates
    /// per activity. Public endpoint — works for guests too.
    func registerLiveActivityToken(fixtureId: Int, token: String) async throws {
        struct Body: Encodable {
            let fixtureId: Int
            let token: String
            let bundleId: String?
        }
        // نرسل bundleId صراحةً (كما يفعل تطبيق الرياضة) كي يختار الخادم apns-topic
        // ومفتاح APNs الصحيحين بدل الاعتماد على الافتراضي.
        try await postRaw(
            path: "/live-activity/register",
            body: Body(fixtureId: fixtureId, token: token, bundleId: Bundle.main.bundleIdentifier)
        )
    }

    /// Tell the backend the live activity is over so it stops pushing updates.
    func endLiveActivityToken(token: String) async throws {
        struct Body: Encodable { let token: String }
        try await postRaw(path: "/live-activity/end", body: Body(token: token))
    }

    /// Latest 50 editorial notifications (scheduled/published/rejected/
    /// needs_revision) for the signed-in user, newest first. Used by the
    /// in-app NotificationsView. Renamed from the generic `notifications`
    /// path-set to avoid clashing with the older `markNotificationRead`
    /// pair that powers the bell icon — these editorial helpers wrap a
    /// completely different DB table on the backend.
    func fetchEditorialNotifications() async throws -> EditorialNotificationsPage {
        try await get(EditorialNotificationsPage.self, path: "/notifications")
    }

    func markEditorialNotificationRead(id: String) async throws {
        try await postRaw(path: "/notifications/\(id)/read")
    }

    func markAllEditorialNotificationsRead() async throws {
        try await postRaw(path: "/notifications/read-all")
    }

    func deleteEditorialNotification(id: String) async throws {
        try await deleteRaw(path: "/notifications/\(id)")
    }

    func deleteAllEditorialNotifications() async throws {
        try await deleteRaw(path: "/notifications")
    }

    func fetchNotificationPreferences() async throws -> EditorialNotificationPreferences {
        // غياب مفتاح preferences = الافتراضي (الكل مفعّل) بدل إفشال الشاشة.
        struct Response: Decodable { let preferences: EditorialNotificationPreferences? }
        return try await get(Response.self, path: "/notifications/preferences").preferences ?? .allOn
    }

    func updateNotificationPreferences(_ prefs: EditorialNotificationPreferences) async throws {
        let url = try buildURL(path: "/notifications/preferences")
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        applyHeaders(&request)
        request.httpBody = try JSONEncoder().encode(prefs)
        let (_, response) = try await session.data(for: request)
        try ensureSuccess(response)
    }

    // MARK: - Sports follows + match-event alerts

    /// متابعات المستخدم الرياضية (فِرق/بطولات). يتطلّب جلسة عضو (Bearer).
    func fetchSportsFollows() async throws -> [SportsFollow] {
        struct Response: Decodable { let follows: [SportsFollow] }
        return try await get(Response.self, path: "/sports/follows").follows
    }

    /// متابعة فريق/بطولة (idempotent على الخادم).
    func addSportsFollow(kind: String, refId: String, refName: String, refLogo: String?) async throws {
        struct Body: Encodable { let kind: String; let refId: String; let refName: String; let refLogo: String? }
        try await postRaw(path: "/sports/follows",
                          body: Body(kind: kind, refId: refId, refName: refName, refLogo: refLogo))
    }

    /// إلغاء متابعة — نمرّر (kind, refId) في الجسم لا في المسار (buildURL يرمّز `?`).
    func removeSportsFollow(kind: String, refId: String) async throws {
        struct Body: Encodable { let kind: String; let refId: String }
        try await deleteRaw(path: "/sports/follows", body: Body(kind: kind, refId: refId))
    }

    /// تفضيلات أنواع تنبيهات المباريات (الافتراضي «الكل مفعّل»).
    func fetchSportsAlertPreferences() async throws -> SportsAlertPreferences {
        struct Response: Decodable { let preferences: SportsAlertPreferences }
        return try await get(Response.self, path: "/sports/alert-prefs").preferences
    }

    func updateSportsAlertPreferences(_ prefs: SportsAlertPreferences) async throws {
        let url = try buildURL(path: "/sports/alert-prefs")
        var request = URLRequest(url: url)
        request.httpMethod = "PUT"
        applyHeaders(&request)
        request.httpBody = try JSONEncoder().encode(prefs)
        let (_, response) = try await session.data(for: request)
        try ensureSuccess(response)
    }

    // MARK: - Newsletter

    /// Subscribe to the smart newsletter. Hits `POST /api/v1/newsletter/subscribe`
    /// which auto-exempts from CSRF and reuses the same `newsletterSubscriptions`
    /// + MailerLite pipeline as the web. Server responds 201 on new active
    /// subscription, 409 with `alreadySubscribed: true` if the email is already
    /// active — we surface that as `NewsletterAlreadySubscribed` so the UI can
    /// jump straight to the "manage" state instead of showing an error.
    func subscribeNewsletter(email: String, firstName: String? = nil) async throws {
        struct Body: Encodable {
            let email: String
            let firstName: String?
            let language: String
            let source: String
        }
        let body = Body(email: email, firstName: firstName, language: "ar", source: "ios-app")
        do {
            try await postRaw(path: "/newsletter/subscribe", body: body)
        } catch APIError.serverError(let code) where code == 409 {
            throw NewsletterError.alreadySubscribed
        }
    }

    /// Check whether `email` already has an active subscription. Used by the
    /// NewsletterSheet on appear so the user lands on the right state
    /// immediately (manage vs subscribe).
    func checkNewsletterStatus(email: String) async -> Bool {
        struct Response: Decodable { let subscribed: Bool? }
        do {
            let r = try await get(Response.self, path: "/newsletter/status", query: ["email": email])
            return r.subscribed == true
        } catch {
            return false
        }
    }

    func unsubscribeNewsletter(email: String, reason: String? = nil) async throws {
        struct Body: Encodable {
            let email: String
            let reason: String?
        }
        try await postRaw(path: "/newsletter/unsubscribe", body: Body(email: email, reason: reason))
    }

    enum NewsletterError: Error, LocalizedError {
        case alreadySubscribed

        var errorDescription: String? {
            switch self {
            case .alreadySubscribed:
                return "هذا البريد مشترك بالفعل في النشرة. يمكنك إلغاء الاشتراك في أي وقت."
            }
        }
    }

    // MARK: - Article Submission (writers + reporters)

    /// Submit an article (opinion) or news (with multi-image) draft. Hits
    /// `POST /api/v1/articles/submit` which lands in `articles` with
    /// `status='draft'` for editorial review. The backend derives the article
    /// kind from the user's RBAC roles; admin-likes can override via `kind`.
    ///
    /// Images are sent as base64 data URIs in the **original byte order from
    /// the picker** — index 0 becomes the hero image, the rest go into
    /// `albumImages[]`. We do not re-encode pixels here; whatever the picker
    /// hands us is what CF Images stores, preserving user-perceived quality.
    func submitArticleDraft(
        title: String,
        content: String,
        kind: ArticleSubmissionKind,
        imageData: [Data]
    ) async throws -> ArticleSubmissionResponse {
        struct Body: Encodable {
            let title: String
            let content: String
            let kind: String
            let images: [String]
        }

        let dataURIs: [String] = imageData.compactMap { data in
            guard !data.isEmpty else { return nil }
            let mime = Self.detectImageMimeType(data) ?? "image/jpeg"
            return "data:\(mime);base64,\(data.base64EncodedString())"
        }

        let body = Body(
            title: title,
            content: content,
            kind: kind.rawValue,
            images: dataURIs
        )

        // Image upload + sequential CF Images processing on the server can
        // take well past the default 15s. Give submission a 90s budget so a
        // couple of phone photos don't time out before the server replies.
        return try await post(
            ArticleSubmissionResponse.self,
            path: "/articles/submit",
            body: body,
            timeout: 90
        )
    }

    // MARK: - Article Revisions
    //
    // Editor-requested revisions (review_status='needs_changes') used to
    // ship the writer back to the dashboard. These three endpoints power
    // the mobile equivalent — see mobileApiRoutes.ts /articles/my-revisions
    // for the contract.

    func fetchMyRevisions() async throws -> [ArticleRevisionSummary] {
        let response = try await get(
            ArticleRevisionsListResponse.self,
            path: "/articles/my-revisions"
        )
        return response.articles
    }

    func fetchArticleDraft(id: String) async throws -> ArticleDraftPayload {
        try await get(ArticleDraftResponse.self, path: "/articles/\(id)/draft").article
    }

    /// Re-submits a revised article. `heroImageData` is sent as a new
    /// base64 data URI only when the writer replaced the hero; pass `nil`
    /// to preserve whatever URL the draft already had. Same semantics
    /// for `albumImageData`. The backend flips reviewStatus back to
    /// `pending_review` on success.
    func resubmitArticle(
        id: String,
        title: String,
        content: String,
        heroImageData: Data?,
        albumImageData: [Data]?
    ) async throws -> ArticleSubmissionResponse {
        struct Body: Encodable {
            let title: String
            let content: String
            let heroImage: String?
            let albumImages: [String]?
        }

        let heroURI: String? = heroImageData.flatMap { data in
            guard !data.isEmpty else { return nil }
            let mime = Self.detectImageMimeType(data) ?? "image/jpeg"
            return "data:\(mime);base64,\(data.base64EncodedString())"
        }
        let albumURIs: [String]? = albumImageData.map { batch in
            batch.compactMap { data in
                guard !data.isEmpty else { return nil }
                let mime = Self.detectImageMimeType(data) ?? "image/jpeg"
                return "data:\(mime);base64,\(data.base64EncodedString())"
            }
        }

        let body = Body(
            title: title,
            content: content,
            heroImage: heroURI,
            albumImages: albumURIs
        )

        return try await put(
            ArticleSubmissionResponse.self,
            path: "/articles/\(id)/resubmit",
            body: body
        )
    }

    /// Best-effort MIME sniff for the picker output. PNG / JPEG / WebP / GIF
    /// / HEIC all have stable magic bytes at offset 0 (HEIC is the ftyp box
    /// with brand "heic"/"mif1" — close enough that CF Images accepts it).
    private static func detectImageMimeType(_ data: Data) -> String? {
        guard data.count >= 12 else { return nil }
        let bytes = [UInt8](data.prefix(12))
        // PNG: 89 50 4E 47
        if bytes[0] == 0x89, bytes[1] == 0x50, bytes[2] == 0x4E, bytes[3] == 0x47 {
            return "image/png"
        }
        // JPEG: FF D8 FF
        if bytes[0] == 0xFF, bytes[1] == 0xD8, bytes[2] == 0xFF {
            return "image/jpeg"
        }
        // WebP: RIFF....WEBP
        if bytes[0] == 0x52, bytes[1] == 0x49, bytes[2] == 0x46, bytes[3] == 0x46,
           bytes[8] == 0x57, bytes[9] == 0x45, bytes[10] == 0x42, bytes[11] == 0x50 {
            return "image/webp"
        }
        // GIF: GIF87a / GIF89a
        if bytes[0] == 0x47, bytes[1] == 0x49, bytes[2] == 0x46 {
            return "image/gif"
        }
        // HEIC: 'ftyp' box at offset 4 with major brand 'heic'/'heix'/'mif1'
        if bytes[4] == 0x66, bytes[5] == 0x74, bytes[6] == 0x79, bytes[7] == 0x70 {
            return "image/heic"
        }
        return nil
    }

    // MARK: - Contact

    /// Submit a contact-form message. Mirrors the web /contact form: all five
    /// fields are required by the backend Zod schema, and `subject` must be
    /// one of the canonical Arabic strings the backend enums on. The phone
    /// must be the Saudi `+966[9 digits]` format. Successful submissions land
    /// in the dashboard's "رسائل التواصل" via the same insert as the web.
    ///
    /// Routed through the v1 root (`POST /api/v1/contact`) because:
    /// - The web's `/api/contact` requires CSRF (mobile apps can't attach
    ///   `x-csrf-token`) and was returning 403.
    /// - Everything under `/api/v1/` is automatically exempt from CSRF per
    ///   `server/csrf.ts` EXEMPT_PATHS, matching the project's mobile-auth
    ///   convention from [[sabq-ios-mobile-auth]].
    func sendContactMessage(
        name: String,
        phone: String,
        email: String,
        subject: String,
        message: String
    ) async throws {
        try await postRaw(path: "/contact", body: [
            "name": name,
            "phone": phone,
            "email": email,
            "subject": subject,
            "message": message
        ])
    }

    // MARK: - Shortlinks

    func fetchShortlink(articleId: String) async throws -> String? {
        do {
            let result = try await get(
                APIShortlink.self,
                path: "/shortlinks/article/\(articleId)",
                apiRoot: publicAPIBaseURL
            )
            return result.resolvedURLString
        } catch APIError.notFound {
            return nil
        } catch APIError.apiMessage(let message)
            where message.localizedCaseInsensitiveContains("لا يوجد رابط قصير") {
            return nil
        } catch where Self.isFallbackWorthy(error) {
            let fallback = try await get(APIShortlink.self, path: "/shortlinks/article/\(articleId)")
            return fallback.resolvedURLString
        }
    }

    // MARK: - Keyword Following

    func followKeyword(tagId: Int) async throws {
        try await postRaw(path: "/keywords/follow", body: ["tag_id": tagId])
    }

    func unfollowKeyword(tagId: Int) async throws {
        try await deleteRaw(path: "/keywords/follow/\(tagId)")
    }

    func fetchFollowedKeywords() async throws -> [APITag] {
        try await get(WrappedArray<APITag>.self, path: "/keywords/followed").items
    }

    // MARK: - Today's AI Insights (SmartSummaryBlock on web)

    /// `/api/ai/insights/today` returns a flexible key/value map (greeting,
    /// phrase, counts, top category, etc). We decode it loosely so the home
    /// Greeting Block can gracefully use whichever keys come back.
    func fetchTodayInsights() async throws -> [String: String] {
        try await get([String: String].self, path: "/ai/insights/today", apiRoot: publicAPIBaseURL)
    }

    /// Personal knowledge-journey insights — typed shape used by the
    /// home-feed PersonalJourneyBlock to render metric tiles + interests
    /// inline (mirrors the web's SmartSummaryBlock layout).
    ///
    /// Hits `/api/v1/insights/today` (member-session) instead of the public
    /// `/ai/insights/today` because the latter authenticates via the web's
    /// Passport session, which iOS Bearer tokens can't satisfy.
    func fetchTodayInsightsRich() async throws -> APITodayInsights {
        try await get(APITodayInsights.self, path: "/insights/today")
    }

    /// "صدى الحج" homepage block (seasonal). The backend at
    /// `/api/hajj-block` hides itself outside the configured season,
    /// returning `{ isVisible: false }`. iOS treats that as "render
    /// nothing" — the block only shows up during the Hajj window
    /// configured from the dashboard.
    ///
    /// Lives on the PUBLIC namespace (not `/api/v1/`) because it's
    /// reader-facing content that doesn't require a session.
    func fetchHajjBlock() async throws -> APIHajjBlockResponse {
        try await get(
            APIHajjBlockResponse.self,
            path: "/hajj-block",
            apiRoot: publicAPIBaseURL,
        )
    }

    // MARK: - Unified Behavior Tracking (web parity)

    /// Send a behavior event to the unified iOS tracking endpoint.
    /// Backend writes to reading_history (view/read) or reactions
    /// (like/unlike) so `/insights/today` and the trending opinion
    /// query both reflect iOS reads alongside web.
    ///
    /// Best-effort: swallows non-200 responses so analytics failures
    /// never bubble into the article-reading flow.
    func trackBehaviorEvent(articleId: String,
                            eventType: String,
                            dwellSeconds: Int?,
                            scrollDepth: Int?,
                            completionRate: Int?) async throws {
        struct Body: Encodable {
            let articleId: String
            let eventType: String
            let dwellSeconds: Int?
            let scrollDepth: Int?
            let completionRate: Int?
            let platform: String
        }
        let body = Body(
            articleId: articleId,
            eventType: eventType,
            dwellSeconds: dwellSeconds,
            scrollDepth: scrollDepth,
            completionRate: completionRate,
            platform: "ios"
        )
        try await postRaw(path: "/behavior/track", body: body)
    }

    // MARK: - Apple Wallet Press Pass

    // Server contract: server/routes/mobileApiRoutes.ts (status route)
    // omits serialNumber/issuedAt when the user has no pass yet. Both
    // are optional to keep the decoder forgiving.
    nonisolated struct APIPressPassStatus: Decodable {
        let success: Bool?
        let authorized: Bool
        let hasPass: Bool
        let serialNumber: String?
        let issuedAt: String?
        /// Localized Arabic role label, computed server-side using the
        /// SAME map PressPassBuilder will burn onto the .pkpass. The
        /// activation-screen preview reads this so it never disagrees
        /// with the printed card.
        let roleLabel: String?
        let jobTitle: String?
    }


    func fetchPressPassStatus() async throws -> APIPressPassStatus {
        try await get(APIPressPassStatus.self, path: "/wallet/press/status")
    }

    /// Hits `POST /api/v1/wallet/press/issue` and returns the raw
    /// `.pkpass` bytes (application/vnd.apple.pkpass) the caller hands
    /// to `PKAddPassesViewController`. Throws apiMessage("…") when the
    /// server says we're not authorized so the press-card screen can
    /// surface the Arabic reason directly.
    func downloadPressPass() async throws -> Data {
        let url = try buildURL(path: "/wallet/press/issue")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyHeaders(&request)
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.noResponse }
        switch http.statusCode {
        case 200..<300: return data
        case 401: throw APIError.unauthorized
        case 403, 400:
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw APIError.apiMessage(msg ?? "غير مصرح بإصدار البطاقة")
        default:
            throw APIError.serverError(http.statusCode)
        }
    }

    // MARK: - Loyalty (Phase 3)
    //
    // `/api/v1/loyalty/me` returns the same shape the web profile reads
    // from `/api/loyalty/summary` — tier + week/month points + streak.
    // `/api/v1/loyalty/events` accepts a batch; server-side daily caps
    // and dedup make the batch idempotent so the on-device queue can
    // retry without producing double awards.
    func fetchLoyaltySummary() async throws -> LoyaltySummary {
        try await get(LoyaltySummary.self, path: "/loyalty/me")
    }

    func submitLoyaltyEvents(_ events: [LoyaltyEventPayload]) async throws -> LoyaltyEventBatchResponse {
        struct Body: Encodable { let events: [LoyaltyEventPayload] }
        return try await post(LoyaltyEventBatchResponse.self, path: "/loyalty/events", body: Body(events: events))
    }

    // ---- Loyalty: history + monthly + rewards (added 2026-05-20) ----
    //
    // These power the new "تاريخ نقاطي" feed, the 6-month bar chart on
    // LoyaltyAccountView, and the "مكافآتي" tab where members spend
    // their points.

    func fetchLoyaltyHistory(page: Int = 1, limit: Int = 20) async throws -> LoyaltyHistoryResponse {
        try await get(
            LoyaltyHistoryResponse.self,
            path: "/loyalty/history",
            query: ["page": "\(page)", "limit": "\(limit)"]
        )
    }

    func fetchLoyaltyMonthly() async throws -> LoyaltyMonthlyResponse {
        try await get(LoyaltyMonthlyResponse.self, path: "/loyalty/monthly")
    }

    func fetchLoyaltyRewards() async throws -> LoyaltyRewardsResponse {
        try await get(LoyaltyRewardsResponse.self, path: "/loyalty/rewards")
    }

    func redeemLoyaltyReward(id: String) async throws -> LoyaltyRedeemResponse {
        struct Body: Encodable {}
        return try await post(
            LoyaltyRedeemResponse.self,
            path: "/loyalty/rewards/\(id)/redeem",
            body: Body()
        )
    }

    func fetchMyRedemptions() async throws -> LoyaltyRedemptionsResponse {
        try await get(LoyaltyRedemptionsResponse.self, path: "/loyalty/redemptions/me")
    }

    func toggleArticleLike(articleId: String) async throws -> APIArticleReactionResponse {
        try await post(APIArticleReactionResponse.self, path: "/articles/\(articleId)/react")
    }

    func fetchArticleLikeStatus(articleId: String) async throws -> APIArticleReactionResponse {
        try await get(APIArticleReactionResponse.self, path: "/articles/\(articleId)/react")
    }

    // MARK: - Phase 5: Calendar / OMQ / Daily Brief / Audio Newsletters

    /// Calendar events (world days, gulf events, commemorations). Public.
    func fetchCalendarEvents(dateFrom: String? = nil,
                             dateTo: String? = nil,
                             type: String? = nil,
                             limit: Int = 50) async throws -> [APICalendarEvent] {
        var query: [String: String] = ["limit": "\(limit)"]
        if let dateFrom { query["dateFrom"] = dateFrom }
        if let dateTo { query["dateTo"] = dateTo }
        if let type { query["type"] = type }
        let response = try await get(
            APICalendarEventsResponse.self,
            path: "/calendar",
            query: query,
            apiRoot: publicAPIBaseURL
        )
        return response.events
    }

    /// Calendar — events occurring within the next `days` days.
    func fetchUpcomingCalendarEvents(days: Int = 7) async throws -> [APICalendarEvent] {
        let response = try await get(
            APICalendarEventsResponse.self,
            path: "/calendar/upcoming",
            query: ["days": "\(days)"],
            apiRoot: publicAPIBaseURL
        )
        return response.events
    }

    /// OMQ deep-analysis list. Public.
    func fetchOmqList(page: Int = 1, limit: Int = 9, status: String? = nil) async throws -> APIOmqListResponse {
        var query: [String: String] = ["page": "\(page)", "limit": "\(limit)"]
        if let status { query["status"] = status }
        return try await get(APIOmqListResponse.self, path: "/omq", query: query, apiRoot: publicAPIBaseURL)
    }

    /// OMQ deep-analysis detail. Public. Response is wrapped in `{ data: ... }`
    /// per the web's OmqDetail.tsx code path; we unwrap defensively.
    func fetchOmqDetail(id: String) async throws -> APIDeepAnalysis {
        // Try direct shape first, fall back to { data: ... } wrapper.
        if let direct = try? await get(APIDeepAnalysis.self, path: "/omq/\(id)", apiRoot: publicAPIBaseURL) {
            return direct
        }
        return try await get(WrappedObject<APIDeepAnalysis>.self, path: "/omq/\(id)", apiRoot: publicAPIBaseURL).item
    }

    /// Daily personal brief — authenticated. Server has both `/api/ai/daily-summary`
    /// and `/api/en/ai/daily-summary`; we use the language-neutral path.
    func fetchDailySummary() async throws -> APIDailySummary {
        try await get(APIDailySummary.self, path: "/ai/daily-summary", apiRoot: publicAPIBaseURL)
    }

    /// Audio newsletters list. Public. Backend may return a bare array OR a
    /// wrapped `{ newsletters: [] }` shape; handle both.
    func fetchAudioNewsletters() async throws -> [APIAudioNewsletter] {
        struct Wrapped: Decodable { let newsletters: [APIAudioNewsletter] }
        if let direct = try? await get([APIAudioNewsletter].self, path: "/audio-newsletters", apiRoot: publicAPIBaseURL) {
            return direct
        }
        if let wrapped = try? await get(Wrapped.self, path: "/audio-newsletters", apiRoot: publicAPIBaseURL) {
            return wrapped.newsletters
        }
        return try await get(WrappedArray<APIAudioNewsletter>.self, path: "/audio-newsletters", apiRoot: publicAPIBaseURL).items
    }

    func fetchAudioNewsletter(slug: String) async throws -> APIAudioNewsletter {
        if let direct = try? await get(APIAudioNewsletter.self, path: "/audio-newsletters/\(slug)", apiRoot: publicAPIBaseURL) {
            return direct
        }
        return try await get(WrappedObject<APIAudioNewsletter>.self, path: "/audio-newsletters/\(slug)", apiRoot: publicAPIBaseURL).item
    }

    // MARK: - Private Helpers

    private func buildURL(path: String, query: [String: String] = [:], apiRoot: String? = nil) throws -> URL {
        let sanitizedPath = path
            .components(separatedBy: "/")
            .map { segment in
                segment.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? segment
            }
            .joined(separator: "/")
        let fullPath = sanitizedPath.hasPrefix("/") ? sanitizedPath : "/\(sanitizedPath)"
        let root = apiRoot ?? baseURL
        guard var components = URLComponents(string: root + fullPath) else {
            throw APIError.invalidURL
        }
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

    /// الاحتياطي (v1 بعد public أو شكل بديل) يليق فقط بـ«غير موجود هنا»
    /// (404) أو «شكل استجابة مختلف» (فشل فك). أخطاء الشبكة و5xx تُرمى
    /// مباشرة — كان try? يبتلعها فيطلق طلبًا ثانيًا يضاعف الحمل على خادم
    /// متعثر أصلًا ويحوّل «خطأ خادم» إلى «المحتوى غير موجود» أمام المستخدم.
    nonisolated static func isFallbackWorthy(_ error: Error) -> Bool {
        guard let api = error as? APIError else { return false }
        switch api {
        case .notFound, .decodingError: return true
        default: return false
        }
    }

    private func perform<T: Decodable>(_ request: URLRequest, as type: T.Type) async throws -> T {
        try await decode(type, from: session, request: request)
    }

    private func decode<T: Decodable>(_ type: T.Type, from urlSession: URLSession, request: URLRequest) async throws -> T {
        let (data, response) = try await urlSession.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.noResponse
        }
        switch http.statusCode {
        case 200...299:
            do {
                return try decoder.decode(type, from: data)
            } catch {
                // DecodingError الخام كان يتسرّب للمستخدم برسالة إنجليزية
                // تقنية ("The data couldn't be read…") عبر localizedDescription
                // في واجهة عربية. التفاصيل للتشخيص في الكونسول فقط.
                #if DEBUG
                print("[API] decode failure for \(T.self):", error)
                #endif
                throw APIError.decodingError
            }
        default:
            if let apiErr = try? decoder.decode(APIErrorResponse.self, from: data) {
                // Surface the pending-activation contract as a structured
                // case so the login flow can show "resend activation"
                // instead of a dead-end error banner. The backend sets
                // `requiresActivation: true` on the 403 from
                // `/api/v1/auth/login` for users whose status is
                // `pending` (see mobileApiRoutes.ts:1178-1186).
                if apiErr.requiresActivation == true {
                    let msg = apiErr.message ?? "الحساب غير مفعل. يرجى تفعيل الحساب أولاً"
                    throw APIError.accountPendingActivation(message: msg, userId: apiErr.userId)
                }
                if let msg = apiErr.message {
                    throw APIError.apiMessage(msg)
                }
            }
            switch http.statusCode {
            case 401: throw APIError.unauthorized
            case 403: throw APIError.forbidden
            case 404: throw APIError.notFound
            case 429: throw APIError.rateLimited
            default:  throw APIError.serverError(http.statusCode)
            }
        }
    }
}

// MARK: - Article submission types

enum ArticleSubmissionKind: String, Codable, Identifiable {
    case opinion
    case news

    var id: String { rawValue }
}

nonisolated struct ArticleSubmissionResponse: Decodable {
    let success: Bool
    let message: String
    let article: SubmittedArticle?

    struct SubmittedArticle: Decodable {
        let id: String
        let title: String
        let slug: String?
        let kind: String
        let status: String
        let imagesUploaded: Int?
    }
}

// MARK: - Article revision types
//
// Driven by the three /api/v1/articles/* endpoints that handle editor
// revision requests. Shape mirrors the backend response exactly so the
// decoder can stay declarative — no FlexKey acrobatics needed.

nonisolated struct ArticleRevisionSummary: Decodable, Identifiable {
    let id: String
    let title: String
    let imageURL: String?
    let kind: String
    let reviewNotes: String
    /// ISO-8601 timestamp the editor requested the change; nil when the
    /// backend couldn't determine a meaningful moment (rare).
    let requestedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, title
        case imageURL = "imageUrl"
        case kind, reviewNotes, requestedAt
    }

    var isOpinion: Bool { kind == "opinion" }
}

nonisolated struct ArticleRevisionsListResponse: Decodable {
    let success: Bool
    let count: Int
    let articles: [ArticleRevisionSummary]
}

nonisolated struct ArticleDraftPayload: Decodable {
    let id: String
    let title: String
    let body: String
    let excerpt: String
    let imageURL: String?
    let albumImages: [String]?
    let kind: String
    let reviewNotes: String
    let requestedAt: String?
    /// Current review state on the server. We use this to short-circuit
    /// the revision form when the writer already resubmitted — without
    /// it they could open the same `needs_revision` notification a
    /// second time and accidentally edit the same article twice.
    let reviewStatus: String?
    let status: String?

    enum CodingKeys: String, CodingKey {
        case id, title, body, excerpt
        case imageURL = "imageUrl"
        case albumImages, kind, reviewNotes, requestedAt, reviewStatus, status
    }

    var isOpinion: Bool { kind == "opinion" }

    /// True when the article is still actively waiting for the writer's
    /// edits. Any other state means the resubmit window has closed —
    /// editor already accepted, asked again, or someone else changed
    /// the article on the dashboard.
    var awaitingEdits: Bool {
        reviewStatus == "needs_changes" && status == "draft"
    }
}

nonisolated struct ArticleDraftResponse: Decodable {
    let success: Bool
    let article: ArticleDraftPayload
}

// MARK: - APIUser role helpers

extension APIUser {
    /// Canonical role identifiers the writer-submission flow honours.
    static let writerRoleIdentifiers: Set<String> = [
        "opinion_author",
        "columnist",
        "article_author",
        "article_writer",
        "writer",
        "author",
    ]

    /// Canonical role identifiers the reporter-submission flow honours.
    static let reporterRoleIdentifiers: Set<String> = [
        "reporter",
        "correspondent",
        "journalist",
    ]

    static let adminLikeRoleIdentifiers: Set<String> = [
        "admin",
        "system_admin",
        "superadmin",
        "editor",
        "editor_in_chief",
        "senior_editor",
        "managing_editor",
        "editorial_manager",
        "content_manager",
    ]

    /// Strict subset of `adminLikeRoleIdentifiers` — top-level platform admins
    /// only (no editors). Gates the in-app admin dashboard entry.
    static let platformAdminRoleIdentifiers: Set<String> = [
        "admin",
        "system_admin",
        "system.admin",
        "superadmin",
    ]

    private var allRoleKeys: [String] {
        var keys: [String] = []
        if let r = role { keys.append(r.lowercased()) }
        keys.append(contentsOf: roles.map { $0.lowercased() })
        return keys
    }

    var isWriter: Bool {
        allRoleKeys.contains { APIUser.writerRoleIdentifiers.contains($0) }
    }

    var isReporter: Bool {
        allRoleKeys.contains { APIUser.reporterRoleIdentifiers.contains($0) }
    }

    var isAdminLike: Bool {
        allRoleKeys.contains { APIUser.adminLikeRoleIdentifiers.contains($0) }
    }

    /// True only for top-level platform admins (admin / system_admin /
    /// superadmin) — excludes editors. Gates the in-app admin dashboard.
    var isPlatformAdmin: Bool {
        allRoleKeys.contains { APIUser.platformAdminRoleIdentifiers.contains($0) }
    }

    /// True when the user has a role that lets them submit content from the
    /// mobile app — surfaces the submission card in settings.
    var canSubmitContent: Bool {
        isWriter || isReporter || isAdminLike
    }
}

// MARK: - Error

nonisolated enum APIError: LocalizedError {
    case invalidURL
    case noResponse
    case unauthorized
    case forbidden
    case notFound
    case rateLimited
    case serverError(Int)
    case decodingError
    case apiMessage(String)
    /// Login failed because the account exists but is still pending
    /// email activation. Carries the server's localized message and
    /// the userId so the LoginSheet can offer a "resend activation"
    /// button targeted at the right account.
    case accountPendingActivation(message: String, userId: String?)

    var errorDescription: String? {
        switch self {
        case .invalidURL:       "رابط غير صالح"
        case .noResponse:       "لا يوجد استجابة من الخادم"
        case .unauthorized:     "يرجى تسجيل الدخول"
        case .forbidden:        "ليس لديك صلاحية"
        case .notFound:         "المحتوى غير موجود"
        case .rateLimited:      "طلبات كثيرة، حاول لاحقاً"
        case .serverError(let code): "خطأ في الخادم (\(code))"
        case .decodingError:    "خطأ في قراءة البيانات"
        case .apiMessage(let msg): msg
        case .accountPendingActivation(let msg, _): msg
        }
    }
}

// MARK: - Wrapper Helpers

nonisolated private struct WrappedArray<T: Decodable>: Decodable {
    let items: [T]

    init(from decoder: Decoder) throws {
        if let arr = try? decoder.singleValueContainer().decode([T].self) {
            items = arr
            return
        }
        let c = try decoder.container(keyedBy: FlexKey.self)
        items = (try? c.decode([T].self, forKey: FlexKey("data")))
            ?? (try? c.decode([T].self, forKey: FlexKey("items")))
            ?? (try? c.decode([T].self, forKey: FlexKey("results")))
            ?? (try? c.decode([T].self, forKey: FlexKey("opinions")))
            ?? (try? c.decode([T].self, forKey: FlexKey("related_articles")))
            ?? (try? c.decode([T].self, forKey: FlexKey("articles")))
            // `/api/v1/sections` wraps the list under `sections` — without
            // this the interests-picker and category fetch surfaces both
            // got an empty array and rendered as a blank screen.
            ?? (try? c.decode([T].self, forKey: FlexKey("sections")))
            ?? []
    }
}

nonisolated private struct WrappedObject<T: Decodable>: Decodable {
    let item: T

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let data = try? c.decode(T.self, forKey: FlexKey("data")) {
            item = data
        } else if let data = try? c.decode(T.self, forKey: FlexKey("item")) {
            item = data
        } else if let data = try? c.decode(T.self, forKey: FlexKey("opinion")) {
            item = data
        } else {
            item = try T(from: decoder)
        }
    }
}

nonisolated private struct WrappedOrDirect<T: Decodable>: Decodable {
    let value: T

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: FlexKey.self)
        if let wrapped = try? c.decode(T.self, forKey: FlexKey("data")) {
            value = wrapped
        } else if let wrapped = try? c.decode(T.self, forKey: FlexKey("user")) {
            value = wrapped
        } else {
            value = try T(from: decoder)
        }
    }
}

// MARK: - Comment Submission Body

nonisolated struct CommentSubmitBody: Encodable {
    let content: String
    let parentId: String?
    /// Source platform — lets the admin Smart Moderation dashboard
    /// show which app the comment came from. Fixed to "ios" here.
    let platform: String = "ios"
}

// MARK: - Type Erasure for Encodable

nonisolated private struct AnyEncodable: Encodable {
    private let _encode: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) {
        let encode = wrapped
        _encode = { try encode.encode(to: $0) }
    }
    func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}
