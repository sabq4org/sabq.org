package com.sabq.smart.feature.worldcup

import android.content.Context
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.GpsFixed
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Schedule
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlin.random.Random
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

    // احتفال الفوز — يُعرض مرّة واحدة لكل مباراة فائزة، ونتتبّع المعروضة محليًّا.
    val context = LocalContext.current
    var celebration by remember { mutableStateOf<WcPredictionHistoryItem?>(null) }
    LaunchedEffect(state.mine, state.isLoggedIn) {
        if (!state.isLoggedIn || celebration != null) return@LaunchedEffect
        val seen = wcSeenWins(context)
        state.mine.firstOrNull { it.won && it.fixtureId !in seen }?.let { celebration = it }
    }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        celebration?.let { row ->
            WcWinCelebration(row) {
                wcMarkWinSeen(context, row.fixtureId)
                celebration = null
            }
        }
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
                    // شريط التبويبات — قابل للتمرير أفقيًّا (أربع تبويبات) مطابق iOS
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().background(WcColors.stadiumTop)
                            .horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp),
                    ) {
                        TabChip("مباريات اليوم", state.tab == WorldCupPredictionsViewModel.Tab.TODAY) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.TODAY)
                        }
                        TabChip("توقّع البطل", state.tab == WorldCupPredictionsViewModel.Tab.TOURNAMENT) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.TOURNAMENT)
                        }
                        TabChip("توقّعاتي", state.tab == WorldCupPredictionsViewModel.Tab.MINE) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.MINE)
                        }
                        TabChip("المتصدّرون", state.tab == WorldCupPredictionsViewModel.Tab.BOARD) {
                            viewModel.selectTab(WorldCupPredictionsViewModel.Tab.BOARD)
                        }
                    }

                    when (state.tab) {
                        WorldCupPredictionsViewModel.Tab.TODAY -> TodayTab(state, viewModel, onRequireLogin)
                        WorldCupPredictionsViewModel.Tab.TOURNAMENT -> TournamentTab(state, viewModel, onRequireLogin)
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
        textAlign = TextAlign.Center, maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(50)).background(if (active) WcColors.emeraldDeep else WcColors.chipFill)
            .clickable { onClick() }.padding(horizontal = 18.dp, vertical = 9.dp),
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

// أدوار خروج المغلوب لا تُحسم بتعادل، فنمنع توقّع التعادل فيها (نطابق roundEn
// الإنجليزي كما يفعل الخادم؛ المزوّد قد يُذيّل الاسم برقم مثل "Round of 16 - 1").
private val WC_KNOCKOUT_ROUND_PREFIXES = listOf(
    "Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "3rd Place Final", "Final",
)
private const val WC_DRAW_NOT_ALLOWED_MESSAGE = "لا يمكن توقع التعادل في خروج المغلوب — اختر فائزًا للمباراة"
private fun wcIsKnockoutRound(roundEn: String): Boolean {
    val r = roundEn.trim()
    return WC_KNOCKOUT_ROUND_PREFIXES.any { r == it || r.startsWith(it) }
}

