package com.sabq.smart.feature.worldcup

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.CompareArrows
import androidx.compose.material.icons.filled.EventSeat
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material.icons.filled.WbCloudy
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class WorldCupMatchViewModel @Inject constructor(
    private val repo: WorldCupRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {
    private val fixtureId: Int = savedStateHandle.get<String>("id")?.toIntOrNull() ?: 0

    data class UiState(
        val detail: WcMatchDetail? = null,
        val loading: Boolean = true,
        // إثراء أفضل-جهد (SportMonks/TheSports) — تُخفى الأقسام عند الغياب
        val facts: WcMatchFacts? = null,
        val xg: WcXg? = null,
        val forecast: WcForecast? = null,
        val pressure: WcPressure? = null,
        val momentum: WcMomentum? = null,
        val commentary: WcCommentary? = null,
        val tv: WcTvListing? = null,
        // بطاقة اللاعب الشاملة — تعلو مركز المباراة
        val selectedPlayerId: Int? = null,
        val playerCard: WcPlayerCard? = null,
        val playerLoading: Boolean = false,
    ) {
        val isLive: Boolean get() = detail?.fixture?.status?.live == true
    }

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    private var pollJob: kotlinx.coroutines.Job? = null

    init {
        load()
        loadExtras()
        loadTv()
    }

    fun load() {
        viewModelScope.launch {
            val d = runCatching { repo.match(fixtureId) }.getOrNull()
            _state.update { it.copy(detail = d, loading = false) }
            maybeStartPolling()
        }
    }

    /** الإثراءات المتغيّرة لحظيًا — تُحمَّل مع التحميل الأول وعند كل دورة تحديث */
    private fun loadExtras() {
        viewModelScope.launch {
            val facts = async { runCatching { repo.matchFacts(fixtureId) }.getOrNull() }
            val xg = async { runCatching { repo.xg(fixtureId) }.getOrNull() }
            val forecast = async { runCatching { repo.forecast(fixtureId) }.getOrNull() }
            val pressure = async { runCatching { repo.pressure(fixtureId) }.getOrNull() }
            val momentum = async { runCatching { repo.momentum(fixtureId) }.getOrNull() }
            val commentary = async { runCatching { repo.commentary(fixtureId) }.getOrNull() }
            _state.update {
                it.copy(
                    facts = facts.await() ?: it.facts,
                    xg = xg.await() ?: it.xg,
                    forecast = forecast.await() ?: it.forecast,
                    pressure = pressure.await() ?: it.pressure,
                    momentum = momentum.await() ?: it.momentum,
                    commentary = commentary.await() ?: it.commentary,
                )
            }
        }
    }

    private fun loadTv() {
        viewModelScope.launch {
            val tv = runCatching { repo.tv(fixtureId) }.getOrNull()
            if (tv?.available == true) _state.update { it.copy(tv = tv) }
        }
    }

    /** تحديث حيّ كل 8 ثوانٍ أثناء اللعب — يطابق سلوك iOS */
    private fun maybeStartPolling() {
        if (pollJob?.isActive == true) return
        if (!_state.value.isLive) return
        pollJob = viewModelScope.launch {
            while (_state.value.isLive) {
                kotlinx.coroutines.delay(8_000)
                val d = runCatching { repo.match(fixtureId) }.getOrNull()
                if (d != null) _state.update { it.copy(detail = d) }
                loadExtras()
            }
        }
    }

    /** يفتح بطاقة اللاعب الشاملة — يتجاهل المعرّفات غير الصالحة */
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

@Composable
fun WorldCupMatchCenterScreen(onBack: () -> Unit, viewModel: WorldCupMatchViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(modifier = Modifier.fillMaxSize().background(WcColors.sectionBackground)) {
            Row(
                modifier = Modifier.fillMaxWidth().background(WcColors.stadiumTop).statusBarsPadding().padding(horizontal = 8.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                androidx.compose.material3.IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", tint = Color.White)
                }
                Spacer(Modifier.weight(1f))
                Text("مركز المباراة", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
                Spacer(Modifier.size(40.dp))
            }

            val detail = state.detail
            when {
                state.loading -> WcLoading()
                detail == null -> WcEmptyText("تعذر جلب تفاصيل المباراة")
                else -> MatchContent(state, viewModel::openPlayer)
            }
        }

        // بطاقة اللاعب — تعلو مركز المباراة
        if (state.selectedPlayerId != null) {
            PlayerCardDialog(card = state.playerCard, loading = state.playerLoading, onDismiss = viewModel::closePlayer)
        }
    }
}

@Composable
private fun MatchContent(state: WorldCupMatchViewModel.UiState, onOpenPlayer: (Int) -> Unit) {
    val detail = state.detail ?: return
    val f = detail.fixture
    val started = f.status.live || f.status.finished
    val tabs = buildList {
        if (started) add("commentary" to "التعليق")
        add("events" to "الأحداث")
        if (started) { add("momentum" to "الزخم"); add("pressure" to "الضغط") }
        add("lineups" to "التشكيلات"); add("stats" to "الإحصائيات")
        if (detail.ratings.isNotEmpty()) add("ratings" to "التقييمات")
        add("prediction" to "التوقعات")
    }
    var tab by remember(f.id, started) { mutableStateOf(if (f.status.live) "commentary" else "events") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { MatchHeader(f) }
        state.tv?.takeIf { it.available && it.channels.isNotEmpty() }?.let { tv ->
            item { TvStrip(tv.channels) }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                tabs.forEach { (key, label) ->
                    val isSel = tab == key
                    Text(label, color = if (isSel) Color.White else WcColors.onDarkDim, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(if (isSel) WcColors.emeraldDeep else WcColors.chipFill)
                            .clickable { tab = key }.padding(horizontal = 12.dp, vertical = 7.dp))
                }
            }
        }
        item {
            when (tab) {
                "commentary" -> CommentaryTab(state.commentary)
                "events" -> EventsTab(detail, state.facts, onOpenPlayer)
                "momentum" -> MomentumTab(state.momentum, f.home.name, f.away.name)
                "pressure" -> PressureTab(state.pressure, f.home.name, f.away.name)
                "lineups" -> LineupsTab(detail, onOpenPlayer)
                "stats" -> StatsTab(detail, state.facts, state.xg)
                "ratings" -> RatingsTab(detail, onOpenPlayer)
                else -> PredictionTab(detail, state.forecast)
            }
        }
    }
}

@Composable
private fun MatchHeader(f: WcFixture) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
            HeadTeam(f.home, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.width(100.dp)) {
                // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR
                if (f.started) LtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", WcColors.onDark, 30, FontWeight.Black)
                else Text(WcFormat.time(f), color = WcColors.onDark, fontSize = 22.sp, fontWeight = FontWeight.Black)
                WcStatusPill(f)
            }
            HeadTeam(f.away, Modifier.weight(1f))
        }
        Text("${f.round} · ${f.venue.name} — ${f.venue.city} · ${WcFormat.day(f)}", color = WcColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun HeadTeam(team: WcTeam, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = modifier) {
        WcTeamLogo(team, size = 48)
        Text(team.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
    }
}

// ---------- الأحداث ----------

@Composable
private fun EventsTab(detail: WcMatchDetail, facts: WcMatchFacts?, onOpenPlayer: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        facts?.halftime?.let { ht ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("نتيجة الشوط الأول", color = WcColors.onDarkDim, fontSize = 11.sp)
                LtrText("${ht.away} - ${ht.home}", WcColors.onDark, 12, FontWeight.Black)
            }
        }
        if (detail.events.isEmpty()) {
            WcEmptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة")
            return@Column
        }
        val sorted = detail.events.sortedWith(compareByDescending<WcMatchEvent> { it.minute }.thenByDescending { it.extraMinute ?: 0 })
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            sorted.forEach { ev ->
                val team = if (ev.teamId == detail.fixture.home.id) detail.fixture.home else detail.fixture.away
                val playerId = ev.playerId ?: 0
                val extra = eventDetailFor(ev, detail, facts)
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.chipFill)
                        .clickable(enabled = playerId > 0) { onOpenPlayer(playerId) }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    LtrText("${ev.minute}'${ev.extraMinute?.let { "+$it" } ?: ""}", WcColors.onDarkDim, 12, FontWeight.Bold)
                    EventIcon(ev.type)
                    Column(modifier = Modifier.weight(1f)) {
                        Text("${ev.label}${if (ev.player.isNotBlank()) " — ${ev.player}" else ""}", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        if (extra != null) Text(extra, color = WcColors.sky, fontSize = 11.sp, maxLines = 1)
                        ev.assist?.let {
                            val prefix = if (ev.type == "goal") "صناعة: " else if (ev.type == "substitution") "بديلًا عن: " else ""
                            if (prefix.isNotEmpty()) Text("$prefix$it", color = WcColors.onDarkDim, fontSize = 11.sp)
                        }
                    }
                    WcTeamLogoBare(team.logo)
                }
            }
        }
    }
}

