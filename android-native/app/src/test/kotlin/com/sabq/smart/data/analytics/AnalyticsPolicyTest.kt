package com.sabq.smart.data.analytics

import org.junit.Assert.*
import org.junit.Test

class AnalyticsPolicyTest {
    @Test fun customPushNameAvoidsFirebaseReservedNotificationEvent() {
        assertNull(AnalyticsPolicy.sanitize("notification_open", mapOf("notification_type" to "article")))
        assertNotNull(AnalyticsPolicy.sanitize("push_open", mapOf("notification_type" to "article")))
    }

    @Test fun collectionRequiresConsentConfigurationAndExplicitDebugOptIn() {
        assertFalse(AnalyticsPolicy.canCollect(false, false, true, true))
        assertFalse(AnalyticsPolicy.canCollect(true, false, true, false))
        assertFalse(AnalyticsPolicy.canCollect(true, true, false, true))
        assertTrue(AnalyticsPolicy.canCollect(true, true, true, true))
        assertTrue(AnalyticsPolicy.canCollect(true, false, false, true))
    }

    @Test fun encodedAndEmbeddedSensitiveSearchIsDroppedEntirely() {
        listOf("contact test@example.com", "contact test%40example.com",
            "test%2540example.com", "call +966 50 123 4567", "اتصل ٠٥٠١٢٣٤٥٦٧", "token=synthetic",
            "https://example.com/?code=synthetic").forEach {
            assertNull(it, AnalyticsPolicy.sanitize("search", mapOf("search_term" to it)))
        }
        assertEquals("رؤية 2030", AnalyticsPolicy.sanitize("search", mapOf("search_term" to "رؤية 2030"))?.get("search_term"))
    }

    @Test fun safeIdentifiersSurviveWhileUnknownFieldsAndObjectsDoNot() {
        val result = AnalyticsPolicy.sanitize("article_view", mapOf(
            "article_id" to "1234567890123", "article_title" to "Safe public title",
            "email" to "test@example.com", "user" to mapOf("secret" to "synthetic")))!!
        assertEquals(setOf("article_id", "article_title"), result.keys)
        assertEquals("1234567890123", result["article_id"])
        assertNotNull(AnalyticsPolicy.sanitize("article_view", mapOf("article_id" to "123e4567-e89b-12d3-a456-426614174000"))?.get("article_id"))
        assertNull(AnalyticsPolicy.sanitize("unknown_event", emptyMap()))
    }

    @Test fun sensitiveScreensAreExcludedAndBooleanFlagsAreNumeric() {
        listOf("AdminInbox", "Settings", "Login", "Profile", "More", "Bookmarks").forEach {
            assertNull(AnalyticsPolicy.sanitize("screen_view", mapOf("screen_name" to it)))
        }
        assertNotNull(AnalyticsPolicy.sanitize("screen_view", mapOf("screen_name" to "ArticleDetail")))
        assertEquals(1L, AnalyticsPolicy.sanitize("bookmark_toggle", mapOf("bookmarked" to true))?.get("bookmarked"))
    }

    @Test fun shareAndLiteContractsAreNotSilentlyDropped() {
        assertEquals("destination_selected", AnalyticsPolicy.sanitize("share", mapOf("article_id" to "abc", "stage" to "destination_selected"))?.get("stage"))
        assertEquals("auto", AnalyticsPolicy.sanitize("lite_mode_activated", mapOf("trigger" to "auto"))?.get("trigger"))
    }

    @Test fun partialFinalBodyBlockDoesNotPretendToBeFullyRead() {
        assertEquals(0.5f, AnalyticsPolicy.readingDepth(0, 1, 0.5f), 0.001f)
        assertEquals(0.875f, AnalyticsPolicy.readingDepth(3, 4, 0.5f), 0.001f)
        assertEquals(1f, AnalyticsPolicy.readingDepth(3, 4, 1f), 0.001f)
        assertEquals(0f, AnalyticsPolicy.readingDepth(4, 4, 1f), 0.001f)
    }

    @Test fun readingPausesInBackgroundAndFlushesOnlyOnce() {
        var now = 0L
        val reading = AnalyticsReadingSession { now }
        reading.active(true)
        now = 6_000; reading.active(false)
        now = 66_000
        assertTrue(reading.depth(90).isEmpty())
        reading.active(true)
        now = 72_000
        assertEquals(12L, reading.finish())
        assertNull(reading.finish())
    }

    @Test fun thresholdsArePerVisitAndShortReadsDoNotEmit() {
        var now = 0L
        val first = AnalyticsReadingSession { now }
        first.active(true)
        assertEquals(listOf(25, 50, 75), first.depth(80))
        assertTrue(first.depth(80).isEmpty())
        assertEquals(listOf(90), first.depth(100))
        now = 9_000
        assertNull(first.finish())
        val second = AnalyticsReadingSession { now }
        second.active(true)
        assertEquals(listOf(25), second.depth(30))
    }
}
