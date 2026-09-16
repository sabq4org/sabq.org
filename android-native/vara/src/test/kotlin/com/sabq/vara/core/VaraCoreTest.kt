package com.sabq.vara.core

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VaraCoreTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun fixtureParserAcceptsCurrentNestedContractAndNullScores() {
        val root = json.parseToJsonElement(
            """{"fixture":{"id":42,"timestamp":1785000000},"teams":{"home":{"id":1,"name":"الهلال","logo":"/h.png"},"away":{"id":2,"nameAr":"النصر"}},"status":{"code":"NS","label":"قادمة"},"competition":{"slug":"pro-league","name":"دوري روشن"}}""",
        )
        val parsed = parseFixture(root)
        assertNotNull(parsed)
        val fixture = parsed!!
        assertEquals(42, fixture.id)
        assertEquals("الهلال", fixture.home.name)
        assertEquals("https://sabq.org/h.png", fixture.home.logo)
        assertEquals("pro-league", fixture.competitionSlug)
        assertEquals(null, fixture.homeScore)
        assertFalse(fixture.status.live)
    }

    @Test
    fun fixtureParserRecognizesLiveAndFinishedStatusVariants() {
        val live = parseFixture(json.parseToJsonElement("""{"id":1,"home":{"id":2,"name":"أ"},"away":{"id":3,"name":"ب"},"status":{"code":"2H","elapsed":71}}"""))!!
        val finished = parseFixture(json.parseToJsonElement("""{"id":2,"home":{"id":2,"name":"أ"},"away":{"id":3,"name":"ب"},"status":"FT"}"""))!!
        assertTrue(live.status.live)
        assertEquals(71, live.status.elapsed)
        assertTrue(finished.status.finished)
    }

    @Test
    fun standingsAndLeadersTolerateOptionalFields() {
        val standing = parseStanding(json.parseToJsonElement("""{"position":1,"team":{"teamId":7,"name_ar":"الاتحاد"},"p":9,"w":7,"d":1,"l":1,"gd":12,"pts":22}"""))!!
        val leader = parseLeader(json.parseToJsonElement("""{"player":{"playerId":8,"nameAr":"لاعب"},"team":{"name":"نادٍ"},"goals":5}"""))!!
        assertEquals(22, standing.points)
        assertEquals(7, standing.team.id)
        assertEquals(5, leader.value)
        assertEquals("نادٍ", leader.team)
    }

    @Test
    fun findArraySupportsDirectAndNestedResponseEnvelopes() {
        val direct = json.parseToJsonElement("""{"fixtures":[{"id":1}]}""")
        val nested = json.parseToJsonElement("""{"data":{"items":[{"id":2}]}}""")
        assertEquals(1, findArray(direct, "fixtures").size)
        assertEquals(2, findArray(nested, "items").first().jsonObject.int("id"))
        assertTrue(findArray(json.parseToJsonElement("{}"), "items").isEmpty())
    }

    @Test
    fun fixtureBucketsCombineCurrentCompetitionResponseSections() {
        val root = json.parseToJsonElement("""{"live":[{"id":1,"home":{"id":1,"name":"أ"},"away":{"id":2,"name":"ب"}}],"today":[{"id":1,"home":{"id":1,"name":"أ"},"away":{"id":2,"name":"ب"}}],"upcoming":[{"id":2,"home":{"id":3,"name":"ج"},"away":{"id":4,"name":"د"}}],"results":[]}""")
        val fixtures = parseFixtureBuckets(root)
        assertEquals(listOf(1, 2), fixtures.map { it.id })
    }

    @Test
    fun memberParserKeepsPhoneOnlyAccountBehindNameGate() {
        val phoneOnly = parseMember(json.parseToJsonElement("""{"id":"u1","phone":"+966500000000"}"""))!!
        val named = parseMember(json.parseToJsonElement("""{"id":"u2","firstName":"سارة","lastName":"محمد"}"""))!!
        assertTrue(phoneOnly.needsDisplayName)
        assertFalse(named.needsDisplayName)
        assertEquals("سارة محمد", named.name)
    }

    @Test
    fun syntheticPhoneEmailIsHiddenFromDisplay() {
        val member = parseMember(json.parseToJsonElement("""{"id":"u1","name":"أحمد","email":"0501234567@phone.sabq.org"}"""))!!
        assertEquals("", member.displayEmail)
        val real = parseMember(json.parseToJsonElement("""{"id":"u2","name":"سارة","email":"sara@example.com"}"""))!!
        assertEquals("sara@example.com", real.displayEmail)
    }

    @Test
    fun worldLiveStringCompetitionAndPenaltiesAreParsed() {
        // /sports/world-live يعيد competition نصًا لا كائنًا — كان يضيع فيتوحّد
        // كل العالم في مجموعة واحدة بلا أسماء.
        val fx = parseFixture(
            json.parseToJsonElement(
                """{"id":9,"home":{"id":1,"name":"أ"},"away":{"id":2,"name":"ب"},"competition":"الدوري الإيطالي","countryAr":"إيطاليا","leagueLogo":"/l.png","status":{"code":"PEN","live":true},"penalties":{"home":5,"away":4}}""",
            ),
        )!!
        assertEquals("الدوري الإيطالي", fx.competitionName)
        assertEquals("إيطاليا", fx.countryAr)
        assertEquals("https://sabq.org/l.png", fx.leagueLogo)
        assertEquals(5, fx.penHome)
        assertEquals(4, fx.penAway)
        assertTrue(fx.hasPenalties)
    }

    @Test
    fun standingsCarryGoalsAndLiveDelta() {
        val s = parseStanding(json.parseToJsonElement("""{"rank":2,"team":{"id":3,"name":"الهلال"},"played":10,"points":24,"goalsFor":28,"goalsAgainst":9,"live":true,"liveDelta":1}"""))!!
        assertEquals(28, s.goalsFor)
        assertEquals(9, s.goalsAgainst)
        assertTrue(s.live)
        assertEquals(1, s.liveDelta)
    }

    @Test
    fun matchClockMirrorsIosBehavior() {
        // الحالات الموقوفة تعرض نصها لا الدقيقة.
        assertEquals("استراحة", MatchClock.minuteText(MatchStatus(code = "HT", live = true, elapsed = 45)))
        assertEquals("ركلات", MatchClock.minuteText(MatchStatus(code = "P", live = true, elapsed = 120)))
        // بدل الضائع دائمًا بنص المزوّد.
        val extra = MatchStatus(code = "1H", live = true, elapsed = 45, extra = 2, clockStartEpoch = 1L)
        assertFalse(MatchClock.isSelfTicking(extra))
        assertEquals("45+2'", MatchClock.minuteText(extra))
        // العدّاد الذاتي من المرساة: بعد 630 ثانية من الانطلاق = الدقيقة 11.
        val nowMs = 1_700_000_000_000L
        val anchored = MatchStatus(code = "1H", live = true, elapsed = 9, clockStartEpoch = nowMs / 1000 - 630)
        assertTrue(MatchClock.isSelfTicking(anchored))
        assertEquals("11'", MatchClock.minuteText(anchored, nowMs))
        // مرساة فاسدة فوق السقف → الرجوع لدقيقة المزوّد.
        val insane = MatchStatus(code = "2H", live = true, elapsed = 88, clockStartEpoch = nowMs / 1000 - 200L * 60)
        assertEquals("88'", MatchClock.minuteText(insane, nowMs))
    }

    @Test
    fun riyadhFormatterUsesGregorianLatinDigits() {
        VaraFormat.displayLang = "ar"
        // 2026-07-27T18:00:00Z = 21:00 بتوقيت الرياض.
        val fx = Fixture(1, Team(1, "أ"), Team(2, "ب"), timestamp = 1_785_261_600L)
        val kickoff = fixtureKickoff(fx)
        assertTrue("expected latin digits in: $kickoff", kickoff.contains("21:00"))
        assertTrue("expected Arabic month name in: $kickoff", kickoff.contains("يوليو"))
    }

    @Test
    fun transferProbabilityIsTextualLevel() {
        val t = com.sabq.vara.ui.parseTransfer(
            json.parseToJsonElement("""{"player":{"id":7,"name":"لاعب"},"probability":"HIGH","from":{"name":"نادٍ"},"to":{"name":"آخر"},"amount":85000000,"currency":"EUR"}"""),
        )!!
        assertEquals("قوية", t.probabilityLabelAr)
        assertEquals("85 مليون €", t.fee)
        assertEquals("https://media.api-sports.io/football/players/7.png", t.playerImage)
    }
}