private fun eventDetailFor(ev: WcMatchEvent, detail: WcMatchDetail, facts: WcMatchFacts?): String? {
    val klass = when (ev.type) {
        "goal" -> "goal"
        "yellow-card", "red-card" -> "card"
        "var" -> "var"
        else -> return null
    }
    val list = facts?.eventDetails ?: return null
    val loc = if (ev.teamId == detail.fixture.home.id) "home" else "away"
    return list.firstOrNull { it.klass == klass && it.location == loc && kotlin.math.abs(it.minute - ev.minute) <= 1 }?.detail
}

@Composable
private fun WcTeamLogoBare(url: String) {
    coil.compose.AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(20.dp))
}

@Composable
private fun EventIcon(type: String) {
    when (type) {
        "goal" -> Icon(Icons.Filled.SportsSoccer, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(16.dp))
        "yellow-card" -> Box(Modifier.size(width = 11.dp, height = 15.dp).clip(RoundedCornerShape(2.dp)).background(WcColors.gold))
        "red-card", "missed-penalty" -> Box(Modifier.size(width = 11.dp, height = 15.dp).clip(RoundedCornerShape(2.dp)).background(WcColors.liveRed))
        "substitution" -> Icon(Icons.AutoMirrored.Filled.CompareArrows, null, tint = WcColors.sky, modifier = Modifier.size(16.dp))
        else -> Box(Modifier.size(10.dp).clip(CircleShape).background(WcColors.onDarkDim))
    }
}

