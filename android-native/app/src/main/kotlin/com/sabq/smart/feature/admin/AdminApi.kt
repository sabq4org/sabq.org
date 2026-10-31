package com.sabq.smart.feature.admin

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * لوحة التحكم لمسؤول المنصة وصندوق الإدارة — مرآة iOS `AdminService` و
 * `AdminInboxService`. كل المسارات تحت `/api/v1/admin/` ويحميها الخادم
 * بفحص مسؤول المنصة على رمز Bearer.
 */

// ── الأخبار ───────────────────────────────────────────────────────────

enum class AdminArticleStatus(val wire: String, val label: String, val badge: String) {
    Draft("draft", "المسودات", "مسودة"),
    Scheduled("scheduled", "المجدولة", "مجدول"),
    Published("published", "المنشورة", "منشور"),
    Archived("archived", "المؤرشفة", "مؤرشف"),
    ;

    companion object {
        fun from(raw: String?): AdminArticleStatus = entries.firstOrNull { it.wire == raw } ?: Draft
    }
}

@Serializable
data class AdminWriterWeeklySlot(val weekday: Int = 0, val publishTime: String = "", val nextSlot: String? = null)

@Serializable
data class AdminNewsItem(
    val id: String,
    val title: String = "",
    val excerpt: String = "",
    val status: String = "draft",
    val author: String = "",
    val articleType: String = "news",
    val updatedAt: String? = null,
    val views: Int = 0,
    val scheduledAt: String? = null,
    val publishedAt: String? = null,
    val writerWeeklySlot: AdminWriterWeeklySlot? = null,
    val reviewStatus: String? = null,
    val reviewNotes: String? = null,
) {
    val state: AdminArticleStatus get() = AdminArticleStatus.from(status)
    val isOpinion: Boolean get() = articleType.equals("opinion", ignoreCase = true)
    val awaitingRevision: Boolean get() = reviewStatus == "needs_changes"
}

@Serializable
data class AdminNewsList(val items: List<AdminNewsItem> = emptyList(), val total: Int? = null)

@Serializable
data class AdminNewsItemEnvelope(val item: AdminNewsItem? = null)

@Serializable
data class AdminCounts(val draft: Int = 0, val scheduled: Int = 0)

@Serializable
data class AdminReviewNotesBody(val reviewNotes: String)

@Serializable
data class AdminDeletionBody(val deletionReason: String)

// ── رسائل التواصل ─────────────────────────────────────────────────────

enum class AdminContactStatus(val wire: String, val label: String) {
    Pending("pending", "بانتظار القراءة"),
    Read("read", "تمت القراءة"),
    Replied("replied", "تم الرد"),
    ;

    companion object {
        fun from(raw: String?): AdminContactStatus = entries.firstOrNull { it.wire == raw } ?: Pending
    }
}

@Serializable
data class AdminContactMessage(
    val id: String,
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val subject: String = "",
    val message: String = "",
    val status: String = "pending",
    val createdAt: String? = null,
    val repliedAt: String? = null,
    val replyText: String? = null,
) {
    val state: AdminContactStatus get() = AdminContactStatus.from(status)
}

@Serializable
data class AdminContactReply(
    val id: String,
    val replyText: String = "",
    val responderName: String? = null,
    val createdAt: String? = null,
)

@Serializable
data class AdminContactPage(
    val messages: List<AdminContactMessage> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val totalPages: Int = 1,
)

@Serializable
data class AdminContactDetail(val message: AdminContactMessage, val replies: List<AdminContactReply> = emptyList())

// ── استفسارات كتّاب الرأي ────────────────────────────────────────────

enum class AdminTicketStatus(val wire: String, val label: String) {
    Open("open", "مفتوح"),
    Answered("answered", "تمت الإجابة"),
    Closed("closed", "مغلق"),
    ;

    companion object {
        fun from(raw: String?): AdminTicketStatus = entries.firstOrNull { it.wire == raw } ?: Open
    }
}

@Serializable
data class AdminTicket(
    val id: String,
    val writerId: String = "",
    val writerName: String? = null,
    val writerEmail: String? = null,
    val title: String = "",
    val status: String = "open",
    val lastMessageAt: String? = null,
    val createdAt: String? = null,
    val hasUnread: Boolean = false,
) {
    val state: AdminTicketStatus get() = AdminTicketStatus.from(status)
    val writerLabel: String get() = writerName?.takeIf { it.isNotBlank() } ?: writerEmail?.takeIf { it.isNotBlank() } ?: "كاتب الرأي"
}

