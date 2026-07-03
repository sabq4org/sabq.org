package com.sabq.smart.feature.worldcup

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlin.math.roundToInt

// أوزان المبادر — كلّما ثبّتَّ أبكر كبُرت حصّتك (يطابق iOS/الويب).
private data class WeightTier(val id: String, val label: String, val mult: String)
private val weightTiers = listOf(
    WeightTier("r32", "حتى دور الـ16", "×1.0"),
    WeightTier("r16", "دور الـ16", "×0.6"),
    WeightTier("qf", "ربع النهائي", "×0.3"),
)

/**
 * تبويب «توقّع البطل» — توقّع بطل المونديال (مرجّح بوزن المبادر، يُغلق عند نصف
 * النهائي) وتوقّع هدّاف البطولة (يُقسَّم بالتساوي، يُغلق عند ربع النهائي).
 * نظير WCPredTournamentTab على iOS و WcLongPredictions على الويب.
 */
@Composable
fun TournamentTab(
    state: WorldCupPredictionsViewModel.UiState,
    viewModel: WorldCupPredictionsViewModel,
    onRequireLogin: () -> Unit,
) {
    state.toast?.let {
        LaunchedEffect(it) {
            kotlinx.coroutines.delay(2500)
            viewModel.clearToast()
        }
    }
    when {
        state.longLoading -> WcLoading()
        state.long == null -> TournamentUnavailable()
        else -> {
            val data = state.long
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                state.toast?.let { toast ->
                    item {
                        Text(toast, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WcColors.emeraldDeep).padding(vertical = 9.dp))
                    }
                }
                item { HowItWorksCard(data) }
                item { ChampionSection(data, state, viewModel, onRequireLogin) }
                item { ScorerSection(data, state, viewModel, onRequireLogin) }
            }
        }
    }
}

@Composable
private fun TournamentUnavailable() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().padding(40.dp),
    ) {
        Icon(Icons.Filled.EmojiEvents, null, tint = WcColors.onDarkDim.copy(alpha = 0.5f), modifier = Modifier.size(34.dp))
        Text("توقّعات البطولة قيد الإطلاق", color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Text("عُد قريبًا — توقّع البطل والهدّاف واربح آلاف النقاط.", color = WcColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center)
    }
}

// ---------- كيف تعمل ----------

@Composable
private fun HowItWorksCard(data: WcLongData) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(18.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Filled.Info, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(16.dp))
            Text("كيف تعمل توقّعات البطولة؟", color = WcColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Black)
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Bullet("🏆", "البطل (${data.pools.champion} نقطة): اختر من يرفع الكأس من المنتخبات المتأهّلة لدور الـ32. تُقسَّم الجائزة على كل من يصيب البطل مرجّحةً بوزن توقّعك — لا بالتساوي.")
            Bullet("⏱️", "وزن المبادر: كلّما ثبّتَّ توقّعك أبكر كبُرت حصّتك — ×1.0 حتى دور الـ16، ×0.6 في دور الـ16، ×0.3 في ربع النهائي، ثم يُغلق عند انطلاق نصف النهائي.")
            Bullet("⚽", "الهدّاف (${data.pools.topScorer} نقطة): اختر متصدّر الهدّافين. تُقسَّم الجائزة بالتساوي على المصيبين، ويُغلق التوقّع عند انطلاق ربع النهائي.")
            Bullet("🎯", "الاحتساب: تُمنَح النقاط تلقائيًّا بعد النهائي — البطل = الفائز باللقب، الهدّاف = متصدّر لائحة الهدّافين الرسمية.")
        }
    }
}

@Composable
private fun Bullet(icon: String, text: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(icon, fontSize = 13.sp)
        Text(text, color = WcColors.onDarkDim, fontSize = 12.sp)
    }
}

// ---------- البطل ----------

private fun myMine(data: WcLongData, kind: String): WcLongMine? = data.mine.firstOrNull { it.kind == kind }

private fun champVotes(data: WcLongData): Map<Int, Pair<Int, Int>> =
    data.champion.votes.mapNotNull { v -> v.teamId?.let { it to (v.n to v.w) } }.toMap()

private fun champTotal(data: WcLongData): Int = champVotes(data).values.sumOf { it.first }

