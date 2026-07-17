package com.sabq.smart.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Retrofit interface targeting `https://sabq.org/`. Paths mirror the
 * iOS `APIClient.swift` 1:1 — see lines 285-580 for the canonical
 * shapes.
 *
 * Two prefixes coexist:
 *   - `/api/v1/...` — mobile-specific Bearer-token routes
 *     (`appMemberSessions`). Public reads also work here but require
 *     no auth.
 *   - `/api/...` — Passport-session public routes. iOS uses this for
 *     article detail because v1 strips the full HTML body.
 */
interface SabqApi {

    // -- v1 (mobile) ---------------------------------------------------

    /**
     * Paginated articles list. Returns `{ articles: [...], total,
     * limit, offset, hasMore }`. Verified against production
     * 2026-05-19. The previously-attempted `/api/v1/news/paginated`
     * path 404s — likely a legacy iOS path that was renamed.
     */
    @GET("api/v1/articles")
    suspend fun getArticles(
        @Query("offset") offset: Int = 0,
        @Query("limit") limit: Int = 20,
        @Query("section") section: String? = null,
        @Query("featured") featured: Boolean? = null,
    ): ApiArticlesResponse

    @GET("api/v1/sections")
    suspend fun getSections(): ApiSectionsResponse

    /**
     * Full-text article search. Backend returns the same shape as
     * `/api/v1/articles` plus a `query` echo and a global `total`
     * count across the index (often very large — 12k+ for common
     * words). iOS path: APIClient.search at line 412.
     */
    @GET("api/v1/search")
    suspend fun search(
        @Query("q") query: String,
        @Query("page") page: Int = 1,
    ): ApiSearchResponse

    @GET("api/v1/breaking")
    suspend fun getBreaking(): ApiBreakingTicker

    /**
     * Dashboard-curated breaking ticker. Public namespace (NOT v1),
     * mirroring iOS `APIClient.fetchBreakingTicker`
     * (Services/APIClient.swift:449 → `/breaking-ticker/active`).
     * Returns `{ topic, headlines }` or a bare `null` when no topic is
     * active — the null body fails kotlinx decoding, so callers wrap
     * the call in `runCatching` and fall back to the single breaking
     * article pill.
     */
    @GET("api/breaking-ticker/active")
    suspend fun getBreakingTickerActive(): ApiBreakingTickerActive

    /** Trending page — top articles + keywords. iOS uses
     *  `articlesStore.trendingArticles.prefix(3)` on Home and the full
     *  list (plus `tags`) on the dedicated `TrendingView`. */
    @GET("api/v1/trending")
    suspend fun getTrending(): ApiTrendingPageResponse

    // -- home extras (public namespace, NOT v1) ----------------------

    /** Story rails — circular bubbles at the top of Home. iOS uses
     *  `/api/stories` (public). Response shape: `{ items: [...] }`. */
    @GET("api/stories")
    suspend fun getStories(): ApiStoriesResponse

    /** Today's upcoming calendar events. Public namespace per iOS
     *  `APIClient.fetchUpcomingCalendarEvents` (line 1140). */
    @GET("api/calendar/upcoming")
    suspend fun getCalendarUpcoming(
        @Query("days") days: Int = 14,
    ): ApiCalendarEventsResponse

    /** Audio newsletters list. Public namespace per iOS line 1175. */
    @GET("api/audio-newsletters")
    suspend fun getAudioNewsletters(): ApiAudioNewslettersResponse

    /**
     * Seasonal "صدى الحج" homepage block. Backend gates visibility on
     * a dashboard toggle + season window, so the response can come back
     * with `isVisible: false` and no other fields. iOS counterpart:
     * `APIClient.fetchHajjBlock` (`Services/APIClient.swift:1106`).
     * Public namespace (NOT `/api/v1/`).
     */
    @GET("api/hajj-block")
    suspend fun getHajjBlock(): ApiHajjBlockResponse

    // -- public (article detail / opinions) ---------------------------

    /**
     * Public article detail — preferred over `/api/v1/articles/{slug}`
     * because v1 strips the full HTML body. See APIClient.swift line
     * 308 commentary.
     */
    @GET("api/articles/{slug}")
    suspend fun getArticleBySlug(@Path("slug") slug: String): ApiArticle

    /**
     * Related-articles list for the bottom of the article detail
     * screen. Same wrapper shape as `/articles`: `{ articles: [...] }`.
     * iOS counterpart: `APIClient.fetchRelated` at
     * `Services/APIClient.swift:327`.
     */
    @GET("api/articles/{slug}/related")
    suspend fun getRelatedArticles(@Path("slug") slug: String): List<ApiArticle>

    @GET("api/articles/{articleId}/media-assets")
    suspend fun getMediaAssets(@Path("articleId") articleId: String): List<ApiMediaAsset>

    /**
     * Content Passport ("جواز المحتوى") — the trust + provenance
     * fingerprint surfaced by the green "موثَّق" badge.
     * Server: `server/services/articlePassportService.ts`.
     * iOS counterpart: `APIClient.fetchPassport`
     * (`Services/APIClient.swift:352`).
     */
    @GET("api/articles/{slug}/passport")
    suspend fun getPassport(@Path("slug") slug: String): ApiPassport