@Serializable
data class AdminTicketMessage(
    val id: String,
    val ticketId: String = "",
    val senderId: String = "",
    val senderRole: String = "writer",
    val senderName: String? = null,
    val message: String = "",
    val parentMessageId: String? = null,
    val createdAt: String? = null,
) {
    val isFromAdmin: Boolean get() = senderRole == "admin"
}

@Serializable
data class AdminTicketPage(
    val tickets: List<AdminTicket> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val totalPages: Int = 1,
)

@Serializable
data class AdminTicketDetail(val ticket: AdminTicket, val messages: List<AdminTicketMessage> = emptyList())

@Serializable
data class AdminStatusBody(val status: String)

@Serializable
data class AdminContactReplyBody(val replyText: String)

/** `parentMessageId` بلا قيمة افتراضية: يُرسل دائمًا (null للرد العام). */
@Serializable
data class AdminTicketReplyBody(val message: String, val parentMessageId: String?)

@Serializable
data class AdminActionResult(val success: Boolean? = null, val message: String? = null, val emailSent: Boolean? = null)

interface AdminApi {
    @GET("api/v1/admin/dashboard/counts")
    suspend fun counts(): AdminCounts

    @GET("api/v1/admin/articles")
    suspend fun articles(
        @Query("status") status: String,
        @Query("page") page: Int,
        @Query("limit") limit: Int = ADMIN_PAGE_SIZE,
    ): AdminNewsList

    @POST("api/v1/admin/articles/{id}/publish")
    suspend fun publish(@Path("id") id: String): AdminNewsItemEnvelope

    @POST("api/v1/admin/articles/{id}/request-revision")
    suspend fun requestRevision(@Path("id") id: String, @Body body: AdminReviewNotesBody): AdminNewsItemEnvelope

    @POST("api/v1/admin/articles/{id}/archive")
    suspend fun archive(@Path("id") id: String, @Body body: AdminReviewNotesBody): AdminNewsItemEnvelope

    @HTTP(method = "DELETE", path = "api/v1/admin/articles/{id}/permanent", hasBody = true)
    suspend fun permanentDelete(@Path("id") id: String, @Body body: AdminDeletionBody): retrofit2.Response<Unit>

    @GET("api/v1/admin/contact-messages")
    suspend fun contactMessages(
        @Query("page") page: Int,
        @Query("status") status: String? = null,
        @Query("search") search: String? = null,
        @Query("limit") limit: Int = 20,
    ): AdminContactPage

    @GET("api/v1/admin/contact-messages/{id}")
    suspend fun contactMessage(@Path("id") id: String): AdminContactDetail

    @PATCH("api/v1/admin/contact-messages/{id}")
    suspend fun updateContactMessage(@Path("id") id: String, @Body body: AdminStatusBody): AdminActionResult

    @POST("api/v1/admin/contact-messages/{id}/reply")
    suspend fun replyContactMessage(@Path("id") id: String, @Body body: AdminContactReplyBody): AdminActionResult

    @GET("api/v1/admin/opinion-tickets")
    suspend fun tickets(
        @Query("page") page: Int,
        @Query("status") status: String? = null,
        @Query("search") search: String? = null,
        @Query("limit") limit: Int = 20,
    ): AdminTicketPage

    @GET("api/v1/admin/opinion-tickets/{id}")
    suspend fun ticket(@Path("id") id: String): AdminTicketDetail

    @PATCH("api/v1/admin/opinion-tickets/{id}/status")
    suspend fun updateTicket(@Path("id") id: String, @Body body: AdminStatusBody): AdminActionResult

    @POST("api/v1/admin/opinion-tickets/{id}/messages")
    suspend fun replyTicket(@Path("id") id: String, @Body body: AdminTicketReplyBody): AdminActionResult
}

const val ADMIN_PAGE_SIZE = 10

@Module
@InstallIn(SingletonComponent::class)
object AdminNetworkModule {
    @Provides
    @Singleton
    fun provideAdminApi(retrofit: Retrofit): AdminApi = retrofit.create(AdminApi::class.java)
}

