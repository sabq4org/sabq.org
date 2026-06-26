package com.sabq.smart.feature.worldcup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.auth.AuthTokenStore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * مسابقة توقّعات المونديال — ثلاثة تبويبات (مباريات اليوم/توقّعاتي/المتصدّرون)
 * مع تصويت Bearer. مطابق لـiOS WCPredictionsView.
 */
@HiltViewModel
class WorldCupPredictionsViewModel @Inject constructor(
    private val repo: WorldCupRepository,
    private val tokenStore: AuthTokenStore,
) : ViewModel() {

    enum class Tab { TODAY, MINE, BOARD }

    data class ScoreInput(val home: Int = 0, val away: Int = 0)

    data class UiState(
        val tab: Tab = Tab.TODAY,
        val isLoggedIn: Boolean = false,
        // اليوم
        val matches: List<WcPredictableMatch> = emptyList(),
        val todayLoading: Boolean = true,
        val inputs: Map<Int, ScoreInput> = emptyMap(),
        val submitting: Set<Int> = emptySet(),
        val toast: String? = null,
        // توقّعاتي
        val mine: List<WcPredictionHistoryItem> = emptyList(),
        val mineLoading: Boolean = true,
        // المتصدّرون
        val leaders: List<WcPredLeader> = emptyList(),
        val boardLoading: Boolean = true,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val loggedIn = !tokenStore.token.first().isNullOrBlank()
            _state.update { it.copy(isLoggedIn = loggedIn) }
        }
        loadToday()
        loadLeaderboard()
    }

    fun selectTab(tab: Tab) {
        _state.update { it.copy(tab = tab) }
        if (tab == Tab.MINE && _state.value.isLoggedIn) loadMine()
    }

    fun loadToday() {
        _state.update { it.copy(todayLoading = true) }
        viewModelScope.launch {
            val r = runCatching { repo.predictionsToday() }.getOrDefault(emptyList())
            val seeded = r.associate { m ->
                m.fixture.id to ScoreInput(m.myPrediction?.predHome ?: 0, m.myPrediction?.predAway ?: 0)
            }
            _state.update { it.copy(matches = r, inputs = seeded, todayLoading = false) }
        }
    }

    fun loadMine() {
        _state.update { it.copy(mineLoading = true) }
        viewModelScope.launch {
            val r = runCatching { repo.myPredictions() }.getOrDefault(emptyList())
            _state.update { it.copy(mine = r, mineLoading = false) }
        }
    }

    fun loadLeaderboard() {
        _state.update { it.copy(boardLoading = true) }
        viewModelScope.launch {
            val r = runCatching { repo.leaderboard() }.getOrDefault(emptyList())
            _state.update { it.copy(leaders = r, boardLoading = false) }
        }
    }

    fun setHome(id: Int, v: Int) {
        if (v < 0 || v > 20) return
        _state.update {
            val cur = it.inputs[id] ?: ScoreInput()
            it.copy(inputs = it.inputs + (id to cur.copy(home = v)))
        }
    }

    fun setAway(id: Int, v: Int) {
        if (v < 0 || v > 20) return
        _state.update {
            val cur = it.inputs[id] ?: ScoreInput()
            it.copy(inputs = it.inputs + (id to cur.copy(away = v)))
        }
    }

    fun submit(fixtureId: Int) {
        val input = _state.value.inputs[fixtureId] ?: return
        _state.update { it.copy(submitting = it.submitting + fixtureId) }
        viewModelScope.launch {
            val ok = runCatching { repo.submitPrediction(fixtureId, input.home, input.away) }.isSuccess
            _state.update {
                it.copy(
                    submitting = it.submitting - fixtureId,
                    toast = if (ok) "حُفظ توقّعك بنجاح" else "تعذّر حفظ التوقّع — قد تكون المباراة أُغلقت",
                )
            }
            if (ok) loadToday()
        }
    }

    fun clearToast() { _state.update { it.copy(toast = null) } }
}
