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
        val facts: WcCompetitionFacts? = null,
        val bracket: WcBracket? = null,
        val news: List<WcNewsItem> = emptyList(),
        // بطاقة نبض المباراة (ودجت حيّ) + ومضة الهدف
        val pulse: WcPulse? = null,
        val pulseGoalFlash: Boolean = false,
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

    private var pulseJob: kotlinx.coroutines.Job? = null
    private var goalFlashJob: kotlinx.coroutines.Job? = null

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
            // الأقسام التكميلية (حقائق/إقصائي/أخبار) — best-effort تظهر post-render
            val facts = async { runCatching { repo.facts() }.getOrNull() }
            val bracket = async { runCatching { repo.bracket() }.getOrNull() }
            val news = async { runCatching { repo.news(limit = 8) }.getOrDefault(emptyList()) }
            _state.update {
                it.copy(
                    overview = overview.await(), overviewLoading = false,
                    fixtures = fixtures.await(), fixturesLoading = false,
                    standings = standings.await(), standingsLoading = false,
                    scorers = scorers.await(), scorersLoading = false,
                    teams = teams.await(), teamsLoading = false,
                    saudiSquad = saudiSquad.await(),
                    facts = facts.await(),
                    bracket = bracket.await(),
                    news = news.await(),
                    isRefreshing = false,
                )
            }
            startPulse()
        }
    }

    /** مباراة النبض: حيّة أولًا → أقرب قادمة → أحدث منتهية → مباراة اليوم */
    private fun pulseFixtureId(): Int? {
        val fx = _state.value.fixtures
        fx.firstOrNull { it.status.live }?.let { return it.id }
        val nowTs = System.currentTimeMillis() / 1000
        fx.filter { !it.status.finished && !it.status.live && it.timestamp >= nowTs }
            .minByOrNull { it.timestamp }?.let { return it.id }
        fx.filter { it.status.finished }.maxByOrNull { it.timestamp }?.let { return it.id }
        return _state.value.overview?.matchOfTheDay?.fixture?.id
    }

    private fun startPulse() {
        val fixtureId = pulseFixtureId() ?: return
        pulseJob?.cancel()
        pulseJob = viewModelScope.launch {
            while (true) {
                val prevTotal = _state.value.pulse?.let { it.score.home + it.score.away } ?: 0
                val p = runCatching { repo.pulse(fixtureId) }.getOrNull()
                if (p != null) {
                    val increased = _state.value.pulse != null && (p.score.home + p.score.away) > prevTotal
                    _state.update { it.copy(pulse = p) }
                    if (increased) triggerGoalFlash()
                }
                val live = _state.value.pulse?.status?.live == true
                kotlinx.coroutines.delay(if (live) 12_000 else 60_000)
            }
        }
    }

    private fun triggerGoalFlash() {
        goalFlashJob?.cancel()
        _state.update { it.copy(pulseGoalFlash = true) }
        goalFlashJob = viewModelScope.launch {
            kotlinx.coroutines.delay(5_000)
            _state.update { it.copy(pulseGoalFlash = false) }
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