/** إجراءات سير العمل التي تطلب سببًا (خمسة أحرف على الأقل) — نصوص iOS حرفيًا. */
enum class AdminWorkflowAction(
    val title: String,
    val explanation: String,
    val fieldLabel: String,
    val confirmTitle: String,
    val destructive: Boolean,
) {
    RequestRevision(
        "طلب تعديل",
        "يُرسل للكاتب/المراسل مع الملاحظات، ويعود المحتوى لمسوداته ليعدّله ثم يُرسله.",
        "الملاحظات",
        "إرسال طلب التعديل",
        false,
    ),
    Archive(
        "أرشفة (عدم النشر)",
        "قرار نهائي بعدم النشر — يُرسل للكاتب/المراسل مع السبب (إشعار + إيميل). ليس طلب تعديل.",
        "السبب",
        "تأكيد الأرشفة",
        true,
    ),
    PermanentDelete(
        "حذف نهائي",
        "حذف نهائي للمحتوى من قبل فريق التحرير، ويُشعر الكاتب/المراسل بالسبب.",
        "السبب",
        "حذف نهائي",
        true,
    ),
    ;

    companion object {
        const val MIN_REASON = 5

        fun isValidReason(text: String): Boolean = text.trim().length >= MIN_REASON

        /** المؤرشف يُحذف نهائيًا فقط؛ غيره يُطلب تعديله أو يُؤرشف. */
        fun available(status: AdminArticleStatus): List<AdminWorkflowAction> =
            if (status == AdminArticleStatus.Archived) listOf(PermanentDelete) else listOf(RequestRevision, Archive)
    }
}

object AdminText {
    /** «حُفظت» أو «نُشر» حسب الحالة، مع الوقت المناسب. */
    fun timestamp(item: AdminNewsItem): Pair<String, String?> =
        if (item.state == AdminArticleStatus.Published && item.publishedAt != null) "نُشر" to item.publishedAt
        else "حُفظت" to item.updatedAt

    /** النشر الفوري متاح لغير المنشور وغير المؤرشف. */
    fun canPublish(item: AdminNewsItem): Boolean =
        item.state != AdminArticleStatus.Published && item.state != AdminArticleStatus.Archived

    fun canLoadMore(loaded: Int, total: Int): Boolean = loaded < total
}

/** عرض الموعد على صف الخبر — مرآة iOS `AdminSchedulePresentation`: الموعد المحفوظ وحده قد يفوت. */
data class AdminSchedule(val title: String, val detail: String, val overdue: Boolean)

object AdminScheduleText {
    fun of(item: AdminNewsItem, now: java.time.Instant = java.time.Instant.now()): AdminSchedule? {
        val saved = com.sabq.smart.feature.editorial.EditorialText.parse(item.scheduledAt)
        val label = { at: java.time.Instant -> com.sabq.smart.feature.editorial.EditorialText.dayTime(at, now) }
        return when {
            item.state == AdminArticleStatus.Draft && item.isOpinion -> {
                if (saved != null) {
                    val overdue = !saved.isAfter(now)
                    AdminSchedule(
                        title = if (overdue) "فات موعد الكاتب" else "موعد محفوظ",
                        detail = "${if (overdue) "فات الموعد المحفوظ" else "موعد محفوظ"} · ${label(saved)}",
                        overdue = overdue,
                    )
                } else {
                    val next = com.sabq.smart.feature.editorial.EditorialText.parse(item.writerWeeklySlot?.nextSlot)
                    if (next != null) {
                        AdminSchedule("الموعد القادم حسب جدول الكاتب", "اقتراح الكاتب · ${label(next)}", false)
                    } else {
                        AdminSchedule("موعد الكاتب", "غير محدد — حدده يدويًا", false)
                    }
                }
            }
            item.state == AdminArticleStatus.Scheduled -> {
                if (saved == null) {
                    AdminSchedule("موعد النشر", "غير محدد — اختر موعدًا", false)
                } else {
                    val overdue = !saved.isAfter(now)
                    AdminSchedule(if (overdue) "فات موعد النشر" else "موعد النشر", label(saved), overdue)
                }
            }
            else -> null
        }
    }
}