// ---------- التشكيلات (ملعب 2D) ----------

@Composable
private fun LineupsTab(detail: WcMatchDetail, onOpenPlayer: (Int) -> Unit) {
    if (detail.lineups.isEmpty()) { WcEmptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة"); return }
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        detail.lineups.forEach { Pitch(it, onOpenPlayer) }
    }
}

@Composable
private fun Pitch(lineup: WcLineup, onOpenPlayer: (Int) -> Unit) {
    val rows = lineup.startXI.groupBy { (it.grid ?: "0:0").split(":").firstOrNull()?.toIntOrNull() ?: 0 }
        .filterKeys { it > 0 }.toSortedMap()
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(lineup.teamName, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            lineup.formation?.let {
                LtrTextBg(it)
            }
        }
        Box(
            modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f).clip(RoundedCornerShape(18.dp))
                .background(Brush.verticalGradient(listOf(WcColors.pitchTop, WcColors.pitchBottom)))
                .border(1.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(18.dp)).padding(10.dp),
        ) {
            if (rows.isEmpty()) {
                Text("التشكيلة غير متاحة بعد", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, modifier = Modifier.align(Alignment.Center))
            } else {
                Column(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.SpaceEvenly) {
                    // أعلى = الهجوم (أعلى صف رقمًا)، أسفل = الحارس (صف 1)
                    rows.keys.sortedDescending().forEach { r ->
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            rows[r]!!.sortedBy { (it.grid ?: "0:0").split(":").getOrNull(1)?.toIntOrNull() ?: 0 }.forEach { p -> PlayerDot(p, onOpenPlayer) }
                        }
                    }
                }
            }
        }
        if (lineup.coach.isNotBlank()) Text("المدرب: ${lineup.coach}", color = WcColors.onDarkDim, fontSize = 11.sp)
        if (lineup.substitutes.isNotEmpty()) Bench(lineup.substitutes, onOpenPlayer)
    }
}

