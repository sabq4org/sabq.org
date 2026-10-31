package com.sabq.smart.feature.inbox

import com.sabq.smart.data.AuthRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * صندوق إشعارات القارئ (/api/v1/inbox) — مرآة iOS `ReaderInboxView` و
 * `ReaderNotificationSettingsView`: أخبار الكلمات المتابعة، والتوصيات،
 * والملخص اليومي، وإعدادات ما يقرؤه خادم الإرسال فعلًا.
 * الخادم: server/routes/readerInboxMobile.ts + services/readerInboxService.ts.
 */

@Serializable
data class InboxItem(
    val id: String = "",
    val type: String = "",
    val title: String = "",
    val body: String = "",
    val deeplink: String? = null,
    val read: Boolean = false,
    val imageUrl: String? = null,
    val createdAt: String = "",
)

@Serializable
data class InboxPage(
    val items: List<InboxItem> = emptyList(),
    val unread: Int = 0,
    val hasMore: Boolean = false,
)

@Serializable
data class InboxUnread(val unread: Int = 0)

@Serializable
data class InboxOk(val success: Boolean = true)

/** الحقول كلها بلا قيم افتراضية حتى تُرسَل كاملة في PATCH (الـ Json لا يرمّز الافتراضيات). */
@Serializable
data class ReaderNotificationPrefs(
    val dailyDigest: Boolean,
    val becauseYouLiked: Boolean,
    val similarToSaved: Boolean,
    val withinReads: Boolean,
    val trendingForYou: Boolean,
    val quietHoursStart: String,
    val quietHoursEnd: String,
) {
    companion object {
        val Defaults = ReaderNotificationPrefs(
            dailyDigest = false,
            becauseYouLiked = true,
            similarToSaved = true,
            withinReads = true,
            trendingForYou = true,
            quietHoursStart = "22:00",
            quietHoursEnd = "08:00",
        )
    }
}

interface ReaderInboxApi {
    @GET("api/v1/inbox")
    suspend fun page(@Query("limit") limit: Int = 30, @Query("offset") offset: Int = 0): InboxPage

    @GET("api/v1/inbox/unread-count")
    suspend fun unreadCount(): InboxUnread

    @POST("api/v1/inbox/{id}/read")
    suspend fun markRead(@Path("id") id: String): InboxOk

    @POST("api/v1/inbox/read-all")
    suspend fun markAllRead(): InboxOk

    @DELETE("api/v1/inbox/{id}")
    suspend fun delete(@Path("id") id: String): InboxOk

    @GET("api/v1/inbox/preferences")
    suspend fun preferences(): ReaderNotificationPrefs

    @PATCH("api/v1/inbox/preferences")
    suspend fun updatePreferences(@Body body: ReaderNotificationPrefs): ReaderNotificationPrefs
}

@Module
@InstallIn(SingletonComponent::class)
object ReaderInboxNetworkModule {
    @Provides
    @Singleton
    fun provideReaderInboxApi(retrofit: Retrofit): ReaderInboxApi = retrofit.create(ReaderInboxApi::class.java)
}

/**
 * غير المقروء في صندوق القارئ — مشترك بين جرس الرئيسية والشاشة نفسها
 * (نظير `NotificationsStore.readerUnread` في iOS). نقطة الجرس = هذا + التحريري.
 */
@Singleton
class ReaderInboxStore @Inject constructor(
    private val api: ReaderInboxApi,
    private val auth: AuthRepository,
) {
    private val _unread = MutableStateFlow(0)
    val unread: StateFlow<Int> = _unread.asStateFlow()

    fun setUnread(value: Int) {
        _unread.value = value.coerceAtLeast(0)
    }

    fun decrement() {
        _unread.value = (_unread.value - 1).coerceAtLeast(0)
    }

    suspend fun refreshUnread() {
        if (auth.user.value == null) {
            _unread.value = 0
            return
        }
        runCatching { api.unreadCount().unread }.onSuccess { setUnread(it) }
    }
}

object ReaderInboxText {
    fun unreadLabel(n: Int): String = when (n) {
        1 -> "إشعار غير مقروء"
        2 -> "إشعاران غير مقروءين"
        in 3..10 -> "$n إشعارات غير مقروءة"
        else -> "$n إشعارًا غير مقروء"
    }

    /** نوع الأيقونة حسب نوع الإشعار (نظير `ReaderInboxView.symbol`). */
    enum class Kind { Keyword, Recommendation, Digest, Sports, Comment, Other }

    fun kind(type: String): Kind {
        val lower = type.lowercase()
        return when {
            type == "KeywordFollow" -> Kind.Keyword
            type == "recommendation" -> Kind.Recommendation
            type == "daily_digest" -> Kind.Digest
            type.startsWith("sports") || type.startsWith("gc") -> Kind.Sports
            lower.contains("comment") || lower.contains("reply") -> Kind.Comment
            else -> Kind.Other
        }
    }

    /** مكان داخل التطبيق يفتحه رابط الإشعار، أو null إن لم يكن معروفًا. */
    sealed interface Target {
        data class Article(val slug: String) : Target
        data class Keyword(val keyword: String) : Target
    }

    fun target(deeplink: String?): Target? {
        val raw = deeplink?.trim().orEmpty()
        if (raw.isEmpty()) return null
        Regex("(?:^|/)article/([^/?#]+)").find(raw)?.let { m ->
            val slug = java.net.URLDecoder.decode(m.groupValues[1], "UTF-8")
            if (slug.isNotBlank()) return Target.Article(slug)
        }
        Regex("(?:^|/)(?:keyword|tag)/([^/?#]+)").find(raw)?.let { m ->
            val keyword = java.net.URLDecoder.decode(m.groupValues[1], "UTF-8")
            if (keyword.isNotBlank()) return Target.Keyword(keyword)
        }
        return null
    }
}
