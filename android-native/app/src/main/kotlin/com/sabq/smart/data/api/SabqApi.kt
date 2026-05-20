package com.sabq.smart.data.api

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
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
        @Query("page") page: Int = 1,
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

    /** Trending page — top articles + keywords. iOS uses
     *  `articlesStore.trendingArticles.prefix(3)` on Home. */
    @GET("api/v1/trending")
    suspend fun getTrending(): ApiArticlesResponse

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

    // -- auth ---------------------------------------------------------

    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequest): ApiLoginResponse

    @POST("api/v1/auth/register")
    suspend fun register(@Body body: RegisterRequest): ApiLoginResponse

    @POST("api/v1/auth/logout")
    suspend fun logout(): retrofit2.Response<Unit>

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
    @GET("api/opinion")
    suspend fun getOpinions(
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
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

    // -- keyword & authors -------------------------------------------

    @GET("api/keyword/{keyword}")
    suspend fun getArticlesByKeyword(@Path("keyword") keyword: String): List<ApiArticle>

    @GET("api/v1/authors/by-name")
    suspend fun getAuthorPage(
        @Query("name") name: String,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): ApiAuthorPage
}