@Composable
private fun Bench(subs: List<WcLineupPlayer>, onOpenPlayer: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.EventSeat, null, tint = WcColors.emerald, modifier = Modifier.size(12.dp))
            Text("دكة البدلاء", color = WcColors.emerald, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("(${subs.size})", color = WcColors.onDarkDim, fontSize = 11.sp)
        }
        // شبكة عمودين من البدلاء
        subs.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                pair.forEach { p ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(WcColors.chipFill)
                            .clickable(enabled = p.id > 0) { onOpenPlayer(p.id) }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    ) {
                        Box(modifier = Modifier.size(22.dp).clip(CircleShape).background(WcColors.emerald.copy(alpha = 0.15f)), contentAlignment = Alignment.Center) {
                            LtrText(p.number?.toString() ?: "•", WcColors.emeraldDeep, 11, FontWeight.Black)
                        }
                        Text(p.name, color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun LtrTextBg(text: String) {
    Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 8.dp, vertical = 2.dp)) {
        LtrText(text, WcColors.onDarkDim, 12, FontWeight.Bold)
    }
}

@Composable
private fun PlayerDot(p: WcLineupPlayer, onOpenPlayer: (Int) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier.width(56.dp).clip(RoundedCornerShape(8.dp)).clickable(enabled = p.id > 0) { onOpenPlayer(p.id) },
    ) {
        Box(modifier = Modifier.size(28.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
            Text(p.number?.toString() ?: "•", color = WcColors.pitchBottom, fontSize = 11.sp, fontWeight = FontWeight.Black)
        }
        Text(p.name, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, textAlign = TextAlign.Center)
    }
}

// ---------- الإحصائيات ----------

@Composable
private fun StatsTab(detail: WcMatchDetail, facts: WcMatchFacts?, xg: WcXg?) {
    // أثناء اللعب نُفضّل إحصاءات detail اللحظية إن توفّرت؛ وإلا SportMonks الأعمق
    val stats = when {
        detail.fixture.status.live && detail.statistics.isNotEmpty() -> detail.statistics
        facts != null && facts.statistics.isNotEmpty() -> facts.statistics
        else -> detail.statistics
    }
    val nothing = stats.isEmpty() && xg?.available != true && facts?.weather == null && facts?.absentees.isNullOrEmpty()
    if (nothing) { WcEmptyText("الإحصائيات تظهر هنا أثناء المباراة"); return }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (xg?.available == true) XgCard(xg, detail)
        facts?.weather?.let { WeatherCard(it) }
        facts?.absentees?.takeIf { it.isNotEmpty() }?.let { AbsenteesCard(it, detail) }
        stats.forEach { StatRow(it) }
    }
}

@Composable
private fun StatRow(s: WcStatistic) {
    val h = s.home.replace("%", "").toFloatOrNull() ?: 0f
    val a = s.away.replace("%", "").toFloatOrNull() ?: 0f
    val max = (h + a).coerceAtLeast(1f)
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(s.home, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black)
            Text(s.label, color = WcColors.onDarkDim, fontSize = 12.sp)
            Text(s.away, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black)
        }
        Row(modifier = Modifier.fillMaxWidth().height(6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                Box(Modifier.fillMaxWidth(h / max).height(6.dp).clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep))
            }
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                Box(Modifier.fillMaxWidth(a / max).height(6.dp).clip(RoundedCornerShape(50)).background(WcColors.sky))
            }
        }
    }
}

