package com.sabq.smart.feature.worldcup

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.sabq.smart.ui.theme.IbmPlexSansArabic

// ---------- سباقات البطولة (هدافون/صنّاع/بطاقات) ----------

@Composable
fun RacesSection(state: WorldCupViewModel.UiState, viewModel: WorldCupViewModel) {
    var tab by remember { mutableStateOf("goals") }
    LaunchedEffect(tab) {
        if (tab == "assists") viewModel.loadAssists()
        if (tab == "cards") viewModel.loadCards()
    }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.EmojiEvents, "سباقات البطولة", "الحذاء الذهبي، صنّاع الأهداف، والبطاقات", tint = WcColors.gold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
            listOf("goals" to "الهدافون", "assists" to "صنّاع الأهداف", "cards" to "البطاقات").forEach { (key, label) ->
                val isSel = tab == key
                Text(label, color = if (isSel) Color.White else WcColors.onDarkDim, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(if (isSel) WcColors.gold else WcColors.chipFill)
                        .clickable { tab = key }.padding(horizontal = 12.dp, vertical = 7.dp))
            }
        }
        Box(Modifier.padding(horizontal = 16.dp)) {
            when (tab) {
                "goals" -> GoalsRace(state.scorers, state.scorersLoading)
                "assists" -> LeadersList(state.assists, "سباق صنّاع الأهداف ينطلق مع أول صافرة") { l ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("${l.goals} أهداف", color = WcColors.onDarkDim, fontSize = 12.sp)
                        Text("${l.assists}", color = WcColors.onDark, fontSize = 18.sp, fontWeight = FontWeight.Black)
                    }
                }
                else -> LeadersList(state.cards, "لا بطاقات بعد — وعسى ألا تكثر") { l ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        CardCount(l.yellow, WcColors.gold); CardCount(l.red, WcColors.liveRed)
                    }
                }
            }
        }
    }
}

