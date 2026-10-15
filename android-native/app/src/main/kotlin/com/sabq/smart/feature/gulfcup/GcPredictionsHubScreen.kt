package com.sabq.smart.feature.gulfcup

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
fun GcPredictionsHubScreen(
    onRequireLogin: () -> Unit,
    viewModel: GcPredictionsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = rememberGcMajlisPalette()

    if (state.selectedMajlis != null) {
        GcMajlisDetailScreen(state = state, viewModel = viewModel)
        return
    }

    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(colors.appBg, colors.appBgMid, colors.appBg)))) {
        Column(Modifier.fillMaxSize()) {
            GcSegmentBar(state.segment, colors, viewModel::selectSegment)
            state.toast?.let { toast ->
                LaunchedEffect(toast) {
                    kotlinx.coroutines.delay(2_500)
                    viewModel.clearToast()
                }
                Text(
                    toast,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    fontFamily = IbmPlexSansArabic,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(12.dp)).background(colors.emerald).padding(9.dp),
                )
            }
            Box(Modifier.weight(1f)) {
                when (state.segment) {
                    GcPredictionsViewModel.Segment.MATCHES -> com.sabq.smart.feature.predictions.PredictionCenterScreen(
                        onBack = { viewModel.selectSegment(GcPredictionsViewModel.Segment.MAJLIS) },
                        onRequireLogin = onRequireLogin, initialCompetition = "gulf-cup-27")
                    GcPredictionsViewModel.Segment.LEADERBOARD -> com.sabq.smart.feature.predictions.PredictionCenterScreen(
                        onBack = { viewModel.selectSegment(GcPredictionsViewModel.Segment.MAJLIS) },
                        onRequireLogin = onRequireLogin, initialCompetition = "gulf-cup-27")
                    GcPredictionsViewModel.Segment.MAJLIS -> GcMajlisHubScreen(state, viewModel, onRequireLogin, colors)
                    GcPredictionsViewModel.Segment.FANTASY -> GcFantasyLeaderboardSegment(state, colors)
                    GcPredictionsViewModel.Segment.LONG -> com.sabq.smart.feature.predictions.PredictionCenterScreen(
                        onBack = { viewModel.selectSegment(GcPredictionsViewModel.Segment.MAJLIS) },
                        onRequireLogin = onRequireLogin, initialCompetition = "gulf-cup-27")
                    GcPredictionsViewModel.Segment.MINE -> com.sabq.smart.feature.predictions.PredictionCenterScreen(
                        onBack = { viewModel.selectSegment(GcPredictionsViewModel.Segment.MAJLIS) },
                        onRequireLogin = onRequireLogin, initialCompetition = "gulf-cup-27")
                }
            }
        }
        state.onboardingMajlis?.let {
            GcMajlisOnboardingDialog(
                onFinish = { enable -> viewModel.finishOnboarding(openPredictions = false, enableAlerts = enable) },
                onPredictNow = { enable -> viewModel.finishOnboarding(openPredictions = true, enableAlerts = enable) },
                colors = colors,
            )
        }
    }
}

