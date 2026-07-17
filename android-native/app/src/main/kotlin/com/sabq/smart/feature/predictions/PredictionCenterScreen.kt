package com.sabq.smart.feature.predictions

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme

// مركز التوقّعات — مطابق لمرجع iOS المعتمد 1:1: بطاقة بطولة تفصل نقاط
// الترتيب (ذهبي) عن المحفظة، تبويبات المباريات/سجلّي/المتصدرون، حالة واحدة
// لكل مباراة، وحوار «كيف حُسبت نقاطي؟» بأرقام سجل الخادم نفسها.

@Composable
fun PredictionCenterScreen(
    onBack: () -> Unit,
    onRequireLogin: () -> Unit,
    viewModel: PredictionCenterViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.toast) {
        state.toast?.let {
            snackbar.showSnackbar(it)
            viewModel.clearToast()
        }
    }

    Box(Modifier.fillMaxSize().background(SabqTheme.colors.background)) {
        Column(Modifier.fillMaxSize()) {
            HeaderBar(onBack)

            when {
                state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = SabqTheme.colors.primaryStart)
                }
                state.competitions.isEmpty() -> EmptyStateView(
                    icon = Icons.Filled.SportsSoccer,
                    tint = SabqTheme.colors.primaryStart,
                    title = "لا بطولات توقّعات متاحة حاليًا",
                    subtitle = state.error ?: "ستظهر البطولات هنا فور انطلاقها",
                )
                else -> Content(state, viewModel, onRequireLogin)
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }

    state.settlement?.let { settlement ->
        SettlementDialog(settlement, onDismiss = viewModel::dismissSettlement)
    }
}

@Composable
private fun HeaderBar(onBack: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp),
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "رجوع", tint = SabqTheme.colors.ink)
        }
        Text("التوقّعات", style = SabqTheme.typography.screenTitle, color = SabqTheme.colors.ink)
    }
}

@Composable
private fun Content(
    state: PredictionCenterUiState,
    viewModel: PredictionCenterViewModel,
    onRequireLogin: () -> Unit,
) {
    LazyColumn(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
    ) {
        if (state.competitions.size > 1) {
            item { CompetitionChips(state, viewModel::selectCompetition) }
        }
        item { HeroCard(state, onRequireLogin) }
        item { TabsBar(state.tab, viewModel::selectTab) }

        when (state.tab) {
            PredTab.Matches -> matchesItems(state, viewModel)
            PredTab.Ledger -> ledgerItems(state, onRequireLogin)
            PredTab.Leaders -> leadersItems(state)
        }
        item { Spacer(Modifier.height(24.dp)) }
    }
}

// ---------------------------------------------------------------------------
// البطولات والبطاقة والتبويبات
// ---------------------------------------------------------------------------

@Composable
private fun CompetitionChips(state: PredictionCenterUiState, onSelect: (String) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.horizontalScroll(rememberScrollState()),
    ) {
        state.competitions.forEach { comp ->
            val selected = comp.slug == state.selected?.slug
            Text(
                comp.nameAr,
                style = SabqTheme.typography.chipLabel,
                color = if (selected) Color.White else SabqTheme.colors.secondaryInk,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (selected) SabqTheme.colors.primaryStart else SabqTheme.colors.paleFill)
                    .clickable { onSelect(comp.slug) }
                    .padding(horizontal = 16.dp, vertical = 7.dp),
            )
        }
    }
}

