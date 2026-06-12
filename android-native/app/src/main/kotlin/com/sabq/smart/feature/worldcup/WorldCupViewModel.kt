package com.sabq.smart.feature.worldcup

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

/**
 * حالة قسم كأس العالم الرئيسي. يحمّل النظرة العامة + الجدول + الترتيب +
 * الهدافون + المنتخبات بالتوازي؛ السباقات (صنّاع/بطاقات) وقائمة المنتخب
 * تُحمّل عند الطلب. مطابق لـiOS WorldCupView state.
 */
@HiltViewModel
class WorldCupViewModel @Inject constructor(
    private val repo: WorldCupRepository,
) : ViewModel() {

    data class UiState(
        val overview: WcOverview? = null,
        val fixtures: List<WcFixture> = emptyList(),
        val standings: List<WcGroup> = emptyList(),
        val scorers: List<WcScorer> = emptyList(),
        val teams: List<WcTeam> = emptyList(),
        val assists: List<WcLeader> = emptyList(),
        val cards: List<WcLeader> = emptyList(),
        val overviewLoading: Boolean = true,
        val fixturesLoading: Boolean = true,
        val standingsLoading: Boolean = true,
        val scorersLoading: Boolean = true,
        val teamsLoading: Boolean = true,
        val assistsLoaded: Boolean = false,
        val cardsLoaded: Boolean = false,
        val isRefreshing: Boolean = false,
        // حوار قائمة المنتخب
        val selectedTeam: WcTeam? = null,
        val squad: WcSquad? = null,
        val squadLoading: Boolean = false,
        // شريط تشكيلة الأخضر في «مشوار الأخضر»
        val saudiSquad: List<WcSquadPlayer> = emptyList(),
        // بطاقة اللاعب الشاملة — تعلو أي حوار مفتوح
        val selectedPlayerId: Int? = null,
        val playerCard: WcPlayerCard? = null,
        val playerLoading: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            val overview = async { runCatching { repo.overview() }.getOrNull() }
            val fixtures = async { runCatching { repo.fixtures() }.getOrDefault(emptyList()) }
            val standings = async { runCatching { repo.standings() }.getOrDefault(emptyList()) }
            val scorers = async { runCatching { repo.scorers() }.getOrDefault(emptyList()) }
            val teams = async { runCatching { repo.teams() }.getOrDefault(emptyList()) }
            // تشكيلة الأخضر لشريط «مشوار الأخضر» — مكاشة على الخادم فلا تكلفة تذكر
            val saudiSquad = async { runCatching { repo.squad(WC_SAUDI_TEAM_ID).players }.getOrDefault(emptyList()) }
            _state.update {
                it.copy(
                    overview = overview.await(), overviewLoading = false,
                    fixtures = fixtures.await(), fixturesLoading = false,
                    standings = standings.await(), standingsLoading = false,
                    scorers = scorers.await(), scorersLoading = false,
                    teams = teams.await(), teamsLoading = false,
                    saudiSquad = saudiSquad.await(),
                    isRefreshing = false,
                )
            }
        }
    }

    fun refresh() {
        _state.update { it.copy(isRefreshing = true) }
        load()
    }

    fun loadAssists() {
        if (_state.value.assistsLoaded) return
        _state.update { it.copy(assistsLoaded = true) }
        viewModelScope.launch {
            val r = runCatching { repo.assists() }.getOrDefault(emptyList())
            _state.update { it.copy(assists = r) }
        }
    }

    fun loadCards() {
        if (_state.value.cardsLoaded) return
        _state.update { it.copy(cardsLoaded = true) }
        viewModelScope.launch {
            val r = runCatching { repo.cards() }.getOrDefault(emptyList())
            _state.update { it.copy(cards = r) }
        }
    }

    fun openSquad(team: WcTeam) {
        _state.update { it.copy(selectedTeam = team, squad = null, squadLoading = true) }
        viewModelScope.launch {
            val r = runCatching { repo.squad(team.id) }.getOrNull()
            _state.update { it.copy(squad = r, squadLoading = false) }
        }
    }

    fun closeSquad() {
        _state.update { it.copy(selectedTeam = null, squad = null, squadLoading = false) }
    }

    /** يفتح بطاقة اللاعب الشاملة — يتجاهل المعرّفات غير الصالحة (تجميع الأحداث قبل لوحات المزود) */
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