@Composable
private fun XgCard(xg: WcXg, detail: WcMatchDetail) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
            .border(1.dp, WcColors.cardStroke, RoundedCornerShape(16.dp)).padding(14.dp),
    ) {
        StatRow(WcStatistic(key = "xg", label = "الأهداف المتوقعة (xG)",
            home = String.format(java.util.Locale.US, "%.2f", xg.home.xg),
            away = String.format(java.util.Locale.US, "%.2f", xg.away.xg)))
        if (xg.home.xgot > 0 || xg.away.xgot > 0) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                LtrText(String.format(java.util.Locale.US, "%.2f", xg.home.xgot), WcColors.onDarkDim, 11, FontWeight.Normal)
                Spacer(Modifier.weight(1f))
                Text("على المرمى (xGoT)", color = WcColors.onDarkDim, fontSize = 11.sp)
                Spacer(Modifier.weight(1f))
                LtrText(String.format(java.util.Locale.US, "%.2f", xg.away.xgot), WcColors.onDarkDim, 11, FontWeight.Normal)
            }
        }
        if (xg.topPlayers.isNotEmpty()) {
            Box(Modifier.fillMaxWidth().height(0.5.dp).background(WcColors.cardStroke))
            Text("الأعلى خطورة (xG)", color = WcColors.onDarkDim, fontSize = 10.sp)
            xg.topPlayers.take(3).forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    WcTeamLogoBare(if (p.location == "home") detail.fixture.home.logo else detail.fixture.away.logo)
                    Text(p.name, color = WcColors.onDark, fontSize = 12.sp, maxLines = 1, modifier = Modifier.weight(1f))
                    LtrText(String.format(java.util.Locale.US, "%.2f", p.xg), WcColors.onDark, 12, FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun WeatherCard(w: WcWeather) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(16.dp)).padding(12.dp),
    ) {
        if (w.icon.isEmpty()) Icon(Icons.Filled.WbCloudy, null, tint = WcColors.sky, modifier = Modifier.size(28.dp))
        else WcTeamLogoBare(w.icon)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(w.description, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                if (w.type == "forecast") Text("· توقّع", color = WcColors.onDarkDim, fontSize = 10.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                w.temp?.let { LtrText("$it°م", WcColors.onDarkDim, 11, FontWeight.Normal) }
                w.humidity?.takeIf { it.isNotEmpty() }?.let { h ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                        Icon(Icons.Filled.WaterDrop, null, tint = WcColors.onDarkDim, modifier = Modifier.size(9.dp))
                        Text(h, color = WcColors.onDarkDim, fontSize = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun AbsenteesCard(list: List<WcAbsentee>, detail: WcMatchDetail) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(16.dp)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.HealthAndSafety, null, tint = WcColors.liveRed, modifier = Modifier.size(12.dp))
            Text("الغيابات", color = WcColors.liveRed, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            AbsenteeCol(detail.fixture.home, list.filter { it.location == "home" }, Modifier.weight(1f))
            AbsenteeCol(detail.fixture.away, list.filter { it.location == "away" }, Modifier.weight(1f))
        }
    }
}

@Composable
private fun AbsenteeCol(team: WcTeam, players: List<WcAbsentee>, modifier: Modifier = Modifier) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = modifier) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            WcTeamLogoBare(team.logo)
            Text(team.name, color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
        if (players.isEmpty()) {
            Text("—", color = WcColors.onDarkDim, fontSize = 11.sp)
        } else {
            players.forEach { p ->
                Text("${p.name}${if (p.reason.isEmpty()) "" else " — ${p.reason}"}", color = WcColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
            }
        }
    }
}

// ---------- التقييمات ----------

@androidx.compose.runtime.Composable
@androidx.compose.runtime.ReadOnlyComposable
private fun ratingColor(r: Double): Color = when {
    r >= 8 -> WcColors.emeraldDeep
    r >= 7 -> WcColors.leaf
    r >= 6 -> WcColors.gold
    else -> WcColors.liveRed
}

@Composable
private fun RatingsTab(detail: WcMatchDetail, onOpenPlayer: (Int) -> Unit) {
    if (detail.ratings.isEmpty()) { WcEmptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة"); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        detail.manOfTheMatch?.let { motm ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.gold.copy(alpha = 0.12f))
                    .border(1.dp, WcColors.gold.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                    .clickable(enabled = motm.id > 0) { onOpenPlayer(motm.id) }
                    .padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Icon(Icons.Filled.WorkspacePremium, null, tint = WcColors.gold, modifier = Modifier.size(20.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("رجل المباراة", color = WcColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(motm.name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black)
                }
                RatingBadge(motm.rating)
            }
        }
        detail.ratings.forEach { p ->
            val teamLogo = if (p.teamId == detail.fixture.home.id) detail.fixture.home.logo else detail.fixture.away.logo
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.chipFill)
                    .clickable(enabled = p.id > 0) { onOpenPlayer(p.id) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                WcPlayerPhoto(p.photo, p.name, 32)
                Column(modifier = Modifier.weight(1f)) {
                    Text("${p.name}${if (p.captain) " (ك)" else ""}", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    Text(ratingSubtitle(p), color = WcColors.onDarkDim, fontSize = 10.sp)
                }
                WcTeamLogoBare(teamLogo)
                RatingBadge(p.rating)
            }
        }
    }
}

private fun ratingSubtitle(p: WcPlayerRating): String {
    val parts = mutableListOf(p.position)
    if (p.minutes > 0) parts.add("${p.minutes} د")
    if (p.goals > 0) parts.add("${p.goals} ⚽")
    if (p.assists > 0) parts.add("${p.assists} صناعة")
    return parts.joinToString(" · ")
}

@Composable
private fun RatingBadge(rating: Double) {
    Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(ratingColor(rating)).padding(horizontal = 7.dp, vertical = 3.dp)) {
        LtrText(String.format(java.util.Locale.US, "%.1f", rating), Color.White, 13, FontWeight.Black)
    }
}

// ---------- التوقعات + المواجهات ----------

@Composable
private fun PredictionTab(detail: WcMatchDetail, forecast: WcForecast?) {
    // نتيجة المباراة: API-Football إن توفّر، وإلا احتمالات SportMonks
    val ft = detail.prediction?.let { Triple(it.home, it.draw, it.away) }
        ?: forecast?.fulltime?.let { Triple(it.home, it.draw, it.away) }
    val hasAny = ft != null || forecast?.available == true

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        if (ft != null) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PredBar("فوز ${detail.fixture.home.name}", ft.first, WcColors.emeraldDeep)
                PredBar("التعادل", ft.second, Color.White.copy(alpha = 0.4f))
                PredBar("فوز ${detail.fixture.away.name}", ft.third, WcColors.sky)
            }
        } else {
            WcEmptyText("لا تتوفر توقعات لهذه المباراة")
        }

        forecast?.takeIf { it.available }?.let { ForecastBlocks(it, detail) }

        if (hasAny) {
            Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا", color = WcColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        }

        Box(Modifier.fillMaxWidth().height(0.5.dp).background(WcColors.cardStroke))
        Text("سجل المواجهات", color = WcColors.emerald, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        if (detail.headToHead.isEmpty()) {
            Text("أول مواجهة رسمية بين المنتخبين — التاريخ يبدأ من هنا", color = WcColors.onDarkDim, fontSize = 12.sp)
        } else {
            detail.headToHead.forEach { m -> H2hRow(m) }
        }
    }
}