@Composable
private fun GoalsRace(scorers: List<WcScorer>, loading: Boolean) {
    when {
        loading -> WcLoading()
        scorers.isEmpty() -> RaceEmpty("سباق الحذاء الذهبي ينطلق مع أول صافرة")
        else -> {
            val podium = scorers.take(3)
            val rest = scorers.drop(3)
            Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    if (podium.size > 1) Box(Modifier.weight(1f)) { Podium(podium[1], 1) } else Spacer(Modifier.weight(1f))
                    Box(Modifier.weight(1f)) { Podium(podium[0], 0) }
                    if (podium.size > 2) Box(Modifier.weight(1f)) { Podium(podium[2], 2) } else Spacer(Modifier.weight(1f))
                }
                rest.forEach { s ->
                    LeaderRow(s.rank, s.name, s.photo, s.team, s.minutes) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${s.assists} صناعة", color = WcColors.onDarkDim, fontSize = 12.sp)
                            Text("${s.goals}", color = WcColors.onDark, fontSize = 18.sp, fontWeight = FontWeight.Black)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Podium(scorer: WcScorer, place: Int) {
    val ring = listOf(WcColors.gold, Color(0.75f, 0.75f, 0.75f), Color(0.7f, 0.4f, 0.15f))[place]
    val size = if (place == 0) 84 else 64
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().padding(top = if (place == 0) 0.dp else 24.dp)) {
        Box(contentAlignment = Alignment.BottomCenter) {
            Box(modifier = Modifier.size(size.dp).clip(CircleShape).border(4.dp, ring, CircleShape)) {
                WcPlayerPhoto(scorer.photo, scorer.name, size)
            }
            Text("${place + 1}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(ring).padding(horizontal = 7.dp, vertical = 1.dp))
        }
        Text(scorer.name, color = WcColors.onDark, fontSize = if (place == 0) 15.sp else 13.sp, fontWeight = FontWeight.Black, maxLines = 1, textAlign = TextAlign.Center)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            WcTeamLogo(scorer.team, size = 14)
            Text(scorer.team.name, color = WcColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            Text("${scorer.goals}", color = if (place == 0) WcColors.gold else WcColors.onDark, fontSize = if (place == 0) 28.sp else 22.sp, fontWeight = FontWeight.Black)
            Text(if (scorer.goals == 1) "هدف" else "أهداف", color = WcColors.onDarkDim, fontSize = 11.sp)
        }
    }
}

@Composable
private fun LeadersList(leaders: List<WcLeader>, empty: String, trailing: @Composable (WcLeader) -> Unit) {
    if (leaders.isEmpty()) RaceEmpty(empty)
    else Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        leaders.forEach { l -> LeaderRow(l.rank, l.name, l.photo, l.team, l.minutes) { trailing(l) } }
    }
}

@Composable
private fun LeaderRow(rank: Int, name: String, photo: String, team: WcTeam, minutes: Int, trailing: @Composable () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text("$rank", color = WcColors.onDarkDim, fontSize = 13.sp, modifier = Modifier.width(20.dp), textAlign = TextAlign.Center)
        WcPlayerPhoto(photo, name, 36)
        Column(modifier = Modifier.weight(1f)) {
            Text(name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                WcTeamLogo(team, size = 12)
                Text(team.name, color = WcColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
            }
        }
        trailing()
    }
}

@Composable
private fun CardCount(n: Int, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(Modifier.size(width = 9.dp, height = 12.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Text("$n", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black)
    }
}

@Composable
private fun RaceEmpty(message: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(20.dp)).padding(vertical = 26.dp),
    ) {
        Icon(Icons.Filled.SportsSoccer, null, tint = WcColors.gold, modifier = Modifier.size(28.dp))
        Text(message, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Text("تابع هنا الترتيب أولًا بأول طوال البطولة", color = WcColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

// ---------- المنتخبات + قائمة المنتخب ----------

@Composable
fun TeamsSection(state: WorldCupViewModel.UiState, viewModel: WorldCupViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.Groups, "المنتخبات", "48 منتخبًا — اضغط على أي منتخب لعرض قائمته")
        }
        if (state.teamsLoading) WcLoading()
        else Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
            state.teams.chunked(4).forEach { row ->
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    row.forEach { team -> Box(Modifier.weight(1f)) { TeamTile(team) { viewModel.openSquad(team) } } }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
private fun TeamTile(team: WcTeam, onClick: () -> Unit) {
    val isSaudi = team.id == WC_SAUDI_TEAM_ID
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.card)
            .border(if (isSaudi) 2.dp else 0.5.dp, if (isSaudi) WcColors.emeraldDeep else WcColors.cardStroke, RoundedCornerShape(18.dp))
            .clickable { onClick() }.padding(vertical = 12.dp, horizontal = 6.dp),
    ) {
        WcTeamLogo(team, size = 38)
        Text(team.name, color = WcColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center)
        if (isSaudi) {
            Text("الأخضر", color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep).padding(horizontal = 6.dp, vertical = 1.dp))
        }
    }
}

@Composable
fun SquadDialog(team: WcTeam, squad: WcSquad?, loading: Boolean, onDismiss: () -> Unit) {
    val sections = listOf("Goalkeeper" to "حراسة المرمى", "Defender" to "الدفاع", "Midfielder" to "الوسط", "Attacker" to "الهجوم")
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
            Column(
                modifier = Modifier.fillMaxWidth(0.92f).clip(RoundedCornerShape(24.dp)).background(WcColors.stadiumMid)
                    .border(1.dp, WcColors.cardStroke, RoundedCornerShape(24.dp)).padding(18.dp).height(560.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    WcTeamLogo(team, size = 34)
                    Text("قائمة ${team.name}", color = WcColors.onDark, fontSize = 17.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("✕", color = WcColors.onDark, fontSize = 18.sp, modifier = Modifier.clip(RoundedCornerShape(50)).clickable { onDismiss() }.padding(8.dp))
                }
                Spacer(Modifier.height(12.dp))
                when {
                    loading -> WcLoading()
                    squad == null || squad.players.isEmpty() -> WcEmptyText("القائمة الرسمية لم تُعلن بعد")
                    else -> Column(verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.verticalScroll(rememberScrollState())) {
                        sections.forEach { (en, label) ->
                            val players = squad.players.filter { it.positionEn == en }
                            if (players.isNotEmpty()) {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(label, color = WcColors.emerald, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                                    players.forEach { SquadPlayerRow(it) }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SquadPlayerRow(p: WcSquadPlayer) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        WcPlayerPhoto(p.photo, p.name, 36)
        Column(modifier = Modifier.weight(1f)) {
            Text(p.name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            p.age?.let { Text("$it سنة", color = WcColors.onDarkDim, fontSize = 10.sp) }
        }
        Text(p.number?.toString() ?: "—", color = WcColors.onDarkDim, fontSize = 15.sp, fontWeight = FontWeight.Black)
    }
}
