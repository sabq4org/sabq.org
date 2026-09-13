package com.sabq.smart.data.analytics

import android.content.Context
import android.os.Bundle
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics
import com.sabq.smart.BuildConfig
import com.sabq.smart.data.AuthRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/** Single native sender. Firebase owns installation IDs, sessions and delivery. */
object SabqAnalytics {
    private const val PREFS = "analytics_consent"
    private const val CONSENT_KEY = "analytics_storage"
    private val firebaseRef = AtomicReference<FirebaseAnalytics?>(null)
    private val consent = AtomicReference(Consent.UNKNOWN)
    private val debugOptIn = AtomicBoolean(BuildConfig.ANALYTICS_DEBUG_ENABLED)
    private val currentUserId = AtomicReference<String?>(null)
    private val started = AtomicBoolean(false)
    private val enabledState = MutableStateFlow(false)
    val collectionEnabled = enabledState.asStateFlow()
    enum class Consent { UNKNOWN, DENIED, GRANTED }

    fun consentState(context: Context): Consent {
        val raw = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(CONSENT_KEY, null)
        return Consent.entries.firstOrNull { it.name == raw } ?: Consent.UNKNOWN
    }

    fun start(context: Context, authRepository: AuthRepository, scope: CoroutineScope) {
        if (!started.compareAndSet(false, true)) return
        val ctx = context.applicationContext
        consent.set(consentState(ctx))
        // Manifest defaults deny collection before Firebase's content provider runs.
        val app = runCatching { FirebaseApp.initializeApp(ctx) }.getOrNull()
        val options = app?.options
        if (options != null && Regex("1:[0-9]+:android:[a-fA-F0-9]+").matches(options.applicationId)
            && !options.projectId.isNullOrBlank() && options.apiKey.isNotBlank()) {
            firebaseRef.set(FirebaseAnalytics.getInstance(ctx))
            firebaseRef.get()?.setAnalyticsCollectionEnabled(false)
        } else {
            Log.w("SabqAnalytics", "Native Firebase configuration unavailable; analytics disabled")
        }
        applyConsent()
        scope.launch { authRepository.user.collect { userId(it?.id) } }
    }

    fun setConsent(context: Context, granted: Boolean) {
        val value = if (granted) Consent.GRANTED else Consent.DENIED
        consent.set(value)
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(CONSENT_KEY, value.name).apply()
        applyConsent()
    }

    fun userId(id: String?) {
        currentUserId.set(id?.takeIf { it.length <= 100 && Regex("[A-Za-z0-9_-]+").matches(it) })
        applyUserId()
    }
    fun setUserId(id: String?) = userId(id)
    fun screen(name: String, screenClass: String? = null) = log("screen_view", buildMap {
        put("screen_name", name); screenClass?.let { put("screen_class", it) }
    })
    fun articleView(id: String, title: String, category: String?) = log("article_view", buildMap {
        put("article_id", id); put("article_title", title); put("content_type", "news")
        category?.let { put("category", it) }
    })
    fun opinionView(id: String, title: String, authorName: String) = log("opinion_view", mapOf(
        "article_id" to id, "article_title" to title, "author" to authorName, "content_type" to "opinion"))
    fun articleShare(id: String, platform: String) = log("share", mapOf(
        "article_id" to id, "method" to platform, "stage" to "destination_selected"))
    fun bookmarkToggle(id: String, isBookmarked: Boolean) = log("bookmark_toggle", mapOf("article_id" to id, "bookmarked" to isBookmarked))
    fun search(query: String) = log("search", mapOf("search_term" to query))
    fun articleLike(id: String, liked: Boolean) = log("article_like", mapOf("article_id" to id, "liked" to liked))
    fun articleComment(slug: String, parentId: String?) = log("article_comment", buildMap {
        put("article_slug", slug); parentId?.let { put("parent_comment_id", it) }
    })
    fun login(method: String) = log("login", mapOf("method" to method))
    fun signUp(method: String) = log("sign_up", mapOf("method" to method))
    fun notificationOpen(type: String, articleId: String?) = log("push_open", buildMap {
        put("notification_type", type); articleId?.let { put("article_id", it) }
    })
    fun deepLinkOpen(kind: String, source: String?) = log("deep_link_open", buildMap {
        put("kind", kind); source?.let { put("source", it) }
    })

    fun log(name: String, parameters: Map<String, Any>? = null) {
        if (!enabledState.value) return
        val sdk = firebaseRef.get() ?: return
        val clean = AnalyticsPolicy.sanitize(name, parameters.orEmpty()) ?: return
        val bundle = Bundle()
        clean.forEach { (key, value) -> when (value) {
            is String -> bundle.putString(key, value)
            is Long -> bundle.putLong(key, value)
            is Double -> bundle.putDouble(key, value)
        } }
        sdk.logEvent(name, bundle)
    }

    private fun applyConsent() {
        val sdk = firebaseRef.get()
        val allowed = AnalyticsPolicy.canCollect(consent.get() == Consent.GRANTED,
            BuildConfig.DEBUG, debugOptIn.get(), sdk != null)
        // Disable the app gate immediately, before any async SDK transitions.
        if (!allowed) enabledState.value = false
        sdk?.setConsent(mapOf(
            FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE to if (allowed) FirebaseAnalytics.ConsentStatus.GRANTED else FirebaseAnalytics.ConsentStatus.DENIED,
            FirebaseAnalytics.ConsentType.AD_STORAGE to FirebaseAnalytics.ConsentStatus.DENIED,
            FirebaseAnalytics.ConsentType.AD_USER_DATA to FirebaseAnalytics.ConsentStatus.DENIED,
            FirebaseAnalytics.ConsentType.AD_PERSONALIZATION to FirebaseAnalytics.ConsentStatus.DENIED,
        ))
        if (!allowed) sdk?.setUserId(null)
        sdk?.setAnalyticsCollectionEnabled(allowed)
        enabledState.value = allowed
        applyUserId()
    }

    private fun applyUserId() {
        firebaseRef.get()?.setUserId(if (enabledState.value) currentUserId.get() else null)
    }
}