@Composable
private fun HeroCard(state: PredictionCenterUiState, onRequireLogin: () -> Unit) {
    val comp = state.selected ?: return
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd)))
            .padding(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                Modifier.size(40.dp).clip(RoundedCornerShape(13.dp)).background(Color.White.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.EmojiEvents, null, tint = SabqTheme.colors.gold, modifier = Modifier.size(20.dp))
            }
            Column {
                Text(comp.nameAr, style = SabqTheme.typography.cardTitle, color = Color.White)
                Text("موسم ${comp.seasonKey}", style = SabqTheme.typography.metaSmall, color = Color.White.copy(alpha = 0.72f))
            }
        }

        if (state.loggedIn) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                HeroStat("${comp.myPoints ?: 0}", "نقاطي في البطولة", gold = true, modifier = Modifier.weight(1f))
                HeroStat(state.board?.myRank?.let { "#${it.rank}" } ?: "—", "ترتيبي", modifier = Modifier.weight(1f))
                HeroStat("${comp.openContests}", "توقّعات مفتوحة", modifier = Modifier.weight(1f))
            }
        } else {
            Text(
                "سجّل الدخول لتتوقّع وتنافس على النقاط",
                style = SabqTheme.typography.ctaButton,
                color = Color.White,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(13.dp))
                    .background(Color.White.copy(alpha = 0.14f))
                    .clickable(onClick = onRequireLogin)
                    .padding(vertical = 11.dp),
            )
        }
    }
}

@Composable
private fun HeroStat(value: String, label: String, modifier: Modifier = Modifier, gold: Boolean = false) {
    Column(
        modifier = modifier.clip(RoundedCornerShape(13.dp)).background(Color.White.copy(alpha = 0.11f)).padding(horizontal = 11.dp, vertical = 9.dp),
    ) {
        Text(
            value,
            style = SabqTheme.typography.statValue,
            color = if (gold) SabqTheme.colors.gold else Color.White,
        )
        Text(label, fontSize = 10.sp, color = Color.White.copy(alpha = 0.72f))
    }
}