@Composable
private fun GcEarnedBadgesRail(rawCodes: List<String>, colors: GcMajlisPalette) {
    val earned = remember(rawCodes) { GcBadgeCatalog.earned(rawCodes) }
    if (earned.isEmpty()) return
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(16.dp)).background(colors.card)
            .border(1.dp, colors.line, RoundedCornerShape(16.dp)).padding(vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("أوسمتي", color = colors.ink, fontSize = 13.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f))
            Text("${earned.size} مفتوح ✓", color = colors.emeraldDeep, fontSize = 9.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        }
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            earned.forEach { badge ->
                Row(
                    Modifier.width(210.dp).clip(RoundedCornerShape(14.dp))
                        .background(colors.sky.copy(.08f)).border(1.dp, colors.sky.copy(.24f), RoundedCornerShape(14.dp))
                        .padding(horizontal = 10.dp, vertical = 9.dp)
                        .semantics { contentDescription = "وسام ${badge.name}: ${badge.description}" },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(9.dp),
                ) {
                    Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(colors.sky.copy(.13f)), contentAlignment = Alignment.Center) {
                        Text(badge.emoji, fontSize = 20.sp)
                    }
                    Column(Modifier.weight(1f)) {
                        Text(badge.name, color = colors.ink, fontSize = 11.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, maxLines = 1)
                        Text(badge.description, color = colors.inkDim, fontSize = 8.sp, fontFamily = IbmPlexSansArabic, maxLines = 2, lineHeight = 11.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun GcPredictionsHero(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    val me = state.today?.me
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(colors.heroTop, colors.heroMid, colors.heroDeep)))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(24.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("مسابقة التوقعات", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                Text("توقّع النتيجة ونافس مجلسك", color = Color(0xFFB3E0E6), fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.clip(RoundedCornerShape(13.dp)).background(Color.White.copy(0.08f)).padding(horizontal = 13.dp, vertical = 7.dp)) {
                Icon(Icons.Filled.EmojiEvents, null, tint = colors.skyLite, modifier = Modifier.size(17.dp))
                Text("${state.today?.jackpot ?: 0}", color = colors.skyLite, fontWeight = FontWeight.Black)
                Text("الجائزة", color = Color.White.copy(0.58f), fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
            }
        }
        Row(Modifier.fillMaxWidth()) {
            GcHeroStat("${me?.points ?: 0}", "نقاطي")
            GcHeroStat("${me?.exact ?: 0}", "دقيقة")
            GcHeroStat("${me?.currentStreak ?: 0}", "السلسلة")
            val myRank = state.user?.id?.let { id -> state.leaders.firstOrNull { it.userId == id }?.rank }
            GcHeroStat(myRank?.let { "#$it" } ?: "—", "ترتيبي")
        }
    }
}

@Composable private fun androidx.compose.foundation.layout.RowScope.GcHeroStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
        Text(value, color = Color.White, fontWeight = FontWeight.Black, fontSize = 16.sp)
        Text(label, color = Color.White.copy(0.58f), fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
    }
}

@Composable
private fun GcSegmentBar(
    selected: GcPredictionsViewModel.Segment,
    colors: GcMajlisPalette,
    onSelect: (GcPredictionsViewModel.Segment) -> Unit,
) {
    val labels = listOf(
        GcPredictionsViewModel.Segment.MATCHES to "التوقعات",
        GcPredictionsViewModel.Segment.MAJLIS to "المجالس",
        GcPredictionsViewModel.Segment.FANTASY to "الفانتازي",
    )
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 2.dp)
            .clip(RoundedCornerShape(16.dp)).background(colors.card)
            .border(1.dp, colors.line, RoundedCornerShape(16.dp))
            .horizontalScroll(rememberScrollState()).padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        labels.forEach { (segment, label) ->
            Text(
                label,
                color = if (selected == segment) Color.White else colors.inkDim,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = IbmPlexSansArabic,
                maxLines = 1,
                modifier = Modifier.clip(RoundedCornerShape(12.dp))
                    .background(if (selected == segment) colors.emerald else Color.Transparent)
                    .clickable { onSelect(segment) }.padding(horizontal = 14.dp, vertical = 11.dp)
                    .semantics { contentDescription = "$label${if (selected == segment) "، محدد" else ""}" },
            )
        }
    }
}

@Composable
private fun GcMatchesSegment(
    state: GcPredictionsViewModel.UiState,
    vm: GcPredictionsViewModel,
    onRequireLogin: () -> Unit,
    colors: GcMajlisPalette,
) {
    when {
        state.loading && state.today == null -> GcCenteredLoading("يتم تحميل التوقعات", colors)
        state.today?.matches.isNullOrEmpty() -> GcCenteredEmpty("لا توجد مباريات قابلة للتوقّع الآن", colors)
        else -> LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            items(state.today!!.matches, key = { it.fixture.id }) { match ->
                GcPredictionCard(match, state, vm, onRequireLogin, colors)
            }
        }
    }
}

