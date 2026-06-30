package com.sabq.smart.feature.worldcup

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.FormatListNumbered
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Podcasts
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Tv
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.hilt.navigation.compose.hiltViewModel
import com.sabq.smart.ui.theme.IbmPlexSansArabic

/** نص بالاتجاه اللاتيني (نتائج/تواريخ) حتى لا تنقلب الأرقام في RTL. */
@Composable
fun LtrText(text: String, color: Color, fontSize: Int, weight: FontWeight) {
    androidx.compose.runtime.CompositionLocalProvider(
        androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr
    ) {
        Text(text, color = color, fontSize = fontSize.sp, fontWeight = weight)
    }
}

@Composable
fun WorldCupScreen(
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    onOpenArticle: (slug: String) -> Unit = {},
    onOpenTeam: (WcTeam) -> Unit = {},
    onOpenPredictions: () -> Unit = {},
    viewModel: WorldCupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Box(modifier = Modifier.fillMaxSize().background(WcColors.sectionBackground)) {
            Column(modifier = Modifier.fillMaxSize()) {
                // شريط علوي شفاف فوق الخلفية الفاتحة — لا كتلة داكنة (الشكل الجديد)
                Row(
                    modifier = Modifier.fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    androidx.compose.material3.IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع", tint = WcColors.onDark)
                    }
                    Spacer(Modifier.weight(1f))
                    Text("مونديال 2026", color = WcColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.weight(1f))
                    Spacer(Modifier.size(40.dp))
                }

                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 36.dp),
                    verticalArrangement = Arrangement.spacedBy(22.dp),
                ) {
                    item { HeroSection(state.overview, state.overviewLoading, onOpenMatch) }

                    item { WcPredictCTA(onOpenPredictions) }

                    item { FactsSection(state.facts) }

                    state.pulse?.let { pulse ->
                        item { WcPulseCard(pulse, state.pulseGoalFlash, onOpenMatch) }
                    }

                    state.overview?.saudi?.takeIf { it.fixtures.isNotEmpty() }?.let { saudi ->
                        item { SaudiSpotlight(saudi, state.saudiSquad, onOpenMatch, viewModel::openPlayer) }
                    }

                    item { MatchesSection(state.fixtures, state.fixturesLoading, onOpenMatch) }

                    item { StandingsSection(state.standings, state.standingsLoading) }

                    item { KnockoutSection(state.bracket, onOpenMatch) }

                    item { RacesSection(state, viewModel) }

                    item { TeamsSection(state, onOpenTeam) }

                    item { NewsSection(state.news, onOpenArticle) }
                }
            }

            // حوار قائمة المنتخب
            state.selectedTeam?.let { team ->
                SquadDialog(
                    team = team, squad = state.squad, loading = state.squadLoading,
                    onDismiss = viewModel::closeSquad, onOpenPlayer = viewModel::openPlayer,
                )
            }

            // بطاقة اللاعب — تعلو قائمة المنتخب إن كانت مفتوحة
            if (state.selectedPlayerId != null) {
                PlayerCardDialog(card = state.playerCard, loading = state.playerLoading, onDismiss = viewModel::closePlayer)
            }
        }
    }
}

// ---------- الهيرو (مباراة اليوم) ----------

