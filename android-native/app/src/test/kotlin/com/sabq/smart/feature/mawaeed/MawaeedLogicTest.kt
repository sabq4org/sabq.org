package com.sabq.smart.feature.mawaeed

import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class MawaeedLogicTest {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false }

    @Test
    fun riyadhDateCrossesMidnightBeforeUtc() {
        assertEquals("2026-11-01", MawaeedLogic.riyadhDateISO(Instant.parse("2026-10-31T21:00:00Z")))
        assertEquals("2026-10-31", MawaeedLogic.riyadhDateISO(Instant.parse("2026-10-31T20:59:00Z")))
    }

    @Test
    fun liveTextWholeDays() {
        val now = Instant.parse("2026-10-31T21:00:00Z")
        assertEquals("بعد يومين", MawaeedLogic.liveText(now, "2026-11-03", "اليوم"))
    }

    @Test
    fun liveTextDaysAndHours() {
        val now = Instant.parse("2026-11-01T09:00:00Z")
        assertEquals("بعد يوم واحد و12 ساعة", MawaeedLogic.liveText(now, "2026-11-03", "اليوم"))
    }

    @Test
    fun liveTextHoursOnly() {
        val now = Instant.parse("2026-11-02T18:00:00Z")
        assertEquals("بعد 3 ساعات", MawaeedLogic.liveText(now, "2026-11-03", "اليوم"))
    }

    @Test
    fun liveTextToday() {
        val now = Instant.parse("2026-11-03T05:00:00Z")
        assertEquals("اليوم", MawaeedLogic.liveText(now, "2026-11-03", "اليوم"))
    }

    @Test
    fun clockPartsCountsToRiyadhMidnight() {
        val card = MawaeedCard(startsOn = "2026-11-03", title = "t")
        val parts = MawaeedLogic.clockParts(card, Instant.parse("2026-11-01T09:00:00Z"))
        assertEquals(MawaeedLogic.ClockParts(1, 12, 0, null), parts)
    }

    @Test
    fun compactTitleDropsMonthAndYear() {
        assertEquals("موعد صرف الرواتب", MawaeedLogic.compactTitle("موعد صرف الرواتب (نوفمبر 2026)", "2026-11-27"))
        assertEquals("حساب المواطن", MawaeedLogic.compactTitle("حساب المواطن — نوفمبر 2026", "2026-11-10"))
        assertEquals("عنوان آخر", MawaeedLogic.compactTitle("عنوان آخر", "bad"))
    }

    @Test
    fun dayUnitWords() {
        assertEquals("أيام", MawaeedLogic.dayUnitWord(5))
        assertEquals("يوماً", MawaeedLogic.dayUnitWord(11))
        assertEquals("بعد يومين", MawaeedLogic.daysPhrase(2, "اليوم"))
    }

    @Test
    fun decodesOverviewAndPicksNearest() {
        val payload = json.decodeFromString<MawaeedViewPayload>(
            """{"region":"riyadh","series":[
              {"slug":"salary","title":"رواتب","kind":"salary","next":{"id":1,"seriesSlug":"salary","seriesTitle":"رواتب","title":"x","startsOn":"2026-11-27"}},
              {"slug":"ca","title":"حساب المواطن","kind":"citizen_account","next":{"id":"a","seriesSlug":"ca","seriesTitle":"حساب المواطن","title":"y","startsOn":"2026-11-10"}},
              {"slug":"school","title":"الإجازات","kind":"school_holiday","next":null,"upcoming":[]}
            ],"sections":[],"faq":[]}""",
        )
        val nearest = MawaeedLogic.nearestCard(payload.series)
        assertEquals("ca", nearest?.seriesSlug)
        assertEquals("a", nearest?.key)
        val board = MawaeedLogic.boardBlocks(payload.series, nearest)
        assertEquals(listOf("salary"), board.map { it.slug })
    }

    @Test
    fun regionQueryOmitsDefault() {
        assertNull(MawaeedPrefs.query("riyadh"))
        assertEquals("jeddah", MawaeedPrefs.query("jeddah"))
    }
}
