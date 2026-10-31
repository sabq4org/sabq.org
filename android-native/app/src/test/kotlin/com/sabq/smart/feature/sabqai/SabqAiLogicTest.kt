package com.sabq.smart.feature.sabqai

import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SabqAiLogicTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test
    fun numbersUseLatinGrouping() {
        assertEquals("1,234,567", SaiFormat.number(1_234_567.0))
        assertEquals("98.7", SaiFormat.number(98.66, 1))
        assertEquals("—", SaiFormat.number(Double.NaN))
    }

    @Test
    fun arabicDateWithAndWithoutYear() {
        assertEquals("19 يوليو 2026", SaiFormat.arabicDate("2026-07-19T00:00:00Z", withYear = true))
        assertEquals("3 أكتوبر", SaiFormat.arabicDate("2026-10-03"))
        assertEquals("bad", SaiFormat.arabicDate("bad"))
    }

    @Test
    fun updatedAgoPhrases() {
        val now = Instant.parse("2026-10-31T12:00:00Z")
        assertEquals("قبل لحظات", SaiFormat.updatedAgo("2026-10-31T12:00:00Z", now))
        assertEquals("قبل دقيقتين", SaiFormat.updatedAgo("2026-10-31T11:58:00Z", now))
        assertEquals("قبل 5 دقائق", SaiFormat.updatedAgo("2026-10-31T11:55:00Z", now))
        assertEquals("قبل 30 دقيقة", SaiFormat.updatedAgo("2026-10-31T11:30:00.000Z", now))
    }

    @Test
    fun tilesDropZeroMetrics() {
        val s = SaiPublicStats(
            ai = SaiAi(totalOps = 10.0, todayOps = 2.0, totalTokens = 0.0, successRate = 99.1),
            comments = SaiComments(total = 0.0, aiAnalyzed = 0.0),
        )
        val labels = SaiLive.tiles(s, monthOps = null).map { it.label }
        assertFalse("توكن معالج منذ الإطلاق" in labels)
        assertFalse("تعليقات تُفحص آليًا" in labels)
        assertFalse("عملًا للفريق هذا الشهر" in labels)
        assertTrue("معدل نجاح العمليات" in labels)
        assertTrue("عملية اليوم حتى الآن" in labels)
    }

    @Test
    fun commentsPercentRounded() {
        val s = SaiPublicStats(comments = SaiComments(total = 3.0, aiAnalyzed = 2.0))
        assertEquals(67.0, SaiLive.tiles(s, 5).first { it.label == "تعليقات تُفحص آليًا" }.value, 0.0)
    }

    @Test
    fun decodesServerPayload() {
        val s = json.decodeFromString<SaiPublicStats>(
            """{"generatedAt":"2026-10-31T12:00:00.000Z","ai":{"totalOps":1200,"todayOps":40,"totalTokens":5500000,"successRate":99.4,"sinceDate":null,"daily":[{"date":"2026-10-30","count":30}],"todayByDomain":{"editorial":10,"sports":25,"visual":3,"audio":2}},"comments":{"total":10,"aiAnalyzed":9},"stories":{"total":4},"articles":{"totalPublished":900,"todayPublished":12},"audio":{"totalMinutes":7},"radar":{"totalItems":50},"sports":{"totalOps":20}}""",
        )
        assertEquals(1200.0, s.ai.totalOps, 0.0)
        assertEquals("رياضة", SaiLive.domainRows(s).first().first)
        assertEquals(1, s.ai.daily.size)
    }
}