@Composable
private fun HeroSection(overview: WcOverview?, isLoading: Boolean, onOpenMatch: (Int) -> Unit) {
    val motd = overview?.matchOfTheDay
    val liveCount = overview?.live?.size ?: 0

    // المباريات المعروضة في الأعلى: مباراة اليوم + أي مباراة أخرى تنطلق
    // بنفس التوقيت (نفس الـ timestamp) ولم تنتهِ بعد — تُعرض كبطاقتين بدل
    // واحدة عند تزامن مباراتين. التوقّع متاح لمباراة اليوم فقط؛ البقية بلا
    // شريط احتمالات.
    val heroMatches: List<Pair<WcFixture, WcPrediction?>> = remember(overview) {
        if (motd == null) {
            emptyList()
        } else {
            val primary = motd.fixture
            val pool = (overview.today + overview.live).distinctBy { it.id }
            val siblings = pool.filter {
                it.id != primary.id && it.timestamp == primary.timestamp && !it.status.finished
            }
            listOf(primary to motd.prediction) + siblings.map { it to null }
        }
    }

    // الشكل الجديد: لا كتلة داكنة — المحتوى يجلس مباشرة على الخلفية الفاتحة
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(18.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Pill("🏆 تغطية خاصة", WcColors.gold.copy(alpha = 0.16f), WcColors.gold)
                if (liveCount > 0) {
                    Pill(if (liveCount == 1) "مباراة مباشرة" else "$liveCount مباريات مباشرة", WcColors.liveRed, Color.White)
                }
            }
            Text("مونديال 2026", color = WcColors.emeraldDeep, fontSize = 40.sp, fontWeight = FontWeight.Black)
            Text(
                "48 منتخبًا · 16 ملعبًا · تغطية حية بتوقيت الرياض",
                color = WcColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center,
            )
        }

        when {
            isLoading -> Box(
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(WcColors.card).padding(vertical = 30.dp),
                contentAlignment = Alignment.Center,
            ) { CircularProgressIndicator(color = WcColors.emerald, strokeWidth = 2.dp) }
            heroMatches.isNotEmpty() -> heroMatches.forEach { (f, pred) -> MatchCard(f, pred, onOpenMatch) }
            else -> HeroEmpty()
        }
    }
}

@Composable
private fun MatchCard(f: WcFixture, prediction: WcPrediction?, onOpenMatch: (Int) -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp))
            .background(WcColors.card)
            .border(1.dp, WcColors.cardStroke, RoundedCornerShape(24.dp))
            .padding(horizontal = 14.dp, vertical = 18.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val label = if (f.status.live) "تجري الآن"
                else if (WcFormat.dayKey(f.date) == WcFormat.todayKey()) "مباراة اليوم" else "المباراة القادمة"
            Text(label, color = WcColors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            Text("·", color = WcColors.onDarkDim, fontSize = 12.sp)
            Text(f.round, color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
        }

        Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
            TeamColumn(f.home, Modifier.weight(1f))
            HeroCenter(f, Modifier.width(120.dp))
            TeamColumn(f.away, Modifier.weight(1f))
        }

        if (!f.started) WcCountdownChips(f.timestamp)
        if (prediction != null && !f.status.finished) WcProbabilityBar(f, prediction)

        Text(
            "مركز المباراة",
            color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.royal)
                .clickable { onOpenMatch(f.id) }.padding(horizontal = 24.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun TeamColumn(team: WcTeam, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = modifier) {
        WcTeamLogo(team, size = 64)
        Text(team.name, color = WcColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center)
    }
}

@Composable
private fun HeroCenter(f: WcFixture, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = modifier) {
        if (f.started) {
            // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم منتخبه
            LtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", WcColors.onDark, 40, FontWeight.Black)
            f.penaltyOutcome?.let {
                Text(
                    "فاز ${it.winnerName} بركلات الترجيح (${it.winnerScore}-${it.loserScore})",
                    color = WcColors.emeraldDeep,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
            WcStatusPill(f, onDark = false)
        } else {
            Text(WcFormat.time(f), color = WcColors.onDark, fontSize = 26.sp, fontWeight = FontWeight.Black)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                Icon(Icons.Filled.CalendarMonth, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(12.dp))
                Text(WcFormat.day(f), color = WcColors.emeraldDeep, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun HeroEmpty() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(WcColors.card)
            .border(1.dp, WcColors.cardStroke, RoundedCornerShape(22.dp)).padding(vertical = 24.dp),
    ) {
        Icon(Icons.Filled.EmojiEvents, null, tint = WcColors.emerald, modifier = Modifier.size(30.dp))
        Text("تغطية المونديال تنطلق قريبًا", color = WcColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        Text("جدول المباريات والنتائج الحية ستجدها هنا أولًا بأول", color = WcColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun Pill(text: String, bg: Color, fg: Color) {
    Text(
        text, color = fg, fontSize = 12.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 12.dp, vertical = 5.dp),
    )
}

// ---------- مشوار الأخضر ----------

@Composable
private fun SaudiSpotlight(
    saudi: WcSaudi,
    saudiSquad: List<WcSquadPlayer>,
    onOpenMatch: (Int) -> Unit,
    onOpenPlayer: (Int) -> Unit,
) {
    androidx.compose.runtime.CompositionLocalProvider(LocalWcForceDark provides true) {
    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(WcColors.royal, WcColors.stadiumTop)))
            .padding(20.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("مشوار الأخضر", color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black)
            saudi.group?.let {
                Text(it.group, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 3.dp))
            }
        }
        saudi.next?.let { n ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Filled.LocationOn, null, tint = WcColors.emerald.copy(alpha = 0.85f), modifier = Modifier.size(14.dp))
                Text("${n.venue.name} — ${n.venue.city}", color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 12.sp)
            }
        }
        saudi.fixtures.forEach { f -> SaudiRow(f, onOpenMatch) }
        SaudiSquadStrip(saudiSquad, onOpenPlayer)
    }
    }
}

@Composable
private fun SaudiRow(f: WcFixture, onOpenMatch: (Int) -> Unit) {
    val opp = if (f.home.id == WC_SAUDI_TEAM_ID) f.away else f.home
    val saudiGoals = if (f.home.id == WC_SAUDI_TEAM_ID) f.goals.home else f.goals.away
    val oppGoals = if (f.home.id == WC_SAUDI_TEAM_ID) f.goals.away else f.goals.home
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.08f))
            .clickable { onOpenMatch(f.id) }.padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        WcTeamLogo(opp, size = 34)
        Column(modifier = Modifier.weight(1f)) {
            Text("ضد ${opp.name}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text("${f.round} · ${WcFormat.day(f)}", color = WcColors.emerald.copy(alpha = 0.7f), fontSize = 11.sp)
        }
        if (f.started) LtrText("${saudiGoals ?: 0} - ${oppGoals ?: 0}", Color.White, 17, FontWeight.Black)
        else Text(WcFormat.time(f), color = WcColors.emerald, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.width(2.dp))
        WcStatusPill(f)
    }
}

