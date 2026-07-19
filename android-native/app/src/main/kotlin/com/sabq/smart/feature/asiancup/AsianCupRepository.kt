package com.sabq.smart.feature.asiancup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.api.SabqApi
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@Singleton
class AsianCupRepository @Inject constructor(private val api: SabqApi) {
    suspend fun overview() = api.getAsianCupOverview()
    suspend fun fixtures() = api.getAsianCupFixtures().fixtures
    suspend fun standings() = api.getAsianCupStandings().groups
    suspend fun teams() = api.getAsianCupTeams().teams
    suspend fun scorers() = api.getAsianCupScorers().scorers
    suspend fun bracket() = api.getAsianCupBracket()
    suspend fun team(id: Int) = api.getAsianCupTeam(id)
    suspend fun match(id: Int) = api.getAsianCupMatch(id)
    suspend fun predictions() = api.getAsianCupPredictionsToday()
    suspend fun leaderboard() = api.getAsianCupPredictionsLeaderboard().leaders
    suspend fun submit(fixtureId: Int, home: Int, away: Int) =
        api.submitAsianCupPrediction(AcPredictionSubmitBody(fixtureId, home, away)).prediction
}

/**
 * يجلب نظرة كأس آسيا العامة لشريط الرئيسية فقط — يطابق نمط
 * [com.sabq.smart.feature.worldcup.WorldCupStripViewModel]: جلبة واحدة
 * best-effort عند الإنشاء، والفشل يُبقي القيمة null فيختفي الشريط.
 */
@HiltViewModel
class AsianCupStripViewModel @Inject constructor(private val repo: AsianCupRepository) : ViewModel() {
    private val _overview = MutableStateFlow<AcOverview?>(null)
    val overview: StateFlow<AcOverview?> = _overview.asStateFlow()

    init {
        viewModelScope.launch { _overview.value = runCatching { repo.overview() }.getOrNull() }
    }
}

@HiltViewModel
class AsianCupViewModel @Inject constructor(private val repo: AsianCupRepository) : ViewModel() {
    enum class Tab { HOME, MATCHES, PREDICTIONS, GROUPS, MORE }
    data class State(
        val loading: Boolean = true, val refreshing: Boolean = false, val error: String? = null,
        val tab: Tab = Tab.HOME, val overview: AcOverview? = null,
        val fixtures: List<AcFixture> = emptyList(), val groups: List<AcGroup> = emptyList(),
        val teams: List<AcTeam> = emptyList(), val scorers: List<AcScorer> = emptyList(),
        val bracket: AcBracket = AcBracket(), val predictions: AcPredictionsTodayResponse = AcPredictionsTodayResponse(),
        val leaders: List<AcPredictionLeader> = emptyList(), val savingFixture: Int? = null,
    )
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    init { refresh() }
    fun select(tab: Tab) = _state.update { it.copy(tab = tab) }
    fun refresh() = viewModelScope.launch {
        _state.update { it.copy(refreshing = !it.loading, error = null) }
        runCatching {
            coroutineScope {
                val overview = async { repo.overview() }; val fixtures = async { repo.fixtures() }
                val groups = async { repo.standings() }; val teams = async { repo.teams() }
                val scorers = async { repo.scorers() }; val bracket = async { repo.bracket() }
                val predictions = async { runCatching { repo.predictions() }.getOrDefault(AcPredictionsTodayResponse()) }
                val leaders = async { runCatching { repo.leaderboard() }.getOrDefault(emptyList()) }
                State(false, false, null, _state.value.tab, overview.await(), fixtures.await(), groups.await(),
                    teams.await(), scorers.await(), bracket.await(), predictions.await(), leaders.await())
            }
        }.onSuccess { loaded -> _state.value = loaded }
            .onFailure { error -> _state.update { it.copy(loading = false, refreshing = false, error = error.localizedMessage) } }
    }
    fun submit(fixtureId: Int, home: Int, away: Int, onUnauthorized: () -> Unit) = viewModelScope.launch {
        _state.update { it.copy(savingFixture = fixtureId, error = null) }
        runCatching { repo.submit(fixtureId, home, away) }
            .onSuccess { saved ->
                _state.update { s -> s.copy(savingFixture = null, predictions = s.predictions.copy(matches = s.predictions.matches.map {
                    if (it.fixture.id == fixtureId) it.copy(myPrediction = saved) else it
                })) }
            }
            .onFailure { error ->
                _state.update { it.copy(savingFixture = null, error = error.localizedMessage) }
                if (error.localizedMessage?.contains("401") == true) onUnauthorized()
            }
    }
}

@HiltViewModel
class AsianCupMatchViewModel @Inject constructor(private val repo: AsianCupRepository) : ViewModel() {
    data class State(val loading: Boolean = true, val detail: AcMatchDetail? = null, val error: String? = null)
    private val _state = MutableStateFlow(State()); val state = _state.asStateFlow()
    fun load(id: Int) = viewModelScope.launch { _state.value = State(); runCatching { repo.match(id) }
        .onSuccess { _state.value = State(false, it) }.onFailure { _state.value = State(false, error = it.localizedMessage) } }
}

@HiltViewModel
class AsianCupTeamViewModel @Inject constructor(private val repo: AsianCupRepository) : ViewModel() {
    data class State(val loading: Boolean = true, val profile: AcTeamProfile? = null, val error: String? = null)
    private val _state = MutableStateFlow(State()); val state = _state.asStateFlow()
    fun load(id: Int) = viewModelScope.launch { _state.value = State(); runCatching { repo.team(id) }
        .onSuccess { _state.value = State(false, it) }.onFailure { _state.value = State(false, error = it.localizedMessage) } }
}
