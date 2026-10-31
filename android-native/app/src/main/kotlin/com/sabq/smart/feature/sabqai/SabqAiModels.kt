package com.sabq.smart.feature.sabqai

import androidx.compose.ui.graphics.Color
import com.sabq.smart.data.api.ApiAiTeam
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.text.NumberFormat
import java.time.Instant
import java.time.OffsetDateTime
import java.time.temporal.ChronoUnit
import java.util.Locale
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.GET

/**
 * «عقل سبق» — مرآة iOS `SabqAIKit.swift` (نقل صفحة الويب /sabq-ai).
 * قاعدة مصداقية ملزمة: لا أرقام وهمية. الأرقام من `/api/public/ai-stats`
 * و`/api/public/ai-team`؛ إن تعذّر الجلب تظهر حقائق ثابتة بدلها.
 */

@Serializable
data class SaiDay(val date: String = "", val count: Double = 0.0)

@Serializable
data class SaiDomains(val editorial: Double = 0.0, val sports: Double = 0.0, val visual: Double = 0.0, val audio: Double = 0.0)

@Serializable
data class SaiAi(
    val totalOps: Double = 0.0,
    val todayOps: Double = 0.0,
    val totalTokens: Double = 0.0,
    val successRate: Double = 0.0,
    val sinceDate: String? = null,
    val daily: List<SaiDay> = emptyList(),
    val todayByDomain: SaiDomains? = null,
)

@Serializable
data class SaiComments(val total: Double = 0.0, val aiAnalyzed: Double = 0.0)

@Serializable
data class SaiTotal(val total: Double = 0.0)

@Serializable
data class SaiArticles(val totalPublished: Double = 0.0, val todayPublished: Double = 0.0)

@Serializable
data class SaiAudio(val totalMinutes: Double = 0.0)

@Serializable
data class SaiRadar(val totalItems: Double = 0.0)

@Serializable
data class SaiSports(val totalOps: Double = 0.0)

@Serializable
data class SaiPublicStats(
    val generatedAt: String = "",
    val ai: SaiAi = SaiAi(),
    val comments: SaiComments = SaiComments(),
    val stories: SaiTotal = SaiTotal(),
    val articles: SaiArticles = SaiArticles(),
    val audio: SaiAudio? = null,
    val radar: SaiRadar? = null,
    val sports: SaiSports? = null,
)

interface SabqAiApi {
    /** استعلامات إنتاج بكاش 5 دقائق على الخادم. */
    @GET("api/public/ai-stats")
    suspend fun stats(): SaiPublicStats

    @GET("api/public/ai-team")
    suspend fun team(): ApiAiTeam
}

@Module
@InstallIn(SingletonComponent::class)
object SabqAiNetworkModule {
    @Provides
    @Singleton
    fun provideSabqAiApi(retrofit: Retrofit): SabqAiApi = retrofit.create(SabqAiApi::class.java)
}

/** ألوان الصفحة السينمائية الداكنة — محصورة في هذه الشاشة كما في iOS (`SAI`). */
object Sai {
    val void = Color(0xFF03060C)
    val deep = Color(0xFF060C17)
    val ai = Color(0xFF5CB4FF)
    val ai2 = Color(0xFF8B7BFF)
    val human = Color(0xFF3FE0A0)
    val warn = Color(0xFFFF8A98)
    val text = Color(0xFFE8EEF6)
    val mute = Color(0xFF8496AD)
    val soft = Color(0xFFA3B2C4)
    val faint = Color.White.copy(alpha = 0.08f)
}

object SaiFormat {
    private val months = listOf(
        "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
        "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
    )

    /** `toLocaleString("en-US")` بعدد منازل ثابت. */
    fun number(v: Double, decimals: Int = 0): String {
        if (!v.isFinite()) return "—"
        val f = NumberFormat.getNumberInstance(Locale.US)
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        return f.format(v)
    }

