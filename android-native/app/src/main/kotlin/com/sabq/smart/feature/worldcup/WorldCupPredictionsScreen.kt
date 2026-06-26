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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

// ---------- بطاقة الدعوة في الهب ----------

@Composable
fun WcPredictCTA(onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(WcColors.heroTop, WcColors.royal, WcColors.heroBottom)))
            .border(1.dp, WcColors.gold.copy(alpha = 0.30f), RoundedCornerShape(20.dp))
            .clickable { onClick() }.padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Box(
            modifier = Modifier.size(44.dp).clip(CircleShape)
                .background(Brush.verticalGradient(listOf(WcColors.gold, WcColors.gold.copy(alpha = 0.7f)))),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Filled.GpsFixed, null, tint = WcColors.heroTop, modifier = Modifier.size(20.dp))
        }
        Column(verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.weight(1f)) {
            Text("توقّع واربح", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black)
            Text("أصِب النتيجة بالضبط واكسب من 500 نقطة لكل مباراة", color = Color.White.copy(alpha = 0.85f), fontSize = 11.sp, maxLines = 2)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null, tint = WcColors.gold, modifier = Modifier.size(20.dp))
    }
}

// ---------- الشاشة الكاملة ----------

@Composable
fun WorldCupPredictionsScreen(
    onBack: () -> Unit,
    onRequireLogin: () -> Unit,
    viewModel: WorldCupPredictionsViewModel = hiltViewModel(),
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
                        Text("مسابقة التوقّعات", color = Color.White, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        Spacer(Modifier.size(40.dp))
                    }
                    // شريط التبويبات
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().background(WcColors.stadiumTop).padding(horizontal = 16.dp, vertical = 10.dp),
                    ) {
                        TabChip("مباريات اليوم", state.tab == WorldCupPredictionsViewModel.Tab.TODAY, Modifier.weight(1f)) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.TODAY)
                        }
                        TabChip("توقّعاتي", state.tab == WorldCupPredictionsViewModel.Tab.MINE, Modifier.weight(1f)) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.MINE)
                        }
                        TabChip("المتصدّرون", state.tab == WorldCupPredictionsViewModel.Tab.BOARD, Modifier.weight(1f)) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.BOARD)
                        }
                    }

                    when (state.tab) {
                        WorldCupPredictionsViewModel.Tab.TODAY -> TodayTab(state, viewModel, onRequireLogin)
                        WorldCupPredictionsViewModel.Tab.MINE -> MineTab(state, onRequireLogin)
                        WorldCupPredictionsViewModel.Tab.BOARD -> LeaderboardTab(state)
                    }
                }
            }
        }
}

@Composable
private fun TabChip(label: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Text(
        label, color = if (active) Color.White else WcColors.onDarkDim, fontSize = 13.sp, fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = modifier.clip(RoundedCornerShape(50)).background(if (active) WcColors.emeraldDeep else WcColors.chipFill)
            .clickable { onClick() }.padding(vertical = 9.dp),
    )
}

// ---------- تبويب: مباريات اليوم ----------

@Composable
private fun TodayTab(
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
        state.todayLoading -> WcLoading()
        state.matches.isEmpty() -> PredEmpty("لا توجد مباريات قابلة للتوقّع اليوم أو غدًا — تابع الجدول لاحقًا")
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            state.toast?.let { toast ->
                item {
                    Text(toast, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WcColors.emeraldDeep).padding(vertical = 9.dp))
                }
            }
            items(state.matches, key = { it.fixture.id }) { m ->
                PredictableCard(m, state, viewModel, onRequireLogin)
            }
        }
    }
}

@Composable
private fun PredictableCard(
    m: WcPredictableMatch,
    state: WorldCupPredictionsViewModel.UiState,
    viewModel: WorldCupPredictionsViewModel,
    onRequireLogin: () -> Unit,
) {
    val f = m.fixture
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), RoundedCornerShape(18.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            TeamSide(f.home, Modifier.weight(1f))
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp), modifier = Modifier.width(74.dp)) {
                Text(WcFormat.time(f), color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Black)
                Text(f.round, color = WcColors.onDarkDim, fontSize = 9.sp, maxLines = 1)
            }
            TeamSide(f.away, Modifier.weight(1f))
        }

        when {
            m.locked -> LockedView(m)
            state.isLoggedIn -> InputView(m, state, viewModel)
            else -> Text(
                "سجّل الدخول للتوقّع", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep)
                    .clickable { onRequireLogin() }.padding(vertical = 11.dp),
            )
        }

        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.Group, null, tint = WcColors.onDarkDim, modifier = Modifier.size(12.dp))
            Spacer(Modifier.width(4.dp))
            Text("${m.predictionsCount} مشارك", color = WcColors.onDarkDim, fontSize = 11.sp)
            Spacer(Modifier.weight(1f))
            Text("الجائزة 500 نقطة", color = WcColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun TeamSide(team: WcTeam, modifier: Modifier = Modifier) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp), modifier = modifier) {
        WcTeamLogo(team, size = 42)
        Text(team.name, color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center)
    }
}

