package com.sabq.smart.feature.editorial

import java.time.Instant
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EditorialApiTest {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    @Test
    fun decodesBoardsAndDropsUnknownKinds() {
        val board = json.decodeFromString<EditorialNewsBoard>(
            """{"counts":{"all":3,"reporters":1,"editRequests":1,"email":1},"oldestAt":"2026-10-31T08:00:00.000Z",
               "items":[{"kind":"draft","id":"a","title":"t","channel":"app","albumCount":2},
                        {"kind":"edit_request","id":"r","articleId":"a2","title":"t2","requesterName":"س","articleStatus":"published"},
                        {"kind":"future","id":"x","title":"?"}]}""",
        )
        assertEquals(2, board.visibleItems.size)
        assertTrue(board.visibleItems[0].isDraft)
        assertEquals("على خبر منشور", board.visibleItems[1].onWhat)
        assertEquals("1 مراسل · 1 بريد · 1 طلب تعديل", board.breakdown)
    }

    @Test
    fun myNewsKeepsKnownStatesAndReadsPublishedSlug() {
        val board = json.decodeFromString<MyNewsBoard>(
            """{"counts":{"all":1},"items":[
               {"id":"1","title":"x","state":"published","stateLabel":"منشور","url":"https://sabq.org/article/abc-123"},
               {"id":"2","title":"y","state":"weird","stateLabel":"?"}]}""",
        )
        assertEquals(listOf("1"), board.visibleItems.map { it.id })
        assertEquals("abc-123", board.visibleItems[0].publishedSlug)
        assertNull(MyNewsItem(url = "http://sabq.org/article/x").publishedSlug)
    }

    @Test
    fun requestBodiesEncodeRequiredFieldsAndOmitNulls() {
        val body = json.encodeToString(
            EditRequestDraftBody("a1", urgent = false, note = "", proposed = EditRequestProposedBody(title = "ج")),
        )
        assertTrue(body.contains("\"urgent\":false"))
        assertTrue(body.contains("\"note\":\"\""))
        assertFalse(body.contains("albumAdd"))
        assertEquals("""{"regenerate":true}""", json.encodeToString(ApproveBody(regenerate = true)))
        assertEquals("{}", json.encodeToString(PublishBody()))
    }

    @Test
    fun paragraphsStripHtml() {
        assertEquals(
            listOf("أولى & ثانية", "ثالثة"),
            EditorialText.paragraphs("<p>أولى &amp; ثانية</p><p><strong>ثالثة</strong></p><p> </p>"),
        )
    }

    @Test
    fun relativeAndDayTimeUseLatinDigitsAndRiyadhTime() {
        val now = Instant.parse("2026-10-31T18:00:00Z") // 21:00 Riyadh
        assertEquals("الآن", EditorialText.relative(now, now))
        assertEquals("منذ 5 د", EditorialText.relative(now.minusSeconds(300), now))
        assertEquals("منذ ساعتين", EditorialText.relative(now.minusSeconds(7200), now))
        assertEquals("اليوم 20:00", EditorialText.dayTime(now.minusSeconds(3600), now))
        assertEquals("أمس 21:00", EditorialText.dayTime(now.minusSeconds(86_400), now))
        assertEquals("2026-10-31T18:00:00Z", EditorialText.isoUtc(now))
        assertEquals("اعتمد وطبّق (2 من 3)", EditRequestReview.approveTitle(2, 3))
        assertEquals("اعتمد وطبّق", EditRequestReview.approveTitle(3, 3))
    }
}
