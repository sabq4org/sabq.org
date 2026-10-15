package com.sabq.smart.feature.roshn

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import java.util.Locale

// مركز مباراة دوري روشن — port ‏1:1 لـiOS `RoshnMatchCenter.swift`:
// ترويسة النتيجة بتحديث لحظي (نبض 8 ثوانٍ للحية في الـViewModel)، وتبويبات
// الأحداث/الإحصائيات/التشكيلات/التقييمات. iOS يعرضه كورقة (sheet) بينما
// أندرويد وجهة كاملة — نفس عرف بقية مراكز مباريات التطبيق (اختلاف منصة مقصود).

private enum class RsMatchTab(val label: String) {
    EVENTS("الأحداث"), STATS("الإحصائيات"), LINEUPS("التشكيلات"), RATINGS("التقييمات")
}

@Composable
fun RoshnMatchScreen(
    fixtureId: Int,
    onBack: () -> Unit,
    onOpenTeam: (RsTeam) -> Unit,
    viewModel: RoshnMatchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(RsMatchTab.EVENTS) }
    LaunchedEffect(fixtureId) { viewModel.load(fixtureId) }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(RoshnColors.canvas)) {
            RoshnHeader("مركز المباراة", onBack)
            val detail = state.detail
            when {
                detail == null && state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = RoshnColors.sky)
                }
                detail == null -> MatchError(state.error ?: "تعذّر الاتصال بمصدر المباراة") { viewModel.load(fixtureId) }
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    item { MatchHeader(detail, onOpenTeam) }
                    item {
                        MatchTabBar(tab) { selected ->
                            tab = selected
                            if (selected == RsMatchTab.RATINGS) viewModel.requestRatings(fixtureId)
                        }
                    }
                    when (tab) {
                        RsMatchTab.EVENTS -> eventsTab(detail)
                        RsMatchTab.STATS -> item { StatsCard(detail) }
                        RsMatchTab.LINEUPS -> lineupsTab(detail)
                        RsMatchTab.RATINGS -> ratingsTab(state, fixtureId, viewModel)
                    }
                }
            }
        }
    }
}

// ── الترويسة ──