@Composable
private fun ForecastBlocks(f: WcForecast, detail: WcMatchDetail) {
    val home = detail.fixture.home.name
    val away = detail.fixture.away.name
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(Modifier.fillMaxWidth().height(0.5.dp).background(WcColors.cardStroke))
        Text("توقعات متقدّمة", color = WcColors.emerald, fontSize = 13.sp, fontWeight = FontWeight.Bold)

        f.doubleChance?.let { dc ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("الفرصة المزدوجة", color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    DcCell("$home أو تعادل", dc.homeOrDraw, Modifier.weight(1f))
                    DcCell("بلا تعادل", dc.homeOrAway, Modifier.weight(1f))
                    DcCell("$away أو تعادل", dc.awayOrDraw, Modifier.weight(1f))
                }
            }
        }

        f.btts?.let { TwoWay("الفريقان يسجلان", "نعم", it.yes, "لا", it.no) }

        if (f.goals.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("مجموع الأهداف — أكثر/أقل من", color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                f.goals.forEach { ou ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        LtrText(formatLine(ou.line), WcColors.onDark, 12, FontWeight.Bold)
                        TwoWayBar(ou.over, ou.under, Modifier.weight(1f))
                    }
                }
            }
        }

        if (f.correctScores.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("أرجح النتائج (الرقم الأول للمضيف)", color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
                    f.correctScores.forEach { cs ->
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
                            modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(WcColors.chipFill).padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            LtrText(cs.score, WcColors.onDark, 14, FontWeight.Black)
                            LtrText(formatPct(cs.prob), WcColors.onDarkDim, 10, FontWeight.Normal)
                        }
                    }
                }
            }
        }
    }
}

private fun formatLine(v: Double): String =
    if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

private fun formatPct(v: Double): String {
    val s = if (v == v.toLong().toDouble()) v.toLong().toString() else String.format(java.util.Locale.US, "%.1f", v)
    return "$s%"
}