@Composable
private fun TabsBar(current: PredTab, onSelect: (PredTab) -> Unit) {
    val tabs = listOf(PredTab.Matches to "المباريات", PredTab.Ledger to "سجلّي", PredTab.Leaders to "المتصدّرون")
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
        tabs.forEach { (tab, label) ->
            val selected = tab == current
            Text(
                label,
                style = SabqTheme.typography.tabLabel,
                color = if (selected) Color.White else SabqTheme.colors.secondaryInk,
                textAlign = TextAlign.Center,
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(if (selected) SabqTheme.colors.primaryStart else SabqTheme.colors.paleFill)
                    .clickable { onSelect(tab) }
                    .padding(vertical = 9.dp),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// المباريات
// ---------------------------------------------------------------------------

private fun androidx.compose.foundation.lazy.LazyListScope.matchesItems(
    state: PredictionCenterUiState,
    viewModel: PredictionCenterViewModel,
) {
    val matchScore = state.contests.filter { it.isMatchScore }
    val open = matchScore.filter { it.status == "open" }.sortedBy { it.locksAt }
    val locked = matchScore.filter { it.status == "locked" || it.status == "ready" }
    val finished = matchScore.filter { it.status == "settled" || it.status == "void" }
        .sortedByDescending { it.settledAt ?: "" }
        .take(10)

    if (open.isEmpty() && locked.isEmpty() && finished.isEmpty()) {
        item {
            EmptyStateView(
                icon = Icons.Filled.SportsSoccer,
                tint = SabqTheme.colors.primaryStart,
                title = "لا مباريات متاحة للتوقّع الآن",
                subtitle = "تُفتح التوقّعات فور إعلان جدول المباريات",
            )
        }
        return
    }

    items((open + locked), key = { it.id }) { contest -> MatchCard(contest, state, viewModel) }
    if (finished.isNotEmpty()) {
        item {
            Text("انتهت", style = SabqTheme.typography.sectionHeader, color = SabqTheme.colors.tertiaryInk)
        }
        items(finished, key = { it.id }) { contest -> MatchCard(contest, state, viewModel) }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.items(
    list: List<PredContest>,
    key: (PredContest) -> Any,
    itemContent: @Composable (PredContest) -> Unit,
) {
    items(count = list.size, key = { key(list[it]) }) { index -> itemContent(list[index]) }
}

@Composable
private fun MatchCard(
    contest: PredContest,
    state: PredictionCenterUiState,
    viewModel: PredictionCenterViewModel,
) {
    val editing = state.editingContestId == contest.id
    Column(
        verticalArrangement = Arrangement.spacedBy(9.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SabqTheme.colors.surface)
            .padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TeamSide(contest.metadata?.home, Modifier.weight(1f))
            CenterBlock(contest)
            TeamSide(contest.metadata?.away, Modifier.weight(1f), trailing = true)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                listOfNotNull(
                    contest.metadata?.round,
                    if (contest.status == "open") PredDates.countdownAr(contest.locksAt) else null,
                ).joinToString(" · "),
                style = SabqTheme.typography.metaSmall,
                color = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.weight(1f),
            )
            StatusChip(contest, onPredict = { viewModel.toggleEditing(contest.id) }, onSettlement = { viewModel.openSettlement(contest.id) })
        }

        if (editing && contest.status == "open") {
            EditingSection(contest, state, viewModel)
        }
    }
}

@Composable
private fun TeamSide(team: PredTeamMeta?, modifier: Modifier = Modifier, trailing: Boolean = false) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = if (trailing) Arrangement.spacedBy(7.dp, Alignment.End) else Arrangement.spacedBy(7.dp),
        modifier = modifier,
    ) {
        if (!trailing) TeamLogo(team?.logo)
        Text(
            team?.name ?: "يُحدد لاحقًا",
            style = SabqTheme.typography.cardTitle,
            fontSize = 13.sp,
            color = SabqTheme.colors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (trailing) TeamLogo(team?.logo)
    }
}

@Composable
private fun TeamLogo(url: String?) {
    if (url.isNullOrBlank()) {
        Icon(Icons.Filled.SportsSoccer, null, tint = SabqTheme.colors.tertiaryInk.copy(alpha = 0.4f), modifier = Modifier.size(24.dp))
    } else {
        AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(26.dp))
    }
}

@Composable
private fun CenterBlock(contest: PredContest) {
    val result = contest.result
    if (contest.status == "settled" && result?.finalHome != null && result.finalAway != null) {
        Text(
            "⁦${result.finalHome}–${result.finalAway}⁩",
            fontSize = 18.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
    } else {
        Text(
            PredDates.kickoffTimeAr(contest.locksAt),
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun StatusChip(contest: PredContest, onPredict: () -> Unit, onSettlement: () -> Unit) {
    val mine = contest.myEntry?.payload
    when (contest.status) {
        "open" -> {
            val label = if (mine?.predHome != null) "توقّعتَ ${mine.predHome}–${mine.predAway} · تعديل" else "توقّع الآن"
            val filled = mine?.predHome == null
            Chip(
                label,
                textColor = if (filled) Color.White else SabqTheme.colors.primaryStart,
                fill = if (filled) SabqTheme.colors.primaryStart else SabqTheme.colors.primaryStart.copy(alpha = 0.12f),
                onClick = onPredict,
            )
        }
        "locked", "ready" -> Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.clip(CircleShape).background(SabqTheme.colors.coral.copy(alpha = 0.12f)).padding(horizontal = 10.dp, vertical = 4.dp),
        ) {
            Icon(Icons.Filled.Lock, null, tint = SabqTheme.colors.coral, modifier = Modifier.size(11.dp))
            Text(
                if (mine?.predHome != null) "توقّعك ${mine.predHome}–${mine.predAway} مقفل" else "مقفل — بانتظار النتيجة",
                style = SabqTheme.typography.statusChip,
                color = SabqTheme.colors.coral,
            )
        }
        "settled" -> Chip(
            "احتُسبت — التفاصيل",
            textColor = SabqTheme.colors.gold,
            fill = SabqTheme.colors.gold.copy(alpha = 0.14f),
            onClick = onSettlement,
        )
        "void" -> Chip("أُلغيت", textColor = SabqTheme.colors.tertiaryInk, fill = SabqTheme.colors.paleFill, onClick = {})
    }
}

@Composable
private fun Chip(label: String, textColor: Color, fill: Color, onClick: () -> Unit) {
    Text(
        label,
        style = SabqTheme.typography.statusChip,
        color = textColor,
        modifier = Modifier.clip(CircleShape).background(fill).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 5.dp),
    )
}

@Composable
private fun EditingSection(
    contest: PredContest,
    state: PredictionCenterUiState,
    viewModel: PredictionCenterViewModel,
) {
    var predHome by remember(contest.id) { mutableIntStateOf(contest.myEntry?.payload?.predHome ?: 0) }
    var predAway by remember(contest.id) { mutableIntStateOf(contest.myEntry?.payload?.predAway ?: 0) }
    val submitting = state.submittingContestIds.contains(contest.id)

    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        state.editingRule?.let { rule ->
            Text(
                rule.summaryAr(),
                style = SabqTheme.typography.metaSmall,
                color = SabqTheme.colors.primaryStart,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(SabqTheme.colors.primaryStart.copy(alpha = 0.10f))
                    .padding(10.dp),
            )
        }
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Stepper(predHome) { predHome = it }
            Text("-", fontSize = 20.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.tertiaryInk)
            Stepper(predAway) { predAway = it }
        }
        Text(
            if (submitting) "جارٍ الحفظ…" else "تأكيد التوقّع $predHome–$predAway",
            style = SabqTheme.typography.ctaButton,
            color = Color.White,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(13.dp))
                .background(SabqTheme.colors.primaryStart)
                .clickable(enabled = !submitting) { viewModel.submit(contest.id, predHome, predAway) }
                .padding(vertical = 11.dp),
        )
        Text(
            "يُقفل التوقّع عند ضربة البداية — ويمكنك تعديله حتى ذلك الحين",
            style = SabqTheme.typography.metaSmall,
            color = SabqTheme.colors.tertiaryInk,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun Stepper(value: Int, onChange: (Int) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(SabqTheme.colors.paleFill).padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        StepBtn(Icons.Filled.Remove) { if (value > 0) onChange(value - 1) }
        Text(
            "$value",
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.width(30.dp),
        )
        StepBtn(Icons.Filled.Add) { if (value < 20) onChange(value + 1) }
    }
}

@Composable
private fun StepBtn(icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Box(
        modifier = Modifier.size(32.dp).clip(CircleShape).background(SabqTheme.colors.primaryStart.copy(alpha = 0.12f)).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, null, tint = SabqTheme.colors.primaryStart, modifier = Modifier.size(14.dp))
    }
}

// ---------------------------------------------------------------------------
// سجلّي
// ---------------------------------------------------------------------------

private fun androidx.compose.foundation.lazy.LazyListScope.ledgerItems(
    state: PredictionCenterUiState,
    onRequireLogin: () -> Unit,
) {
    if (!state.loggedIn) {
        item {
            EmptyStateView(
                icon = Icons.Filled.Lock,
                tint = SabqTheme.colors.primaryStart,
                title = "سجّل الدخول لعرض سجل نقاطك",
                subtitle = "كل نقطة بسببها — وكل تصحيح ظاهر بشفافية",
                actionTitle = "تسجيل الدخول",
                onAction = onRequireLogin,
            )
        }
        return
    }
    if (state.ledger.isEmpty()) {
        item {
            EmptyStateView(
                icon = Icons.Filled.SportsSoccer,
                tint = SabqTheme.colors.primaryStart,
                title = "لا قيود نقاط بعد",
                subtitle = "ستظهر نقاطك هنا فور تسوية أول مباراة توقّعتها",
            )
        }
        return
    }
    items(count = state.ledger.size, key = { state.ledger[it].id }) { index ->
        val item = state.ledger[index]
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(SabqTheme.colors.surface)
                .padding(horizontal = 13.dp, vertical = 10.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(item.reasonLabelAr, style = SabqTheme.typography.cardTitle, fontSize = 13.sp, color = SabqTheme.colors.ink)
                Text(PredDates.dayAr(item.createdAt), style = SabqTheme.typography.metaSmall, color = SabqTheme.colors.tertiaryInk)
            }
            Text(
                if (item.points >= 0) "+${item.points}" else "${item.points}",
                style = SabqTheme.typography.statValue,
                color = if (item.points >= 0) SabqTheme.colors.leaf else SabqTheme.colors.coral,
            )
        }
    }
}