@Composable
private fun InputView(m: WcPredictableMatch, state: WorldCupPredictionsViewModel.UiState, viewModel: WorldCupPredictionsViewModel) {
    val id = m.fixture.id
    val input = state.inputs[id] ?: WorldCupPredictionsViewModel.ScoreInput()
    val saved = m.myPrediction
    val dirty = saved == null || saved.predHome != input.home || saved.predAway != input.away
    val isSubmitting = state.submitting.contains(id)

    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        // المضيف يمينًا في RTL — نعرض داخل LTR
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Stepper(input.home) { viewModel.setHome(id, it) }
                Text("-", color = WcColors.onDarkDim, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Stepper(input.away) { viewModel.setAway(id, it) }
            }
        }
        if (dirty) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep)
                    .clickable(enabled = !isSubmitting) { viewModel.submit(id) }.padding(vertical = 9.dp),
            ) {
                Spacer(Modifier.weight(1f))
                if (isSubmitting) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(14.dp))
                } else {
                    Icon(if (saved != null) Icons.Filled.CheckCircle else Icons.Filled.Send, null, tint = Color.White, modifier = Modifier.size(14.dp))
                }
                Text(if (saved != null) "تحديث التوقّع" else "حفظ التوقّع", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.weight(1f))
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.padding(vertical = 7.dp)) {
                Icon(Icons.Filled.CheckCircle, null, tint = WcColors.emerald, modifier = Modifier.size(12.dp))
                Text("تم حفظ توقّعك", color = WcColors.onDarkDim, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun Stepper(value: Int, onChange: (Int) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(WcColors.chipFill).padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        StepBtn(Icons.Filled.Remove) { if (value > 0) onChange(value - 1) }
        Text("$value", color = WcColors.onDark, fontSize = 22.sp, fontWeight = FontWeight.Black, modifier = Modifier.width(30.dp), textAlign = TextAlign.Center)
        StepBtn(Icons.Filled.Add) { if (value < 20) onChange(value + 1) }
    }
}

@Composable
private fun StepBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        modifier = Modifier.size(32.dp).clip(CircleShape).background(WcColors.emerald.copy(alpha = 0.14f)).clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = WcColors.emeraldDeep, modifier = Modifier.size(14.dp))
    }
}

@Composable
private fun LockedView(m: WcPredictableMatch) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WcColors.chipFill).padding(vertical = 8.dp, horizontal = 10.dp),
    ) {
        val s = m.settlement
        if (s?.finalHome != null && s.finalAway != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("النتيجة", color = WcColors.onDarkDim, fontSize = 11.sp)
                LtrText("${s.finalAway} - ${s.finalHome}", WcColors.onDark, 15, FontWeight.Black)
            }
        }
        val mine = m.myPrediction
        if (mine != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LtrText("توقّعك: ${mine.predAway} - ${mine.predHome}", WcColors.onDark, 12, FontWeight.Bold)
                StatusBadge(mine.status, mine.pointsAwarded)
            }
        } else {
            Text("أُغلق التوقّع — انطلقت المباراة", color = WcColors.onDarkDim, fontSize = 12.sp)
        }
    }
}

@Composable
fun StatusBadge(status: String, points: Int) {
    val (text, bg) = when (status) {
        "correct" -> "أصبت +$points" to WcColors.emeraldDeep
        "incorrect" -> "لم تُصب" to WcColors.liveRed
        else -> "بانتظار النتيجة" to WcColors.chipFill
    }
    Text(
        text, color = if (status == "pending") WcColors.onDarkDim else Color.White, fontSize = 10.sp, fontWeight = FontWeight.Black,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

// ---------- تبويب: توقّعاتي ----------

@Composable
private fun MineTab(state: WorldCupPredictionsViewModel.UiState, onRequireLogin: () -> Unit) {
    when {
        !state.isLoggedIn -> Column(
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxWidth().padding(40.dp),
        ) {
            Text("سجّل الدخول لعرض توقّعاتك ونقاطك", color = WcColors.onDarkDim, fontSize = 14.sp, textAlign = TextAlign.Center)
            Text("تسجيل الدخول", color = Color.White, fontSize = 13.sp, fontWeight = FontWeight.Black,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emeraldDeep).clickable { onRequireLogin() }.padding(horizontal = 24.dp, vertical = 11.dp))
        }
        state.mineLoading -> WcLoading()
        state.mine.isEmpty() -> PredEmpty("لم تضع أي توقّع بعد — ابدأ من تبويب «مباريات اليوم»")
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item { SummaryBar(state.mine) }
            items(state.mine) { MineRow(it) }
        }
    }
}

