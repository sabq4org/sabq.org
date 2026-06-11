package com.sabq.smart.feature.worldcup

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
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
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

    data class UiState(val detail: WcMatchDetail? = null, val loading: Boolean = true)

    private val _state = MutableStateFlow(UiState())
    val state: StateFlow<UiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            val d = runCatching { repo.match(fixtureId) }.getOrNull()
            _state.update { it.copy(detail = d, loading = false) }
        }
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
                else -> MatchContent(detail)
            }
        }
    }
}

@Composable
private fun MatchContent(detail: WcMatchDetail) {
    val tabs = buildList {
        add("events" to "الأحداث"); add("lineups" to "التشكيلات"); add("stats" to "الإحصائيات")
        if (detail.ratings.isNotEmpty()) add("ratings" to "التقييمات")
        add("prediction" to "التوقعات")
    }
    var tab by remember { mutableStateOf("events") }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item { MatchHeader(detail.fixture) }
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
                "events" -> EventsTab(detail)
                "lineups" -> LineupsTab(detail)
                "stats" -> StatsTab(detail)
                "ratings" -> RatingsTab(detail)
                else -> PredictionTab(detail)
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
                if (f.started) LtrText("${f.goals.home ?: 0} - ${f.goals.away ?: 0}", WcColors.onDark, 30, FontWeight.Black)
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
private fun EventsTab(detail: WcMatchDetail) {
    if (detail.events.isEmpty()) { WcEmptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة"); return }
    val sorted = detail.events.sortedWith(compareByDescending<WcMatchEvent> { it.minute }.thenByDescending { it.extraMinute ?: 0 })
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        sorted.forEach { ev ->
            val team = if (ev.teamId == detail.fixture.home.id) detail.fixture.home else detail.fixture.away
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.chipFill).padding(horizontal = 12.dp, vertical = 10.dp),
            ) {
                LtrText("${ev.minute}'${ev.extraMinute?.let { "+$it" } ?: ""}", WcColors.onDarkDim, 12, FontWeight.Bold)
                EventIcon(ev.type)
                Column(modifier = Modifier.weight(1f)) {
                    Text("${ev.label}${if (ev.player.isNotBlank()) " — ${ev.player}" else ""}", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
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
private fun LineupsTab(detail: WcMatchDetail) {
    if (detail.lineups.isEmpty()) { WcEmptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة"); return }
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        detail.lineups.forEach { Pitch(it) }
    }
}

@Composable
private fun Pitch(lineup: WcLineup) {
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
                            rows[r]!!.sortedBy { (it.grid ?: "0:0").split(":").getOrNull(1)?.toIntOrNull() ?: 0 }.forEach { p -> PlayerDot(p) }
                        }
                    }
                }
            }
        }
        if (lineup.coach.isNotBlank()) Text("المدرب: ${lineup.coach}", color = WcColors.onDarkDim, fontSize = 11.sp)
    }
}

@Composable
private fun LtrTextBg(text: String) {
    Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 8.dp, vertical = 2.dp)) {
        LtrText(text, WcColors.onDarkDim, 12, FontWeight.Bold)
    }
}

@Composable
private fun PlayerDot(p: WcLineupPlayer) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.width(56.dp)) {
        Box(modifier = Modifier.size(28.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
            Text(p.number?.toString() ?: "•", color = WcColors.pitchBottom, fontSize = 11.sp, fontWeight = FontWeight.Black)
        }
        Text(p.name, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, textAlign = TextAlign.Center)
    }
}

// ---------- الإحصائيات ----------

@Composable
private fun StatsTab(detail: WcMatchDetail) {
    if (detail.statistics.isEmpty()) { WcEmptyText("الإحصائيات تظهر هنا أثناء المباراة"); return }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        detail.statistics.forEach { s ->
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
    }
}

// ---------- التقييمات ----------

private fun ratingColor(r: Double): Color = when {
    r >= 8 -> WcColors.emeraldDeep
    r >= 7 -> WcColors.leaf
    r >= 6 -> WcColors.gold
    else -> WcColors.liveRed
}

@Composable
private fun RatingsTab(detail: WcMatchDetail) {
    if (detail.ratings.isEmpty()) { WcEmptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة"); return }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        detail.manOfTheMatch?.let { motm ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.gold.copy(alpha = 0.12f))
                    .border(1.dp, WcColors.gold.copy(alpha = 0.3f), RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
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
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.chipFill).padding(horizontal = 12.dp, vertical = 8.dp),
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
private fun PredictionTab(detail: WcMatchDetail) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        detail.prediction?.let { p ->
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                PredBar("فوز ${detail.fixture.home.name}", p.home, WcColors.emeraldDeep)
                PredBar("التعادل", p.draw, Color.White.copy(alpha = 0.4f))
                PredBar("فوز ${detail.fixture.away.name}", p.away, WcColors.sky)
            }
            Text("توقعات خوارزمية من مزود البيانات الرياضية — للاستئناس وليست ترجيحًا تحريريًا", color = WcColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
        } ?: WcEmptyText("لا تتوفر توقعات لهذه المباراة")

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
        LtrText("${m.goals.home ?: 0} - ${m.goals.away ?: 0}", WcColors.onDark, 13, FontWeight.Black)
        Text(m.away.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}
