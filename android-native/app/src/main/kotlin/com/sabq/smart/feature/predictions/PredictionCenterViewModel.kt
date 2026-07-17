package com.sabq.smart.feature.predictions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

// مركز التوقّعات — نفس نمط WorldCupPredictionsViewModel: UiState واحدة،
// تحميل متوازٍ، مجموعة in-flight للإرسال، وبوابة تسجيل دخول عبر AuthRepository.

enum class PredTab { Matches, Ledger, Leaders }

data class PredictionCenterUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val loggedIn: Boolean = false,
    val competitions: List<PredCompetitionSummary> = emptyList(),
    val selectedSlug: String? = null,
    val contests: List<PredContest> = emptyList(),
    val board: PredLeaderboardResponse? = null,
    val ledger: List<PredLedgerItem> = emptyList(),
    val tab: PredTab = PredTab.Matches,
    /** المسابقة المفتوح عدّادها + قاعدتها المُجلبة من الملف الفعّال. */
    val editingContestId: String? = null,
    val editingRule: PredRule? = null,
    val submittingContestIds: Set<String> = emptySet(),
    /** تفاصيل التسوية المعروضة في الحوار. */
    val settlement: PredSettlementResponse? = null,
    val toast: String? = null,
) {
    val selected: PredCompetitionSummary?
        get() = competitions.firstOrNull { it.slug == selectedSlug } ?: competitions.firstOrNull()
}

@HiltViewModel
class PredictionCenterViewModel @Inject constructor(
    private val repo: PredictionsRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(PredictionCenterUiState())
    val state = _state.asStateFlow()

    init {
        viewModelScope.launch {
            authRepository.user.collectLatest { user ->
                _state.update { it.copy(loggedIn = user != null) }
            }
        }
        load()
    }

    fun load() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching { repo.competitions() }
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            competitions = response.competitions,
                            selectedSlug = it.selectedSlug ?: response.competitions.firstOrNull()?.slug,
                        )
                    }
                    reloadSelected()
                }
                .onFailure { error ->
                    _state.update { it.copy(loading = false, error = message(error)) }
                }
        }
    }

    fun selectCompetition(slug: String) {
        if (slug == _state.value.selectedSlug) return
        _state.update { it.copy(selectedSlug = slug, contests = emptyList(), board = null, ledger = emptyList()) }
        reloadSelected()
    }

    fun selectTab(tab: PredTab) {
        _state.update { it.copy(tab = tab) }
        val slug = _state.value.selected?.slug ?: return
        if (tab == PredTab.Ledger && _state.value.loggedIn && _state.value.ledger.isEmpty()) {
            viewModelScope.launch {
                runCatching { repo.ledger(slug) }
                    .onSuccess { response -> _state.update { it.copy(ledger = response.items) } }
            }
        }
    }

    private fun reloadSelected() {
        val slug = _state.value.selected?.slug ?: run {
            _state.update { it.copy(loading = false) }
            return
        }
        viewModelScope.launch {
            val detail = async { runCatching { repo.competition(slug) } }
            val board = async { runCatching { repo.leaderboard(slug) } }
            val detailResult = detail.await()
            _state.update {
                it.copy(
                    loading = false,
                    contests = detailResult.getOrNull()?.contests ?: emptyList(),
                    board = board.await().getOrNull(),
                    error = detailResult.exceptionOrNull()?.let(::message),
                )
            }
        }
    }

    /** فتح/إغلاق عدّاد مسابقة — يجلب قاعدتها من الملف الفعّال عند الفتح. */
    fun toggleEditing(contestId: String) {
        val current = _state.value
        if (current.editingContestId == contestId) {
            _state.update { it.copy(editingContestId = null, editingRule = null) }
            return
        }
        if (!current.loggedIn) {
            _state.update { it.copy(toast = "سجّل الدخول لتتوقّع وتنافس على النقاط") }
            return
        }
        _state.update { it.copy(editingContestId = contestId, editingRule = null) }
        viewModelScope.launch {
            runCatching { repo.contest(contestId) }
                .onSuccess { detail ->
                    _state.update {
                        if (it.editingContestId == contestId) it.copy(editingRule = detail.rule) else it
                    }
                }
        }
    }

    fun submit(contestId: String, predHome: Int, predAway: Int) {
        if (_state.value.submittingContestIds.contains(contestId)) return
        _state.update { it.copy(submittingContestIds = it.submittingContestIds + contestId) }
        viewModelScope.launch {
            runCatching { repo.submitEntry(contestId, predHome, predAway) }
                .onSuccess {
                    _state.update { state ->
                        state.copy(
                            submittingContestIds = state.submittingContestIds - contestId,
                            editingContestId = null,
                            editingRule = null,
                            toast = "تم حفظ توقّعك ✅ يمكنك تعديله حتى ضربة البداية",
                        )
                    }
                    reloadSelected()
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(
                            submittingContestIds = it.submittingContestIds - contestId,
                            toast = message(error),
                        )
                    }
                }
        }
    }

    fun openSettlement(contestId: String) {
        viewModelScope.launch {
            runCatching { repo.settlement(contestId) }
                .onSuccess { response -> _state.update { it.copy(settlement = response) } }
                .onFailure { error -> _state.update { it.copy(toast = message(error)) } }
        }
    }

    fun dismissSettlement() = _state.update { it.copy(settlement = null) }

    fun clearToast() = _state.update { it.copy(toast = null) }

    private fun message(error: Throwable): String {
        val http = error as? retrofit2.HttpException
        return when {
            http?.code() == 401 -> "يلزم تسجيل الدخول"
            http?.code() == 409 -> "أُقفلت المباراة — حدّث الشاشة"
            http?.code() == 503 -> "التوقّعات غير مفعّلة حاليًا"
            else -> "تعذّر الاتصال — حاول مجددًا"
        }
    }
}
