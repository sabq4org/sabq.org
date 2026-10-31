package com.sabq.smart.feature.editorial

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.io.IOException
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * لوحة المراسل والمشرف (/api/v1/editorial/*). مرآة iOS `EditorialService.swift`:
 * المراسل يرى «أخباري» ويطلب تعديلًا، ومن يملك articles.publish يرى
 * «بانتظار قرارك». نفس خدمات الويب و«مكتب سبق».
 * العقد: docs/systems/editorial/MOBILE_EDITORIAL_API.md
 */

// ── Me ──────────────────────────────────────────────────────────────

@Serializable
data class EditorialMe(
    val userId: String = "",
    val name: String = "",
    val canReport: Boolean = false,
    val canNews: Boolean = false,
)

// ── أخباري (المراسل) ────────────────────────────────────────────────

enum class MyNewsFilter(val wire: String, val title: String) {
    All("all", EditorialStates.FILTER_ALL),
    NeedsChanges("needs_changes", EditorialStates.FILTER_NEEDS_CHANGES),
    Pending("pending", EditorialStates.FILTER_PENDING),
    Scheduled("scheduled", EditorialStates.FILTER_SCHEDULED),
    Published("published", EditorialStates.FILTER_PUBLISHED),
    Draft("draft", EditorialStates.FILTER_DRAFT),
}

@Serializable
data class MyNewsPendingEditRequest(
    val id: String = "",
    val label: String = "",
    val createdAt: String? = null,
)

@Serializable
data class MyNewsLastEditRequest(
    val id: String = "",
    /** pending | approved | rejected */
    val outcome: String = "",
    val label: String = "",
    val urgent: Boolean = false,
    val decisionNote: String? = null,
    val createdAt: String? = null,
    val decidedAt: String? = null,
)

@Serializable
data class MyNewsItem(
    val id: String = "",
    val title: String = "",
    /** draft | pending | needs_changes | scheduled | published | archived */
    val state: String = "",
    val stateLabel: String = "",
    val reviewNotes: String? = null,
    val imageUrl: String? = null,
    val thumbnailUrl: String? = null,
    val categoryName: String? = null,
    val views: Int = 0,
    val url: String? = null,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    val submittedAt: String? = null,
    val reviewedAt: String? = null,
    val scheduledAt: String? = null,
    val publishedAt: String? = null,
    val pendingEditRequest: MyNewsPendingEditRequest? = null,
    val lastEditRequest: MyNewsLastEditRequest? = null,
    val canRequestEdit: Boolean = false,
) {
    val thumbnail: String? get() = EditorialText.https(thumbnailUrl ?: imageUrl)

    /** المسار الأخير من رابط الخبر المنشور، لفتحه داخل التطبيق. */
    val publishedSlug: String?
        get() = EditorialText.https(url)
            ?.substringBefore('?')
            ?.trimEnd('/')
            ?.substringAfterLast('/')
            ?.takeIf { it.isNotBlank() }
}

@Serializable
data class MyNewsCounts(
    val all: Int = 0,
    val pending: Int = 0,
    val needs_changes: Int = 0,
    val scheduled: Int = 0,
    val published: Int = 0,
    val draft: Int = 0,
) {
    fun count(filter: MyNewsFilter): Int = when (filter) {
        MyNewsFilter.All -> all
        MyNewsFilter.NeedsChanges -> needs_changes
        MyNewsFilter.Pending -> pending
        MyNewsFilter.Scheduled -> scheduled
        MyNewsFilter.Published -> published
        MyNewsFilter.Draft -> draft
    }
}

private val KNOWN_MY_NEWS_STATES = setOf("draft", "pending", "needs_changes", "scheduled", "published", "archived")

@Serializable
data class MyNewsBoard(
    val counts: MyNewsCounts = MyNewsCounts(),
    val editRequestsReady: Boolean = true,
    val items: List<MyNewsItem> = emptyList(),
) {
    /** حالة لا يعرفها التطبيق تُسقط بدل عرضها خطأ (مثل iOS). */
    val visibleItems: List<MyNewsItem> get() = items.filter { it.state in KNOWN_MY_NEWS_STATES }
}

// ── طلب التعديل (المراسل) ──────────────────────────────────────────

@Serializable
data class EditRequestContextArticle(
    val id: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val status: String? = null,
    val imageUrl: String? = null,
    val albumImages: List<String>? = null,
)

@Serializable
data class EditRequestContext(
    val article: EditRequestContextArticle = EditRequestContextArticle(),
    val paragraphs: List<String> = emptyList(),
    val acceptsRequests: Boolean = true,
    val pendingRequestId: String? = null,
)

@Serializable
data class EditRequestContentEditBody(val before: String, val after: String)

@Serializable
data class EditRequestProposedBody(
    val title: String? = null,
    val contentEdits: List<EditRequestContentEditBody>? = null,
    val appendParagraph: String? = null,
    val imageUrl: String? = null,
    val albumAdd: List<String>? = null,
)

/** بلا قيم افتراضية للحقول الإلزامية: Json التطبيق لا يرسل القيم الافتراضية. */
@Serializable
data class EditRequestDraftBody(
    val articleId: String,
    val urgent: Boolean,
    val note: String,
    val proposed: EditRequestProposedBody,
)

@Serializable
data class SubmissionImageBody(val image: String, val slot: String)

@Serializable
data class SubmissionImageResponse(val url: String? = null)

// ── المشرف: ما ينتظر قرارك (/editorial/news/*) ─────────────────────

enum class EditorialNewsFilter(val wire: String, val title: String) {
    All("all", "الكل"),
    Reporters("reporters", "مراسلون"),
    EditRequests("edit_requests", "طلبات تعديل"),
    Email("email", "البريد"),
    ;

    companion object {
        fun fromWire(raw: String?): EditorialNewsFilter = entries.firstOrNull { it.wire == raw } ?: All
    }
}

fun channelTitle(channel: String?): String = when (channel) {
    "app" -> "من التطبيق"
    "web" -> "من لوحة التحكم"
    "email" -> "من البريد"
    else -> ""
}

/** صف واحد للنوعين (`kind` = draft | edit_request) — الحقول غير المعنية فارغة. */
@Serializable
data class EditorialNewsItem(
    val kind: String = "",
    val id: String = "",
    val title: String = "",
    // draft
    val channel: String? = null,
    val reporterName: String? = null,
    val categoryName: String? = null,
    val imageUrl: String? = null,
    val thumbnailUrl: String? = null,
    val albumCount: Int = 0,
    val isBreaking: Boolean = false,
    val lockedBy: String? = null,
    val submittedAt: String? = null,
    // edit_request
    val articleId: String? = null,
    val articleStatus: String? = null,
    val requesterName: String? = null,
    val urgent: Boolean = false,
    val note: String? = null,
    val label: String? = null,
) {
    val isDraft: Boolean get() = kind == "draft"
    val isEditRequest: Boolean get() = kind == "edit_request"
    val thumbnail: String? get() = EditorialText.https(thumbnailUrl ?: imageUrl)
    val onWhat: String get() = if (articleStatus == "published") "على خبر منشور" else "على مسودة"
    val key: String get() = "$kind-$id"
}

@Serializable
data class EditorialNewsCounts(
    val all: Int = 0,
    val reporters: Int = 0,
    val editRequests: Int = 0,
    val email: Int = 0,
) {
    fun count(filter: EditorialNewsFilter): Int = when (filter) {
        EditorialNewsFilter.All -> all
        EditorialNewsFilter.Reporters -> reporters
        EditorialNewsFilter.EditRequests -> editRequests
        EditorialNewsFilter.Email -> email
    }
}

@Serializable
data class EditorialNewsBoard(
    val counts: EditorialNewsCounts = EditorialNewsCounts(),
    val oldestAt: String? = null,
    val items: List<EditorialNewsItem> = emptyList(),
) {
    val visibleItems: List<EditorialNewsItem> get() = items.filter { it.isDraft || it.isEditRequest }

    /** «3 مراسلون · 1 بريد · 1 طلب تعديل». */
    val breakdown: String
        get() = buildList {
            if (counts.reporters > 0) add("${counts.reporters} ${if (counts.reporters == 1) "مراسل" else "مراسلون"}")
            if (counts.email > 0) add("${counts.email} بريد")
            if (counts.editRequests > 0) {
                add("${counts.editRequests} ${if (counts.editRequests == 1) "طلب تعديل" else "طلبات تعديل"}")
            }
        }.joinToString(" · ")
}

@Serializable
data class EditorialCategory(val id: String = "", val name: String = "")

@Serializable
data class EditorialCategoriesEnvelope(val categories: List<EditorialCategory> = emptyList())

@Serializable
data class EditorialNewsPreview(
    val id: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val status: String = "draft",
    val content: String = "",
    val imageUrl: String? = null,
    val albumImages: List<String> = emptyList(),
    val category: EditorialCategory? = null,
    val isBreaking: Boolean = false,
    val channel: String? = null,
    val reporterName: String? = null,
    val submittedAt: String? = null,
    val summaryReady: Boolean = false,
    val seoReady: Boolean = false,
    val lockedBy: String? = null,
    val pendingEditRequestId: String? = null,
    /** نص الخادم كما هو: يُعاد حرفيًا في `expectedUpdatedAt`. */
    val updatedAt: String? = null,
) {
    val hero: String? get() = EditorialText.https(imageUrl)
    val album: List<String> get() = albumImages.mapNotNull { EditorialText.https(it) }
    val isDecidable: Boolean get() = status == "draft" || status == "ready_to_publish"
    val paragraphs: List<String> get() = EditorialText.paragraphs(content)

    val readinessLine: String?
        get() = when {
            summaryReady && seoReady -> "الموجز والسيو جاهزان"
            summaryReady -> "الموجز جاهز"
            seoReady -> "السيو جاهز"
            else -> null
        }
}

@Serializable
data class EditorialPreviewEnvelope(val article: EditorialNewsPreview = EditorialNewsPreview())

@Serializable
data class PublishBody(val expectedUpdatedAt: String? = null, val categoryId: String? = null)

@Serializable
data class ScheduleBody(
    val scheduledAt: String,
    val expectedUpdatedAt: String? = null,
    val categoryId: String? = null,
)

@Serializable
data class NoteBody(val note: String)

@Serializable
data class ReasonBody(val reason: String)

@Serializable
data class ApproveBody(val fields: List<String>? = null, val regenerate: Boolean)

@Serializable
data class EditorialOk(val ok: Boolean = true)

@Serializable
data class EditRequestApproveResult(val ok: Boolean = true, val regenerating: Boolean? = null)

// ── مراجعة طلب التعديل ─────────────────────────────────────────────

enum class EditRequestField(val wire: String, val title: String) {
    Title("title", "العنوان"),
    Subtitle("subtitle", "العنوان الفرعي"),
    Content("content", "النص"),
    ImageUrl("imageUrl", "الصورة البارزة"),
    AlbumImages("albumImages", "صور الألبوم"),
    ;

    companion object {
        fun fromWire(raw: String): EditRequestField? = entries.firstOrNull { it.wire == raw }
    }
}

@Serializable
data class ReviewContentEdit(val before: String = "", val after: String = "", val found: Boolean = true)

@Serializable
data class ReviewProposed(
    val title: String? = null,
    val subtitle: String? = null,
    val contentEdits: List<ReviewContentEdit>? = null,
    val appendParagraph: String? = null,
    val imageUrl: String? = null,
    val albumAdd: List<String>? = null,
)

@Serializable
data class ReviewRequest(
    val id: String = "",
    val articleId: String = "",
    val status: String = "",
    val urgent: Boolean = false,
    val note: String? = null,
    val requesterName: String = "",
    val decidedByName: String? = null,
    val decisionNote: String? = null,
    val proposed: ReviewProposed = ReviewProposed(),
    val createdAt: String? = null,
) {
    val isPending: Boolean get() = status == "pending"
}

@Serializable
data class ReviewArticle(
    val id: String = "",
    val title: String = "",
    val subtitle: String? = null,
    val status: String = "",
    val imageUrl: String? = null,
)

@Serializable
data class EditRequestReview(
    val request: ReviewRequest = ReviewRequest(),
    val article: ReviewArticle = ReviewArticle(),
    val fields: List<String> = emptyList(),
    val contentEdits: List<ReviewContentEdit> = emptyList(),
) {
    val knownFields: List<EditRequestField> get() = fields.mapNotNull { EditRequestField.fromWire(it) }
    val hasMissingParagraphs: Boolean get() = contentEdits.any { !it.found }

    companion object {
        /** «اعتمد وطبّق (2 من 3)». */
        fun approveTitle(selected: Int, total: Int): String =
            if (total > 1 && selected < total) "اعتمد وطبّق ($selected من $total)" else "اعتمد وطبّق"
    }
}

// ── Retrofit ───────────────────────────────────────────────────────

interface EditorialApi {
    @GET("api/v1/editorial/me")
    suspend fun me(): EditorialMe

    @GET("api/v1/editorial/my-news")
    suspend fun myNews(@Query("filter") filter: String): MyNewsBoard

    @GET("api/v1/editorial/edit-requests/context/{articleId}")
    suspend fun editRequestContext(@Path("articleId") articleId: String): EditRequestContext

    @POST("api/v1/editorial/edit-requests")
    suspend fun createEditRequest(@Body body: EditRequestDraftBody): EditorialOk

    @POST("api/v1/editorial/edit-requests/{id}/cancel")
    suspend fun cancelEditRequest(@Path("id") id: String): EditorialOk

    @GET("api/v1/editorial/news")
    suspend fun newsBoard(@Query("filter") filter: String): EditorialNewsBoard

    @GET("api/v1/editorial/news/categories")
    suspend fun categories(): EditorialCategoriesEnvelope

    @GET("api/v1/editorial/news/{id}")
    suspend fun preview(@Path("id") id: String): EditorialPreviewEnvelope

    @POST("api/v1/editorial/news/{id}/publish")
    suspend fun publish(@Path("id") id: String, @Body body: PublishBody): EditorialOk

    @POST("api/v1/editorial/news/{id}/schedule")
    suspend fun schedule(@Path("id") id: String, @Body body: ScheduleBody): EditorialOk

    @POST("api/v1/editorial/news/{id}/return")
    suspend fun returnToReporter(@Path("id") id: String, @Body body: NoteBody): EditorialOk

    @GET("api/v1/editorial/news/edit-requests/{id}")
    suspend fun editRequestReview(@Path("id") id: String): EditRequestReview

    @POST("api/v1/editorial/news/edit-requests/{id}/approve")
    suspend fun approveEditRequest(@Path("id") id: String, @Body body: ApproveBody): EditRequestApproveResult

    @POST("api/v1/editorial/news/edit-requests/{id}/reject")
    suspend fun rejectEditRequest(@Path("id") id: String, @Body body: ReasonBody): EditorialOk

    /** نفس رفع صور «إرسال خبر» (iOS uploadSubmissionImage). */
    @POST("api/v1/articles/images")
    suspend fun uploadImage(@Body body: SubmissionImageBody): SubmissionImageResponse
}

@Module
@InstallIn(SingletonComponent::class)
object EditorialNetworkModule {
    @Provides
    @Singleton
    fun provideEditorialApi(retrofit: Retrofit): EditorialApi = retrofit.create(EditorialApi::class.java)
}

// ── الأخطاء ────────────────────────────────────────────────────────

/** مثل iOS `EditorialError`: رمز الخادم مهم (two_factor_required). */
sealed class EditorialError(val message: String) {
    class Unauthorized : EditorialError("سجّل الدخول أولًا")
    class TwoFactorRequired(message: String) : EditorialError(message)
    class Forbidden(message: String) : EditorialError(message)
    class Conflict(message: String) : EditorialError(message)
    class Other(message: String) : EditorialError(message)

    val title: String
        get() = when (this) {
            is TwoFactorRequired -> "فعّل المصادقة الثنائية"
            is Forbidden -> "غير متاح لحسابك"
            is Unauthorized -> "سجّل الدخول"
            else -> "تعذر التحميل"
        }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; isLenient = true }

        @Serializable
        private data class Body(val code: String? = null, val message: String? = null)

        fun from(error: Throwable): EditorialError {
            if (error is CancellationException) throw error
            if (error is HttpException) {
                val raw = runCatching { error.response()?.errorBody()?.string() }.getOrNull()
                val body = raw?.let { runCatching { json.decodeFromString(Body.serializer(), it) }.getOrNull() }
                val message = body?.message?.takeIf { it.isNotBlank() } ?: "حدث خطأ (${error.code()})"
                return when {
                    error.code() == 401 -> Unauthorized()
                    error.code() == 403 && body?.code == "two_factor_required" -> TwoFactorRequired(message)
                    error.code() == 403 -> Forbidden(message)
                    error.code() == 409 -> Conflict(message)
                    error.code() == 429 -> Other(body?.message ?: "طلبات كثيرة خلال فترة قصيرة؛ انتظر قليلًا")
                    else -> Other(message)
                }
            }
            if (error is IOException) return Other("تعذر الاتصال. تحقق من الشبكة وحاول مجددًا")
            return Other("تعذر قراءة البيانات")
        }
    }
}