    // -- auth ---------------------------------------------------------

    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequest): ApiLoginResponse

    /** إرسال رمز OTP للجوال (Twilio Verify). */
    @POST("api/v1/auth/phone/send")
    suspend fun sendPhoneCode(@Body body: PhoneSendRequest): PhoneSendResponse

    /** التحقق من رمز الجوال وإصدار جلسة عضو. */
    @POST("api/v1/auth/phone/verify")
    suspend fun verifyPhoneCode(@Body body: PhoneVerifyRequest): ApiLoginResponse

    @POST("api/v1/auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiLoginResponse

    /**
     * Native OAuth login via Apple Sign-In. The `identityToken` is the JWT
     * obtained from the Apple authorization-code exchange (Custom Tab flow
     * on Android). Backend verifies it against `APPLE_IOS_BUNDLE_ID` and
     * `APPLE_CLIENT_ID` audiences and issues an `appMemberSessions` token.
     * See `server/routes/v1/oauthMobile.ts:221`.
     */
    @POST("api/v1/auth/apple")
    suspend fun loginWithApple(@Body body: AppleOAuthRequest): ApiLoginResponse

    /**
     * Native OAuth login via Google Sign-In through Credential Manager.
     * Backend verifies `idToken` against `GOOGLE_CLIENT_ID` +
     * `GOOGLE_IOS_CLIENT_ID` + `GOOGLE_ANDROID_CLIENT_ID` audiences and
     * issues an `appMemberSessions` token. See `oauthMobile.ts:92`.
     */
    @POST("api/v1/auth/google")
    suspend fun loginWithGoogle(@Body body: GoogleOAuthRequest): ApiLoginResponse

    /**
     * Re-send the account-activation email when login surfaced
     * `requiresActivation: true`. Accepts either userId or email —
     * passing both lets the server pick the more reliable lookup.
     */
    @POST("api/v1/auth/resend-activation")
    suspend fun resendActivation(@Body body: ResendActivationRequest): ResendActivationResponse

    @POST("api/v1/auth/logout")
    suspend fun logout(): retrofit2.Response<Unit>

    /**
     * Register the device's FCM token with the editorial-push backend.
     * iOS counterpart: APNs registration. Server upserts on
     * `deviceToken`, derives `tokenProvider = "fcm"` when `platform =
     * "android"`. See `mobileApiRoutes.ts:498`.
     */
    @POST("api/v1/devices/register")
    suspend fun registerDevice(@Body body: DeviceRegisterRequest): DeviceRegisterResponse

    /** Drop the device row when the user signs out or revokes pushes. */
    @HTTP(method = "DELETE", path = "api/v1/devices/unregister", hasBody = true)
    suspend fun unregisterDevice(@Body body: DeviceUnregisterRequest): retrofit2.Response<Unit>

    /** App-scoped FCM registration for Gulf Cup Majlis notifications. */
    @POST("api/v1/members/push-token")
    suspend fun registerMemberPushToken(@Body body: MemberPushTokenRequest): MemberPushTokenResponse

    @HTTP(method = "DELETE", path = "api/v1/members/push-token", hasBody = true)
    suspend fun unregisterMemberPushToken(
        @Body body: MemberPushTokenDeleteRequest,
    ): MemberPushTokenResponse

    /**
     * Authenticated user profile. iOS uses `/v1/members/profile`
     * (NOT `/auth/me` — that path 404s on production).
     *
     * Response shape: `{ success, user: {...} }` — see
     * `mobileApiRoutes.ts:1605`. Callers unwrap via [getProfileOrThrow]
     * below.
     */
    @GET("api/v1/members/profile")
    suspend fun getProfileEnvelope(): MemberProfileResponse

    // -- loyalty ------------------------------------------------------

    /**
     * Member's loyalty summary: tier, lifetime + week + month points,
     * streak days. Bearer-token required (401 anonymous).
     */
    @GET("api/v1/loyalty/me")
    suspend fun getLoyaltyMe(): ApiLoyaltySummary

    /**
     * Submit a batch of loyalty events (read / read-deep / like / share /
     * comment / notification-open / daily-login). Powers the on-device
     * [com.sabq.smart.data.LoyaltyEventQueue] flush. Bearer-token
     * required — anonymous calls 401 and the queue retries with backoff
     * until the user signs in.
     *
     * Backend caps batch size at 100 events (mobileApiRoutes.ts:5772);
     * the queue itself slices to 50 to keep request size bounded. The
     * server applies daily caps + dedup in `awardPoints()` so retries
     * after a network failure don't produce duplicate points.
     */
    @POST("api/v1/loyalty/events")
    suspend fun submitLoyaltyEvents(@Body body: LoyaltyEventBatchRequest): LoyaltyEventBatchResponse

    /**
     * Paginated activity log for the signed-in member — drives the
     * "سجل نقاطي" screen. Page size capped server-side at 50; we
     * default to 20 to match iOS. Bearer-token required (401 anonymous).
     * Backend handler: `mobileApiRoutes.ts:5820`.
     */
    @GET("api/v1/loyalty/history")
    suspend fun getLoyaltyHistory(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): ApiLoyaltyHistoryResponse

    /**
     * Catalog of redeemable rewards + the caller's point balance. iOS
     * mirror: `APIClient.fetchLoyaltyRewards` (`Services/APIClient.swift`).
     * Backend route: `mobileApiRoutes.ts` — `/loyalty/rewards`.
     */
    @GET("api/v1/loyalty/rewards")
    suspend fun getLoyaltyRewards(): ApiLoyaltyRewardsResponse

    /**
     * Redeem a specific reward. Server may reject with success=false +
     * a human message if stock ran out, per-user cap hit, or balance
     * drifted below the cost between catalog load and tap. UI surfaces
     * the message as an error banner instead of throwing.
     */
    @POST("api/v1/loyalty/rewards/{id}/redeem")
    suspend fun redeemLoyaltyReward(@Path("id") id: String): ApiLoyaltyRedeemResponse

    // -- insights (personal knowledge journey) -----------------------

    /**
     * Today's "knowledge journey" payload for the signed-in member —
     * greeting + reading time + completion rate + likes + comments +
     * top-3 interest category names. Bearer-token required (401
     * anonymous). Mirrors iOS `APIClient.fetchTodayInsightsRich`
     * (`Services/APIClient.swift:1011`). Backend handler is at
     * `server/routes/mobileApiRoutes.ts:4349`.
     */
    @GET("api/v1/insights/today")
    suspend fun getInsightsToday(): ApiTodayInsights

    // -- comments -----------------------------------------------------

    /**
     * List comments on an article. Returns a bare top-level array
     * with `replies: [...]` nested. Verified live 2026-05-19:
     * `/api/v1/articles/<slug>/comments` returns 200 with `[]` for
     * articles without comments.
     */
    @GET("api/v1/articles/{slug}/comments")
    suspend fun getComments(@Path("slug") slug: String): List<ApiComment>

    /**
     * Submit a comment / reply. Bearer-token required. Body:
     * `{ content, parentId? }`. Default status = "pending"; AI
     * moderation (GPT-4o-mini) runs async after this returns.
     */
    @POST("api/v1/articles/{slug}/comments")
    suspend fun postComment(
        @Path("slug") slug: String,
        @Body body: CommentSubmitBody,
    ): ApiComment

    // -- opinions -----------------------------------------------------

    /**
     * Opinion articles list — separate endpoint from the news feed.
     * iOS uses `/api/opinion` (public namespace, NOT v1) because v1
     * doesn't expose this. Same wrapper shape as `/articles`:
     * `{ articles: [...], total, hasMore }`. Verified live
     * 2026-05-19.
     */
    /**
     * Trending search keywords for the Explore screen's "الأكثر بحثاً"
     * pill flow. Public namespace, NOT v1. iOS counterpart at
     * `APIClient.fetchTrendingKeywords` (`Services/APIClient.swift:428`).
     * Response shape: `[{ keyword, count, category }]`.
     */
    @GET("api/trending-keywords")
    suspend fun getTrendingKeywords(): List<ApiTrendingKeyword>

    @GET("api/opinion")
    suspend fun getOpinions(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
        /** Accepts "trending" (last-48h by views) or null (latest by
         *  publishedAt DESC). iOS counterpart at OpinionsView.swift:304-305. */
        @Query("sort") sort: String? = null,
    ): ApiArticlesResponse

    // -- account management ------------------------------------------

    @POST("api/v1/members/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): retrofit2.Response<Unit>

    @POST("api/v1/auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): retrofit2.Response<Unit>

    @POST("api/v1/auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): retrofit2.Response<Unit>

    /** Retrofit doesn't ship a `@DELETE` body helper without
     *  `@HTTP`, so we use the verbose form. iOS sends the password
     *  in the JSON body — same here. */
    @retrofit2.http.HTTP(method = "DELETE", path = "api/v1/members/account", hasBody = true)
    suspend fun deleteAccount(@Body body: DeleteAccountRequest): retrofit2.Response<Unit>

    @PUT("api/v1/members/profile")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): ApiUpdateProfileResponse

    /** Fetch the member's interest category list — joined with the
     *  `categories` table so we receive name/slug/colour per row. iOS
     *  also pulls this from `/v1/members/profile` (interests array on
     *  the user); we keep a dedicated call too for the DailyBrief +
     *  InterestsPicker fresh-fetch path. */
    @GET("api/v1/members/interests")
    suspend fun getMemberInterests(): ApiMemberInterestsResponse

    /** Replace the authenticated member's interest list. Backend wipes
     *  prior rows + inserts new ones (mobileApiRoutes.ts:2079). iOS
     *  refreshes the profile after this returns; we do the same. */
    @POST("api/v1/members/interests")
    suspend fun updateMemberInterests(@Body body: UpdateMemberInterestsRequest): retrofit2.Response<Unit>

    @POST("api/v1/newsletter/subscribe")
    suspend fun subscribeNewsletter(@Body body: NewsletterSubscribeRequest): retrofit2.Response<Unit>

    @POST("api/v1/newsletter/unsubscribe")
    suspend fun unsubscribeNewsletter(@Body body: NewsletterUnsubscribeRequest): retrofit2.Response<Unit>

    @GET("api/v1/newsletter/status")
    suspend fun newsletterStatus(@Query("email") email: String): NewsletterStatusResponse

    @POST("api/v1/contact")
    suspend fun sendContactMessage(@Body body: ContactMessageRequest): retrofit2.Response<Unit>

    @POST("api/v1/members/profile/image")
    suspend fun uploadAvatar(@Body body: AvatarUploadRequest): ApiAvatarUploadResponse

    @retrofit2.http.DELETE("api/v1/members/profile/image")
    suspend fun deleteAvatar(): retrofit2.Response<Unit>

    /** Writer/reporter article submission. Backend derives the kind
     *  from RBAC roles; admins can override via `kind`. */
    @POST("api/v1/articles/submit")
    suspend fun submitArticle(@Body body: ArticleSubmissionRequest): ApiArticleSubmissionResponse

    // -- editorial notifications -------------------------------------

    /**
     * Latest 50 editorial notifications for the signed-in author —
     * scheduled / published / rejected / needs_revision / archived.
     * Newest first. Bearer-token required. iOS APIClient line 766.
     * Returns `{ success, items: [...], unread }`.
     */
    @GET("api/v1/notifications")
    suspend fun getEditorialNotifications(): ApiEditorialNotificationsPage

    @POST("api/v1/notifications/{id}/read")
    suspend fun markEditorialNotificationRead(@Path("id") id: String): retrofit2.Response<Unit>

    @POST("api/v1/notifications/read-all")
    suspend fun markAllEditorialNotificationsRead(): retrofit2.Response<Unit>

    @DELETE("api/v1/notifications/{id}")
    suspend fun deleteEditorialNotification(@Path("id") id: String): retrofit2.Response<Unit>

    @DELETE("api/v1/notifications")
    suspend fun deleteAllEditorialNotifications(): retrofit2.Response<Unit>

    @GET("api/v1/notifications/preferences")
    suspend fun getNotificationPreferences(): ApiEditorialNotificationPreferencesEnvelope

    @PUT("api/v1/notifications/preferences")
    suspend fun updateNotificationPreferences(
        @Body body: ApiEditorialNotificationPreferences,
    ): retrofit2.Response<Unit>

    // -- likes and behavior ------------------------------------------

    @POST("api/v1/articles/{id}/react")
    suspend fun toggleArticleLike(
        @Path("id") articleId: String,
    ): ApiArticleReactionResponse

    @GET("api/v1/articles/{id}/react")
    suspend fun fetchArticleLikeStatus(
        @Path("id") articleId: String,
    ): ApiArticleReactionResponse

    @POST("api/v1/behavior/track")
    suspend fun trackBehavior(
        @Body body: ApiBehaviorEventRequest,
    ): retrofit2.Response<Unit>

    // -- bookmarks (server-synced) ------------------------------------

    @GET("api/v1/bookmarks")
    suspend fun getBookmarks(): ApiBookmarksResponse

    @POST("api/v1/bookmarks/{articleId}")
    suspend fun addBookmark(@Path("articleId") articleId: String): retrofit2.Response<Unit>

    @DELETE("api/v1/bookmarks/{articleId}")
    suspend fun removeBookmark(@Path("articleId") articleId: String): retrofit2.Response<Unit>

    /**
     * AI-derived insights for an article — sentiment, credibility,
     * engagement metrics. iOS `APIClient.fetchAIInsights` (Services
     * /APIClient.swift:372). Public, NOT v1. The response is a
     * flexible key/value map (values may be String OR Number); we
     * decode as `Map<String, Any>` and the screen reads just the
     * `sentiment` key for the labels-row pill.
     */
    @GET("api/articles/{slug}/ai-insights")
    suspend fun fetchArticleAiInsights(
        @Path("slug") slug: String,
    ): Map<String, Any>

    // -- moment-by-moment --------------------------------------------

    /**
     * Reverse-chronological news feed. Cursor-based pagination via
     * `nextCursor` (an ISO timestamp). Filter accepts only `"breaking"`;
     * any other value is dropped server-side. iOS APIClient line 462+.
     * Public namespace, NOT v1.
     */
    @GET("api/live/updates")
    suspend fun getLiveUpdates(
        @Query("cursor") cursor: String? = null,
        @Query("filter") filter: String? = null,
        @Query("limit") limit: Int = 20,
    ): ApiLiveUpdatesResponse

    /**
     * Full multi-country live coverage feed — distinct from
     * `/api/live/updates` above. Powers the topical LiveCoverageView
     * (Gulf attacks etc.) with timeline + countries + stats. iOS
     * APIClient line 440. Backend route: mobileApiRoutes.ts line 3279.
     */
    @GET("api/v1/live")
    suspend fun getLiveCoverage(
        @Query("country") country: String? = null,
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
        @Query("since") since: String? = null,
    ): ApiLiveResponse

    // -- keyword & authors -------------------------------------------

    @GET("api/keyword/{keyword}")
    suspend fun getArticlesByKeyword(@Path("keyword") keyword: String): List<ApiArticle>

    @GET("api/v1/authors/by-name")
    suspend fun getAuthorPage(
        @Query("name") name: String,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): ApiAuthorPage

    // -- contributor dashboard ----------------------------------------

    @GET("api/v1/contributor/analytics")
    suspend fun getContributorAnalytics(): ApiContributorAnalytics

    @GET("api/v1/contributor/ranking")
    suspend fun getContributorRanking(): ApiContributorRanking

    // -- مُقترب (Muqtarab analytical angles) -------------------------
    // Public namespace (NOT v1), no auth. Paths mirror iOS
    // `MuqtarabModels.swift` `APIClient` extension 1:1.

    /** All active angles (with topic-count + writer stats). Returns a
     *  bare `[ApiMuqAngle]` array. iOS: `fetchMuqtarabAngles`. */
    @GET("api/muqtarab/angles")
    suspend fun getMuqtarabAngles(
        @Query("active") active: Boolean = true,
        @Query("withStats") withStats: Boolean = true,
    ): List<ApiMuqAngle>

    /** Latest/featured published topics (home strip + landing). Bare
     *  `[ApiMuqTopic]` array. iOS: `fetchMuqtarabFeaturedTopics`. */
    @GET("api/muqtarab/topics/featured")
    suspend fun getMuqtarabFeaturedTopics(
        @Query("limit") limit: Int = 8,
    ): List<ApiMuqTopic>

    /** A single angle's header + writer. iOS:
     *  `fetchMuqtarabAngleDetail`. */
    @GET("api/muqtarab/angles/{slug}")
    suspend fun getMuqtarabAngleDetail(@Path("slug") slug: String): ApiMuqAngleDetail

    /** A single angle's published topics. iOS:
     *  `fetchMuqtarabAngleTopics`. */
    @GET("api/muqtarab/angles/{slug}/topics")
    suspend fun getMuqtarabAngleTopics(
        @Path("slug") slug: String,
        @Query("limit") limit: Int = 30,
    ): ApiMuqTopicsResponse

    /** A published topic + its angle + writer. iOS:
     *  `fetchMuqtarabTopic`. */
    @GET("api/muqtarab/angles/{angleSlug}/topics/{topicSlug}")
    suspend fun getMuqtarabTopic(
        @Path("angleSlug") angleSlug: String,
        @Path("topicSlug") topicSlug: String,
    ): ApiMuqTopicDetailResponse

    /** Writer page: bio + their angles + published topics. iOS:
     *  `fetchMuqtarabWriter`. */
    @GET("api/muqtarab/writers/{id}")
    suspend fun getMuqtarabWriter(@Path("id") id: String): ApiMuqWriterProfile

    /** Best-effort view registration for a topic. iOS:
     *  `reportMuqtarabTopicView`. */
    @POST("api/muqtarab/topics/{id}/view")
    suspend fun reportMuqtarabTopicView(@Path("id") id: String): retrofit2.Response<Unit>

    // -- World Cup 2026 (نقاط عامة على api.sabq.org مباشرة، مطابقة لـiOS) ----
    // روابط مطلقة تتجاوز baseUrl(sabq.org) لتضرب الخادم مباشرة دون وسيط Pages.

    @GET("https://api.sabq.org/api/world-cup/overview")
    suspend fun getWorldCupOverview(): com.sabq.smart.feature.worldcup.WcOverview

    @GET("https://api.sabq.org/api/world-cup/fixtures")
    suspend fun getWorldCupFixtures(): com.sabq.smart.feature.worldcup.WcFixturesResponse

    @GET("https://api.sabq.org/api/world-cup/standings")
    suspend fun getWorldCupStandings(): com.sabq.smart.feature.worldcup.WcStandingsResponse

    @GET("https://api.sabq.org/api/world-cup/scorers")
    suspend fun getWorldCupScorers(): com.sabq.smart.feature.worldcup.WcScorersResponse

    @GET("https://api.sabq.org/api/world-cup/assists")
    suspend fun getWorldCupAssists(): com.sabq.smart.feature.worldcup.WcLeadersResponse

    @GET("https://api.sabq.org/api/world-cup/cards")
    suspend fun getWorldCupCards(): com.sabq.smart.feature.worldcup.WcLeadersResponse

    @GET("https://api.sabq.org/api/world-cup/teams")
    suspend fun getWorldCupTeams(): com.sabq.smart.feature.worldcup.WcTeamsResponse

    @GET("https://api.sabq.org/api/world-cup/squad/{teamId}")
    suspend fun getWorldCupSquad(@Path("teamId") teamId: Int): com.sabq.smart.feature.worldcup.WcSquad

    @GET("https://api.sabq.org/api/world-cup/match/{id}")
    suspend fun getWorldCupMatch(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcMatchDetail

    @GET("https://api.sabq.org/api/world-cup/player/{id}")
    suspend fun getWorldCupPlayer(@Path("id") playerId: Int): com.sabq.smart.feature.worldcup.WcPlayerCard

    @GET("https://api.sabq.org/api/world-cup/facts")
    suspend fun getWorldCupFacts(): com.sabq.smart.feature.worldcup.WcCompetitionFacts

    @GET("https://api.sabq.org/api/world-cup/bracket")
    suspend fun getWorldCupBracket(): com.sabq.smart.feature.worldcup.WcBracket

    @GET("https://api.sabq.org/api/world-cup/news")
    suspend fun getWorldCupNews(@Query("limit") limit: Int = 8): com.sabq.smart.feature.worldcup.WcNewsResponse

    @GET("https://api.sabq.org/api/world-cup/team/{id}")
    suspend fun getWorldCupTeam(@Path("id") teamId: Int): com.sabq.smart.feature.worldcup.WcTeamProfile

    // -- إثراء مركز المباراة (أفضل-جهد، عبر api.sabq.org) ------------------
    @GET("https://api.sabq.org/api/world-cup/match-facts/{id}")
    suspend fun getWorldCupMatchFacts(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcMatchFacts

    @GET("https://api.sabq.org/api/world-cup/xg/{id}")
    suspend fun getWorldCupXg(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcXg

    @GET("https://api.sabq.org/api/world-cup/forecast/{id}")
    suspend fun getWorldCupForecast(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcForecast

    @GET("https://api.sabq.org/api/world-cup/pressure/{id}")
    suspend fun getWorldCupPressure(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcPressure

    @GET("https://api.sabq.org/api/world-cup/momentum/{id}")
    suspend fun getWorldCupMomentum(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcMomentum

    @GET("https://api.sabq.org/api/world-cup/commentary/{id}")
    suspend fun getWorldCupCommentary(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcCommentary

    @GET("https://api.sabq.org/api/world-cup/match/{id}/tv")
    suspend fun getWorldCupTv(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcTvListing

    @GET("https://api.sabq.org/api/world-cup/pulse/{id}")
    suspend fun getWorldCupPulse(@Path("id") fixtureId: Int): com.sabq.smart.feature.worldcup.WcPulse

    @GET("https://api.sabq.org/api/world-cup/player/{id}/market")
    suspend fun getWorldCupPlayerMarket(@Path("id") playerId: Int): com.sabq.smart.feature.worldcup.WcPlayerMarket

    @GET("https://api.sabq.org/api/world-cup/player/{id}/form")
    suspend fun getWorldCupPlayerForm(@Path("id") playerId: Int): com.sabq.smart.feature.worldcup.WcPlayerForm

    // -- كأس آسيا 2027 ------------------------------------------------------
    @GET("api/asian-cup/overview")
    suspend fun getAsianCupOverview(): com.sabq.smart.feature.asiancup.AcOverview

    @GET("api/asian-cup/fixtures")
    suspend fun getAsianCupFixtures(): com.sabq.smart.feature.asiancup.AcFixturesResponse

    @GET("api/asian-cup/standings")
    suspend fun getAsianCupStandings(): com.sabq.smart.feature.asiancup.AcStandingsResponse

    @GET("api/asian-cup/teams")
    suspend fun getAsianCupTeams(): com.sabq.smart.feature.asiancup.AcTeamsResponse

    @GET("api/asian-cup/team/{id}")
    suspend fun getAsianCupTeam(@Path("id") teamId: Int): com.sabq.smart.feature.asiancup.AcTeamProfile

    @GET("api/asian-cup/match/{id}")
    suspend fun getAsianCupMatch(@Path("id") fixtureId: Int): com.sabq.smart.feature.asiancup.AcMatchDetail

    @GET("api/asian-cup/scorers")
    suspend fun getAsianCupScorers(): com.sabq.smart.feature.asiancup.AcScorersResponse

    @GET("api/asian-cup/bracket")
    suspend fun getAsianCupBracket(): com.sabq.smart.feature.asiancup.AcBracket

    @GET("api/v1/asian-cup/predictions/today")
    suspend fun getAsianCupPredictionsToday(): com.sabq.smart.feature.asiancup.AcPredictionsTodayResponse

    @POST("api/v1/asian-cup/predictions")
    suspend fun submitAsianCupPrediction(
        @Body body: com.sabq.smart.feature.asiancup.AcPredictionSubmitBody,
    ): com.sabq.smart.feature.asiancup.AcPredictionSubmitResponse

    @GET("api/v1/asian-cup/predictions/leaderboard")
    suspend fun getAsianCupPredictionsLeaderboard(): com.sabq.smart.feature.asiancup.AcPredictionLeaderboardResponse

    // -- خليجي 27 (Gulf Cup 27 — جدة 2026) --------------------------------
    @GET("https://api.sabq.org/api/gulf-cup/overview")
    suspend fun getGulfCupOverview(): com.sabq.smart.feature.gulfcup.GcOverview

    @GET("https://api.sabq.org/api/gulf-cup/fixtures")
    suspend fun getGulfCupFixtures(): com.sabq.smart.feature.gulfcup.GcFixturesResponse

    @GET("https://api.sabq.org/api/gulf-cup/standings")
    suspend fun getGulfCupStandings(): com.sabq.smart.feature.gulfcup.GcStandingsResponse

    @GET("https://api.sabq.org/api/gulf-cup/teams")
    suspend fun getGulfCupTeams(): com.sabq.smart.feature.gulfcup.GcTeamsResponse

    @GET("https://api.sabq.org/api/gulf-cup/team/{id}")
    suspend fun getGulfCupTeam(@Path("id") teamId: Int): com.sabq.smart.feature.gulfcup.GcTeamProfile

    @GET("https://api.sabq.org/api/gulf-cup/match/{id}")
    suspend fun getGulfCupMatch(@Path("id") fixtureId: Int): com.sabq.smart.feature.gulfcup.GcMatchDetail

    // -- خليجي 27: التوقعات والمجالس (Bearer /api/v1 فقط) -----------------

    @GET("api/v1/gulf-cup/predictions/today")
    suspend fun getGcPredictionsToday(): com.sabq.smart.feature.gulfcup.GcPredictionsTodayResponse

    @POST("api/v1/gulf-cup/predictions")
    suspend fun submitGcPrediction(
        @Body body: com.sabq.smart.feature.gulfcup.GcPredictionSubmitBody,
    ): com.sabq.smart.feature.gulfcup.GcPredictionSubmitResponse

    @GET("api/v1/gulf-cup/predictions/leaderboard")
    suspend fun getGcPredictionsLeaderboard(): com.sabq.smart.feature.gulfcup.GcPredictionLeaderboardResponse

    @GET("api/v1/gulf-cup/predictions/mine")
    suspend fun getGcMyPredictions(): com.sabq.smart.feature.gulfcup.GcMyPredictionsResponse

    @GET("api/v1/gulf-cup/predictions/long")
    suspend fun getGcLongPredictions(): com.sabq.smart.feature.gulfcup.GcLongData

    @POST("api/v1/gulf-cup/predictions/long")
    suspend fun submitGcLongPrediction(
        @Body body: com.sabq.smart.feature.gulfcup.GcLongSubmitBody,
    ): com.sabq.smart.feature.gulfcup.GcOkResponse

    @GET("api/v1/gulf-cup/majlis/mine")
    suspend fun getGcMajalis(): com.sabq.smart.feature.gulfcup.GcMajalisResponse

    @POST("api/v1/gulf-cup/majlis")
    suspend fun createGcMajlis(
        @Body body: com.sabq.smart.feature.gulfcup.GcMajlisNameBody,
    ): com.sabq.smart.feature.gulfcup.GcMajlisSummary

    @POST("api/v1/gulf-cup/majlis/join")
    suspend fun joinGcMajlis(
        @Body body: com.sabq.smart.feature.gulfcup.GcMajlisCodeBody,
    ): com.sabq.smart.feature.gulfcup.GcMajlisSummary

    @GET("api/v1/gulf-cup/majlis/invite/{code}")
    suspend fun getGcMajlisInvite(
        @Path("code") code: String,
    ): com.sabq.smart.feature.gulfcup.GcMajlisInvitePreview

    @GET("api/v1/gulf-cup/majlis/{id}/leaderboard")
    suspend fun getGcMajlisBoard(
        @Path("id") majlisId: String,
    ): com.sabq.smart.feature.gulfcup.GcMajlisBoard

    @DELETE("api/v1/gulf-cup/majlis/{id}")
    suspend fun leaveGcMajlis(
        @Path("id") majlisId: String,
    ): com.sabq.smart.feature.gulfcup.GcLeaveResponse

    @GET("api/v1/gulf-cup/majlis/{id}/matchday")
    suspend fun getGcMajlisMatchday(
        @Path("id") majlisId: String,
        @Query("date") date: String? = null,
    ): com.sabq.smart.feature.gulfcup.GcMajlisMatchdayResponse

    @GET("api/v1/gulf-cup/majlis/{id}/fantasy")
    suspend fun getGcMajlisFantasy(
        @Path("id") majlisId: String,
    ): com.sabq.smart.feature.gulfcup.GcMajlisFantasyResponse

    @GET("api/v1/gulf-cup/majlis/{id}/champion-picks")
    suspend fun getGcMajlisChampionPicks(
        @Path("id") majlisId: String,
    ): com.sabq.smart.feature.gulfcup.GcMajlisChampionPicksResponse

    @GET("api/v1/gulf-cup/majlis/{id}/harvest")
    suspend fun getGcMajlisHarvest(
        @Path("id") majlisId: String,
    ): com.sabq.smart.feature.gulfcup.GcMajlisHarvestResponse

    @GET("api/v1/gulf-cup/majlis/{id}/duels")
    suspend fun getGcMajlisDuels(
        @Path("id") majlisId: String,
    ): com.sabq.smart.feature.gulfcup.GcMajlisDuelsResponse

    @POST("api/v1/gulf-cup/majlis/{id}/duels")
    suspend fun createGcMajlisDuel(
        @Path("id") majlisId: String,
        @Body body: com.sabq.smart.feature.gulfcup.GcMajlisDuelCreateBody,
    ): com.sabq.smart.feature.gulfcup.GcMajlisDuelMutationResponse

    @POST("api/v1/gulf-cup/majlis/duels/{id}/{action}")
    suspend fun mutateGcMajlisDuel(
        @Path("id") duelId: String,
        @Path("action") action: String,
        @Body body: Map<String, String> = emptyMap(),
    ): com.sabq.smart.feature.gulfcup.GcMajlisDuelMutationResponse

    @GET("api/v1/gulf-cup/majlis/notification-preference")
    suspend fun getGcMajlisNotificationPreference(): com.sabq.smart.feature.gulfcup.GcMajlisNotificationPreference

    @PUT("api/v1/gulf-cup/majlis/notification-preference")
    suspend fun updateGcMajlisNotificationPreference(
        @Body body: com.sabq.smart.feature.gulfcup.GcMajlisNotificationPreferenceBody,
    ): com.sabq.smart.feature.gulfcup.GcMajlisNotificationPreference

    @GET("api/v1/gulf-cup/fantasy/leaderboard")
    suspend fun getGcFantasyLeaderboard(): com.sabq.smart.feature.gulfcup.GcFantasyLeaderboardResponse

    // -- المتابعة الرياضية + تنبيهات المباريات (Bearer، عبر sabq.org) --------
    @GET("api/v1/sports/follows")
    suspend fun getSportsFollows(): com.sabq.smart.feature.worldcup.SportsFollowsResponse

    @POST("api/v1/sports/follows")
    suspend fun addSportsFollow(@Body body: com.sabq.smart.feature.worldcup.SportsFollowBody)

    @HTTP(method = "DELETE", path = "api/v1/sports/follows", hasBody = true)
    suspend fun removeSportsFollow(@Body body: com.sabq.smart.feature.worldcup.SportsFollowBody)

    @GET("api/v1/sports/alert-prefs")
    suspend fun getSportsAlertPrefs(): com.sabq.smart.feature.worldcup.SportsAlertPrefsResponse

    @PUT("api/v1/sports/alert-prefs")
    suspend fun updateSportsAlertPrefs(@Body prefs: com.sabq.smart.feature.worldcup.SportsAlertPreferences)

    // -- مسابقة التوقّعات (Bearer، عبر sabq.org) --------------------------
    @GET("api/v1/world-cup/predictions/today")
    suspend fun getWcPredictionsToday(): com.sabq.smart.feature.worldcup.WcPredTodayResponse

    @POST("api/v1/world-cup/predictions")
    suspend fun submitWcPrediction(@Body body: com.sabq.smart.feature.worldcup.WcPredictionSubmitBody)

    @GET("api/v1/world-cup/predictions/mine")
    suspend fun getWcMyPredictions(): com.sabq.smart.feature.worldcup.WcPredMineResponse

    @GET("api/v1/world-cup/predictions/leaderboard")
    suspend fun getWcLeaderboard(): com.sabq.smart.feature.worldcup.WcLeaderboardResponse

    // -- توقّعات البطولة: البطل + الهدّاف (Bearer) --
    @GET("api/v1/world-cup/predictions/long")
    suspend fun getWcLongPredictions(): com.sabq.smart.feature.worldcup.WcLongData

    @POST("api/v1/world-cup/predictions/long")
    suspend fun submitWcLongPrediction(@Body body: com.sabq.smart.feature.worldcup.WcLongSubmitBody): com.sabq.smart.feature.worldcup.WcLongSubmitResponse

    // -- المنصة المركزية للتوقّعات (Bearer) — كل البطولات ما عدا المونديال --
    @GET("api/v1/predictions/competitions")
    suspend fun getPredCompetitions(): com.sabq.smart.feature.predictions.PredCompetitionsResponse

    @GET("api/v1/predictions/competitions/{slug}")
    suspend fun getPredCompetition(@Path("slug") slug: String): com.sabq.smart.feature.predictions.PredCompetitionDetailResponse

    @GET("api/v1/predictions/contests/{id}")
    suspend fun getPredContest(@Path("id") id: String): com.sabq.smart.feature.predictions.PredContestDetailResponse

    @PUT("api/v1/predictions/contests/{id}/entry")
    suspend fun putPredEntry(
        @Path("id") id: String,
        @Body body: com.sabq.smart.feature.predictions.PredEntryBody,
    ): com.sabq.smart.feature.predictions.PredEntrySaveResponse

    @GET("api/v1/predictions/me/ledger")
    suspend fun getPredLedger(@Query("competition") competition: String): com.sabq.smart.feature.predictions.PredLedgerResponse

    @GET("api/v1/predictions/leaderboards")
    suspend fun getPredLeaderboard(@Query("competition") competition: String): com.sabq.smart.feature.predictions.PredLeaderboardResponse

    @GET("api/v1/predictions/contests/{id}/settlement")
    suspend fun getPredSettlement(@Path("id") id: String): com.sabq.smart.feature.predictions.PredSettlementResponse
}