private fun champLeader(data: WcLongData): Pair<String, Int>? {
    val votes = champVotes(data)
    val total = champTotal(data)
    if (total <= 0) return null
    val best = votes.maxByOrNull { it.value.first } ?: return null
    val team = data.teams.firstOrNull { it.id == best.key } ?: return null
    return team.name to ((best.value.first.toDouble() / total) * 100).roundToInt()
}

private fun estimatedChampShare(data: WcLongData, mine: WcLongMine?, pickedId: Int?, votes: Map<Int, Pair<Int, Int>>): Int {
    if (pickedId == null) return 0
    val myWeight = mine?.weight ?: (data.champion.weight ?: 0)
    if (myWeight <= 0) return 0
    val teamW = votes[pickedId]?.second ?: 0
    val alreadyOnTeam = mine?.teamId == pickedId
    val denom = teamW + (if (alreadyOnTeam) 0 else myWeight)
    if (denom <= 0) return 0
    return (data.pools.champion * myWeight) / denom
}

@Composable
private fun ChampionSection(
    data: WcLongData,
    state: WorldCupPredictionsViewModel.UiState,
    viewModel: WorldCupPredictionsViewModel,
    onRequireLogin: () -> Unit,
) {
    val mine = myMine(data, "champion")
    val votes = champVotes(data)
    val total = champTotal(data)
    val leader = champLeader(data)
    val champOpen = data.champion.open
    val liveWeight = data.champion.weight ?: 0
    val pickedId = state.champPick ?: mine?.teamId
    val estShare = estimatedChampShare(data, mine, pickedId, votes)

    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.gold.copy(alpha = 0.05f))
            .border(1.dp, WcColors.gold.copy(alpha = 0.25f), RoundedCornerShape(18.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.EmojiEvents, null, tint = WcColors.gold, modifier = Modifier.size(18.dp))
            Text("من يرفع كأس العالم 2026؟", color = WcColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
            Text("${data.pools.champion} نقطة", color = WcColors.heroTop, fontSize = 11.sp, fontWeight = FontWeight.Black,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.gold).padding(horizontal = 9.dp, vertical = 3.dp))
        }

        WeightTimeline(data)

        if (total > 0) StatsRow(total, leader?.first, leader?.second, WcColors.gold)

        if (mine != null && mine.teamName != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("اخترت: ${mine.teamName}", color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                StatusBadge(mine.status, mine.pointsAwarded)
                if (mine.status == "pending" && champOpen) {
                    Text("بوزن ×${"%.1f".format(java.util.Locale.US, mine.weight / 100.0)}", color = WcColors.onDarkDim, fontSize = 10.sp)
                }
            }
        }

        if (champOpen) {
            Text("اختر البطل من المتأهّلين لدور الـ32 (${data.teams.count { !it.eliminated }} ما زال في المنافسة)",
                color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.Bold)

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                data.teams.chunked(3).forEach { rowTeams ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        rowTeams.forEach { t ->
                            val selected = pickedId == t.id
                            val pct = if (total > 0) ((votes[t.id]?.first ?: 0).toDouble() / total * 100).roundToInt() else 0
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp),
                                modifier = Modifier.weight(1f).clip(RoundedCornerShape(14.dp))
                                    .background(if (selected) WcColors.gold.copy(alpha = 0.14f) else WcColors.card)
                                    .border(if (selected) 1.5.dp else 0.5.dp, if (selected) WcColors.gold else WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                                    .clickable(enabled = !t.eliminated) { if (state.isLoggedIn) viewModel.setChampPick(t.id) else onRequireLogin() }
                                    .alpha(if (t.eliminated) 0.45f else 1f)
                                    .padding(vertical = 8.dp, horizontal = 4.dp),
                            ) {
                                TourLogo(t.logo, 38)
                                Text(t.name, color = WcColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center)
                                if (t.eliminated) Text("خرج", color = WcColors.liveRed, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                else if (total > 0) LtrText("$pct%", WcColors.onDarkDim, 9, FontWeight.Normal)
                            }
                        }
                        repeat(3 - rowTeams.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }

            if (pickedId != null && estShare > 0) {
                Text("إذا فاز اختيارك، حصّتك التقديرية ≈ $estShare نقطة",
                    color = WcColors.gold, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WcColors.gold.copy(alpha = 0.10f)).padding(vertical = 8.dp))
            }

            if (state.isLoggedIn) {
                val disabled = state.champPick == null || state.champPick == mine?.teamId || state.submittingChamp
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(WcColors.gold)
                        .alpha(if (disabled) 0.5f else 1f)
                        .clickable(enabled = !disabled) { viewModel.submitChampion() }.padding(vertical = 10.dp),
                ) {
                    Spacer(Modifier.weight(1f))
                    Icon(Icons.Filled.EmojiEvents, null, tint = Color.White, modifier = Modifier.size(14.dp))
                    Text(
                        (if (mine != null) "حدّث البطل" else "احفظ البطل") + " (بوزن ×${"%.1f".format(java.util.Locale.US, liveWeight / 100.0)})",
                        color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                    )
                    Spacer(Modifier.weight(1f))
                }
            } else {
                LoginButton(onRequireLogin)
            }
        } else {
            LockedBanner("أُغلق توقّع البطل — انطلق نصف النهائي")
        }
    }
}