/** يشغّل طلبًا ويحوّل الفشل إلى [EditorialError]. */
suspend fun <T> editorialCall(block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(EditorialException(EditorialError.from(e)))
    }

class EditorialException(val error: EditorialError) : Exception(error.message)

fun Throwable.editorialError(): EditorialError =
    (this as? EditorialException)?.error ?: EditorialError.from(this)

// ── نصوص وتواريخ ───────────────────────────────────────────────────

/** قاموس الحالات — منسوخ حرفيًا من `shared/editorialStates.ts` ومن iOS. */
object EditorialStates {
    const val DRAFT = "مسودة"
    const val PENDING = "أُرسل للمراجعة"
    const val NEEDS_CHANGES = "يحتاج تعديلك"
    const val APPROVED = "اعتُمد، بانتظار الجدولة"
    const val SCHEDULED = "مجدول"
    const val PUBLISHED = "منشور"
    const val NOT_PUBLISHED = "لم يُنشر"
    const val ARCHIVED = "مؤرشف"

    const val FILTER_ALL = "الكل"
    const val FILTER_NEEDS_CHANGES = "تحتاج تعديلك"
    const val FILTER_PENDING = "قيد المراجعة"
    const val FILTER_SCHEDULED = "مجدولة"
    const val FILTER_PUBLISHED = "منشورة"
    const val FILTER_DRAFT = "مسودات"