@Composable
private fun GcPredictionCard(
    match: GcPredictableMatch,
    state: GcPredictionsViewModel.UiState,
    vm: GcPredictionsViewModel,
    onRequireLogin: () -> Unit,
    colors: GcMajlisPalette,
) {
    val input = state.scoreInputs[match.fixture.id] ?: GcPredictionsViewModel.ScoreInput()
    val voided = GcTier.isVoid(match.settlement?.status, match.fixture.status.code, match.myPrediction?.status)
    val settled = match.settlement?.status == "settled"
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card)
            .border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            GcPill(match.fixture.round, colors.inkDim, colors)
            Spacer(Modifier.weight(1f))
            Text(
                when { voided -> "ملغاة"; match.locked -> "مقفل"; else -> GcKickoff.format(match.fixture.timestamp) },
                color = when { voided -> colors.inkDim; match.locked -> colors.crimson; else -> colors.emerald },
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = IbmPlexSansArabic,
            )
        }
        Row(verticalAlignment = Alignment.Top, modifier = Modifier.fillMaxWidth()) {
            GcPredictionTeam(match.fixture.home, Modifier.weight(1f), colors)
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(112.dp).padding(top = 14.dp)) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text(
                        if (voided) {
                            "—"
                        } else if (settled && match.settlement?.finalHome != null && match.settlement.finalAway != null) {
                            "${match.settlement.finalAway} - ${match.settlement.finalHome}"
                        } else "${input.away} - ${input.home}",
                        color = colors.ink,
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
                Text(when { voided -> "المباراة ملغاة"; settled -> "النتيجة"; else -> "توقّعك" }, color = colors.inkFaint, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
            }
            GcPredictionTeam(match.fixture.away, Modifier.weight(1f), colors)
        }
        when {
            voided -> Text(
                "أُلغيت المباراة — لا تُحتسب",
                color = colors.inkDim,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = IbmPlexSansArabic,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.chip).padding(10.dp),
            )
            settled -> {
                val mine = match.myPrediction
                Text(
                    if ((mine?.pointsAwarded ?: 0) > 0) "+${mine?.pointsAwarded} نقطة · ${GcTier.label(mine?.tier, mine?.status)}" else GcTier.label(mine?.tier, mine?.status),
                    color = if ((mine?.pointsAwarded ?: 0) > 0) colors.skyDeep else colors.inkDim,
                    fontWeight = FontWeight.Bold,
                    fontFamily = IbmPlexSansArabic,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.sky.copy(0.09f)).padding(10.dp),
                    textAlign = TextAlign.Center,
                )
            }
            match.locked -> Text("أُغلق التوقّع — انطلقت المباراة", color = colors.inkDim, fontSize = 12.sp, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(colors.chip).padding(10.dp))
            state.user == null -> GcActionButton("سجّل الدخول للتوقّع", colors.emerald, onRequireLogin)
            else -> {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                    GcScoreStepper(input.home, { vm.setScore(match.fixture.id, home = it) }, colors)
                    GcScoreStepper(input.away, { vm.setScore(match.fixture.id, away = it) }, colors)
                }
                GcActionButton(
                    if (match.myPrediction == null) "حفظ التوقّع" else "تحديث التوقّع",
                    colors.emerald,
                    { vm.submitPrediction(match.fixture.id) },
                    state.submittingFixtureIds.contains(match.fixture.id),
                )
            }
        }
        if (!settled && !voided) GcProbabilityBar(match, colors)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${match.poolAvailable} نقطة", color = colors.skyDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
            Text("${match.crowd.total} مشارك", color = colors.inkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
        }
    }
}