@Composable
private fun DcCell(label: String, value: Int, modifier: Modifier = Modifier) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp),
        modifier = modifier.clip(RoundedCornerShape(10.dp)).background(WcColors.chipFill).padding(vertical = 8.dp, horizontal = 4.dp),
    ) {
        LtrText("$value%", WcColors.onDark, 16, FontWeight.Black)
        Text(label, color = WcColors.onDarkDim, fontSize = 10.sp, textAlign = TextAlign.Center, maxLines = 2)
    }
}

@Composable
private fun TwoWay(title: String, leftLabel: String, left: Int, rightLabel: String, right: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Text(title, color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        TwoWayBar(left, right, Modifier.fillMaxWidth())
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("$leftLabel $left%", color = WcColors.onDark, fontSize = 11.sp)
            Text("$rightLabel $right%", color = WcColors.onDark, fontSize = 11.sp)
        }
    }
}

@Composable
private fun TwoWayBar(left: Int, right: Int, modifier: Modifier = Modifier) {
    val total = (left + right).coerceAtLeast(1).toFloat()
    Row(modifier = modifier.height(16.dp).clip(RoundedCornerShape(50)), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        Box(Modifier.fillMaxWidth(left / total).fillMaxHeight().background(WcColors.emeraldDeep))
        Box(Modifier.weight(1f).fillMaxHeight().background(WcColors.sky.copy(alpha = 0.5f)))
    }
}

@Composable
private fun PredBar(label: String, value: Int, color: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
            Text("$value%", color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Black)
        }
        Box(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50)).background(WcColors.chipFill)) {
            Box(Modifier.fillMaxWidth((value / 100f).coerceIn(0f, 1f)).height(8.dp).clip(RoundedCornerShape(50)).background(color))
        }
    }
}

