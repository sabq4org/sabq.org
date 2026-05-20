package com.sabq.smart.data.audio

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Plays the AI-generated article summary audio. Mirrors the iOS
 * `toggleAudio` flow in `ArticleDetailView.swift:496-519` — a single
 * shared player wired to the listen pill in `SmartSummaryCard`.
 *
 * Singleton-scoped so the player survives screen recomposition and
 * keeps playing if the user scrolls or toggles focus mode. When the
 * user opens a different article and taps "استماع" we transparently
 * stop the previous track and stream the new one.
 *
 * Build-up of background-service + MediaSession + Android Auto comes
 * later (Pillar B5 / D paths) — for v1 we just need in-app playback.
 * The iOS rule "don't `setActive(true)` in Application.onCreate" maps
 * here to "don't create ExoPlayer eagerly" — we lazily build it on
 * first play, which is what `getOrCreatePlayer` does.
 */
@Singleton
class AudioPlayerController @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /** Playback state surfaced to the UI. `playingSlug` is null when
     *  nothing is loaded; when set, [isPlaying] reflects the live
     *  ExoPlayer state. */
    data class State(
        val playingSlug: String? = null,
        val isPlaying: Boolean = false,
        val isLoading: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var player: ExoPlayer? = null

    /** Toggle play/pause for the given article. Streams from
     *  `https://sabq.org/api/articles/<slug>/summary-audio` — raw MP3,
     *  no JSON envelope (server streams bytes directly, ElevenLabs
     *  with Google TTS fallback, 24h cache). */
    fun toggle(slug: String) {
        if (slug.isBlank()) return
        val url = "https://sabq.org/api/articles/$slug/summary-audio"
        val current = _state.value

        val activePlayer = player
        if (activePlayer != null && current.playingSlug == slug) {
            // Same article — pause/resume.
            if (activePlayer.isPlaying) {
                activePlayer.pause()
                _state.value = current.copy(isPlaying = false, isLoading = false)
            } else {
                activePlayer.play()
                _state.value = current.copy(isPlaying = true)
            }
            return
        }

        // New article — stop the old one (if any) and start fresh.
        val freshPlayer = getOrCreatePlayer()
        freshPlayer.stop()
        freshPlayer.clearMediaItems()
        freshPlayer.setMediaItem(MediaItem.fromUri(url))
        freshPlayer.prepare()
        freshPlayer.playWhenReady = true
        _state.value = State(playingSlug = slug, isPlaying = false, isLoading = true)
    }

    /** Stop and release. Called when the app is fully backgrounded or
     *  the user navigates away from the article. Defensive — the
     *  player will recreate next play. */
    fun release() {
        player?.release()
        player = null
        _state.value = State()
    }

    private fun getOrCreatePlayer(): ExoPlayer {
        val existing = player
        if (existing != null) return existing
        val audioAttrs = AudioAttributes.Builder()
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .setUsage(C.USAGE_MEDIA)
            .build()
        val newPlayer = ExoPlayer.Builder(context).build().apply {
            setAudioAttributes(audioAttrs, /* handleAudioFocus = */ true)
            addListener(object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) {
                    _state.value = _state.value.copy(
                        isPlaying = isPlaying,
                        // ExoPlayer flips isPlaying=true once buffering
                        // finishes → drop the loading flag at the same
                        // moment so the pill doesn't flash twice.
                        isLoading = if (isPlaying) false else _state.value.isLoading,
                    )
                }

                override fun onPlaybackStateChanged(playbackState: Int) {
                    when (playbackState) {
                        Player.STATE_BUFFERING -> _state.value = _state.value.copy(isLoading = true)
                        Player.STATE_READY -> _state.value = _state.value.copy(isLoading = false)
                        Player.STATE_ENDED -> _state.value = State()
                        Player.STATE_IDLE -> Unit
                    }
                }

                override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                    // Reset on error so the pill snaps back to "play".
                    _state.value = State()
                }
            })
        }
        player = newPlayer
        return newPlayer
    }
}
