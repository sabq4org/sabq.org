package com.sabq.smart.feature.sports

import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SportsHeadlineTest {
    private val comps = listOf(
        SpCompetitionInfo(slug = "pro-league", name = "دوري روشن", category = "saudi", start = "2026-08-20"),
        SpCompetitionInfo(slug = "premier-league", name = "الدوري الإنجليزي", category = "europe"),
    )

    private fun fixture(
        id: Int,
        slug: String,
        home: String,
        away: String,
        ts: Long = 1_793_000_000,
        live: Boolean = false,
        finished: Boolean = false,
        elapsed: Int? = null,
    ) = SpTodayFixture(
        id = id,
        timestamp = ts,
        status = SpTodayStatus(live = live, finished = finished, elapsed = elapsed),
        home = SpTodayTeam(id * 10, home),
        away = SpTodayTeam(id * 10 + 1, away),
        goals = SpTodayGoals(home = 2, away = 1),
        competitionSlug = slug,
    )

    @Test
    fun liveSaudiMatchWins() {
        val today = listOf(
            fixture(1, "premier-league", "ليفربول", "آرسنال", live = true, elapsed = 30),
            fixture(2, "pro-league", "الهلال", "النصر", live = true, elapsed = 55),
        )
        val h = SportsHeadline.pick(today, comps)
        assertTrue(h.live)
        assertEquals(2, h.match?.id)
        assertEquals("د55 — تابعها لحظة بلحظة", h.tail)
    }

    @Test
    fun foreignMatchNeedsHeadlineClub() {
        val today = listOf(fixture(1, "premier-league", "برنتفورد", "فولهام"))
        val h = SportsHeadline.pick(today, comps, Instant.parse("2026-10-31T09:00:00Z"))
        assertNull(h.match)
        assertEquals("2 بطولة في مكان واحد", h.text)
    }

    @Test
    fun upcomingMatchShowsKickoff() {
        val ts = Instant.parse("2026-11-01T17:30:00Z").epochSecond
        val h = SportsHeadline.pick(listOf(fixture(3, "pro-league", "الاتحاد", "الأهلي", ts = ts)), comps)
        assertFalse(h.live)
        assertEquals(3, h.match?.id)
        assertTrue(h.tail, h.tail.startsWith("8:30"))
    }

    @Test
    fun countdownToNextTournament() {
        val list = listOf(SpCompetitionInfo(slug = "kings-cup", name = "كأس الملك", category = "saudi", start = "2026-11-03"))
        val h = SportsHeadline.pick(emptyList(), list, Instant.parse("2026-10-31T21:00:00Z"))
        assertEquals("كأس الملك ينطلق بعد يومين", h.text)
    }

    @Test
    fun emptyEverything() {
        assertEquals("كل البطولات في مكان واحد", SportsHeadline.pick(emptyList(), emptyList()).text)
    }

    @Test
    fun normalizesArabicNames() {
        assertEquals("الاهلي", SportsHeadline.normalizeName("الأهلي"))
        assertEquals("القادسيه", SportsHeadline.normalizeName("القادسية"))
    }

    @Test
    fun groupsPutLiveThenSaudiFirst() {
        val today = listOf(
            fixture(1, "premier-league", "ليفربول", "آرسنال", live = true),
            fixture(2, "pro-league", "الهلال", "النصر"),
            fixture(3, "la-liga", "ريال مدريد", "برشلونة"),
        )
        val groups = SportsHeadline.groups(today, comps)
        assertEquals(listOf("premier-league", "pro-league", "la-liga"), groups.map { it.slug })
        assertEquals("دوري روشن", groups[1].name)
    }

    @Test
    fun scoreIsAwayFirstForLtr() {
        assertEquals("1 - 2", SportsTodayText.score(fixture(1, "pro-league", "أ", "ب")))
        assertEquals("90+3′", SpTodayStatus(elapsed = 90, extra = 3).minuteText)
    }

    @Test
    fun decoderSkipsBrokenFixture() {
        val json = Json { ignoreUnknownKeys = true }
        val root = json.decodeFromString<JsonObject>(
            """{"configured":true,"today":[
              {"id":7,"timestamp":1793000000,"status":{"code":"NS","live":false,"finished":false},"home":{"id":1,"name":"الهلال"},"away":{"id":2,"name":"النصر"},"goals":{"home":null,"away":null},"competitionSlug":"pro-league"},
              {"id":"bad"}
            ]}""",
        )
        val payload = SportsTodayDecoder.decode(root)
        assertEquals(true, payload.configured)
        assertEquals(listOf(7), payload.today.map { it.id })
    }

    @Test
    fun isoDateUsesRiyadh() {
        assertEquals("2026-11-01", SportsHeadline.isoDate(0, Instant.parse("2026-10-31T21:30:00Z")))
        assertEquals("2026-10-31", SportsHeadline.isoDate(-1, Instant.parse("2026-10-31T21:30:00Z")))
    }
}
