import Foundation
import Security

// MARK: - Keychain Helper

private enum KeychainHelper {
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

    private let baseURL = "https://sabq.org/api/v1"
    private let publicAPIBaseURL = "https://sabq.org/api"
    private let session: URLSession
    private let ephemeralSession: URLSession
    private let decoder: JSONDecoder
    private var authToken: String?
    private var csrfToken: String?

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 15
        config.timeoutIntervalForResource = 30
        config.urlCache = URLCache(
            memoryCapacity: 30_000_000,
            diskCapacity: 100_000_000
        )
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

    func markAuthenticated() {
        UserDefaults.standard.set(true, forKey: "sabq_is_authenticated")
    }

    func markLoggedOut() {
        UserDefaults.standard.removeObject(forKey: "sabq_is_authenticated")
        authToken = nil
        KeychainHelper.delete(forKey: "sabq_auth_token")
        guard let url = URL(string: baseURL) else { return }
        if let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            for cookie in cookies { HTTPCookieStorage.shared.deleteCookie(cookie) }
        }
    }

    var hasSession: Bool {
        UserDefaults.standard.bool(forKey: "sabq_is_authenticated")
    }

    // MARK: - CSRF

    private func ensureCSRF() async {
        guard csrfToken == nil else { return }
        guard let url = URL(string: "https://sabq.org/api/csrf-token") else { return }
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

    func post<T: Decodable>(_ type: T.Type, path: String, body: Encodable? = nil, apiRoot: String? = nil) async throws -> T {
        let url = try buildURL(path: path, apiRoot: apiRoot)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        return try await perform(request, as: type)
    }

    func postRaw(path: String, body: Encodable? = nil) async throws {
        let url = try buildURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        applyHeaders(&request)
        if let body {
            request.httpBody = try JSONEncoder().encode(AnyEncodable(body))
        }
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.serverError((response as? HTTPURLResponse)?.statusCode ?? 500)
        }
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
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.serverError((response as? HTTPURLResponse)?.statusCode ?? 500)
        }
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
        if let publicArticle = try? await get(
            APIArticle.self,
            path: "/articles/\(slug)",
            apiRoot: publicAPIBaseURL
        ) {
            return publicArticle
        }
        // Fallback: v1 wrapped shape. Used for content that's not on the
        // public surface (rare).
        let v1 = try await get(WrappedObject<APIArticle>.self, path: "/articles/\(slug)").item
        return v1
    }

    func fetchRelated(slug: String) async throws -> [APIArticle] {
        // Public API returns a bare JSON array; v1 doesn't have this
        // endpoint (404). Mirror fetchArticle: public-first, v1 fallback.
        if let bare = try? await get(
            [APIArticle].self,
            path: "/articles/\(slug)/related",
            apiRoot: publicAPIBaseURL
        ) {
            return bare
        }
        if let wrapped = try? await get(
            WrappedArray<APIArticle>.self,
            path: "/articles/\(slug)/related",
            apiRoot: publicAPIBaseURL
        ) {
            return wrapped.items
        }
        return try await get(
            WrappedArray<APIArticle>.self,
            path: "/articles/\(slug)/related"
        ).items
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

    func fetchAudioSummary(slug: String) async throws -> APIAudioSummary {
        try await get(WrappedObject<APIAudioSummary>.self, path: "/articles/\(slug)/summary-audio").item
    }

    func fetchAIInsights(slug: String) async throws -> [String: String] {
        try await get([String: String].self, path: "/articles/\(slug)/ai-insights")
    }

    // MARK: - Sections (Categories)

    func fetchCategories() async throws -> [APICategory] {
        try await get(WrappedArray<APICategory>.self, path: "/sections").items
    }

    func fetchCategoryArticles(slug: String, page: Int = 1, perPage: Int = 20) async throws -> APIPaginatedList<APIArticle> {
        try await get(APIPaginatedList<APIArticle>.self, path: "/articles", query: [
            "section": slug,
            "limit": "\(perPage)",
            "offset": "\((page - 1) * perPage)"
        ])
    }

    // MARK: - Breaking News

    func fetchBreakingTicker() async throws -> APIBreakingTicker {
        try await get(APIBreakingTicker.self, path: "/breaking")
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
        } catch {
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
        } catch {
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
        let allowed = CharacterSet.urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))
        let encodedKeyword = keyword.addingPercentEncoding(withAllowedCharacters: allowed) ?? keyword

        do {
            return try await get(
                WrappedArray<APIArticle>.self,
                path: "/keyword/\(encodedKeyword)",
                apiRoot: publicAPIBaseURL
            ).items
        } catch {
            return try await get(WrappedArray<APIArticle>.self, path: "/keyword/\(encodedKeyword)").items
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

    func fetchCurrentUser() async throws -> APIUser {
        try await get(WrappedOrDirect<APIUser>.self, path: "/members/profile").value
    }

    func updateProfile(firstName: String, lastName: String, bio: String?, city: String?) async throws -> APIUser {
        await ensureCSRF()
        var body: [String: String] = [
            "firstName": firstName,
            "lastName": lastName
        ]
        if let bio { body["bio"] = bio }
        if let city { body["city"] = city }
        return try await put(APIUser.self, path: "/members/profile", body: body)
    }

    func uploadAvatar(imageData: Data, filename: String = "avatar.png") async throws -> APIUser {
        await ensureCSRF()
        let url = try buildURL(path: "/members/profile/image")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let csrf = csrfToken {
            request.setValue(csrf, forHTTPHeaderField: "X-CSRF-TOKEN")
        }

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"avatar\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.noResponse }
        guard (200...299).contains(http.statusCode) else {
            if let apiErr = try? decoder.decode(APIErrorResponse.self, from: data), let msg = apiErr.message {
                throw APIError.apiMessage(msg)
            }
            throw APIError.serverError(http.statusCode)
        }
        let result = try decoder.decode(APIAvatarUploadResponse.self, from: data)
        return result.user
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

    // MARK: - Newsletter

    func subscribeNewsletter(email: String) async throws {
        try await postRaw(path: "/newsletter/subscribe", body: ["email": email])
    }

    // MARK: - Contact

    func sendContactMessage(name: String, email: String, message: String) async throws {
        try await postRaw(path: "/contact", body: [
            "name": name,
            "email": email,
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
        } catch {
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
            return try decoder.decode(type, from: data)
        default:
            if let apiErr = try? decoder.decode(APIErrorResponse.self, from: data),
               let msg = apiErr.message {
                throw APIError.apiMessage(msg)
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
