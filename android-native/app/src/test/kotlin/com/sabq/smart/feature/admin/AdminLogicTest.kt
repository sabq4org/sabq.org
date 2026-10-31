package com.sabq.smart.feature.admin

import java.time.Instant
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AdminLogicTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }
    private val now = Instant.parse("2026-10-31T12:00:00Z")

    private fun item(status: String, type: String = "news", scheduledAt: String? = null, nextSlot: String? = null) =
        AdminNewsItem(
            id = "a1",
            status = status,
            articleType = type,
            scheduledAt = scheduledAt,
            writerWeeklySlot = nextSlot?.let { AdminWriterWeeklySlot(weekday = 3, publishTime = "09:00", nextSlot = it) },
        )

    @Test
    fun reasonNeedsFiveTrimmedChars() {
        assertFalse(AdminWorkflowAction.isValidReason("  abc  "))
        assertFalse(AdminWorkflowAction.isValidReason("أربع"))
        assertTrue(AdminWorkflowAction.isValidReason("خمسة أ"))
    }

    @Test
    fun archivedOffersOnlyPermanentDelete() {
        assertEquals(listOf(AdminWorkflowAction.PermanentDelete), AdminWorkflowAction.available(AdminArticleStatus.Archived))
        assertEquals(
            listOf(AdminWorkflowAction.RequestRevision, AdminWorkflowAction.Archive),
            AdminWorkflowAction.available(AdminArticleStatus.Draft),
        )
    }

    @Test
    fun publishOnlyForUnpublishedAndUnarchived() {
        assertTrue(AdminText.canPublish(item("draft")))
        assertTrue(AdminText.canPublish(item("scheduled")))
        assertFalse(AdminText.canPublish(item("published")))
        assertFalse(AdminText.canPublish(item("archived")))
    }

    @Test
    fun unknownStatusFallsBackToDraft() {
        assertEquals(AdminArticleStatus.Draft, AdminArticleStatus.from("weird"))
        assertEquals(AdminContactStatus.Pending, AdminContactStatus.from(null))
        assertEquals(AdminTicketStatus.Closed, AdminTicketStatus.from("closed"))
    }

    @Test
    fun scheduleForOpinionDrafts() {
        assertEquals("موعد محفوظ", AdminScheduleText.of(item("draft", "opinion", "2026-11-02T06:00:00Z"), now)?.title)
        val overdue = AdminScheduleText.of(item("draft", "opinion", "2026-10-30T06:00:00Z"), now)
        assertEquals("فات موعد الكاتب", overdue?.title)
        assertTrue(overdue!!.overdue)
        assertEquals(
            "الموعد القادم حسب جدول الكاتب",
            AdminScheduleText.of(item("draft", "opinion", nextSlot = "2026-11-04T06:00:00Z"), now)?.title,
        )
        val none = AdminScheduleText.of(item("draft", "opinion"), now)
        assertEquals("موعد الكاتب", none?.title)
        assertEquals("غير محدد — حدده يدويًا", none?.detail)
    }

    @Test
    fun scheduleForScheduledAndOthers() {
        assertEquals("غير محدد — اختر موعدًا", AdminScheduleText.of(item("scheduled"), now)?.detail)
        assertEquals("فات موعد النشر", AdminScheduleText.of(item("scheduled", scheduledAt = "2026-10-31T11:00:00Z"), now)?.title)
        assertEquals("موعد النشر", AdminScheduleText.of(item("scheduled", scheduledAt = "2026-10-31T13:00:00Z"), now)?.title)
        assertNull(AdminScheduleText.of(item("draft"), now))
        assertNull(AdminScheduleText.of(item("published"), now))
    }

    @Test
    fun decodesInboxPayloads() {
        val contacts = json.decodeFromString<AdminContactPage>(
            """{"success":true,"messages":[{"id":"m1","name":"سارة","email":"x@y.z","subject":"اقتراح","message":"نص","status":"replied","createdAt":"2026-10-31T08:00:00.000Z","repliedBy":"u1"}],"total":21,"page":1,"limit":20,"totalPages":2}""",
        )
        assertEquals(AdminContactStatus.Replied, contacts.messages.single().state)
        assertEquals(2, contacts.totalPages)

        val tickets = json.decodeFromString<AdminTicketPage>(
            """{"tickets":[{"id":"t1","writerId":"w1","writerName":null,"writerEmail":"w@s.org","title":"موعد","status":"open","hasUnread":true}],"total":1,"page":1,"totalPages":1}""",
        )
        assertEquals("w@s.org", tickets.tickets.single().writerLabel)
        assertTrue(tickets.tickets.single().hasUnread)

        val detail = json.decodeFromString<AdminTicketDetail>(
            """{"ticket":{"id":"t1","title":"موعد","status":"answered"},"messages":[{"id":"x","ticketId":"t1","senderId":"a","senderRole":"admin","message":"تم","parentMessageId":null}]}""",
        )
        assertTrue(detail.messages.single().isFromAdmin)
        assertEquals("كاتب الرأي", detail.ticket.writerLabel)
    }

    @Test
    fun replyBodiesUseServerFieldNames() {
        assertEquals("""{"message":"شكرًا","parentMessageId":"p1"}""", json.encodeToString(AdminTicketReplyBody("شكرًا", "p1")))
        assertEquals("""{"replyText":"أهلًا"}""", json.encodeToString(AdminContactReplyBody("أهلًا")))
        assertEquals("""{"deletionReason":"مكرر تمامًا"}""", json.encodeToString(AdminDeletionBody("مكرر تمامًا")))
    }
}
