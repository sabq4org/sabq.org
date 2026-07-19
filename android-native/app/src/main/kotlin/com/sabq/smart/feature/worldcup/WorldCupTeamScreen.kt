package com.sabq.smart.feature.worldcup

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.HealthAndSafety
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material.icons.filled.Stadium
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

@Composable
fun WorldCupTeamScreen(
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    onRequireLogin: () -> Unit,
    viewModel: WorldCupTeamViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Box(modifier = Modifier.fillMaxSize().background(WcColors.sectionBackground)) {
                Column(modifier = Modifier.fillMaxSize()) {
                    Row(
                        modifier = Modifier.fillMaxWidth().background(WcColors.stadiumTop).statusBarsPadding().padding(horizontal = 8.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", tint = Color.White)
                        }
                        Spacer(Modifier.weight(1f))
                        Text(state.headerTeam.name, color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                        Spacer(Modifier.weight(1f))
                        WcTeamLogo(state.headerTeam, size = 30)
                    }

                    if (state.loading && state.profile == null) {
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = WcColors.emerald, strokeWidth = 2.dp)
                        }
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                            verticalArrangement = Arrangement.spacedBy(22.dp),
                        ) {
                            item { HeaderCard(state) }
                            item { FollowBar(state, viewModel::toggleFollow, viewModel::openAlertPrefs, onRequireLogin) }
                            item { QuickFacts(state.profile) }
                            state.profile?.group?.takeIf { it.rows.isNotEmpty() }?.let { group ->
                                item { GroupTable(group, state.teamId, viewModel::switchTeam) }
                            }
                            state.profile?.coachInfo?.let { item { CoachCard(it) } }
                            state.profile?.venue?.let { item { VenueCard(it) } }
                            state.profile?.injuries?.takeIf { it.isNotEmpty() }?.let { item { InjuriesSection(it) } }
                            state.profile?.seasonStats?.takeIf { it.available && it.items.isNotEmpty() }?.let { item { SeasonStatsSection(it) } }
                            item { MatchesGroup(state.profile?.fixtures ?: emptyList(), onOpenMatch) }
                            item { SquadByPosition(state.profile?.squad ?: emptyList(), viewModel::openPlayer) }
                        }
                    }
                }

                if (state.selectedPlayerId != null) {
                    PlayerCardDialog(card = state.playerCard, loading = state.playerLoading, onDismiss = viewModel::closePlayer)
                }
                if (state.showAlertPrefs) {
                    AlertPrefsSheet(state.alertPrefs, viewModel::saveAlertPrefs, viewModel::closeAlertPrefs)
                }
            }
        }
}

// ---------- الترويسة ----------

@Composable
private fun HeaderCard(state: WorldCupTeamViewModel.UiState) {
    val team = state.headerTeam
    val isSaudi = state.profile?.isSaudi ?: (team.id == WC_SAUDI_TEAM_ID)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp))
            .background(Brush.linearGradient(listOf(WcColors.heroTop, WcColors.heroBottom)))
            .padding(16.dp),
    ) {
        WcTeamLogo(team, size = 72)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(team.name, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Black, maxLines = 1)
                if (isSaudi) {
                    Text("الأخضر", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep).padding(horizontal = 8.dp, vertical = 2.dp))
                }
            }
            state.profile?.group?.let {
                Text(it.group, color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 12.sp)
            }
            state.profile?.coach?.takeIf { it.isNotEmpty() }?.let {
                Text("المدرّب: $it", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, maxLines = 1)
            }
        }
    }
}

// ---------- متابعة التنبيهات ----------