// ---------------------------------------------------------------------------
// المتصدرون — الرأس يعلن النطاق وما تشمله النقاط
// ---------------------------------------------------------------------------

private fun androidx.compose.foundation.lazy.LazyListScope.leadersItems(state: PredictionCenterUiState) {
    val board = state.board
    if (board == null || board.entries.isEmpty()) {
        item {
            EmptyStateView(
                icon = Icons.Filled.EmojiEvents,
                tint = SabqTheme.colors.primaryStart,
                title = "لا ترتيب بعد",
                subtitle = "تُبنى اللوحة بعد تسوية أول مباريات البطولة",
            )
        }
        return
    }

    item {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(SabqTheme.colors.surface)
                .padding(13.dp),
        ) {
            Text(board.nameAr, style = SabqTheme.typography.cardTitle, color = SabqTheme.colors.ink)
            Text(
                "توقّعات المباريات · النقاط الأساسية دون مضاعف العضوية",
                style = SabqTheme.typography.metaSmall,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
    }

    board.myRank?.let { mine ->
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(Brush.linearGradient(listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd)))
                    .padding(horizontal = 13.dp, vertical = 11.dp),
            ) {
                Text("ترتيبك الحالي", style = SabqTheme.typography.cardTitle, fontSize = 13.sp, color = Color.White, modifier = Modifier.weight(1f))
                Text("#${mine.rank} · ${mine.points}", style = SabqTheme.typography.statValue, color = Color.White)
            }
        }
    }

    items(count = board.entries.size, key = { board.entries[it].userId }) { index ->
        val entry = board.entries[index]
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(SabqTheme.colors.surface)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                "${entry.rank}",
                style = SabqTheme.typography.statValue,
                fontSize = 13.sp,
                color = if (entry.rank <= 3) SabqTheme.colors.gold else SabqTheme.colors.tertiaryInk,
                modifier = Modifier.width(22.dp),
            )
            Box(
                Modifier.size(30.dp).clip(CircleShape).background(SabqTheme.colors.primaryStart.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(entry.name.take(1), fontSize = 12.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.primaryStart)
            }
            Column(Modifier.weight(1f)) {
                Text(entry.name, style = SabqTheme.typography.cardTitle, fontSize = 13.sp, color = SabqTheme.colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text("${entry.exactCount} نتيجة دقيقة", style = SabqTheme.typography.metaSmall, color = SabqTheme.colors.tertiaryInk)
            }
            Text("${entry.points}", style = SabqTheme.typography.statValue, color = SabqTheme.colors.primaryStart)
        }
    }
}

