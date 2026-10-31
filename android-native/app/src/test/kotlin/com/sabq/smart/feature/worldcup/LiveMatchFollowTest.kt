package com.sabq.smart.feature.worldcup

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveMatchFollowTest {

    private val now = 1_800_000_000L

    private fun fixture(
        live: Boolean = false,
        finished: Boolean = false,
        kickoffIn: Long = 0,
        code: String = "",
        elapsed: Int? = null,
        extra: Int? = null,
        home: Int? = null,
        away: Int? = null,
    ) = WcFixture(
        id = 9,
        timestamp = (now + kickoffIn).toInt(),
        status = WcStatus(code = code, label = "الشوط الأول", elapsed = elapsed, extra = extra, live = live, finished = finished),
        home = WcTeam(name = "السعودية"),
        away = WcTeam(name = "الأرجنتين"),
        goals = WcScore(home, away),
    )

    @Test fun eligibilityMatchesIos() {
        assertTrue(LiveMatchFollow.isEligible(fixture(live = true, kickoffIn = -4000), now))
        assertFalse(LiveMatchFollow.isEligible(fixture(finished = true, kickoffIn = -7000), now))
        assertTrue(LiveMatchFollow.isEligible(fixture(kickoffIn = 3600), now))
        assertFalse(LiveMatchFollow.isEligible(fixture(kickoffIn = 3601), now))
        assertTrue(LiveMatchFollow.isEligible(fixture(kickoffIn = -119), now))
        assertFalse(LiveMatchFollow.isEligible(fixture(kickoffIn = -120), now))
    }

    @Test fun buttonTitles() {
        assertEquals("إيقاف المتابعة المباشرة", LiveMatchFollow.buttonTitle(true, fixture(live = true)))
        assertEquals("ذكّرني على شاشة القفل", LiveMatchFollow.buttonTitle(false, fixture(kickoffIn = 600)))
        assertEquals("تابع على شاشة القفل", LiveMatchFollow.buttonTitle(false, fixture(live = true)))
    }

    @Test fun pollIntervals() {
        assertEquals(5_000L, LiveMatchFollow.pollIntervalMs(fixture(live = true), now))
        assertEquals(60_000L, LiveMatchFollow.pollIntervalMs(fixture(kickoffIn = 181), now))
        assertEquals(15_000L, LiveMatchFollow.pollIntervalMs(fixture(kickoffIn = 180), now))
        assertEquals(15_000L, LiveMatchFollow.pollIntervalMs(fixture(kickoffIn = -1799), now))
        assertNull(LiveMatchFollow.pollIntervalMs(fixture(kickoffIn = -1800), now))
        assertNull(LiveMatchFollow.pollIntervalMs(fixture(finished = true), now))
    }

    @Test fun minuteAndClock() {
        assertEquals("67'", LiveMatchFollow.minuteText(WcStatus(elapsed = 67)))
        assertEquals("45+2'", LiveMatchFollow.minuteText(WcStatus(elapsed = 45, extra = 2)))
        assertEquals("", LiveMatchFollow.minuteText(WcStatus(elapsed = 0)))
        val nowMs = now * 1000
        assertEquals(nowMs - 47 * 60_000L, LiveMatchFollow.clockStartMillis(WcStatus(code = "1H", elapsed = 45, extra = 2, live = true), nowMs))
        assertNull(LiveMatchFollow.clockStartMillis(WcStatus(code = "HT", elapsed = 45, live = true), nowMs))
        assertNull(LiveMatchFollow.clockStartMillis(WcStatus(code = "1H", elapsed = 30, live = false), nowMs))
    }

    @Test fun lastEventPicksLatestKeyEvent() {
        val events = listOf(
            WcMatchEvent(minute = 12, type = "goal", player = "الدوسري"),
            WcMatchEvent(minute = 40, type = "substitution", player = "البريكان"),
            WcMatchEvent(minute = 33, extraMinute = null, type = "yellow-card", player = "", label = "إنذار"),
        )
        assertEquals("🟨 33' إنذار", LiveMatchFollow.lastEventText(events))
        assertNull(LiveMatchFollow.lastEventText(listOf(WcMatchEvent(minute = 5, type = "substitution"))))
    }

    @Test fun scoreAndDetailLines() {
        assertEquals("السعودية ضد الأرجنتين", LiveMatchFollow.scoreLine(fixture(kickoffIn = 600)))
        val live = fixture(live = true, code = "2H", elapsed = 67, home = 2, away = 1)
        assertEquals("السعودية 2 - 1 الأرجنتين", LiveMatchFollow.scoreLine(live))
        val d = WcMatchDetail(fixture = live, events = listOf(WcMatchEvent(minute = 60, type = "goal", player = "الشهري")))
        assertEquals("67' · ⚽ 60' الشهري", LiveMatchFollow.detailLine(d))
        val ht = WcMatchDetail(fixture = fixture(live = true, code = "HT", elapsed = 45, home = 0, away = 0))
        assertEquals("الشوط الأول", LiveMatchFollow.detailLine(ht))
    }

    @Test fun clockAnchorStaysStableWithinSameMinute() {
        val a = LiveMatchFollow.ClockAnchor()
        val s67 = WcStatus(code = "2H", elapsed = 67, live = true)
        val t0 = now * 1000
        val first = a.anchor(s67, t0)
        assertEquals(first, a.anchor(s67, t0 + 5_000))
        assertEquals(first, a.anchor(s67, t0 + 10_000))
        val s68 = s67.copy(elapsed = 68)
        assertEquals(t0 + 40_000 - 68 * 60_000L, a.anchor(s68, t0 + 40_000))
        assertNull(a.anchor(s68.copy(code = "HT"), t0 + 50_000))
        assertEquals(t0 + 60_000 - 68 * 60_000L, a.anchor(s68, t0 + 60_000))
    }
}