@Composable
private fun H2hRow(m: WcFixture) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WcColors.chipFill).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.card).padding(horizontal = 7.dp, vertical = 3.dp)) {
            LtrText(m.date.take(4), WcColors.onDarkDim, 12, FontWeight.Bold)
        }
        Text(m.home.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        // اسم المضيف على اليمين — الضيف أولًا داخل LTR
        LtrText("${m.goals.away ?: 0} - ${m.goals.home ?: 0}", WcColors.onDark, 13, FontWeight.Black)
        Text(m.away.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

// ---------- التعليق الحي ----------

@Composable
private fun CommentaryTab(data: WcCommentary?) {
    val items = (data?.items ?: emptyList()).sortedByDescending { it.order }
    if (items.isEmpty()) { WcEmptyText("التعليق الحي يبدأ مع صافرة الانطلاق"); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { item ->
            Row(
                verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(if (item.goal) WcColors.emerald.copy(alpha = 0.10f) else WcColors.chipFill)
                    .border(1.dp, if (item.goal) WcColors.emerald.copy(alpha = 0.35f) else Color.Transparent, RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                LtrText(item.minuteLabel, if (item.goal) WcColors.emeraldDeep else WcColors.onDarkDim, 12, FontWeight.Bold)
                when {
                    item.goal -> Icon(Icons.Filled.SportsSoccer, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(14.dp))
                    item.important -> Icon(Icons.Filled.Star, null, tint = WcColors.gold, modifier = Modifier.size(12.dp))
                }
                Text(
                    item.textAr.ifEmpty { item.textEn },
                    color = WcColors.onDark, fontSize = 14.sp,
                    fontWeight = if (item.goal || item.important) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

// ---------- الزخم / الاستحواذ ----------

@Composable
private fun MomentumTab(data: WcMomentum?, homeName: String, awayName: String) {
    if (data == null || (data.possession == null && data.points.isEmpty())) {
        WcEmptyText("مؤشّر الزخم والاستحواذ يظهر هنا أثناء المباراة"); return
    }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        data.possession?.let { pos ->
            val total = (pos.home + pos.away).coerceAtLeast(1).toFloat()
            Column(
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
                    .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(16.dp)).padding(12.dp),
            ) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("$homeName ${pos.home}%", color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text("الاستحواذ", color = WcColors.onDarkDim, fontSize = 11.sp)
                    Text("$awayName ${pos.away}%", color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                // RTL: المضيف (زمردي) يمينًا، الضيف (سماوي) يسارًا
                Row(modifier = Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(50))) {
                    Box(Modifier.fillMaxWidth(pos.home / total).fillMaxHeight().background(WcColors.emeraldDeep))
                    Box(Modifier.weight(1f).fillMaxHeight().background(WcColors.sky))
                }
            }
        }
        if (data.points.isNotEmpty()) {
            Text("الزخم الهجومي عبر دقائق المباراة — أعلى: $homeName · أسفل: $awayName", color = WcColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
            NetBarChart(data.points.map { it.minute to it.net }, WcColors.emeraldDeep, WcColors.sky)
        }
    }
}

// ---------- الضغط ----------

@Composable
private fun PressureTab(data: WcPressure?, homeName: String, awayName: String) {
    if (data == null || data.points.isEmpty()) { WcEmptyText("مؤشّر الضغط يظهر هنا أثناء المباراة"); return }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        data.latest?.takeIf { it.side != "even" }?.let { latest ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Text("الأكثر سيطرة الآن:", color = WcColors.onDarkDim, fontSize = 13.sp)
                Text(if (latest.side == "home") homeName else awayName, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Black)
                Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 7.dp, vertical = 2.dp)) {
                    LtrText("${latest.value.toInt()}", WcColors.onDark, 13, FontWeight.Black)
                }
            }
        }
        Text("مؤشّر الضغط لحظة بلحظة — أعلى: $homeName · أسفل: $awayName", color = WcColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        NetBarChart(data.points.map { it.minute to it.net }, WcColors.emeraldDeep, WcColors.liveRed)
    }
}

/** رسم بياني بسيط للقيم الموجبة/السالبة عبر الدقائق (يطابق BarMark على iOS). */
@Composable
private fun NetBarChart(points: List<Pair<Int, Double>>, positive: Color, negative: Color) {
    if (points.isEmpty()) return
    val maxAbs = (points.maxOf { kotlin.math.abs(it.second) }).coerceAtLeast(1.0)
    Canvas(modifier = Modifier.fillMaxWidth().height(180.dp).padding(vertical = 8.dp)) {
        val w = size.width
        val h = size.height
        val midY = h / 2f
        // RTL: الدقيقة 0 يمينًا، الأحدث يسارًا
        val slot = w / points.size
        val barW = (slot * 0.6f).coerceAtMost(8f)
        points.forEachIndexed { i, (_, net) ->
            val cx = w - (i + 0.5f) * slot
            val barH = (kotlin.math.abs(net) / maxAbs * (midY - 4)).toFloat()
            if (net >= 0) {
                drawRect(color = positive, topLeft = androidx.compose.ui.geometry.Offset(cx - barW / 2, midY - barH), size = androidx.compose.ui.geometry.Size(barW, barH))
            } else {
                drawRect(color = negative, topLeft = androidx.compose.ui.geometry.Offset(cx - barW / 2, midY), size = androidx.compose.ui.geometry.Size(barW, barH))
            }
        }
        // محور الصفر
        drawRect(color = positive.copy(alpha = 0.25f), topLeft = androidx.compose.ui.geometry.Offset(0f, midY - 0.5f), size = androidx.compose.ui.geometry.Size(w, 1f))
    }
}

// ---------- شريط القنوات الناقلة ----------

@Composable
private fun TvStrip(channels: List<WcTvChannel>) {
    val uriHandler = androidx.compose.ui.platform.LocalUriHandler.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.Tv, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(12.dp))
            Text("القنوات الناقلة", color = WcColors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.horizontalScroll(rememberScrollState())) {
            channels.forEach { ch ->
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill)
                        .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.6f), RoundedCornerShape(50))
                        .then(
                            if (!ch.url.isNullOrEmpty()) Modifier.clickable { runCatching { uriHandler.openUri(ch.url) } } else Modifier,
                        )
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                ) {
                    if (!ch.logo.isNullOrEmpty()) WcTeamLogoBare(ch.logo)
                    else Icon(Icons.Filled.Tv, null, tint = WcColors.onDarkDim, modifier = Modifier.size(12.dp))
                    Text(ch.name, color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    ch.country?.takeIf { it.isNotEmpty() }?.let { Text(it, color = WcColors.onDarkDim, fontSize = 10.sp, maxLines = 1) }
                }
            }
        }
    }
}