@Composable
private fun InputView(m: WcPredictableMatch, state: WorldCupPredictionsViewModel.UiState, viewModel: WorldCupPredictionsViewModel) {
    val id = m.fixture.id
    val input = state.inputs[id] ?: WorldCupPredictionsViewModel.ScoreInput()
    val saved = m.myPrediction
    val dirty = saved == null || saved.predHome != input.home || saved.predAway != input.away
    val isSubmitting = state.submitting.contains(id)
    // التعادل ممنوع في خروج المغلوب — نُظهر التنبيه فورًا (حتى لتوقّع محفوظ مسبقًا
    // بتعادل) ونُعطّل الحفظ حتى يختار المستخدم فائزًا.
    val drawNotAllowed = input.home == input.away && wcIsKnockoutRound(m.fixture.roundEn)

    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        // المضيف يمينًا (تحت شعاره) والضيف يسارًا — مطابقةً لترتيب الشعارات (RTL)
        // ولعرض النتيجة/التوقّع (ضيف-مضيف). نُبقي فرض LTR لثبات تخطيط الأرقام، لكن
        // نرتّب الضيف أولًا ثم المضيف كي يقع عدّاد كل فريق تحت شعاره — وإلا خُزِّن
        // التوقّع مقلوبًا فظهر «لم تُصب» لتوقّع صحيح.
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Stepper(input.away) { viewModel.setAway(id, it) }
                Text("-", color = WcColors.onDarkDim, fontSize = 20.sp, fontWeight = FontWeight.Black)
                Stepper(input.home) { viewModel.setHome(id, it) }
            }
        }
        if (drawNotAllowed) {
            Text(
                WC_DRAW_NOT_ALLOWED_MESSAGE,
                color = Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(WcColors.liveRed)
                    .padding(horizontal = 8.dp, vertical = 8.dp),
            )
        }
        if (dirty) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(50))
                    .background(if (drawNotAllowed) WcColors.onDarkDim else WcColors.emeraldDeep)
                    .clickable(enabled = !isSubmitting && !drawNotAllowed) { viewModel.submit(id) }.padding(vertical = 9.dp),
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
        } else if (!drawNotAllowed) {
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
        // خروج المغلوب: «1-1» وحدها مضلِّلة — نوضّح من حُسمت له بالترجيح.
        m.fixture.penaltyOutcome?.let {
            Text(
                "فاز ${it.winnerName} بالترجيح (${it.winnerScore}-${it.loserScore})",
                color = WcColors.emeraldDeep,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
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

// بطاقة توقّع احترافية مطابقة لتصميم الويب (MyPredictionsList) و iOS: شريط علوي
// (اليوم + حالة)، ثم الشعارات (المضيف يمينًا) وكتلتا «توقّعي/النتيجة»، وتذييل
// للترجيح إن وُجد. توحيد بصري كامل بين المنصّات الثلاث.
@Composable
private fun MineRow(item: WcPredictionHistoryItem) {
    val settled = item.matchStatus == "settled" && item.finalHome != null && item.finalAway != null
    val isWin = settled && item.status == "correct"
    val borderColor = if (isWin) WcColors.emeraldDeep.copy(alpha = 0.5f) else WcColors.cardStroke.copy(alpha = 0.5f)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(WcColors.card)
            .border(if (isWin) 1.dp else 0.5.dp, borderColor, RoundedCornerShape(18.dp)),
    ) {
        // شريط علوي: اليوم + شارة الحالة
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(if (isWin) WcColors.emeraldDeep.copy(alpha = 0.10f) else WcColors.chipFill.copy(alpha = 0.6f))
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(WcFormat.dayFromIso(item.kickoffAt), color = WcColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.weight(1f))
            MineStatusPill(settled, isWin, item.pointsAwarded)
        }

        // الشعارات + توقّعي/النتيجة
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 12.dp),
        ) {
            MineCrest(item.homeTeamName, item.homeTeamLogo)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
                modifier = Modifier.weight(1f),
            ) {
                ScoreBlockMine("توقّعي", item.predAway, item.predHome, if (isWin) WcColors.emeraldDeep else WcColors.onDark)
                if (settled && item.finalHome != null && item.finalAway != null) {
                    Box(Modifier.width(1.dp).height(34.dp).background(WcColors.cardStroke))
                    ScoreBlockMine("النتيجة", item.finalAway, item.finalHome, WcColors.onDarkDim)
                }
            }
            MineCrest(item.awayTeamName, item.awayTeamLogo)
        }

        // تذييل: الفائز بركلات الترجيح
        val ph = item.finalPenHome
        val pa = item.finalPenAway
        if (ph != null && pa != null && ph != pa) {
            val winner = if (ph > pa) item.homeTeamName else item.awayTeamName
            Box(Modifier.fillMaxWidth().height(1.dp).background(WcColors.cardStroke.copy(alpha = 0.6f)))
            Text(
                "فاز ${winner ?: ""} بالترجيح (${maxOf(ph, pa)}-${minOf(ph, pa)})",
                color = WcColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp, horizontal = 8.dp),
            )
        }
    }
}

// شعار + اسم منتخب — عمود متمركز بعرض ثابت (المضيف يمينًا في RTL)
@Composable
private fun MineCrest(name: String?, logo: String?) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.width(62.dp),
    ) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier.size(44.dp).clip(CircleShape).background(Color.White).border(1.dp, WcColors.cardStroke, CircleShape),
        ) {
            if (!logo.isNullOrEmpty()) {
                AsyncImage(model = logo, contentDescription = null, modifier = Modifier.size(30.dp))
            }
        }
        Text(name ?: "—", color = WcColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 2, textAlign = TextAlign.Center)
    }
}

