package com.sabq.smart.feature.inbox

import com.sabq.smart.feature.audio.AudioBulletin
import com.sabq.smart.feature.audio.AudioBulletinChapter
import com.sabq.smart.feature.audio.AudioBulletinEnvelope
import com.sabq.smart.feature.audio.AudioBulletinText
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReaderInboxTest {
    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        explicitNulls = false
    }

    @Test
    fun decodesInboxPage() {
        val page = json.decodeFromString<InboxPage>(
            """{"items":[{"id":"1","type":"KeywordFollow","title":"مقال جديد","body":"b","deeplink":"/article/abc","read":false,"imageUrl":null,"createdAt":"2026-10-31T08:00:00.000Z"}],"unread":4,"hasMore":true}""",
        )
        assertEquals(1, page.items.size)
        assertEquals(4, page.unread)
        assertTrue(page.hasMore)
    }

    @Test
    fun prefsEncodeEveryField() {
        val body = json.encodeToString(ReaderNotificationPrefs.Defaults)
        for (key in listOf("dailyDigest", "becauseYouLiked", "similarToSaved", "withinReads", "trendingForYou", "quietHoursStart", "quietHoursEnd")) {
            assertTrue("missing $key in $body", body.contains("\"$key\""))
        }
    }

    @Test
    fun deeplinkTargets() {
        assertEquals(ReaderInboxText.Target.Article("abc"), ReaderInboxText.target("/article/abc"))
        assertEquals(ReaderInboxText.Target.Article("abc"), ReaderInboxText.target("https://sabq.org/article/abc?x=1"))
        assertEquals(ReaderInboxText.Target.Keyword("رؤية"), ReaderInboxText.target("/keyword/%D8%B1%D8%A4%D9%8A%D8%A9"))
        assertNull(ReaderInboxText.target("/dashboard/opinion-author"))
        assertNull(ReaderInboxText.target(null))
    }

    @Test
    fun labelsAndKinds() {
        assertEquals("إشعار غير مقروء", ReaderInboxText.unreadLabel(1))
        assertEquals("إشعاران غير مقروءين", ReaderInboxText.unreadLabel(2))
        assertEquals("5 إشعارات غير مقروءة", ReaderInboxText.unreadLabel(5))
        assertEquals("12 إشعارًا غير مقروء", ReaderInboxText.unreadLabel(12))
        assertEquals(ReaderInboxText.Kind.Keyword, ReaderInboxText.kind("KeywordFollow"))
        assertEquals(ReaderInboxText.Kind.Sports, ReaderInboxText.kind("gc_match"))
        assertEquals(ReaderInboxText.Kind.Comment, ReaderInboxText.kind("CommentReply"))
    }

    @Test
    fun quietHours() {
        assertEquals(22 to 0, QuietHours.split("bad"))
        assertEquals(7 to 30, QuietHours.split("07:30"))
        assertEquals("08:05", QuietHours.format(8, 5))
    }

    @Test
    fun audioBulletin() {
        val env = json.decodeFromString<AudioBulletinEnvelope>(
            """{"bulletin":{"id":"b1","title":"نشرة الصباح","publishedAt":"2026-10-31T04:00:00Z","audioUrl":"https://media.sabq.org/a.mp3","durationSec":200.8,"chapters":[{"start":0,"label":"أولًا"},{"start":60.5,"label":"ثانيًا","href":"/article/x"}]}}""",
        )
        val b = env.bulletin!!
        assertEquals(200.8, b.durationSec, 0.001)
        assertEquals("أولًا", b.activeChapter(10.0)?.label)
        assertEquals("ثانيًا", b.activeChapter(61.0)?.label)
        assertNull(json.decodeFromString<AudioBulletinEnvelope>("""{"bulletin":null}""").bulletin)
        assertNull(AudioBulletin().activeChapter(5.0))
        assertEquals("3 د", AudioBulletinText.minutesLabel(200.8))
        assertEquals("دقيقتان", AudioBulletinText.minutesLabel(100.0))
        assertEquals("1:05", AudioBulletinText.clock(65.9))
        assertEquals(AudioBulletinChapter(0.0, "x"), AudioBulletinChapter(label = "x"))
    }
}
