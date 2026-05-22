package com.sabq.smart.data.analytics

import android.content.Context
import android.util.Log
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.sabq.smart.BuildConfig
import com.sabq.smart.data.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference

private val Context.analyticsDataStore by preferencesDataStore(name = "analytics_prefs")
private val CLIENT_ID_KEY = stringPreferencesKey("sabq_ga4_client_id")

/**
 * GA4 Measurement Protocol client — 1:1 mirror of
 * `sabq app ios/sabq/Services/SabqAnalytics.swift`. Same event names
 * and parameter shapes so Android, iOS, and web all unify in GA4
 * Reports → Engagement → Events (Sabq GA3 - GA4 property).
 *
 * Deliberately not a Hilt-injected class — we keep it as a top-level
 * `object` to match the iOS enum-based API and so call sites stay
 * identical (`SabqAnalytics.articleView(...)`). Dependencies are
 * wired once at app start via [start]; calls made before [start]
 * become silent no-ops (they only log to logcat in debug builds).
 *
 * - HTTPS POST → www.google-analytics.com/mp/collect, no Firebase SDK
 * - `client_id` is a UUID persisted in DataStore for the install lifetime
 * - `session_id` rotates after 30 min idle (GA4 default)
 * - `engagement_time_msec` is clamped to 30s — longer gaps mean the
 *   app was backgrounded, not actively engaged
 * - `user_id` is auto-tracked from [AuthRepository.user]
 * - DEBUG builds attach `debug_mode = 1` so events flow into DebugView
 *   without any extra wiring
 * - Fire-and-forget — dropped events are fine, this is a trend signal
 */
object SabqAnalytics {

    private const val TAG = "SabqAnalytics"
    private const val ENDPOINT = "https://www.google-analytics.com/mp/collect"
    private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

    // ---------- Public API (kept in lockstep with SabqAnalytics.swift) ----------

    fun screen(name: String, screenClass: String? = null) {
        val params = mutableMapOf<String, Any>("screen_name" to name)
        screenClass?.let { params["screen_class"] = it }
        log("screen_view", params)
    }

    fun articleView(id: String, title: String, category: String?) {
        val params = mutableMapOf<String, Any>(
            "article_id" to id,
            "article_title" to title.take(100),
            "content_type" to "news",
        )
        if (!category.isNullOrEmpty()) params["category"] = category
        log("article_view", params)
    }

    fun opinionView(id: String, title: String, authorName: String) {
        log(
            "opinion_view",
            mapOf(
                "article_id" to id,
                "article_title" to title.take(100),
                "author" to authorName.take(80),
                "content_type" to "opinion",
            ),
        )
    }

    fun articleShare(id: String, platform: String) {
        log("share", mapOf("article_id" to id, "method" to platform))
    }

    fun bookmarkToggle(id: String, isBookmarked: Boolean) {
        log("bookmark_toggle", mapOf("article_id" to id, "bookmarked" to isBookmarked))
    }

    fun search(query: String) {
        log("search", mapOf("search_term" to query.take(100)))
    }

    fun articleLike(id: String, liked: Boolean) {
        log("article_like", mapOf("article_id" to id, "liked" to liked))
    }

    fun articleComment(slug: String, parentId: String?) {
        val params = mutableMapOf<String, Any>("article_slug" to slug.take(100))
        parentId?.let { params["parent_comment_id"] = it }
        log("article_comment", params)
    }

    fun login(method: String) {
        log("login", mapOf("method" to method))
    }

    fun notificationOpen(type: String, articleId: String?) {
        val params = mutableMapOf<String, Any>("notification_type" to type)
        articleId?.let { params["article_id"] = it }
        log("notification_open", params)
    }

    /**
     * Generic event hook — kept on the public surface for parity with the
     * iOS facade (which exposes `log(name, parameters:)`) and so existing
     * Android call sites that called the no-op `log(...)` keep working.
     */
    fun log(name: String, parameters: Map<String, Any>? = null) {
        emit(name, parameters ?: emptyMap())
    }

    // ---------- Lifecycle ----------