@Composable
private fun MatchHeader(d: RsMatchDetail, onOpenTeam: (RsTeam) -> Unit) {
    Box(
        modifier = Modifier.fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(22.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(22.dp))
            .background(RoshnColors.hero),
    ) {
        // خط الهوية الذهبي أعلى البطاقة بعرضها — لمسة التتويج المميزة.
        Box(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 40.dp)
                .height(3.dp).clip(RoundedCornerShape(2.dp)).background(RoshnColors.gold),
        )
        Column(
            Modifier.padding(vertical = 18.dp, horizontal = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MatchTeamColumn(d.fixture.home, Modifier.weight(1f)) { onOpenTeam(d.fixture.home) }
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.width(96.dp)) {
                    if (d.fixture.started) {
                        RsLtrText("${d.fixture.goals.away ?: 0} - ${d.fixture.goals.home ?: 0}", RoshnColors.heroOn, 30)
                    } else {
                        Text(RsFormat.time(d.fixture), color = RoshnColors.heroOn, fontSize = 22.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    }
                    MatchStatusChip(d.fixture)
                }
                MatchTeamColumn(d.fixture.away, Modifier.weight(1f)) { onOpenTeam(d.fixture.away) }
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text("${RsFormat.day(d.fixture)} · ${RsFormat.time(d.fixture)}", color = RoshnColors.heroOnSoft, fontSize = 10.sp)
                val meta = listOf(d.fixture.round, d.fixture.venue.name).filter { it.isNotEmpty() }.joinToString(" · ")
                if (meta.isNotEmpty()) {
                    Text(meta, color = RoshnColors.heroOnSoft.copy(alpha = 0.9f), fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun MatchTeamColumn(team: RsTeam, modifier: Modifier, onOpen: () -> Unit) {
    Column(
        modifier.clickable(onClick = onOpen),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        RsTeamLogo(team.logo, size = 58, padding = 5)
        Text(
            team.name, color = RoshnColors.heroOn, fontSize = 13.sp, fontWeight = FontWeight.Bold,
            maxLines = 2, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun MatchStatusChip(f: RsFixture) {
    if (f.status.live) {
        Row(
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
            modifier = Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.liveRed).padding(horizontal = 11.dp, vertical = 5.dp),
        ) {
            Box(Modifier.size(5.dp).clip(CircleShape).background(Color.White))
            RsLtrText(rsLiveMinute(f.status) ?: f.status.label, Color.White, 11)
        }
    } else {
        Text(
            f.status.label.ifEmpty { "قادمة" }, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Medium,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.heroChip)
                .padding(horizontal = 11.dp, vertical = 5.dp),
        )
    }
}

@Composable
private fun MatchTabBar(selected: RsMatchTab, onSelect: (RsMatchTab) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        RsMatchTab.entries.forEach { item ->
            val active = item == selected
            Box(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(11.dp))
                    .background(if (active) RoshnColors.sky else RoshnColors.skySoft.copy(alpha = 0.6f))
                    .clickable { onSelect(item) }.padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    item.label, color = if (active) Color.White else RoshnColors.inkSoft,
                    fontSize = 12.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Normal, maxLines = 1,
                )
            }
        }
    }
}

// ── الأحداث ──

private fun androidx.compose.foundation.lazy.LazyListScope.eventsTab(d: RsMatchDetail) {
    if (d.events.isEmpty()) {
        item {
            RsEmptyState(if (d.fixture.started) "لا أحداث مسجّلة لهذه المباراة" else "الأحداث تتوالى هنا لحظة بلحظة مع الانطلاقة")
        }
    } else {
        val sorted = d.events.sortedWith(compareByDescending<RsMatchEvent> { it.minute ?: 0 }.thenByDescending { it.extra ?: 0 })
        items(sorted) { ev -> EventRow(ev, d) }
    }
}

@Composable
private fun EventRow(ev: RsMatchEvent, d: RsMatchDetail) {
    val isGoal = ev.type == "goal"
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(13.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(13.dp))
            .background(if (isGoal) RoshnColors.pitchSoft else RoshnColors.card)
            .padding(horizontal = 12.dp, vertical = 9.dp),
    ) {
        Box(Modifier.width(42.dp), contentAlignment = Alignment.Center) {
            RsLtrText(ev.minuteLabel, RoshnColors.inkSoft, 11)
        }
        EventIcon(ev.type)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(ev.player, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            val assist = ev.assist?.takeIf { it.isNotEmpty() }?.let { " · بمساعدة $it" } ?: ""
            Text("${ev.label}$assist", color = RoshnColors.inkSoft, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(
            if (ev.teamId == d.fixture.home.id) d.fixture.home.name else d.fixture.away.name,
            color = RoshnColors.inkSoft, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(76.dp), textAlign = TextAlign.End,
        )
    }
}

@Composable
private fun EventIcon(type: String) {
    Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) {
        when (type) {
            "goal" -> Text("⚽", fontSize = 13.sp)
            "yellow-card" -> Box(Modifier.size(width = 10.dp, height = 14.dp).clip(RoundedCornerShape(2.dp)).background(Color(0xFFF2C94C)))
            "red-card" -> Box(Modifier.size(width = 10.dp, height = 14.dp).clip(RoundedCornerShape(2.dp)).background(RoshnColors.liveRed))
            "substitution" -> Text("⇄", color = RoshnColors.sky, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            else -> Text(if (type.lowercase().contains("var")) "📺" else "•", color = RoshnColors.inkSoft, fontSize = 12.sp)
        }
    }
}

// ── الإحصائيات ──

@Composable
private fun StatsCard(d: RsMatchDetail) {
    val rows = d.statistics?.rows ?: emptyList()
    if (rows.isEmpty()) {
        RsEmptyState(
            if (d.fixture.status.live) "أرقام المباراة تتجمّع الآن — تظهر تباعًا خلال الشوط الأول"
            else "لا تتوفّر إحصاءات لهذه المباراة بعد",
        )
        return
    }
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(16.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(16.dp)).background(RoshnColors.card).padding(14.dp),
    ) {
        rows.forEach { row -> StatBar(row) }
    }
}

@Composable
private fun StatBar(row: RsStatRow) {
    val h = row.homeText.replace("%", "").toDoubleOrNull() ?: 0.0
    val a = row.awayText.replace("%", "").toDoubleOrNull() ?: 0.0
    val total = (h + a).coerceAtLeast(0.001)
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(row.homeText, color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text(row.label, color = RoshnColors.inkSoft, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            Text(row.awayText, color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        // بلا قلب اتجاه: الصفّ أعلاه RTL (المضيف يمينًا) والشريط يتبعه —
        // فرضُ LTR كان يعكس عمودَي المضيف والضيف تحت رقميهما (قاعدة المالك).
        Row(Modifier.fillMaxWidth().height(5.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            val homeWeight = (h / total).toFloat().coerceAtLeast(0.02f)
            val awayWeight = (a / total).toFloat().coerceAtLeast(0.02f)
            Box(Modifier.weight(homeWeight).fillMaxSize().clip(RoundedCornerShape(2.dp)).background(RoshnColors.sky))
            Box(Modifier.weight(awayWeight).fillMaxSize().clip(RoundedCornerShape(2.dp)).background(RoshnColors.gold.copy(alpha = 0.75f)))
        }
    }
}

// ── التشكيلات ──

private fun androidx.compose.foundation.lazy.LazyListScope.lineupsTab(d: RsMatchDetail) {
    if (d.lineups.isEmpty()) {
        item { RsEmptyState("التشكيلات تُعلن قبل انطلاق المباراة بنحو ساعة عادةً") }
    } else {
        items(d.lineups, key = { "lineup-${it.team.id}" }) { lineup -> LineupCard(lineup) }
    }
}

@Composable
private fun LineupCard(lineup: RsLineup) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(16.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(16.dp)).background(RoshnColors.card).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RsTeamLogo(lineup.team.logo, size = 28, padding = 2)
            Text(lineup.team.name, color = RoshnColors.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            lineup.formation?.let { formation ->
                Box(Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.skySoft).padding(horizontal = 8.dp, vertical = 4.dp)) {
                    RsLtrText(formation, RoshnColors.sky, 11)
                }
            }
        }
        lineup.coach?.takeIf { it.isNotEmpty() }?.let {
            Text("المدرب: $it", color = RoshnColors.inkSoft, fontSize = 11.sp)
        }
        PlayerGroup("التشكيلة الأساسية", lineup.startXI, RoshnColors.pitch)
        if (lineup.substitutes.isNotEmpty()) {
            PlayerGroup("البدلاء", lineup.substitutes, RoshnColors.inkSoft)
        }
    }
}

@Composable
private fun PlayerGroup(title: String, players: List<RsLineupPlayer>, accent: Color) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, color = accent, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        players.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                pair.forEach { p ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        Box(
                            Modifier.size(22.dp).clip(CircleShape).background(RoshnColors.skySoft),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(p.number?.toString() ?: "–", color = RoshnColors.sky, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(p.name, color = RoshnColors.ink, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ── التقييمات ──

private fun androidx.compose.foundation.lazy.LazyListScope.ratingsTab(
    state: RoshnMatchViewModel.State,
    fixtureId: Int,
    viewModel: RoshnMatchViewModel,
) {
    val ratings = state.ratings
    when {
        ratings != null && ratings.players.isEmpty() -> item { RsEmptyState("لا تتوفّر تقييمات لهذه المباراة") }
        ratings != null -> {
            ratings.motm?.let { motm ->
                item {
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(RoshnColors.goldSoft).padding(12.dp),
                    ) {
                        Text("👑", fontSize = 16.sp)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text("رجل المباراة", color = RoshnColors.gold, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            Text(motm.name, color = RoshnColors.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                        RatingBadge(motm.rating)
                    }
                }
            }
            items(ratings.players, key = { "rate-${it.id}" }) { p -> RatedPlayerRow(p) }
        }
        state.ratingsError != null -> item {
            Column(
                Modifier.fillMaxWidth().padding(vertical = 30.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(state.ratingsError, color = RoshnColors.inkSoft, fontSize = 12.sp, textAlign = TextAlign.Center)
                TextButton(onClick = { viewModel.requestRatings(fixtureId, force = true) }) {
                    Text("إعادة المحاولة", color = RoshnColors.sky, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        state.ratingsRequested -> item {
            Box(Modifier.fillMaxWidth().padding(vertical = 30.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = RoshnColors.sky)
            }
        }
        else -> item { RsEmptyState("التقييمات تظهر بعد انطلاق المباراة") }
    }
}

@Composable
private fun RatedPlayerRow(p: RsRatedPlayer) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(13.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(13.dp)).background(RoshnColors.card)
            .padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        AsyncImage(
            model = p.photo, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(32.dp).clip(CircleShape).background(RoshnColors.skySoft),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(p.name, color = RoshnColors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (p.captain) Text("(ق)", color = RoshnColors.gold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
            val parts = buildList {
                add(p.team)
                if (p.pos.isNotEmpty()) add(p.pos)
                if (p.minutes > 0) add("${p.minutes}′")
                if (p.goals > 0) add("⚽ ${p.goals}")
                if (p.assists > 0) add("🅰 ${p.assists}")
            }
            Text(parts.joinToString(" · "), color = RoshnColors.inkSoft, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        p.rating?.let { RatingBadge(it) }
    }
}

@Composable
private fun RatingBadge(rating: Double) {
    val color = when {
        rating >= 7.5 -> RoshnColors.pitch
        rating >= 6.5 -> RoshnColors.sky
        rating >= 6.0 -> RoshnColors.gold
        else -> RoshnColors.liveRed
    }
    Box(Modifier.clip(RoundedCornerShape(8.dp)).background(color).padding(horizontal = 8.dp, vertical = 4.dp)) {
        RsLtrText(String.format(Locale.US, "%.1f", rating), Color.White, 12)
    }
}

// ── الأخطاء ──

@Composable
private fun MatchError(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 54.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("تعذّر فتح مركز المباراة", color = RoshnColors.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        Text(message, color = RoshnColors.inkSoft, fontSize = 12.sp, textAlign = TextAlign.Center)
        Text(
            "إعادة المحاولة", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.sky)
                .clickable(onClick = onRetry).padding(horizontal = 18.dp, vertical = 10.dp),
        )
    }
}
