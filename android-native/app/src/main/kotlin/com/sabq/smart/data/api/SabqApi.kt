package com.sabq.smart.data.api

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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

    // -- public (article detail / opinions) ---------------------------

    /**
     * Public article detail — preferred over `/api/v1/articles/{slug}`
     * because v1 strips the full HTML body. See APIClient.swift line
     * 308 commentary.
     */
    @GET("api/articles/{slug}")
    suspend fun getArticleBySlug(@Path("slug") slug: String): ApiArticle

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
     */
    @GET("api/v1/members/profile")
    suspend fun getProfile(): ApiUser

    // -- loyalty ------------------------------------------------------

    /**
     * Member's loyalty summary: tier, lifetime + week + month points,
     * streak days. Bearer-token required (401 anonymous).
     */
    @GET("api/v1/loyalty/me")
    suspend fun getLoyaltyMe(): ApiLoyaltySummary

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
}
