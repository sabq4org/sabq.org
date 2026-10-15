package com.sabq.smart.feature.economy

import java.time.Instant
import org.junit.Assert.*
import org.junit.Test

/** نقل `format.ts` — نظير اختبارات iOS للدفعة 4. */
class EconomyFormatTest {
    @Test fun sarAndCounts() {
        assertEquals("15.84 مليار", EconomyFormat.fmtSar(15_840_000_000.0))
        assertEquals("2.5 مليون", EconomyFormat.fmtSar(2_500_000.0))
        assertEquals("1,250", EconomyFormat.fmtSar(1250.4))
        assertEquals("1.2 مليون", EconomyFormat.fmtCount(1_240_000.0))
        assertEquals("12 ألف", EconomyFormat.fmtCount(12_400.0))
        assertEquals("980", EconomyFormat.fmtCount(980.0))
        assertEquals("—", EconomyFormat.fmtSar(Double.NaN))
    }

    @Test fun pctRateAndTrim() {
        assertEquals("0.2%", EconomyFormat.fmtPct(-0.2))
        assertEquals("—", EconomyFormat.fmtPct(null))
        assertEquals("3.75", EconomyFormat.fmtRate(3.75))
        assertEquals("0.07307", EconomyFormat.fmtRate(0.073071))
        assertEquals("123.46", EconomyFormat.fmtRate(123.456))
        assertEquals("1,234.5", EconomyFormat.trimNum(1234.5, 1))
        assertEquals("2", EconomyFormat.trimNum(2.0, 2))
    }

    @Test fun datesAndPeriods() {
        assertEquals("28 أغسطس 2026", EconomyFormat.fmtDateAr("2026-08-28"))
        assertEquals("28 أغسطس", EconomyFormat.fmtDateAr("2026-08-28T10:00:00Z", withYear = false))
        assertEquals("أغسطس 2026", EconomyFormat.fmtMonthAr("2026-08-28"))
        assertEquals("—", EconomyFormat.fmtDateAr(null))
        assertEquals("يول", EconomyFormat.fmtMonthShort("2026-07"))
        assertEquals("ر2 26", EconomyFormat.fmtMonthShort("2026-Q2"))
        assertEquals("x", EconomyFormat.fmtMonthShort("x"))
    }

    @Test fun freshnessAndHomeMode() {
        val now = Instant.parse("2026-09-13T12:00:00Z")
        assertTrue(EconomyFormat.isFresh("2026-09-12T13:00:00Z", now = now))
        assertFalse(EconomyFormat.isFresh("2026-09-11T11:00:00Z", now = now))
        assertFalse(EconomyFormat.isFresh(null, now = now))
        val cards = List(3) { EconomyMonthlyCard(key = "k$it") }
        val freshMonthly = EconomyMonthlySummary(cards = cards, ingestedAt = "2026-09-13T00:00:00Z")
        val weekly = EconomyWeeklySummary(topSectors = listOf(EconomySectorSummary(en = "food")))
        assertEquals(EconomyFormat.HomeMode.Monthly, EconomyFormat.homeMode(EconomySnapshot(monthly = freshMonthly, weekly = weekly), now))
        assertEquals(EconomyFormat.HomeMode.Weekly, EconomyFormat.homeMode(EconomySnapshot(monthly = freshMonthly.copy(ingestedAt = "2026-09-01T00:00:00Z"), weekly = weekly), now))
        assertEquals(EconomyFormat.HomeMode.Hidden, EconomyFormat.homeMode(EconomySnapshot(weekly = EconomyWeeklySummary()), now))
        assertEquals(EconomyFormat.HomeMode.Hidden, EconomyFormat.homeMode(null, now))
    }

    @Test fun indicatorSubAndUnits() {
        assertEquals("منذ 28 أغسطس", EconomyFormat.indicatorSub(EconomyIndicator(cadence = "decision", asOf = "2026-08-28")))
        assertEquals("الربع 2 · 2026", EconomyFormat.indicatorSub(EconomyIndicator(cadence = "quarterly", quarter = "2", year = "2026")))
        assertEquals("أغسطس 2026", EconomyFormat.indicatorSub(EconomyIndicator(cadence = "monthly", asOf = "2026-08-01")))
        assertEquals("1.5 مليار ريال", EconomyFormat.fmtUnit(1_500_000_000.0, "sar"))
        assertEquals("12.3%", EconomyFormat.fmtUnit(12.34, "pct"))
        assertEquals("950", EconomyFormat.fmtUnit(950.0, "count"))
    }

    @Test fun latestAsOfPicksTheNewestDate() {
        val s = EconomySnapshot(
            indicators = listOf(EconomyIndicator(asOf = "2026-08-01"), EconomyIndicator(asOf = "2026-09-10")),
            fxAsOf = "2026-09-12",
            weekly = EconomyWeeklySummary(periodEnd = "2026-09-05"),
        )
        assertEquals("2026-09-12", s.latestAsOf)
    }
}