@Composable private fun GcPredictionTeam(team: GcTeam, modifier: Modifier, colors: GcMajlisPalette) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        AsyncImage(team.logo, team.name, modifier = Modifier.size(44.dp).clip(CircleShape).background(Color.White).padding(5.dp))
        Text(team.name, color = colors.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, maxLines = 1, textAlign = TextAlign.Center)
    }
}

@Composable private fun GcScoreStepper(value: Int, onChange: (Int) -> Unit, colors: GcMajlisPalette) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.clip(RoundedCornerShape(18.dp)).background(colors.chip)) {
            IconButton(onClick = { onChange((value - 1).coerceAtLeast(0)) }, modifier = Modifier.size(38.dp)) { Icon(Icons.Filled.Remove, "إنقاص", tint = colors.emerald) }
            Text("$value", color = colors.ink, fontWeight = FontWeight.Black, fontSize = 19.sp, modifier = Modifier.width(32.dp), textAlign = TextAlign.Center)
            IconButton(onClick = { onChange((value + 1).coerceAtMost(9)) }, modifier = Modifier.size(38.dp)) { Icon(Icons.Filled.Add, "زيادة", tint = colors.emerald) }
        }
    }
}

@Composable private fun GcProbabilityBar(match: GcPredictableMatch, colors: GcMajlisPalette) {
    val total = (match.probs.home + match.probs.draw + match.probs.away).takeIf { it > 0 } ?: 1.0
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(Modifier.fillMaxWidth().height(7.dp).clip(RoundedCornerShape(8.dp))) {
            Box(Modifier.weight((match.probs.home / total).toFloat().coerceAtLeast(.01f)).fillMaxSize().background(colors.emerald))
            Box(Modifier.weight((match.probs.draw / total).toFloat().coerceAtLeast(.01f)).fillMaxSize().background(colors.inkFaint.copy(.45f)))
            Box(Modifier.weight((match.probs.away / total).toFloat().coerceAtLeast(.01f)).fillMaxSize().background(colors.sky))
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${match.fixture.home.name} ${(match.probs.home / total * 100).toInt()}%", color = colors.inkDim, fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
            Text("تعادل ${(match.probs.draw / total * 100).toInt()}%", color = colors.inkDim, fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
            Text("${match.fixture.away.name} ${(match.probs.away / total * 100).toInt()}%", color = colors.inkDim, fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
        }
    }
}

@Composable private fun GcLeaderboardSegment(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    if (state.leaders.isEmpty()) return GcCenteredEmpty("لم يبدأ الترتيب بعد", colors)
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.leaders, key = { it.userId }) { row -> GcRankRow(row.rank, row.name, row.avatar, row.totalPoints, row.userId == state.user?.id, colors, "${row.correctCount} إصابة · ${row.exactCount} دقيقة") }
    }
}

@Composable private fun GcFantasyLeaderboardSegment(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    LaunchedEffect(Unit) { if (state.fantasyLeaders.isEmpty()) Unit }
    if (state.fantasyLeaders.isEmpty()) return GcCenteredEmpty("كوّن تشكيلتك من الفانتازي وابدأ المنافسة", colors)
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.fantasyLeaders, key = { it.userId }) { row -> GcRankRow(row.rank, row.name, row.avatar, row.totalPoints, row.userId == state.user?.id, colors, "نقاط الفانتازي") }
    }
}

