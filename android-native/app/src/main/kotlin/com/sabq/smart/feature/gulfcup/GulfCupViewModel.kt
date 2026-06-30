package com.sabq.smart.feature.gulfcup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class GulfCupViewModel @Inject constructor(private val repo: GulfCupRepository) : ViewModel() {

    enum class Tab { HOME, MATCHES, PREDICTIONS, GROUPS, MORE }

    data class UiState(
        val tab: Tab = Tab.HOME,
        val overview: GcOverview? = null,
        val fixtures: List<GcFixture> = emptyList(),
        val standings: List<GcGroup> = emptyList(),
        val teams: List<GcTeam> = emptyList(),
        val loading: Boolean = true,
        val error: String? = null,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun selectTab(tab: Tab) { _state.update { it.copy(tab = tab) } }

    fun load(force: Boolean = false) {
        viewModelScope.launch {
            if (!force) _state.update { it.copy(loading = true) }
            val o = async { runCatching { repo.overview() }.getOrNull() }
            val f = async { runCatching { repo.fixtures() }.getOrDefault(emptyList()) }
            val s = async { runCatching { repo.standings() }.getOrDefault(emptyList()) }
            val t = async { runCatching { repo.teams() }.getOrDefault(emptyList()) }
            _state.update {
                it.copy(
                    overview = o.await(),
                    fixtures = f.await(),
                    standings = s.await(),
                    teams = t.await(),
                    loading = false,
                    error = null,
                )
            }
        }
    }
}

@HiltViewModel
class GulfCupTeamViewModel @Inject constructor(private val repo: GulfCupRepository) : ViewModel() {
    data class UiState(val profile: GcTeamProfile? = null, val loading: Boolean = true, val error: String? = null)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load(teamId: Int) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val r = runCatching { repo.teamProfile(teamId) }.getOrNull()
            _state.update { it.copy(profile = r, loading = false, error = if (r == null) "تعذّر التحميل" else null) }
        }
    }
}

@HiltViewModel
class GulfCupMatchViewModel @Inject constructor(private val repo: GulfCupRepository) : ViewModel() {
    data class UiState(val detail: GcMatchDetail? = null, val loading: Boolean = true)
    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    fun load(fixtureId: Int) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            val r = runCatching { repo.match(fixtureId) }.getOrNull()
            _state.update { it.copy(detail = r, loading = false) }
        }
    }
}