// ---------------------------------------------------------------------------
// حوار «كيف حُسبت نقاطي؟» — نفس Sheet مرجع iOS بأرقام سجل الخادم
// ---------------------------------------------------------------------------

@Composable
private fun SettlementDialog(settlement: PredSettlementResponse, onDismiss: () -> Unit) {
    val award = settlement.myAwards.firstOrNull()
    Dialog(onDismissRequest = onDismiss) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(22.dp))
                .background(SabqTheme.colors.surface)
                .padding(18.dp),
        ) {
            Text("كيف حُسبت نقاطي؟", style = SabqTheme.typography.sectionHeader, color = SabqTheme.colors.ink)

            if (award == null) {
                Text(
                    "لم يدخل توقّعك ضمن الفئات الفائزة في هذه المباراة — توقّع المباريات القادمة لتجمع النقاط.",
                    style = SabqTheme.typography.body,
                    color = SabqTheme.colors.secondaryInk,
                )
            } else {
                // الفئة
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(SabqTheme.colors.paleFill).padding(horizontal = 12.dp, vertical = 9.dp),
                ) {
                    Text(
                        award.breakdown?.prediction?.let { "توقّعتَ $it" } ?: "توقّعك",
                        style = SabqTheme.typography.metaSmall,
                        color = SabqTheme.colors.secondaryInk,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "🎯 ${award.reasonLabelAr}",
                        style = SabqTheme.typography.statusChip,
                        color = SabqTheme.colors.gold,
                    )
                }

                // البطاقة المزدوجة: نقاط الترتيب ≠ المحفظة
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PointsHalf("+${award.points}", "نقاط البطولة → الترتيب", SabqTheme.colors.leaf, Modifier.weight(1f))
                    award.wallet?.let { wallet ->
                        PointsHalf(
                            "+${wallet.walletPoints}",
                            "محفظتك (×${"%.1f".format(wallet.multiplier)} عضوية)",
                            SabqTheme.colors.gold,
                            Modifier.weight(1f),
                        )
                    }
                }

                // خطوات الحساب
                buildSteps(award).forEachIndexed { index, step ->
                    Row(horizontalArrangement = Arrangement.spacedBy(9.dp), verticalAlignment = Alignment.Top) {
                        Box(
                            Modifier.size(20.dp).clip(CircleShape).background(SabqTheme.colors.primaryStart.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("${index + 1}", fontSize = 10.sp, fontWeight = FontWeight.Black, color = SabqTheme.colors.primaryStart)
                        }
                        Text(step, style = SabqTheme.typography.body, fontSize = 12.5.sp, color = SabqTheme.colors.ink, modifier = Modifier.weight(1f))
                    }
                }

                Text(
                    "رقم مرجعي للدعم: ${award.referenceId.take(8).uppercase()}",
                    style = SabqTheme.typography.metaSmall,
                    color = SabqTheme.colors.tertiaryInk,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}

@Composable
private fun PointsHalf(value: String, label: String, tint: Color, modifier: Modifier = Modifier) {
    Column(modifier = modifier.clip(RoundedCornerShape(12.dp)).background(tint.copy(alpha = 0.11f)).padding(11.dp)) {
        Text(value, style = SabqTheme.typography.statValue, color = tint)
        Text(label, style = SabqTheme.typography.metaSmall, color = tint.copy(alpha = 0.85f))
    }
}

private fun buildSteps(award: PredMyAward): List<String> {
    val steps = mutableListOf<String>()
    val pool = award.breakdown?.pool
    if (pool?.base != null) {
        val total = pool.base + (pool.carriedIn ?: 0)
        steps += if ((pool.carriedIn ?: 0) > 0)
            "بركة المباراة $total نقطة (${pool.base} أساس + ${pool.carriedIn} مُرحّلة)"
        else
            "بركة المباراة $total نقطة"
    }
    if (pool?.tierShare != null && pool.tierPoints != null && pool.winners != null) {
        steps += "حصة فئة «${award.reasonLabelAr}» ${(pool.tierShare * 100).toInt()}٪ = ${pool.tierPoints * pool.winners} نقطة"
        steps += "تقاسمها ${pool.winners} فائزًا → ${award.points} نقطة في ترتيب البطولة"
    }
    if (steps.isEmpty()) steps += "حصلت على ${award.points} نقطة — ${award.reasonLabelAr}"
    award.wallet?.let {
        steps += "مضاعف عضويتك ×${"%.1f".format(it.multiplier)} → ${it.walletPoints} نقطة أُودعت في محفظتك"
    }
    return steps
}