@Composable
private fun FollowBar(
    state: WorldCupTeamViewModel.UiState,
    onToggle: () -> Unit,
    onOpenPrefs: () -> Unit,
    onRequireLogin: () -> Unit,
) {
    val following = state.isFollowing
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
            modifier = Modifier.clip(RoundedCornerShape(50))
                .background(if (following) WcColors.emeraldDeep else WcColors.emerald.copy(alpha = 0.14f))
                .clickable(enabled = !state.followBusy) { if (state.isLoggedIn) onToggle() else onRequireLogin() }
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            if (state.followBusy) {
                CircularProgressIndicator(color = if (following) Color.White else WcColors.emeraldDeep, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
            } else {
                Icon(
                    if (following) Icons.Filled.NotificationsActive else Icons.Filled.Notifications,
                    null, tint = if (following) Color.White else WcColors.emeraldDeep, modifier = Modifier.size(16.dp),
                )
            }
            Text(if (following) "تتابع التنبيهات" else "تابع التنبيهات",
                color = if (following) Color.White else WcColors.emeraldDeep, fontSize = 13.sp, fontWeight = FontWeight.Black)
        }
        if (following) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.clip(RoundedCornerShape(50))
                    .border(1.dp, WcColors.emeraldDeep.copy(alpha = 0.35f), RoundedCornerShape(50))
                    .clickable { onOpenPrefs() }.padding(horizontal = 14.dp, vertical = 10.dp),
            ) {
                Icon(Icons.Filled.Tune, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(14.dp))
                Text("نوع التنبيهات", color = WcColors.emeraldDeep, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ---------- حقائق سريعة ----------

@Composable
private fun QuickFacts(profile: WcTeamProfile?) {
    val facts = buildList {
        profile?.fifaRank?.let { add(Triple("#${it.rank}", "تصنيف فيفا", WcColors.emeraldDeep)) }
        profile?.extra?.marketValue?.let { add(Triple(formatMarketValue(it, profile.extra?.marketValueCurrency ?: "€"), "القيمة السوقية", WcColors.gold)) }
        profile?.extra?.foundation?.let { add(Triple("$it", "التأسيس", null)) }
        profile?.extra?.squadSize?.let { add(Triple("$it", "حجم القائمة", null)) }
    }
    if (facts.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        facts.forEach { (value, label, accent) ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(WcColors.card)
                    .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
                    .padding(vertical = 9.dp, horizontal = 6.dp),
            ) {
                LtrText(value, accent ?: WcColors.onDark, 15, FontWeight.Black)
                Text(label, color = WcColors.onDarkDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

private fun formatMarketValue(value: Double, currency: String): String = when {
    value >= 1_000_000_000 -> "$currency${String.format(java.util.Locale.US, "%.1f", value / 1_000_000_000)}B"
    value >= 1_000_000 -> "$currency${(value / 1_000_000).toInt()}M"
    value >= 1_000 -> "$currency${(value / 1_000).toInt()}K"
    else -> "$currency${value.toInt()}"
}

// ---------- ترتيب المجموعة ----------

@Composable
private fun GroupTable(group: WcGroup, currentTeamId: Int, onSwitch: (WcTeam) -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(20.dp)).padding(14.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(group.group, color = WcColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Black)
            Row {
                Text("لعب", color = WcColors.onDarkDim, fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.width(28.dp))
                Text("فارق", color = WcColors.onDarkDim, fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.width(36.dp))
                Text("نقاط", color = WcColors.onDarkDim, fontSize = 10.sp, textAlign = TextAlign.Center, modifier = Modifier.width(28.dp))
            }
        }
        group.rows.forEach { row -> GroupRow(row, currentTeamId, onSwitch) }
    }
}

@Composable
private fun GroupRow(row: WcStandingRow, currentTeamId: Int, onSwitch: (WcTeam) -> Unit) {
    val isCurrent = row.team.id == currentTeamId
    val highlight = when {
        isCurrent -> WcColors.emeraldDeep.copy(alpha = 0.16f)
        row.rank <= 2 -> WcColors.emeraldDeep.copy(alpha = 0.10f)
        row.rank == 3 -> WcColors.gold.copy(alpha = 0.10f)
        else -> Color.Transparent
    }
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(highlight)
            .clickable(enabled = !isCurrent && row.team.id > 0) { onSwitch(row.team) }
            .padding(vertical = 5.dp, horizontal = 6.dp),
    ) {
        Text("${row.rank}", color = WcColors.onDarkDim, fontSize = 12.sp, modifier = Modifier.width(16.dp), textAlign = TextAlign.Center)
        WcTeamLogo(row.team, size = 20)
        Text(row.team.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = if (isCurrent) FontWeight.Black else FontWeight.SemiBold, maxLines = 1, modifier = Modifier.weight(1f))
        Text("${row.played}", color = WcColors.onDarkDim, fontSize = 12.sp, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
        Box(Modifier.width(36.dp), contentAlignment = Alignment.Center) {
            LtrText(if (row.goalsDiff > 0) "+${row.goalsDiff}" else "${row.goalsDiff}", WcColors.onDarkDim, 12, FontWeight.Normal)
        }
        Text("${row.points}", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
    }
}

// ---------- المدرّب ----------

@Composable
private fun CoachCard(c: WcCoachInfo) {
    InfoCard {
        if (c.photo.isBlank()) {
            Box(Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(WcColors.chipFill), contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Person, null, tint = WcColors.onDarkDim, modifier = Modifier.size(30.dp))
            }
        } else {
            AsyncImage(model = c.photo, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)))
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
            Text("المدرّب", color = WcColors.emerald, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(c.name, color = WcColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Black, maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                c.formation?.takeIf { it.isNotEmpty() }?.let {
                    Box(Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 8.dp, vertical = 2.dp)) {
                        LtrText(it, WcColors.onDark, 11, FontWeight.Bold)
                    }
                }
                c.nationality?.takeIf { it.isNotEmpty() }?.let { Text(it, color = WcColors.onDarkDim, fontSize = 11.sp) }
                c.age?.let { Text("$it سنة", color = WcColors.onDarkDim, fontSize = 11.sp) }
            }
        }
    }
}

// ---------- الملعب ----------

@Composable
private fun VenueCard(v: WcVenueInfo) {
    InfoCard {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).background(WcColors.chipFill), contentAlignment = Alignment.Center) {
            Icon(Icons.Filled.Stadium, null, tint = WcColors.emerald, modifier = Modifier.size(22.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
            Text("الملعب", color = WcColors.emerald, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Text(v.name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val place = listOfNotNull(v.city.takeIf { it.isNotEmpty() }, v.country?.takeIf { it.isNotEmpty() }).joinToString("، ")
                if (place.isNotEmpty()) Text(place, color = WcColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
                v.capacity?.let {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                        Icon(Icons.Filled.Person, null, tint = WcColors.onDarkDim, modifier = Modifier.size(9.dp))
                        LtrText("$it", WcColors.onDarkDim, 11, FontWeight.Normal)
                    }
                }
            }
        }
    }
}

@Composable
private fun InfoCard(content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(18.dp)).padding(14.dp),
        content = content,
    )
}

// ---------- الإصابات والغيابات ----------

@Composable
private fun InjuriesSection(injuries: List<WcInjury>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.HealthAndSafety, null, tint = WcColors.liveRed, modifier = Modifier.size(15.dp))
            Text("الإصابات والغيابات", color = WcColors.liveRed, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        injuries.forEach { inj ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(WcColors.liveRed.copy(alpha = 0.8f)))
                Column(modifier = Modifier.weight(1f)) {
                    Text(inj.player, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    val detail = listOfNotNull(inj.status?.takeIf { it.isNotEmpty() }, inj.reason?.takeIf { it.isNotEmpty() }).joinToString(" · ")
                    if (detail.isNotEmpty()) Text(detail, color = WcColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
                }
                inj.until?.takeIf { it.isNotEmpty() }?.let { Text("العودة: $it", color = WcColors.onDarkDim, fontSize = 10.sp) }
            }
        }
    }
}