    /** «19 يوليو 2026» بأرقام لاتينية. */
    fun arabicDate(iso: String, withYear: Boolean = false): String {
        val parts = iso.take(10).split("-").mapNotNull { it.toIntOrNull() }
        if (parts.size != 3 || parts[1] !in 1..12) return iso
        val month = months[parts[1] - 1]
        return if (withYear) "${parts[2]} $month ${parts[0]}" else "${parts[2]} $month"
    }

    fun updatedAgo(iso: String, now: Instant = Instant.now()): String {
        val date = runCatching { Instant.parse(iso) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()
            ?: return "قبل لحظات"
        val minutes = maxOf(0L, ChronoUnit.MINUTES.between(date, now))
        return when {
            minutes == 0L -> "قبل لحظات"
            minutes == 1L -> "قبل دقيقة"
            minutes == 2L -> "قبل دقيقتين"
            minutes in 3..10 -> "قبل $minutes دقائق"
            else -> "قبل $minutes دقيقة"
        }
    }
}

/** حقائق ثابتة تظهر حين يتعذّر جلب الأرقام الحية. */
object SaiStaticFacts {
    val all = listOf(
        "+60" to "خدمة ذكية تعمل في المنظومة",
        "5" to "بطولات تُغطّى بمحرّكات آلية",
        "3" to "لغات نشر من منظومة واحدة",
        "100%" to "مسؤولية تحريرية عن كل ما يُنشر — بشريًا كان أو آليًا",
    )
}

/** بلاطات الأرقام الحية — مرآة `SAILiveNumbers.tiles` في iOS: يُسقط كل رقم صفري لا معنى له. */
data class SaiTile(val value: Double, val decimals: Int, val suffix: String, val label: String)

object SaiLive {
    fun tiles(s: SaiPublicStats, monthOps: Int?): List<SaiTile> {
        val commentsPct = if (s.comments.total > 0) Math.round(100 * s.comments.aiAnalyzed / s.comments.total).toDouble() else null
        val audio = s.audio?.totalMinutes ?: 0.0
        val radar = s.radar?.totalItems ?: 0.0
        val sports = s.sports?.totalOps ?: 0.0
        val month = (monthOps ?: 0).toDouble()
        return listOf(
            Pair(SaiTile(s.ai.successRate, 1, "%", "معدل نجاح العمليات"), true),
            Pair(SaiTile(s.ai.totalTokens / 1_000_000, 1, "M", "توكن معالج منذ الإطلاق"), s.ai.totalTokens > 0),
            Pair(SaiTile(commentsPct ?: 0.0, 0, "%", "تعليقات تُفحص آليًا"), commentsPct != null),
            Pair(SaiTile(s.stories.total, 0, "", "قصة متابعة ذكية"), true),
            Pair(SaiTile(s.articles.todayPublished, 0, "", "خبرًا نُشر اليوم"), true),
            Pair(SaiTile(s.articles.totalPublished, 0, "", "خبرًا في الأرشيف"), true),
            Pair(SaiTile(audio, 0, "", "دقيقة صوت أُنتجت آليًا"), audio > 0),
            Pair(SaiTile(radar, 0, "", "مادة رصدها رادار المصادر"), radar > 0),
            Pair(SaiTile(sports, 0, "", "عملية في التغطيات الرياضية"), sports > 0),
            Pair(SaiTile(s.comments.aiAnalyzed, 0, "", "تعليقًا حلّله «حارس»"), s.comments.aiAnalyzed > 0),
            Pair(SaiTile(month, 0, "", "عملًا للفريق هذا الشهر"), month > 0),
            Pair(SaiTile(s.ai.todayOps, 0, "", "عملية اليوم حتى الآن"), true),
        ).filter { it.second }.map { it.first }
    }

    /** عمليات اليوم حسب المجال، من الأكبر إلى الأصغر. */
    fun domainRows(s: SaiPublicStats): List<Pair<String, Double>> {
        val d = s.ai.todayByDomain ?: return emptyList()
        return listOf("رياضة" to d.sports, "تحرير" to d.editorial, "بصري" to d.visual, "صوت" to d.audio)
            .sortedByDescending { it.second }
    }
}