    /**
     * Wire dependencies. Call once from
     * [com.sabq.smart.SabqApplication.onCreate]. Subsequent calls are
     * ignored. Before [start] is called, every event becomes a debug log
     * only — the app boots fine without analytics.
     */
    fun start(
        context: Context,
        okHttpClient: OkHttpClient,
        authRepository: AuthRepository,
        scope: CoroutineScope,
    ) {
        if (started) return
        appContext = context.applicationContext
        client = okHttpClient
        started = true
        scope.launch {
            authRepository.user.collect { user ->
                userIdRef.set(user?.id?.takeIf { it.isNotBlank() })
            }
        }
    }

    /**
     * Set the Sabq member id explicitly. The automatic collector in
     * [start] keeps this in sync with [AuthRepository] — call this only
     * if you need to override it before [start] has completed.
     */
    fun setUserId(id: String?) {
        userIdRef.set(id?.takeIf { it.isNotBlank() })
    }

    // ---------- Implementation ----------

    @Volatile private var started: Boolean = false
    private var appContext: Context? = null
    private var client: OkHttpClient? = null
    private val userIdRef = AtomicReference<String?>(null)
    private val internalScope = CoroutineScope(Dispatchers.IO)

    private val sessionLock = Mutex()
    private var sessionId: String? = null
    private var lastEventEpochMs: Long? = null
    private const val SESSION_TIMEOUT_MS = 30L * 60L * 1000L
    private const val MAX_ENGAGEMENT_MS = 30_000L

    @Volatile private var cachedClientId: String? = null

    private fun emit(name: String, params: Map<String, Any>) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "$name $params")
        }
        val measurementId = BuildConfig.GA4_MEASUREMENT_ID
        val apiSecret = BuildConfig.GA4_API_SECRET
        val ctx = appContext
        val http = client
        if (!started || ctx == null || http == null || measurementId.isBlank() || apiSecret.isBlank()) {
            return
        }
        internalScope.launch {
            try {
                val (sid, engagementMs) = sessionInfo()
                val payload = buildPayload(ctx, name, params, sid, engagementMs)
                send(http, measurementId, apiSecret, payload)
            } catch (t: Throwable) {
                Log.w(TAG, "Analytics emit failed", t)
            }
        }
    }

    private suspend fun sessionInfo(): Pair<String, Long> = sessionLock.withLock {
        val now = System.currentTimeMillis()
        val idle = lastEventEpochMs?.let { now - it } ?: Long.MAX_VALUE
        if (sessionId == null || idle > SESSION_TIMEOUT_MS) {
            sessionId = (now / 1000).toString()
        }
        val engagement = lastEventEpochMs?.let { now - it }
            ?.coerceIn(1L, MAX_ENGAGEMENT_MS) ?: 1L
        lastEventEpochMs = now
        sessionId!! to engagement
    }

    private suspend fun buildPayload(
        context: Context,
        name: String,
        params: Map<String, Any>,
        sessionId: String,
        engagementMs: Long,
    ): String {
        val eventParams = JSONObject().apply {
            params.forEach { (k, v) -> put(k, v) }
            put("session_id", sessionId)
            put("engagement_time_msec", engagementMs.toString())
            if (BuildConfig.DEBUG) put("debug_mode", 1)
        }
        val event = JSONObject().apply {
            put("name", name)
            put("params", eventParams)
        }
        return JSONObject().apply {
            put("client_id", clientId(context))
            put("events", JSONArray().put(event))
            put("non_personalized_ads", true)
            put("timestamp_micros", System.currentTimeMillis() * 1000L)
            userIdRef.get()?.let { put("user_id", it) }
        }.toString()
    }

    private suspend fun clientId(context: Context): String {
        cachedClientId?.let { return it }
        val existing = context.analyticsDataStore.data.map { it[CLIENT_ID_KEY] }.first()
        val resolved = existing ?: UUID.randomUUID().toString().also { newId ->
            context.analyticsDataStore.edit { it[CLIENT_ID_KEY] = newId }
        }
        cachedClientId = resolved
        return resolved
    }

    private fun send(
        http: OkHttpClient,
        measurementId: String,
        apiSecret: String,
        payload: String,
    ) {
        val url = ENDPOINT.toHttpUrl().newBuilder()
            .addQueryParameter("measurement_id", measurementId)
            .addQueryParameter("api_secret", apiSecret)
            .build()
        val request = Request.Builder()
            .url(url)
            .post(payload.toRequestBody(JSON_MEDIA_TYPE))
            .build()
        http.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "Analytics POST failed: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
            }
        })
    }
}