@Composable
private fun SummaryBar(items: List<WcPredictionHistoryItem>) {
    val total = items.sumOf { it.pointsAwarded }
    val correct = items.count { it.status == "correct" }
    val played = items.count { it.status != "pending" }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        SummaryTile("$total", "نقاطك", WcColors.gold, Modifier.weight(1f))
        SummaryTile("$correct", "إصابات", WcColors.emeraldDeep, Modifier.weight(1f))
        SummaryTile("$played", "مباريات", null, Modifier.weight(1f))
    }
}

@Composable
private fun SummaryTile(value: String, label: String, accent: Color?, modifier: Modifier = Modifier) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier.clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(vertical = 10.dp),
    ) {
        LtrText(value, accent ?: WcColors.onDark, 18, FontWeight.Black)
        Text(label, color = WcColors.onDarkDim, fontSize = 10.sp)
    }
}

@Composable
private fun MineRow(item: WcPredictionHistoryItem) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        MineLogo(item.homeTeamLogo)
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(64.dp)) {
            LtrText("${item.predAway} - ${item.predHome}", WcColors.onDark, 14, FontWeight.Black)
            if (item.finalHome != null && item.finalAway != null) {
                LtrText("النتيجة ${item.finalAway}-${item.finalHome}", WcColors.onDarkDim, 10, FontWeight.Normal)
            }
        }
        MineLogo(item.awayTeamLogo)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            Text("${item.homeTeamName ?: ""} × ${item.awayTeamName ?: ""}", color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            StatusBadge(item.status, item.pointsAwarded)
        }
    }
}

@Composable
private fun MineLogo(url: String?) {
    if (!url.isNullOrEmpty()) {
        AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(28.dp).clip(CircleShape).background(Color.White))
    } else {
        Box(Modifier.size(28.dp).clip(CircleShape).background(WcColors.chipFill))
    }
}

// ---------- تبويب: المتصدّرون ----------

@Composable
private fun LeaderboardTab(state: WorldCupPredictionsViewModel.UiState) {
    when {
        state.boardLoading -> WcLoading()
        state.leaders.isEmpty() -> PredEmpty("لا متصدّرين بعد — كن أول من يصيب نتيجة مباراة!")
        else -> LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.leaders) { LeaderRow(it) }
        }
    }
}

@Composable
private fun LeaderRow(l: WcPredLeader) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        val rankColor = when (l.rank) {
            1 -> WcColors.gold
            2 -> WcColors.onDarkDim
            3 -> WcColors.leaf
            else -> WcColors.chipFill
        }
        Box(
            modifier = Modifier.size(30.dp).clip(CircleShape).background(if (l.rank <= 3) rankColor else WcColors.chipFill),
            contentAlignment = Alignment.Center,
        ) {
            Text("${l.rank}", color = if (l.rank <= 3) Color.White else WcColors.onDarkDim, fontSize = 13.sp, fontWeight = FontWeight.Black)
        }
        if (!l.avatar.isNullOrEmpty()) {
            AsyncImage(model = l.avatar, contentDescription = null, modifier = Modifier.size(34.dp).clip(CircleShape).background(WcColors.chipFill))
        } else {
            Box(Modifier.size(34.dp).clip(CircleShape).background(WcColors.chipFill))
        }
        Column(verticalArrangement = Arrangement.spacedBy(2.dp), modifier = Modifier.weight(1f)) {
            Text(l.name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text("${l.correctCount} إصابة من ${l.playedCount}", color = WcColors.onDarkDim, fontSize = 10.sp)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            LtrText("${l.totalPoints}", WcColors.gold, 16, FontWeight.Black)
            Text("نقطة", color = WcColors.onDarkDim, fontSize = 9.sp)
        }
    }
}

@Composable
private fun PredEmpty(message: String) {
    Text(
        message, color = WcColors.onDarkDim, fontSize = 13.sp, textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 36.dp),
    )
}