@Composable
private fun WeightTimeline(data: WcLongData) {
    val idx = weightTiers.indexOfFirst { it.id == data.champion.stage }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("📈", fontSize = 11.sp)
            Text("ثبّت مبكرًا = حصّة أكبر", color = WcColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
            weightTiers.forEachIndexed { i, t ->
                val active = data.champion.stage == t.id
                val passed = idx > i || !data.champion.open
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp),
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(8.dp))
                        .background(if (active) WcColors.gold else if (passed) WcColors.chipFill else WcColors.card)
                        .border(1.dp, if (active || passed) Color.Transparent else WcColors.gold.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                        .padding(vertical = 6.dp),
                ) {
                    val fg = if (active) Color.White else if (passed) WcColors.onDarkDim else WcColors.onDark
                    LtrText(t.mult, fg, 12, FontWeight.Black)
                    Text(t.label, color = fg, fontSize = 8.sp, maxLines = 1)
                }
            }
            Column(
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(1.dp),
                modifier = Modifier.size(width = 44.dp, height = 44.dp).clip(RoundedCornerShape(8.dp))
                    .background(if (!data.champion.open) WcColors.liveRed else WcColors.chipFill).padding(vertical = 6.dp),
            ) {
                Icon(Icons.Filled.Lock, null, tint = Color.White, modifier = Modifier.size(10.dp))
                Text("إغلاق", color = Color.White, fontSize = 8.sp)
            }
        }
    }
}

// ---------- الهدّاف ----------

private fun scorerVotes(data: WcLongData): Map<Int, Int> =
    data.topScorer.votes.mapNotNull { v -> v.playerId?.let { it to v.n } }.toMap()

private fun scorerTotal(data: WcLongData): Int = scorerVotes(data).values.sum()

private fun scorerLeader(data: WcLongData): Pair<String, Int>? {
    val votes = scorerVotes(data)
    val total = scorerTotal(data)
    if (total <= 0) return null
    val best = votes.maxByOrNull { it.value } ?: return null
    val scorer = data.scorers.firstOrNull { it.id == best.key } ?: return null
    return scorer.name to ((best.value.toDouble() / total) * 100).roundToInt()
}