// ---------- أرقام المنتخب في البطولة ----------

@Composable
private fun SeasonStatsSection(s: WcTeamSeasonStats) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.QueryStats, null, tint = WcColors.emerald, modifier = Modifier.size(15.dp))
            Text("أرقام المنتخب في البطولة", color = WcColors.emerald, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            if (s.matches > 0) {
                Text("${s.matches} مباراة", color = WcColors.onDarkDim, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 7.dp, vertical = 2.dp))
            }
        }
        s.items.chunked(3).forEach { rowItems ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                rowItems.forEach { item ->
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).background(WcColors.card)
                            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(12.dp)).padding(vertical = 10.dp, horizontal = 6.dp),
                    ) {
                        LtrText(item.display, WcColors.onDark, 16, FontWeight.Black)
                        Text(item.label, color = WcColors.onDarkDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                    }
                }
                repeat(3 - rowItems.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

// ---------- المباريات ----------

@Composable
private fun MatchesGroup(fixtures: List<WcFixture>, onOpenMatch: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Text("المباريات", color = WcColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        if (fixtures.isEmpty()) {
            Text("لا توجد مباريات معلنة لهذا المنتخب بعد", color = WcColors.onDarkDim, fontSize = 13.sp,
                modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), textAlign = TextAlign.Center)
            return
        }
        val live = fixtures.filter { it.status.live }
        val upcoming = fixtures.filter { !it.status.live && !it.status.finished }
        val finished = fixtures.filter { it.status.finished }.reversed()
        MatchSubgroup("مباشر الآن", live, onOpenMatch)
        MatchSubgroup("المباريات القادمة", upcoming, onOpenMatch)
        MatchSubgroup("النتائج", finished, onOpenMatch)
    }
}

