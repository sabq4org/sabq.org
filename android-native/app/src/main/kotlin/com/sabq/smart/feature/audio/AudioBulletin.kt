package com.sabq.smart.feature.audio

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.audio.AudioPlayerController
import com.sabq.smart.ui.theme.SabqTheme
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import retrofit2.Retrofit
import retrofit2.http.GET

/**
 * «نشرة سَبْق» الصوتية أعلى الرئيسية — مرآة iOS `AudioBulletinBar`.
 * `GET /api/audio-bulletin/current` يعيد `{bulletin: null}` إن لم تُعتمد
 * نشرة خلال آخر 6 ساعات، فيختفي الشريط.
 */

@Serializable
data class AudioBulletinChapter(
    val start: Double = 0.0,
    val label: String = "",
    val href: String? = null,
)

@Serializable
data class AudioBulletin(
    val id: String = "",
    val title: String = "",
    val publishedAt: String = "",
    val audioUrl: String = "",
    /** ثوانٍ بكسر عشري (200.8 مثلًا) — كانت Int في iOS ففشل فك الاستجابة. */
    val durationSec: Double = 0.0,
    val chapters: List<AudioBulletinChapter> = emptyList(),
) {
    val playerKey: String get() = "audio-bulletin:$id"

    /** الفصل النشط عند ثانية التشغيل الحالية. */
    fun activeChapter(seconds: Double): AudioBulletinChapter? {
        if (chapters.isEmpty()) return null
        var active = chapters.first()
        for (ch in chapters) if (seconds >= ch.start) active = ch
        return active
    }
}

@Serializable
data class AudioBulletinEnvelope(val bulletin: AudioBulletin? = null)

interface AudioBulletinApi {
    @GET("api/audio-bulletin/current")
    suspend fun current(): AudioBulletinEnvelope
}

@Module
@InstallIn(SingletonComponent::class)
object AudioBulletinNetworkModule {
    @Provides
    @Singleton
    fun provideAudioBulletinApi(retrofit: Retrofit): AudioBulletinApi = retrofit.create(AudioBulletinApi::class.java)
}

object AudioBulletinText {
    fun clock(seconds: Double): String {
        val s = seconds.coerceAtLeast(0.0).toInt()
        return "%d:%02d".format(java.util.Locale.ROOT, s / 60, s % 60)
    }

    fun minutesLabel(durationSec: Double): String {
        val minutes = (durationSec / 60.0).roundToInt().coerceAtLeast(1)
        return when (minutes) {
            1 -> "دقيقة"
            2 -> "دقيقتان"
            else -> "$minutes د"
        }
    }
}

@HiltViewModel
class AudioBulletinViewModel @Inject constructor(
    private val api: AudioBulletinApi,
    val player: AudioPlayerController,
) : ViewModel() {

    private val _bulletin = MutableStateFlow<AudioBulletin?>(null)
    val bulletin: StateFlow<AudioBulletin?> = _bulletin.asStateFlow()
    private var lastLoadAt = 0L

    /** يُستدعى عند ظهور الرئيسية؛ الخادم يخزّن 60 ث فلا داعي لأكثر من ذلك. */
    fun refreshIfStale() {
        val now = System.currentTimeMillis()
        if (now - lastLoadAt < 60_000) return
        lastLoadAt = now
        viewModelScope.launch {
            runCatching { api.current().bulletin }
                .onSuccess { b -> _bulletin.value = b?.takeIf { it.audioUrl.startsWith("https://") } }
        }
    }

    fun toggle(b: AudioBulletin) {
        player.toggleUrl(b.playerKey, b.audioUrl)
    }
}