    const val RESUBMIT = "عدّل وأعد الإرسال"
    const val REQUEST_EDIT = "طلب تعديل"
    const val CANCEL_REQUEST = "ألغِ الطلب"
    const val REVIEW_REQUEST = "راجع الطلب"
    const val OPEN_ARTICLE = "فتح الخبر"

    const val REQUEST_PENDING = "طلب تعديل قيد المراجعة"
    const val REQUEST_APPROVED = "اعتُمد طلب التعديل"
    const val REQUEST_REJECTED = "لم يُعتمد طلب التعديل"
    const val REQUEST_URGENT = "طلب تعديل عاجل"
}

object EditorialText {
    private val riyadh: ZoneId = ZoneId.of("Asia/Riyadh")
    private val arabic = Locale.forLanguageTag("ar")

    fun https(raw: String?): String? =
        raw?.trim()?.takeIf { it.startsWith("https://", ignoreCase = true) }

    fun parse(raw: String?): Instant? {
        if (raw.isNullOrBlank()) return null
        return runCatching { Instant.parse(raw) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(raw).toInstant() }.getOrNull()
    }

    /** فقرات نصية من HTML المحرر (للاستعراض فقط). */
    fun paragraphs(html: String): List<String> {
        var text = html
        for (tag in listOf("</p>", "<br>", "<br/>", "<br />", "</h2>", "</h3>", "</li>", "</blockquote>")) {
            text = text.replace(tag, "\n", ignoreCase = true)
        }
        text = text.replace(Regex("<[^>]+>"), "")
        val entities = mapOf("&nbsp;" to " ", "&amp;" to "&", "&quot;" to "\"", "&#39;" to "'", "&lt;" to "<", "&gt;" to ">")
        for ((k, v) in entities) text = text.replace(k, v)
        return text.split("\n").map { it.trim() }.filter { it.isNotEmpty() }
    }

