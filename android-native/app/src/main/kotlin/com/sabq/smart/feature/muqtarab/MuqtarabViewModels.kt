package com.sabq.smart.feature.muqtarab

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.MuqAngle
import com.sabq.smart.data.MuqTopic
import com.sabq.smart.data.MuqWriter
import com.sabq.smart.data.MuqWriterProfile
import com.sabq.smart.data.MuqtarabRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The four «مُقترب» state holders. Each ports the `@State` set of the
 * corresponding SwiftUI view's `load()` (MuqtarabView.swift):
 *   - Landing : angles + featured topics, parallel fetch
 *   - Angle   : angle header + writer + its topics
 *   - Topic   : topic + angle + writer + related, plus a view ping
 *   - Writer  : full writer profile
 */

// ── Landing ──────────────────────────────────────────────────────────

@HiltViewModel
class MuqtarabLandingViewModel @Inject constructor(
    private val repo: MuqtarabRepository,
) : ViewModel() {

    data class UiState(
        val angles: List<MuqAngle> = emptyList(),
        val topics: List<MuqTopic> = emptyList(),
        val isLoading: Boolean = true,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val anglesJob = async { runCatching { repo.getAngles() }.getOrNull() }
            val topicsJob = async { runCatching { repo.getFeaturedTopics(limit = 12) }.getOrNull() }
            val angles = anglesJob.await().orEmpty()
            val topics = topicsJob.await().orEmpty()
            _state.update {
                it.copy(
                    angles = angles,
                    topics = topics,
                    isLoading = false,
                    error = if (angles.isEmpty() && topics.isEmpty()) "تحقّق من الاتصال ثم أعد المحاولة." else null,
                )
            }
        }
    }
}

// ── Angle ────────────────────────────────────────────────────────────

@HiltViewModel
class MuqtarabAngleViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: MuqtarabRepository,
) : ViewModel() {

    val slug: String = savedState.get<String>("slug").orEmpty()

    data class UiState(
        val angle: MuqAngle? = null,
        val writer: MuqWriter? = null,
        val topics: List<MuqTopic> = emptyList(),
        val isLoading: Boolean = true,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val detailJob = async { runCatching { repo.getAngleDetail(slug) }.getOrNull() }
            val topicsJob = async { runCatching { repo.getAngleTopics(slug) }.getOrNull() }
            val detail = detailJob.await()
            val topics = topicsJob.await().orEmpty()
            _state.update {
                it.copy(
                    angle = detail?.angle,
                    writer = detail?.writer,
                    topics = topics,
                    isLoading = false,
                    error = if (detail == null && topics.isEmpty()) "تحقّق من الاتصال ثم أعد المحاولة." else null,
                )
            }
        }
    }
}

// ── Topic ────────────────────────────────────────────────────────────

@HiltViewModel
class MuqtarabTopicViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: MuqtarabRepository,
) : ViewModel() {

    val angleSlug: String = savedState.get<String>("angleSlug").orEmpty()
    val topicSlug: String = savedState.get<String>("topicSlug").orEmpty()

    data class UiState(
        val topic: MuqTopic? = null,
        val angle: MuqAngle? = null,
        val writer: MuqWriter? = null,
        val related: List<MuqTopic> = emptyList(),
        val isLoading: Boolean = true,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var didReportView = false

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val detail = runCatching { repo.getTopic(angleSlug = angleSlug, topicSlug = topicSlug) }.getOrNull()
            if (detail == null) {
                _state.update { it.copy(isLoading = false, error = "تحقّق من الاتصال ثم أعد المحاولة.") }
                return@launch
            }
            _state.update {
                it.copy(
                    topic = detail.topic,
                    angle = detail.angle,
                    writer = detail.writer,
                    isLoading = false,
                    error = null,
                )
            }

            if (!didReportView) {
                didReportView = true
                launch { repo.reportTopicView(detail.topic.id) }
            }

            // Related: same angle, excluding the current topic (top 3).
            val more = runCatching { repo.getAngleTopics(angleSlug, limit = 6) }.getOrNull().orEmpty()
            _state.update {
                it.copy(related = more.filter { t -> t.id != detail.topic.id }.take(3))
            }
        }
    }
}

// ── Writer ───────────────────────────────────────────────────────────

@HiltViewModel
class MuqtarabWriterViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: MuqtarabRepository,
) : ViewModel() {

    val writerId: String = savedState.get<String>("id").orEmpty()

    data class UiState(
        val profile: MuqWriterProfile? = null,
        val isLoading: Boolean = true,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            val profile = runCatching { repo.getWriter(writerId) }.getOrNull()
            _state.update {
                it.copy(
                    profile = profile,
                    isLoading = false,
                    error = if (profile == null) "الكاتب غير موجود" else null,
                )
            }
        }
    }
}