/** الشريط نفسه — لا يرسم شيئًا إن لم تتوفر نشرة. */
@Composable
fun AudioBulletinSection(viewModel: AudioBulletinViewModel = hiltViewModel()) {
    LifecycleResumeEffect(viewModel) {
        viewModel.refreshIfStale()
        onPauseOrDispose { }
    }
    val bulletin by viewModel.bulletin.collectAsStateWithLifecycle()
    val b = bulletin ?: return
    val playerState by viewModel.player.state.collectAsStateWithLifecycle()
    val isCurrent = playerState.playingSlug == b.playerKey
    val isPlaying = isCurrent && playerState.isPlaying

    var elapsedMs by remember { mutableLongStateOf(0L) }
    var durationMs by remember { mutableLongStateOf(0L) }
    LaunchedEffect(isCurrent, isPlaying) {
        if (!isCurrent) {
            elapsedMs = 0L
            return@LaunchedEffect
        }
        while (true) {
            elapsedMs = viewModel.player.positionMs()
            durationMs = viewModel.player.durationMs()
            if (!isPlaying) break
            delay(500)
        }
    }

    val elapsed = elapsedMs / 1000.0
    val total = maxOf(1.0, b.durationSec)
    val duration = if (isCurrent && durationMs > 0) durationMs / 1000.0 else total
    val progress = (elapsed / duration).coerceIn(0.0, 1.0).toFloat()
    val started = isPlaying || elapsed > 0
    val subtitle = if (started) b.activeChapter(elapsed)?.label?.takeIf { it.isNotBlank() } ?: b.title else b.title
    val durationLabel = if (started) "${AudioBulletinText.clock(elapsed)} / ${AudioBulletinText.clock(duration)}"
    else AudioBulletinText.minutesLabel(b.durationSec)

    AudioBulletinBar(
        subtitle = subtitle,
        durationLabel = durationLabel,
        isCurrent = isCurrent,
        isPlaying = isPlaying,
        progress = progress,
        accessibility = if (isPlaying) "إيقاف نشرة سبق الصوتية: $subtitle" else "تشغيل نشرة سبق الصوتية: ${b.title}",
        onClick = { viewModel.toggle(b) },
    )
}

@Composable
private fun AudioBulletinBar(
    subtitle: String,
    durationLabel: String,
    isCurrent: Boolean,
    isPlaying: Boolean,
    progress: Float,
    accessibility: String,
    onClick: () -> Unit,
) {
    val colors = SabqTheme.colors
    Column(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(colors.paleFill)
            .clickable(onClick = onClick)
            .semantics { contentDescription = accessibility }
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(if (isCurrent) 6.dp else 0.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.size(30.dp).clip(CircleShape).background(colors.primaryEnd), contentAlignment = Alignment.Center) {
                Icon(
                    if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp),
                )
            }
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "نشرة سَبْق",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.primaryEnd,
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(colors.surface)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
                Text(
                    subtitle,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = colors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // الأرقام والوقت من اليسار لليمين حتى لا ينقلب «1:20 / 3:21».
            CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                Text(durationLabel, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = colors.secondaryInk)
            }
        }
        AnimatedVisibility(visible = isCurrent, enter = fadeIn(), exit = fadeOut()) {
            BulletinWaveform(progress = progress, isPlaying = isPlaying)
        }
    }
}

/** ترددات تتحرك أثناء الاستماع وتسكن عند الإيقاف، والملوّن منها يبيّن التقدم. */
@Composable
private fun BulletinWaveform(progress: Float, isPlaying: Boolean) {
    val colors = SabqTheme.colors
    val bars = 36
    val phase = if (isPlaying) {
        val transition = rememberInfiniteTransition(label = "bulletin-wave")
        transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(1200), RepeatMode.Restart),
            label = "bulletin-wave-phase",
        ).value
    } else 0f
    Row(
        Modifier.fillMaxWidth().height(18.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        for (i in 0 until bars) {
            val base = 0.35f + 0.65f * (((i * 37) % 11) / 10f)
            val wobble = if (isPlaying) 0.25f * kotlin.math.sin((phase + i / bars.toFloat()) * 2f * Math.PI.toFloat()) else 0f
            val h = (base + wobble).coerceIn(0.2f, 1f)
            val filled = (i + 0.5f) / bars <= progress
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight(h)
                    .clip(RoundedCornerShape(1.dp))
                    .background(if (filled) colors.primaryEnd else colors.primaryEnd.copy(alpha = 0.25f)),
            )
        }
    }
}