    fun relative(raw: String?, now: Instant = Instant.now()): String = relative(parse(raw), now)

    fun relative(date: Instant?, now: Instant = Instant.now()): String {
        date ?: return ""
        val minutes = maxOf(0L, ChronoUnit.MINUTES.between(date, now))
        if (minutes < 1) return "الآن"
        if (minutes < 60) return "منذ $minutes د"
        val hours = minutes / 60
        if (hours < 24) {
            return when (hours) {
                1L -> "منذ ساعة"
                2L -> "منذ ساعتين"
                else -> "منذ $hours ساعات"
            }
        }
        return dayTime(date, now)
    }

    fun dayTime(raw: String?, now: Instant = Instant.now()): String = dayTime(parse(raw), now)

    /** «أمس 21:10» أو «31 أكتوبر 08:40» بالأرقام اللاتينية والتقويم الميلادي. */
    fun dayTime(date: Instant?, now: Instant = Instant.now()): String {
        date ?: return ""
        val local = date.atZone(riyadh)
        val today = now.atZone(riyadh).toLocalDate()
        val time = format(local, "HH:mm")
        return when (local.toLocalDate()) {
            today -> "اليوم $time"
            today.minusDays(1) -> "أمس $time"
            else -> "${format(local, "d MMMM")} $time"
        }
    }

    fun todayLine(now: Instant = Instant.now()): String = format(now.atZone(riyadh), "EEEE d MMMM")

    private fun format(value: java.time.ZonedDateTime, pattern: String): String =
        DateTimeFormatter.ofPattern(pattern, arabic).format(value)

    fun isoUtc(instant: Instant): String = DateTimeFormatter.ISO_INSTANT.format(instant.truncatedTo(ChronoUnit.SECONDS))
}