@Composable
private fun MatchSubgroup(label: String, fixtures: List<WcFixture>, onOpenMatch: (Int) -> Unit) {
    if (fixtures.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(7.dp).clip(CircleShape).background(WcColors.emeraldDeep))
            Text(label, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            Text("(${fixtures.size})", color = WcColors.onDarkDim, fontSize = 12.sp)
        }
        fixtures.forEach { f -> TeamMatchCard(f, onOpenMatch) }
    }
}

@Composable
private fun TeamMatchCard(f: WcFixture, onOpenMatch: (Int) -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
            .clickable { onOpenMatch(f.id) }.padding(12.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(f.round, color = WcColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            WcStatusPill(f)
        }
        TeamMatchRow(f.home, if (f.started) f.goals.home ?: 0 else null, f.home.winner == true)
        TeamMatchRow(f.away, if (f.started) f.goals.away ?: 0 else null, f.away.winner == true)
    }
}

@Composable
private fun TeamMatchRow(team: WcTeam, goals: Int?, win: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        WcTeamLogo(team, size = 24)
        Text(team.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = if (win) FontWeight.Black else FontWeight.SemiBold, modifier = Modifier.weight(1f))
        if (goals != null) Text("$goals", color = if (win) WcColors.emerald else WcColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Black)
    }
}

// ---------- القائمة حسب المركز ----------

@Composable
private fun SquadByPosition(squad: List<WcSquadPlayer>, onOpenPlayer: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.Groups, null, tint = WcColors.onDark, modifier = Modifier.size(16.dp))
            Text("القائمة", color = WcColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold)
        }
        if (squad.isEmpty()) {
            Text("القائمة الرسمية لم تُعلن بعد", color = WcColors.onDarkDim, fontSize = 13.sp,
                modifier = Modifier.fillMaxWidth().padding(vertical = 20.dp), textAlign = TextAlign.Center)
            return
        }
        listOf("Goalkeeper" to "حراسة المرمى", "Defender" to "الدفاع", "Midfielder" to "الوسط", "Attacker" to "الهجوم").forEach { (en, label) ->
            val players = squad.filter { it.positionEn == en }
            if (players.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(label, color = WcColors.emeraldDeep, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                    players.forEach { p -> SquadRow(p, onOpenPlayer) }
                }
            }
        }
    }
}

@Composable
private fun SquadRow(p: WcSquadPlayer, onOpenPlayer: (Int) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card)
            .clickable(enabled = p.id > 0) { onOpenPlayer(p.id) }.padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        WcPlayerPhoto(p.photo, p.name, 36)
        Column(modifier = Modifier.weight(1f)) {
            Text(p.name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            p.age?.let { Text("$it سنة", color = WcColors.onDarkDim, fontSize = 10.sp) }
        }
        Text(p.number?.toString() ?: "—", color = WcColors.onDarkDim, fontSize = 15.sp, fontWeight = FontWeight.Black)
    }
}

// ---------- نافذة أنواع التنبيهات ----------

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun AlertPrefsSheet(prefs: SportsAlertPreferences, onSave: (SportsAlertPreferences) -> Unit, onDismiss: () -> Unit) {
    androidx.compose.material3.ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = WcColors.stadiumMid,
        dragHandle = { WcSheetHandle() },
    ) {
        ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
            Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text("نوع التنبيهات", color = WcColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, "إغلاق", tint = WcColors.onDark) }
                }
                Text("اختر الأحداث التي تريد إشعارًا بها لهذا المنتخب", color = WcColors.onDarkDim, fontSize = 12.sp)
                Spacer(Modifier.height(8.dp))
                AlertToggle("صافرة البداية", prefs.kickoff) { onSave(prefs.copy(kickoff = it)) }
                AlertToggle("الأهداف", prefs.goals) { onSave(prefs.copy(goals = it)) }
                AlertToggle("البطاقات", prefs.cards) { onSave(prefs.copy(cards = it)) }
                AlertToggle("مراجعة الـVAR", prefs.varReview) { onSave(prefs.copy(varReview = it)) }
                AlertToggle("صافرة النهاية", prefs.fulltime) { onSave(prefs.copy(fulltime = it)) }
            }
        }
    }
}

@Composable
private fun AlertToggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card)
            .clickable { onChange(!checked) }.padding(horizontal = 14.dp, vertical = 6.dp),
    ) {
        Text(label, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
        Switch(
            checked = checked, onCheckedChange = onChange,
            colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = WcColors.emeraldDeep),
        )
    }
}