// كتلة نتيجة (توقّعي/النتيجة): عنوان صغير + رقم كبير موحّد الاتجاه (LTR: الضيف يسارًا)
@Composable
private fun ScoreBlockMine(label: String, away: Int, home: Int, tint: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(label, color = WcColors.onDarkDim, fontSize = 10.sp)
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("$away", color = tint, fontSize = 22.sp, fontWeight = FontWeight.Black)
                Text("-", color = WcColors.onDarkDim, fontSize = 16.sp, fontWeight = FontWeight.Black)
                Text("$home", color = tint, fontSize = 22.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable
private fun MineStatusPill(settled: Boolean, isWin: Boolean, points: Int) {
    when {
        settled && isWin -> Pill(WcColors.emeraldDeep) {
            Icon(Icons.Filled.EmojiEvents, null, tint = Color.White, modifier = Modifier.size(12.dp))
            Text("+$points نقطة", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black)
        }
        settled -> Pill(WcColors.chipFill) {
            Icon(Icons.Filled.Close, null, tint = WcColors.onDarkDim, modifier = Modifier.size(11.dp))
            Text("لم تُصب", color = WcColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        else -> Pill(WcColors.gold.copy(alpha = 0.15f)) {
            Icon(Icons.Filled.Schedule, null, tint = WcColors.gold, modifier = Modifier.size(11.dp))
            Text("قيد الانتظار", color = WcColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun Pill(bg: Color, content: @Composable RowScope.() -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 3.dp),
        content = content,
    )
}

// ---------- احتفال الفوز (Dialog + confetti + تفاصيل التوقّع) ----------
//
// يظهر مرّة واحدة لكل مباراة فائزة عند فتح الشاشة — مطابقًا لفكرة iOS
// WCWinCelebration وSpWinCelebration في تطبيق الرياضة والويب.

private const val WC_PREFS = "wc_predictions"
private const val WC_SEEN_KEY = "seen_wins"

private fun wcSeenWins(context: Context): Set<String> =
    context.getSharedPreferences(WC_PREFS, Context.MODE_PRIVATE)
        .getStringSet(WC_SEEN_KEY, emptySet()) ?: emptySet()

private fun wcMarkWinSeen(context: Context, fixtureId: String) {
    val prefs = context.getSharedPreferences(WC_PREFS, Context.MODE_PRIVATE)
    val seen = (prefs.getStringSet(WC_SEEN_KEY, emptySet()) ?: emptySet()).toMutableSet()
    seen.add(fixtureId)
    prefs.edit().putStringSet(WC_SEEN_KEY, seen).apply()
}

@Composable
private fun WcWinCelebration(item: WcPredictionHistoryItem, onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            WcConfetti(Modifier.fillMaxSize())
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(WcColors.card).padding(28.dp),
            ) {
                Text("🎯", fontSize = 56.sp)
                Text("توقّع موفّق! 🎉", color = WcColors.onDark, fontSize = 24.sp, fontWeight = FontWeight.Black)
                Text(
                    "${item.homeTeamName ?: ""} ضد ${item.awayTeamName ?: ""}",
                    color = WcColors.onDarkDim, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                )

                // تفاصيل التوقّع: الشعارات + توقّعي/النتيجة
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.chipFill)
                        .border(1.dp, WcColors.cardStroke, RoundedCornerShape(16.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
                ) {
                    MineCrest(item.homeTeamName, item.homeTeamLogo)
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
                        modifier = Modifier.weight(1f),
                    ) {
                        ScoreBlockMine("توقّعي", item.predAway, item.predHome, WcColors.emeraldDeep)
                        if (item.finalHome != null && item.finalAway != null) {
                            Box(Modifier.width(1.dp).height(32.dp).background(WcColors.cardStroke))
                            ScoreBlockMine("النتيجة", item.finalAway, item.finalHome, WcColors.onDark)
                        }
                    }
                    MineCrest(item.awayTeamName, item.awayTeamLogo)
                }

                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        Text("+${item.pointsAwarded}", color = WcColors.emeraldDeep, fontSize = 42.sp, fontWeight = FontWeight.Black)
                    }
                    Text("نقطة من إصابة النتيجة الدقيقة", color = WcColors.onDarkDim, fontSize = 12.sp)
                }

                Text(
                    "رائع!", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.emeraldDeep)
                        .clickable { onClose() }.padding(vertical = 14.dp),
                )
            }
        }
    }
}

private data class WcConfPiece(
    val x: Float, val delay: Float, val duration: Float,
    val colorIdx: Int, val size: Float, val spin: Float, val drift: Float,
)

@Composable
private fun WcConfetti(modifier: Modifier = Modifier) {
    val palette = listOf(WcColors.emeraldDeep, WcColors.gold, WcColors.leaf, WcColors.emerald)
    val pieces = remember {
        List(80) {
            WcConfPiece(
                x = Random.nextFloat(),
                delay = Random.nextFloat() * 0.8f,
                duration = 2.2f + Random.nextFloat() * 1.4f,
                colorIdx = Random.nextInt(4),
                size = 6f + Random.nextFloat() * 5f,
                spin = -4f + Random.nextFloat() * 8f,
                drift = -40f + Random.nextFloat() * 80f,
            )
        }
    }
    val clock = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        clock.animateTo(4f, animationSpec = tween(durationMillis = 4000, easing = LinearEasing))
    }
    Canvas(modifier = modifier) {
        val time = clock.value
        pieces.forEach { p ->
            val local = time - p.delay
            if (local <= 0f) return@forEach
            val progress = (local / p.duration).coerceAtMost(1f)
            val y = -20f + (size.height + 40f) * progress
            val x = p.x * size.width + p.drift * progress
            val opacity = if (progress < 0.85f) 1f else ((1f - progress) / 0.15f).coerceIn(0f, 1f)
            rotate(degrees = Math.toDegrees((p.spin * local).toDouble()).toFloat(), pivot = Offset(x, y)) {
                drawRect(
                    color = palette[p.colorIdx].copy(alpha = opacity),
                    topLeft = Offset(x - p.size / 2f, y - p.size * 0.3f),
                    size = Size(p.size, p.size * 0.6f),
                )
            }
        }
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