@Composable
private fun ScorerSection(
    data: WcLongData,
    state: WorldCupPredictionsViewModel.UiState,
    viewModel: WorldCupPredictionsViewModel,
    onRequireLogin: () -> Unit,
) {
    val mine = myMine(data, "top_scorer")
    val votes = scorerVotes(data)
    val total = scorerTotal(data)
    val leader = scorerLeader(data)
    val pickedId = state.scorerPick ?: mine?.playerId

    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.emeraldDeep.copy(alpha = 0.05f))
            .border(1.dp, WcColors.emeraldDeep.copy(alpha = 0.20f), RoundedCornerShape(18.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Filled.SportsSoccer, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(18.dp))
            Text("من هدّاف البطولة؟", color = WcColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f))
            Text("${data.pools.topScorer} نقطة", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep).padding(horizontal = 9.dp, vertical = 3.dp))
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Text("⏱️", fontSize = 11.sp)
            Text("تُقسَّم بالتساوي على المصيبين · يُغلق عند انطلاق ربع النهائي", color = WcColors.onDarkDim, fontSize = 11.sp)
        }

        if (total > 0) StatsRow(total, leader?.first, leader?.second, WcColors.emeraldDeep)

        if (mine != null && mine.playerName != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("اخترت: ${mine.playerName}", color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                StatusBadge(mine.status, mine.pointsAwarded)
            }
        }

        when {
            !data.topScorer.open -> LockedBanner("أُغلق توقّع الهدّاف — انطلق ربع النهائي")
            data.scorers.isEmpty() -> Text("لم تُسجّل أهداف بعد — عُد بعد انطلاق المباريات.",
                color = WcColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp))
            else -> {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    data.scorers.forEach { s ->
                        val selected = pickedId == s.id
                        val pct = if (total > 0) ((votes[s.id] ?: 0).toDouble() / total * 100).roundToInt() else 0
                        Row(
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(if (selected) WcColors.emerald.copy(alpha = 0.12f) else WcColors.card)
                                .border(if (selected) 1.5.dp else 0.5.dp, if (selected) WcColors.emeraldDeep else WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
                                .clickable(enabled = !s.eliminated) { if (state.isLoggedIn) viewModel.setScorerPick(s.id) else onRequireLogin() }
                                .alpha(if (s.eliminated) 0.45f else 1f)
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                        ) {
                            Box(modifier = Modifier.size(40.dp).clip(CircleShape)) { WcPlayerPhoto(s.photo, s.name, 40) }
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                                    Text(s.name, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                                    if (s.eliminated) Text("خرج فريقه", color = WcColors.liveRed, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                }
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                    TourLogo(s.team.logo, 12)
                                    Text(s.team.name, color = WcColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
                                }
                            }
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                LtrText("${s.goals}", WcColors.emeraldDeep, 15, FontWeight.Black)
                                Text(if (total > 0) "$pct%" else "هدف", color = WcColors.onDarkDim, fontSize = 8.sp)
                            }
                        }
                    }
                }

                if (state.isLoggedIn) {
                    val disabled = state.scorerPick == null || state.scorerPick == mine?.playerId || state.submittingScorer
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep)
                            .alpha(if (disabled) 0.5f else 1f)
                            .clickable(enabled = !disabled) { viewModel.submitScorer() }.padding(vertical = 10.dp),
                    ) {
                        Spacer(Modifier.weight(1f))
                        Icon(Icons.Filled.SportsSoccer, null, tint = Color.White, modifier = Modifier.size(14.dp))
                        Text(if (mine != null) "حدّث توقّع الهدّاف" else "احفظ توقّع الهدّاف", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                    }
                } else {
                    LoginButton(onRequireLogin)
                }
            }
        }
    }
}

// ---------- مساعدات مشتركة ----------

@Composable
private fun TourLogo(url: String, size: Int) {
    Box(
        modifier = Modifier.size(size.dp).clip(CircleShape).background(Color.White)
            .border(1.dp, WcColors.cardStroke, CircleShape).padding((size * 0.14f).dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun StatsRow(count: Int, leaderName: String?, leaderPct: Int?, tint: Color) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.08f)).padding(horizontal = 10.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
            Icon(Icons.Filled.Group, null, tint = tint, modifier = Modifier.size(12.dp))
            Text("$count توقّعوا", color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        if (leaderName != null && leaderPct != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("🔥", fontSize = 11.sp)
                Text("الأكثر توقّعًا:", color = WcColors.onDarkDim, fontSize = 11.sp)
                Text(leaderName, color = WcColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                LtrText("($leaderPct%)", WcColors.onDarkDim, 11, FontWeight.Normal)
            }
        }
    }
}

@Composable
private fun LockedBanner(text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .border(1.dp, WcColors.liveRed.copy(alpha = 0.35f), RoundedCornerShape(12.dp)).padding(vertical = 14.dp),
    ) {
        Spacer(Modifier.weight(1f))
        Icon(Icons.Filled.Lock, null, tint = WcColors.liveRed, modifier = Modifier.size(13.dp))
        Text(text, color = WcColors.liveRed, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
    }
}

@Composable
private fun LoginButton(onRequireLogin: () -> Unit) {
    Text(
        "سجّل دخولك للتوقّع", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep)
            .clickable { onRequireLogin() }.padding(vertical = 10.dp),
    )
}