@Composable
private fun GcLongSegment(state: GcPredictionsViewModel.UiState, vm: GcPredictionsViewModel, onRequireLogin: () -> Unit, colors: GcMajlisPalette) {
    val data = state.long ?: return GcCenteredLoading("يتم تحميل توقعات البطولة", colors)
    var selectedTeam by remember(data) { mutableIntStateOf(data.mine.firstOrNull { it.kind == "champion" }?.teamId ?: 0) }
    var scorer by remember(data) { mutableStateOf(data.mine.firstOrNull { it.kind == "top_scorer" }?.playerName.orEmpty()) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { GcSectionTitle("توقّع البطل", "جائزة ${data.pools.champion} نقطة", colors) }
        items(data.teams, key = { "champ-${it.id}" }) { team ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(colors.card)
                    .border(if (selectedTeam == team.id) 2.dp else 1.dp, if (selectedTeam == team.id) colors.sky else colors.line, RoundedCornerShape(14.dp))
                    .clickable { selectedTeam = team.id }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                AsyncImage(team.logo, team.name, modifier = Modifier.size(34.dp).clip(CircleShape).background(Color.White).padding(4.dp))
                Text(team.name, color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f).padding(horizontal = 10.dp))
                if (selectedTeam == team.id) Icon(Icons.Filled.CheckCircle, "مختار", tint = colors.sky)
            }
        }
        item {
            GcActionButton("حفظ توقع البطل", colors.emerald, {
                if (state.user == null) onRequireLogin() else if (selectedTeam != 0) vm.submitLong("champion", teamId = selectedTeam)
            }, state.mutationInFlight)
        }
        item { GcSectionTitle("توقّع الهدّاف", "جائزة ${data.pools.topScorer} نقطة", colors) }
        item {
            OutlinedTextField(
                value = scorer,
                onValueChange = { scorer = it.take(60) },
                label = { Text("اسم اللاعب", fontFamily = IbmPlexSansArabic) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            GcActionButton("حفظ توقع الهدّاف", colors.skyDeep, {
                if (state.user == null) onRequireLogin() else if (scorer.trim().length >= 2) vm.submitLong("top_scorer", playerName = scorer.trim())
            }, state.mutationInFlight)
        }
    }
}

@Composable private fun GcMineSegment(state: GcPredictionsViewModel.UiState, onRequireLogin: () -> Unit, colors: GcMajlisPalette) {
    if (state.user == null) {
        Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text("سجّل الدخول لرؤية سجل توقعاتك", color = colors.inkDim, fontFamily = IbmPlexSansArabic)
            Spacer(Modifier.height(12.dp)); GcActionButton("تسجيل الدخول", colors.emerald, onRequireLogin)
        }
        return
    }
    if (state.mine.isEmpty()) return GcCenteredEmpty("لم تسجّل توقعات بعد", colors)
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(state.mine, key = { it.fixtureId }) { row ->
            val voided = GcTier.isVoid(row.tier, row.status, row.matchStatus)
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(16.dp)).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("${row.homeTeamName ?: "—"} × ${row.awayTeamName ?: "—"}", color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                    Text(GcTier.label(row.tier, row.status, row.matchStatus), color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
                }
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                    Text("${row.predAway} - ${row.predHome}", color = colors.skyDeep, fontWeight = FontWeight.Black, fontSize = 17.sp)
                }
                if (!voided && (row.pointsAwarded ?: 0) > 0) Text("  +${row.pointsAwarded}", color = colors.emerald, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun GcRankRow(rank: Int, name: String, avatar: String?, points: Int, viewer: Boolean, colors: GcMajlisPalette, detail: String) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(if (viewer) colors.sky.copy(.07f) else colors.card)
            .border(1.dp, colors.line, RoundedCornerShape(16.dp)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(if (rank <= 3) listOf("🥇", "🥈", "🥉")[rank - 1] else "$rank", color = colors.inkDim, fontWeight = FontWeight.Bold, modifier = Modifier.width(28.dp), textAlign = TextAlign.Center)
        AsyncImage(avatar, name, modifier = Modifier.size(34.dp).clip(CircleShape).background(colors.chip))
        Column(Modifier.weight(1f)) {
            Text(name, color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, maxLines = 1)
            Text(detail, color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
        }
        Text("$points", color = colors.emeraldDeep, fontSize = 16.sp, fontWeight = FontWeight.Black)
    }
}

@Composable internal fun GcActionButton(title: String, color: Color, onClick: () -> Unit, loading: Boolean = false) {
    Button(
        onClick = onClick,
        enabled = !loading,
        colors = ButtonDefaults.buttonColors(containerColor = color),
        shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().height(50.dp),
    ) {
        if (loading) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        else Icon(Icons.AutoMirrored.Filled.Send, null, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(7.dp))
        Text(title, color = Color.White, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
    }
}

@Composable internal fun GcPill(text: String, tint: Color, colors: GcMajlisPalette) {
    Text(text, color = tint, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.clip(RoundedCornerShape(50)).background(tint.copy(.11f)).padding(horizontal = 9.dp, vertical = 5.dp))
}

@Composable internal fun GcCenteredLoading(title: String, colors: GcMajlisPalette) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            CircularProgressIndicator(color = colors.sky)
            Text(title, color = colors.inkDim, fontFamily = IbmPlexSansArabic)
        }
    }
}

