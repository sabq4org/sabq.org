package com.sabq.smart.feature.worldcup

import androidx.lifecycle.SavedStateHandle
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
 * صفحة المنتخب المتكاملة — تجمّع ملف المنتخب (مدرب/ملعب/إصابات/إحصاءات
 * موسم/مجموعة/قائمة) + حالة متابعة التنبيهات (Bearer). مطابق لـiOS WCTeamSheet.
 */
@HiltViewModel
class WorldCupTeamViewModel @Inject constructor(
    savedState: SavedStateHandle,
    private val repo: WorldCupRepository,
    private val tokenStore: AuthTokenStore,
) : ViewModel() {

    data class UiState(
        val teamId: Int = 0,
        val headerTeam: WcTeam = WcTeam(),
        val profile: WcTeamProfile? = null,
        val loading: Boolean = true,
        val isLoggedIn: Boolean = false,
        val isFollowing: Boolean = false,
        val followBusy: Boolean = false,
        val alertPrefs: SportsAlertPreferences = SportsAlertPreferences(),
        val showAlertPrefs: Boolean = false,
        // بطاقة اللاعب
        val selectedPlayerId: Int? = null,
        val playerCard: WcPlayerCard? = null,
        val playerLoading: Boolean = false,
    )

    private val _state = MutableStateFlow(
        UiState(
            teamId = savedState.get<String>("id")?.toIntOrNull() ?: 0,
            headerTeam = WcTeam(
                id = savedState.get<String>("id")?.toIntOrNull() ?: 0,
                name = savedState.get<String>("name").orEmpty(),
                logo = savedState.get<String>("logo").orEmpty(),
            ),
        ),
    )
    val state: StateFlow<UiState> = _state.asStateFlow()

    init {
        load()
        refreshFollowState()
    }

    fun load(force: Boolean = false) {
        _state.update { it.copy(loading = it.profile == null) }
        viewModelScope.launch {
            val p = runCatching { repo.teamProfile(_state.value.teamId) }.getOrNull()
            _state.update {
                it.copy(
                    profile = p ?: it.profile,
                    headerTeam = p?.team ?: it.headerTeam,
                    loading = false,
                )
            }
        }
    }

    /** التبديل لمنتخب آخر بالضغط على صفّه في الترتيب — يعيد التحميل بالكامل. */
    fun switchTeam(team: WcTeam) {
        if (team.id == _state.value.teamId || team.id <= 0) return
        _state.update { it.copy(teamId = team.id, headerTeam = team, profile = null, loading = true) }
        load()
        refreshFollowState()
    }

    private fun refreshFollowState() {
        viewModelScope.launch {
            val loggedIn = !tokenStore.token.first().isNullOrBlank()
            _state.update { it.copy(isLoggedIn = loggedIn) }
            if (!loggedIn) {
                _state.update { it.copy(isFollowing = false) }
                return@launch
            }
            val follows = runCatching { repo.sportsFollows() }.getOrNull() ?: return@launch
            val following = follows.any { it.kind == "team" && it.refId == _state.value.teamId.toString() }
            _state.update { it.copy(isFollowing = following) }
            runCatching { repo.alertPrefs() }.getOrNull()?.let { prefs ->
                _state.update { it.copy(alertPrefs = prefs) }
            }
        }
    }

    fun toggleFollow() {
        val s = _state.value
        if (!s.isLoggedIn || s.followBusy) return
        _state.update { it.copy(followBusy = true) }
        viewModelScope.launch {
            val ok = runCatching {
                if (s.isFollowing) {
                    repo.removeFollow("team", s.teamId.toString())
                } else {
                    repo.addFollow("team", s.teamId.toString(), s.headerTeam.name, s.headerTeam.logo)
                }
            }.isSuccess
            _state.update { it.copy(followBusy = false, isFollowing = if (ok) !s.isFollowing else s.isFollowing) }
        }
    }

    fun openAlertPrefs() { _state.update { it.copy(showAlertPrefs = true) } }
    fun closeAlertPrefs() { _state.update { it.copy(showAlertPrefs = false) } }

    fun saveAlertPrefs(prefs: SportsAlertPreferences) {
        _state.update { it.copy(alertPrefs = prefs) }
        viewModelScope.launch { runCatching { repo.updateAlertPrefs(prefs) } }
    }

    fun openPlayer(playerId: Int) {
        if (playerId <= 0) return
        _state.update { it.copy(selectedPlayerId = playerId, playerCard = null, playerLoading = true) }
        viewModelScope.launch {
            val r = runCatching { repo.player(playerId) }.getOrNull()
            _state.update { it.copy(playerCard = r, playerLoading = false) }
        }
    }

    fun closePlayer() {
        _state.update { it.copy(selectedPlayerId = null, playerCard = null, playerLoading = false) }
    }
}