// ---------- المباريات (تبويبات) ----------

@Composable
private fun MatchesSection(fixtures: List<WcFixture>, isLoading: Boolean, onOpenMatch: (Int) -> Unit) {
    val live = fixtures.filter { it.status.live }
    val today = fixtures.filter { WcFormat.dayKey(it.date) == WcFormat.todayKey() }
    val upcoming = fixtures.filter { !it.status.live && !it.status.finished }
    val finished = fixtures.filter { it.status.finished }.reversed()

    val tabs = listOf("live" to "مباشر", "today" to "اليوم", "upcoming" to "القادمة", "finished" to "النتائج")
    // الافتراضي: اليوم إن وُجد، وإلا مباشر ثم القادمة
    val default = if (today.isNotEmpty()) "today" else if (live.isNotEmpty()) "live" else "upcoming"
    var selected by remember { mutableStateOf<String?>(null) }
    val tab = selected ?: default
    val current = when (tab) { "live" -> live; "today" -> today; "upcoming" -> upcoming; else -> finished }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.CalendarMonth, "المباريات", "جدول مونديال 2026 بتوقيت الرياض")
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        ) {
            tabs.forEach { (key, label) ->
                val isSel = tab == key
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(if (isSel) WcColors.emeraldDeep else WcColors.chipFill)
                        .clickable { selected = key }.padding(horizontal = 14.dp, vertical = 8.dp),
                ) {
                    Text(label, color = if (isSel) Color.White else WcColors.onDarkDim, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                    if (key == "live" && live.isNotEmpty()) {
                        Text("${live.size}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                            modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.liveRed).padding(horizontal = 5.dp, vertical = 1.dp))
                    }
                }
            }
        }

        when {
            isLoading -> WcLoading()
            current.isEmpty() -> WcEmptyText(
                when (tab) {
                    "live" -> "لا توجد مباريات مباشرة الآن — عُد عند صافرة البداية"
                    "today" -> "لا توجد مباريات اليوم"
                    "upcoming" -> "لا توجد مباريات قادمة معلنة بعد"
                    // «الانطلاقة قريبًا» تصبح خاطئة لحظة انطلاق البطولة — الرسالة تتبع الحالة
                    else -> if (live.isNotEmpty()) "مباراة جارية الآن — نتيجتها تظهر هنا فور صافرة النهاية"
                    else "النتائج تظهر هنا فور انتهاء أول مباراة"
                }
            )
            else -> Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
                groupedByDay(current).forEach { (label, items) ->
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(Modifier.size(7.dp).clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep))
                            Text(label, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Text("(${items.size})", color = WcColors.onDarkDim, fontSize = 12.sp)
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(0.dp), modifier = Modifier.fillMaxWidth()) {
                            items.forEachIndexed { index, f ->
                                MatchRowCard(f, onOpenMatch)
                                if (index < items.lastIndex) {
                                    Box(
                                        Modifier.fillMaxWidth().padding(horizontal = 10.dp)
                                            .height(0.5.dp).background(WcColors.cardStroke.copy(alpha = 0.75f))
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun groupedByDay(items: List<WcFixture>): List<Pair<String, List<WcFixture>>> {
    val out = mutableListOf<Pair<String, MutableList<WcFixture>>>()
    for (f in items) {
        val key = WcFormat.dayKey(f.date)
        val last = out.lastOrNull()
        if (last != null && WcFormat.dayKey(last.second.first().date) == key) last.second.add(f)
        else out.add(WcFormat.day(f) to mutableListOf(f))
    }
    return out.map { it.first to it.second.toList() }
}

@Composable
private fun MatchRowCard(f: WcFixture, onOpenMatch: (Int) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
            .background(if (f.status.live) WcColors.liveRed.copy(alpha = 0.04f) else Color.Transparent)
            .clickable { onOpenMatch(f.id) }.padding(horizontal = 8.dp, vertical = 10.dp),
    ) {
        // الفائز يُحسب من الترجيح أيضًا (لا من علم المزوّد وحده) كي يُظلَّل في مباريات الترجيح.
        val penHome = f.penaltyOutcome?.winnerHome
        MatchTeamSide(f.home, home = true, win = penHome ?: (f.home.winner == true), modifier = Modifier.weight(1f))
        MatchScoreCenter(f, Modifier.width(50.dp))
        MatchTeamSide(f.away, home = false, win = penHome?.not() ?: (f.away.winner == true), modifier = Modifier.weight(1f))
    }
}

@Composable
private fun MatchTeamSide(team: WcTeam, home: Boolean, win: Boolean, modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (home) Arrangement.End else Arrangement.Start,
        modifier = modifier,
    ) {
        if (home) {
            Text(
                team.name,
                color = WcColors.onDark,
                fontSize = 12.sp,
                fontWeight = if (win) FontWeight.Black else FontWeight.SemiBold,
                maxLines = 1,
                textAlign = TextAlign.End,
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(6.dp))
            WcTeamLogo(team, size = 34)
        } else {
            WcTeamLogo(team, size = 34)
            Spacer(Modifier.width(6.dp))
            Text(
                team.name,
                color = WcColors.onDark,
                fontSize = 12.sp,
                fontWeight = if (win) FontWeight.Black else FontWeight.SemiBold,
                maxLines = 1,
                textAlign = TextAlign.Start,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun MatchScoreCenter(f: WcFixture, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier) {
        if (f.started) {
            LtrText("${f.goals.away ?: 0}-${f.goals.home ?: 0}", WcColors.onDark, 15, FontWeight.Black)
        } else {
            LtrText(WcFormat.time(f), WcColors.onDark, 13, FontWeight.Black)
        }
        Text(matchStatusText(f), color = matchStatusColor(f), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

private fun matchStatusText(f: WcFixture): String {
    if (f.status.live) {
        val e = f.status.elapsed ?: return f.status.label.ifEmpty { "مباشر" }
        val x = f.status.extra
        return if (x != null && x > 0) "$e+$x'" else "$e'"
    }
    f.penaltyOutcome?.let { return "ترجيح ${it.winnerScore}-${it.loserScore}" }
    if (f.status.finished) return "انتهت"
    return "موعد"
}

// تكيّفي مع الوضع الفاتح/الداكن: ألوان WcColors صارت getters بصيغة @Composable،
// فيجب وسم الدالة المستهلِكة لها بـ@Composable أيضًا (تُستدعى داخل MatchScoreCenter).
@Composable
private fun matchStatusColor(f: WcFixture): Color =
    when {
        f.status.live -> WcColors.liveRed
        f.penalties != null -> WcColors.emeraldDeep
        f.status.finished -> WcColors.onDarkDim
        else -> WcColors.onDarkDim.copy(alpha = 0.7f)
    }

// ---------- ترتيب المجموعات ----------

@Composable
private fun StandingsSection(groups: List<WcGroup>, isLoading: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.FormatListNumbered, "ترتيب المجموعات", "يتأهل الأول والثاني وأفضل 8 من أصحاب المركز الثالث")
        }
        when {
            isLoading -> WcLoading()
            groups.isEmpty() -> WcEmptyText("جداول الترتيب تظهر هنا فور انطلاق البطولة")
            else -> Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
                groups.forEach { GroupCard(it) }
            }
        }
    }
}

@Composable
private fun GroupCard(group: WcGroup) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(20.dp)).padding(14.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(group.group, color = WcColors.emerald, fontSize = 15.sp, fontWeight = FontWeight.Black)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("لعب", color = WcColors.onDarkDim, fontSize = 10.sp)
                Text("فارق", color = WcColors.onDarkDim, fontSize = 10.sp)
                Text("نقاط", color = WcColors.onDarkDim, fontSize = 10.sp)
            }
        }
        group.rows.forEach { StandingRow(it) }
    }
}

@Composable
private fun StandingRow(row: WcStandingRow) {
    val highlight = when {
        row.rank <= 2 -> WcColors.emeraldDeep.copy(alpha = 0.18f)
        row.rank == 3 -> WcColors.gold.copy(alpha = 0.16f)
        else -> Color.Transparent
    }
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(highlight).padding(vertical = 5.dp, horizontal = 6.dp),
    ) {
        Text("${row.rank}", color = WcColors.onDarkDim, fontSize = 12.sp, modifier = Modifier.width(16.dp), textAlign = TextAlign.Center)
        WcTeamLogo(row.team, size = 20)
        Text(row.team.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
        Text("${row.played}", color = WcColors.onDarkDim, fontSize = 12.sp, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
        LtrTextBox(if (row.goalsDiff > 0) "+${row.goalsDiff}" else "${row.goalsDiff}", WcColors.onDarkDim, 12, FontWeight.Normal, 36)
        Text("${row.points}", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
    }
}

@Composable
private fun LtrTextBox(text: String, color: Color, fontSize: Int, weight: FontWeight, width: Int) {
    Box(Modifier.width(width.dp), contentAlignment = Alignment.Center) {
        LtrText(text, color, fontSize, weight)
    }
}

// ---------- بطاقة نبض المباراة (ودجت حيّ) ----------

@Composable
fun WcPulseCard(p: WcPulse, goalFlash: Boolean, onOpen: (Int) -> Unit) {
    val highPulse = p.momentum.value > 70 && p.status.live
    // نبضة دائمة للحلقة الحيّة + التوهّج
    val infinite = rememberInfiniteTransition(label = "pulse")
    val glow by infinite.animateFloat(
        initialValue = 0.35f, targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(950),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "glow",
    )
    Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(20.dp))
                .background(Brush.linearGradient(listOf(WcColors.pitchTop, WcColors.pitchBottom)))
                .border(1.dp, WcColors.emerald.copy(alpha = if (highPulse) glow * 0.85f else 0.4f), RoundedCornerShape(20.dp))
                .clickable { onOpen(p.id) }
                .padding(16.dp),
        ) {
            // الصف العلوي: الجولة + شارة الحالة
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.Podcasts, null, tint = WcColors.emerald, modifier = Modifier.size(11.dp))
                Text(p.round.ifEmpty { "نبض المباراة" }, color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
                PulseStatusPill(p, glow)
            }
            // الفرق + النتيجة
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                PulseTeamCol(p.home, Modifier.weight(1f))
                LtrText("${p.score.home} - ${p.score.away}", Color.White, 30, FontWeight.Black)
                PulseTeamCol(p.away, Modifier.weight(1f))
            }
            if (p.status.live && p.momentum.home + p.momentum.away > 0) {
                PulseMomentum(p)
            }
            p.lastVar?.let { v -> PulseVarChip(p, v) }
        }
        if (goalFlash) {
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.align(Alignment.TopCenter)
                    .clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep).padding(horizontal = 14.dp, vertical = 6.dp),
            ) {
                Icon(Icons.Filled.SportsSoccer, null, tint = Color.White, modifier = Modifier.size(13.dp))
                Text("هدف!", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable
private fun PulseStatusPill(p: WcPulse, glow: Float) {
    when {
        p.status.live -> Row(
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
            modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.liveRed.copy(alpha = 0.25f)).padding(horizontal = 8.dp, vertical = 3.dp),
        ) {
            Box(Modifier.size(7.dp).clip(androidx.compose.foundation.shape.CircleShape).background(WcColors.liveRed.copy(alpha = glow)))
            LtrText(pulseLiveMinute(p), Color.White, 12, FontWeight.Black)
        }
        p.status.finished -> Text(
            p.status.label.ifEmpty { "انتهت" }, color = WcColors.liveRed, fontSize = 11.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.liveRed.copy(alpha = 0.20f)).padding(horizontal = 8.dp, vertical = 3.dp),
        )
        else -> {
            var now by remember { mutableStateOf(System.currentTimeMillis()) }
            androidx.compose.runtime.LaunchedEffect(p.id) {
                while (true) { now = System.currentTimeMillis(); kotlinx.coroutines.delay(1000) }
            }
            Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emerald.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 3.dp)) {
                LtrText("تبدأ بعد ${WcFormat.countdown(p.timestamp, now)}", WcColors.emerald, 11, FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun PulseTeamCol(side: WcPulseSide, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = modifier) {
        coil.compose.AsyncImage(model = side.logo, contentDescription = null, modifier = Modifier.size(46.dp))
        Text(side.name, color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center)
    }
}

@Composable
private fun PulseMomentum(p: WcPulse) {
    val m = p.momentum
    val total = (m.home + m.away).coerceAtLeast(1).toFloat()
    Column(verticalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Text("الزخم الهجومي", color = WcColors.emerald, fontSize = 10.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            if (m.leader != null && m.value > 0) {
                Text("${if (m.leader == "home") p.home.name else p.away.name} +${m.value}", color = Color.White.copy(alpha = 0.85f), fontSize = 10.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            }
        }
        // RTL: المضيف (زمردي) يمينًا، الضيف (ذهبي) يسارًا
        Row(modifier = Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(50))) {
            Box(Modifier.fillMaxWidth(m.home / total).fillMaxHeight().background(WcColors.emerald))
            Box(Modifier.weight(1f).fillMaxHeight().background(WcColors.gold.copy(alpha = 0.85f)))
        }
    }
}

@Composable
private fun PulseVarChip(p: WcPulse, v: WcPulseVar) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Color(0.55f, 0.40f, 0.85f, 0.18f)).padding(horizontal = 9.dp, vertical = 4.dp),
    ) {
        Icon(Icons.Filled.Tv, null, tint = Color(0.72f, 0.55f, 0.98f), modifier = Modifier.size(10.dp))
        Text(
            "مراجعة الفيديو (VAR) · د.${v.minute} · ${if (v.team == "home") p.home.name else p.away.name}",
            color = Color(0.72f, 0.55f, 0.98f), fontSize = 10.sp, fontWeight = FontWeight.SemiBold, maxLines = 1,
        )
    }
}

private fun pulseLiveMinute(p: WcPulse): String {
    val e = p.status.elapsed ?: 0
    val x = p.status.extra?.let { "+$it" } ?: ""
    return "د. $e$x"
}