@Composable internal fun GcCenteredEmpty(title: String, colors: GcMajlisPalette) {
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Icon(Icons.Filled.Group, null, tint = colors.emerald, modifier = Modifier.size(34.dp))
            Text(title, color = colors.inkDim, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center)
        }
    }
}

@Composable private fun GcSectionTitle(title: String, subtitle: String, colors: GcMajlisPalette) {
    Column {
        Text(title, color = colors.ink, fontSize = 18.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
        Text(subtitle, color = colors.inkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
    }
}

private object GcKickoff {
    private val zone = ZoneId.of("Asia/Riyadh")
    private val format = DateTimeFormatter.ofPattern("EEE d MMM · HH:mm", Locale("ar", "SA"))
    fun format(timestamp: Int): String = runCatching { Instant.ofEpochSecond(timestamp.toLong()).atZone(zone).format(format) }.getOrDefault("")
}

private object GcTier {
    const val VOID = "void"
    fun isVoid(vararg values: String?): Boolean = values.any { it.equals(VOID, ignoreCase = true) }
    fun label(value: String?, vararg statuses: String?): String = when {
        isVoid(value, *statuses) -> "أُلغيت المباراة — لا تُحتسب"
        else -> when (value) {
            "exact" -> "النتيجة الدقيقة"
            "margin" -> "الفارق الصحيح"
            "outcome" -> "النتيجة الصحيحة"
            "none" -> "لم تُصب"
            else -> "بانتظار النتيجة"
        }
    }
}

private data class GcBadgeVisual(
    val code: String,
    val emoji: String,
    val name: String,
    val description: String,
)

private object GcBadgeCatalog {
    private val definitions = listOf(
        GcBadgeVisual("majlis_champion", "🏆", "بطل المجلس", "أنهيت البطولة في صدارة أحد مجالسك"),
        GcBadgeVisual("majlis_dean", "🪶", "عميد المجلس", "أوصلت أحد مجالسك إلى 10 أعضاء"),
        GcBadgeVisual("nostradamus", "🔮", "نوسترداموس", "أصبت النتيجة الدقيقة في 5 مباريات"),
        GcBadgeVisual("lionheart", "🦁", "قلب الأسد", "أصبت نتيجة توقّعها أقل من 10%"),
        GcBadgeVisual("hot_streak", "🔥", "سلسلة ملتهبة", "3 إصابات متتالية أو أكثر"),
        GcBadgeVisual("ever_present", "🎖️", "الحاضر دومًا", "شاركت في كل مباريات دور المجموعات"),
    )

    fun earned(rawCodes: List<String>): List<GcBadgeVisual> {
        val normalized = rawCodes.mapTo(linkedSetOf()) { code ->
            when {
                code.startsWith("majlis_champion:") -> "majlis_champion"
                code.startsWith("majlis_dean:") -> "majlis_dean"
                else -> code
            }
        }
        return definitions.filter { it.code in normalized }
    }
}
