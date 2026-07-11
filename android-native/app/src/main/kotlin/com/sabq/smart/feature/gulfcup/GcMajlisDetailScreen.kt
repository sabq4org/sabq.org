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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Replay
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.runtime.CompositionLocalProvider
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@Composable
internal fun GcMajlisDetailScreen(
    state: GcPredictionsViewModel.UiState,
    viewModel: GcPredictionsViewModel,
) {
    val majlis = state.selectedMajlis ?: return
    val colors = rememberGcMajlisPalette()
    val context = LocalContext.current
    var confirmExit by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(colors.appBg, colors.appBgMid, colors.appBg)))) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = viewModel::closeMajlis) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "رجوع", tint = colors.ink) }
            Text(majlis.name, color = colors.ink, fontSize = 17.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f), textAlign = TextAlign.Center, maxLines = 1)
            IconButton(onClick = { viewModel.refreshSelected() }) { Icon(Icons.Filled.Refresh, "تحديث", tint = colors.skyDeep) }
        }
        GcMajlisDetailHero(
            majlis,
            colors,
            onShare = { GcMajlisShare.shareInvite(context, majlis) },
            onExit = { confirmExit = true },
        )
        GcDetailSectionBar(state.detailSection, colors, viewModel::selectDetailSection)
        state.mutationError?.let { Text(it, color = colors.crimson, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
        state.detailError?.let { Text(it, color = colors.crimson, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)) }
        Box(Modifier.weight(1f)) {
            when (state.detailSection) {
                GcPredictionsViewModel.DetailSection.MATCHDAY -> GcMatchdaySection(state, viewModel, colors)
                GcPredictionsViewModel.DetailSection.RANKING -> GcMajlisRankingSection(state, colors)
                GcPredictionsViewModel.DetailSection.FANTASY -> GcMajlisFantasySection(state, colors)
                GcPredictionsViewModel.DetailSection.CHAMPION -> GcChampionPicksSection(state, colors)
                GcPredictionsViewModel.DetailSection.DUELS -> GcDuelsSection(state, viewModel, colors)
                GcPredictionsViewModel.DetailSection.HARVEST -> GcHarvestSection(state, colors)
            }
            if (state.detailLoading && state.matchday == null && state.board == null) {
                Box(Modifier.fillMaxSize().background(colors.appBg.copy(.62f)), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = colors.sky)
                }
            }
        }
    }

    if (confirmExit) {
        AlertDialog(
            onDismissRequest = { confirmExit = false },
            title = { Text(if (majlis.isOwner) "حذف المجلس نهائيًا؟" else "مغادرة هذا المجلس؟", fontFamily = IbmPlexSansArabic, fontWeight = FontWeight.Black) },
            text = { Text(if (majlis.isOwner) "سيُزال المجلس من جميع أعضائه ولا يمكن التراجع عن ذلك." else "ستختفي من ترتيب المجلس ويمكنك العودة لاحقًا برمز الدعوة.", fontFamily = IbmPlexSansArabic) },
            confirmButton = { Button(onClick = { viewModel.leaveSelected { confirmExit = false } }, enabled = !state.mutationInFlight) { Text(if (majlis.isOwner) "حذف نهائي" else "نعم، غادر", fontFamily = IbmPlexSansArabic) } },
            dismissButton = { TextButton(onClick = { confirmExit = false }) { Text("إلغاء", fontFamily = IbmPlexSansArabic) } },
        )
    }
}

@Composable
private fun GcMajlisDetailHero(majlis: GcMajlisSummary, colors: GcMajlisPalette, onShare: () -> Unit, onExit: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp).clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(colors.heroTop, colors.heroMid, colors.heroDeep)))
            .border(1.dp, Color.White.copy(.10f), RoundedCornerShape(24.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                if (majlis.isOwner) Text("👑 صاحب المجلس", color = colors.skyLite, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                Text(majlis.name, color = Color.White, fontSize = 23.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, maxLines = 2)
                Text("${majlis.membersCount} عضو", color = Color(0xFFB3E0E6), fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
            }
            IconButton(onClick = onShare, modifier = Modifier.clip(CircleShape).background(colors.skyLite)) { Icon(Icons.Filled.Share, "ادعُ مجلسك", tint = colors.skyDeep) }
            IconButton(onClick = onExit) { Icon(Icons.Filled.Close, if (majlis.isOwner) "حذف المجلس" else "مغادرة المجلس", tint = Color.White.copy(.75f)) }
        }
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(Color.White.copy(.07f)).padding(11.dp), verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("رمز الدعوة", color = Color.White.copy(.58f), fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) { Text(majlis.code, color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp) }
            }
            Spacer(Modifier.weight(1f))
            Text("النتائج لا تنكشف قبل الإقفال", color = Color(0xFFB3E0E6), fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        }
    }
}

@Composable
private fun GcDetailSectionBar(selected: GcPredictionsViewModel.DetailSection, colors: GcMajlisPalette, onSelect: (GcPredictionsViewModel.DetailSection) -> Unit) {
    val labels = listOf(
        Triple(GcPredictionsViewModel.DetailSection.MATCHDAY, "الجولة", Icons.Filled.CalendarMonth),
        Triple(GcPredictionsViewModel.DetailSection.RANKING, "الترتيب", Icons.Filled.EmojiEvents),
        Triple(GcPredictionsViewModel.DetailSection.FANTASY, "الفانتازي", Icons.Filled.Group),
        Triple(GcPredictionsViewModel.DetailSection.CHAMPION, "البطل", Icons.Filled.Star),
        Triple(GcPredictionsViewModel.DetailSection.DUELS, "التحديات", Icons.Filled.Bolt),
        Triple(GcPredictionsViewModel.DetailSection.HARVEST, "الحصاد", Icons.Filled.TrackChanges),
    )
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        labels.forEach { (section, title, icon) ->
            Row(
                Modifier.clip(RoundedCornerShape(50)).background(if (selected == section) colors.emerald else colors.card)
                    .border(1.dp, if (selected == section) Color.Transparent else colors.line, RoundedCornerShape(50))
                    .clickable { onSelect(section) }.padding(horizontal = 13.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(icon, null, tint = if (selected == section) Color.White else colors.inkDim, modifier = Modifier.size(15.dp))
                Text(title, color = if (selected == section) Color.White else colors.inkDim, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
            }
        }
    }
}

@Composable
private fun GcMatchdaySection(state: GcPredictionsViewModel.UiState, vm: GcPredictionsViewModel, colors: GcMajlisPalette) {
    val data = state.matchday
    if (data == null) return GcCenteredLoading("يتم تحميل توقعات المجلس", colors)
    val listState = rememberLazyListState()
    val highlightedFixtureId = state.highlightedFixtureId
    val statusCardCount = if (
        (data.dayChampion.status == "final" && data.dayChampion.winners.isNotEmpty()) ||
        data.dayChampion.status == "in_progress"
    ) 1 else 0
    LaunchedEffect(data.date, highlightedFixtureId, data.matches) {
        val matchIndex = data.matches.indexOfFirst { it.fixture.id == highlightedFixtureId }
        if (matchIndex >= 0) listState.animateScrollToItem(1 + statusCardCount + matchIndex)
    }
    LazyColumn(
        state = listState,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { GcDayNavigator(data.date, state.detailLoading, colors, vm::loadMatchday) }
        if (data.dayChampion.status == "final" && data.dayChampion.winners.isNotEmpty()) item { GcDayChampion(data.dayChampion, colors) }
        else if (data.dayChampion.status == "in_progress") item {
            Text("تُسوّى الجولة الآن: ${data.dayChampion.settledMatches} من ${data.dayChampion.totalMatches} مباريات", color = colors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(16.dp)).padding(13.dp))
        }
        if (data.matches.isEmpty()) item { GcSectionEmpty("لا مباريات في هذا اليوم", "انتقل إلى يوم آخر أو عُد عند اقتراب الجولة.", colors) }
        itemsIndexed(data.matches, key = { _, match -> match.fixture.id }) { _, match ->
            GcMajlisMatchCard(match, highlighted = match.fixture.id == highlightedFixtureId, colors = colors)
        }
    }
}

@Composable private fun GcDayNavigator(date: String, loading: Boolean, colors: GcMajlisPalette, load: (String?) -> Unit) {
    val parsed = runCatching { LocalDate.parse(date) }.getOrNull()
    val label = parsed?.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale("ar", "SA"))) ?: date
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { parsed?.minusDays(1)?.let { load(it.toString()) } }, enabled = !loading) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "اليوم السابق", tint = colors.skyDeep) }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("يوم المباريات", color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
            Text(label, color = colors.ink, fontSize = 16.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
        }
        IconButton(onClick = { parsed?.plusDays(1)?.let { load(it.toString()) } }, enabled = !loading) { Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "اليوم التالي", tint = colors.skyDeep) }
    }
}

@Composable private fun GcDayChampion(champion: GcMajlisDayChampion, colors: GcMajlisPalette) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Brush.linearGradient(listOf(colors.heroTop, colors.heroDeep))).padding(15.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.EmojiEvents, null, tint = colors.skyLite)
            Text(if (champion.winners.size > 1) " أبطال اليوم" else " بطل اليوم", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f))
            Text("${champion.settledMatches}/${champion.totalMatches}", color = Color.White.copy(.68f), fontSize = 10.sp)
        }
        champion.winners.forEach { winner ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                GcAvatar(winner.avatar, winner.name, 32, colors)
                Text(winner.name, color = Color.White, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f))
                Text("+${winner.points}", color = colors.skyLite, fontSize = 16.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable private fun GcMajlisMatchCard(match: GcMajlisMatchdayMatch, highlighted: Boolean, colors: GcMajlisPalette) {
    val voided = GcEvaluation.isVoid(
        match.result?.status,
        match.fixture.status.code,
        match.visibility,
        *match.members.mapNotNull { it.prediction?.evaluation }.toTypedArray(),
    )
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card)
            .border(if (highlighted) 2.dp else 1.dp, if (highlighted) colors.sky else colors.line, RoundedCornerShape(18.dp))
            .semantics {
                if (highlighted) contentDescription = "المباراة المطلوبة: ${match.fixture.home.name} ضد ${match.fixture.away.name}"
            },
    ) {
        Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                GcPill(match.fixture.round, colors.inkDim, colors); Spacer(Modifier.weight(1f))
                val sealed = match.visibility == "sealed" && !voided
                Row(Modifier.clip(RoundedCornerShape(50)).background((if (sealed || voided) colors.inkFaint else colors.emerald).copy(.11f)).padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (sealed) Icons.Filled.Lock else Icons.Filled.LockOpen, null, tint = if (sealed || voided) colors.inkDim else colors.emeraldDeep, modifier = Modifier.size(13.dp))
                    Text(
                        when { voided -> " أُلغيت المباراة"; sealed -> " التوقعات مختومة"; else -> " انكشفت التوقعات" },
                        color = if (sealed || voided) colors.inkDim else colors.emeraldDeep,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = IbmPlexSansArabic,
                    )
                }
            }
            GcFixtureScore(match.fixture, voided, colors)
            if (voided) {
                Text(
                    GcEvaluation.label(GcEvaluation.VOID),
                    color = colors.inkDim,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    fontFamily = IbmPlexSansArabic,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(11.dp)).background(colors.chip).padding(9.dp),
                )
            }
        }
        match.members.sortedWith(compareByDescending<GcMajlisMemberPrediction> { it.isViewer }.thenBy { it.name }).forEachIndexed { index, member ->
            if (index > 0) Box(Modifier.fillMaxWidth().padding(start = 52.dp).height(1.dp).background(colors.line))
            GcMajlisMemberRow(member, match.visibility, voided, colors)
        }
    }
}

@Composable private fun GcFixtureScore(fixture: GcFixture, voided: Boolean, colors: GcMajlisPalette) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        GcSmallTeam(fixture.home, Modifier.weight(1f), colors)
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Text(if (voided) "—" else if (fixture.status.live || fixture.status.finished) "${fixture.goals.away ?: 0} - ${fixture.goals.home ?: 0}" else "VS", color = colors.ink, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 8.dp))
        }
        GcSmallTeam(fixture.away, Modifier.weight(1f), colors)
    }
}

@Composable private fun GcSmallTeam(team: GcTeam, modifier: Modifier, colors: GcMajlisPalette) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        AsyncImage(team.logo, team.name, modifier = Modifier.size(30.dp).clip(CircleShape).background(Color.White).padding(4.dp))
        Text(team.name, color = colors.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, maxLines = 1)
    }
}

@Composable private fun GcMajlisMemberRow(member: GcMajlisMemberPrediction, visibility: String, voided: Boolean, colors: GcMajlisPalette) {
    Row(Modifier.fillMaxWidth().background(if (member.isViewer) colors.sky.copy(.06f) else Color.Transparent).padding(horizontal = 13.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
        GcAvatar(member.avatar, member.name, 30, colors)
        Column(Modifier.weight(1f)) {
            Text(member.name + if (member.isOwner) " 👑" else if (member.isViewer) " · أنا" else "", color = colors.ink, fontSize = 12.sp, fontWeight = if (member.isViewer) FontWeight.Black else FontWeight.SemiBold, fontFamily = IbmPlexSansArabic, maxLines = 1)
            val prediction = member.prediction
            if (voided) Text(GcEvaluation.label(GcEvaluation.VOID), color = GcEvaluation.color(GcEvaluation.VOID, colors), fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
            else if (prediction != null) Text(GcEvaluation.label(prediction.evaluation), color = GcEvaluation.color(prediction.evaluation, colors), fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
            else if (visibility != "sealed" && !member.hasPredicted) Text("لم يشارك في هذه المباراة", color = colors.inkFaint, fontSize = 9.sp, fontFamily = IbmPlexSansArabic)
        }
        if (voided) {
            Text("لا تُحتسب", color = colors.inkDim, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        } else if (visibility == "sealed") {
            Text(if (member.hasPredicted) "توقّع ✓" else "لم يتوقّع", color = if (member.hasPredicted) colors.emerald else colors.inkFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        } else member.prediction?.let { prediction ->
            Column(horizontalAlignment = Alignment.End) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) { Text("${prediction.away} - ${prediction.home}", color = colors.ink, fontSize = 15.sp, fontWeight = FontWeight.Black) }
                if (prediction.points > 0) Text("+${prediction.points}", color = colors.skyDeep, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable private fun GcMajlisRankingSection(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    val rows = state.board?.rows.orEmpty()
    if (rows.isEmpty()) return GcSectionEmptyFull("الترتيب لم يبدأ", "تظهر المراكز بعد أول مباراة مسوّاة.", colors)
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(rows, key = { it.userId }) { row ->
            GcRankRow(
                row.rank,
                row.name + (if (row.isOwner) " 👑" else "") + (if (row.isDayChampion) " 🏆" else ""),
                row.avatar,
                row.totalPoints,
                row.userId == state.user?.id,
                colors,
                buildString {
                    if (row.isDayChampion) append("بطل الجولة · ")
                    append("${row.correctCount} إصابة · ${row.exactCount} دقيقة")
                },
            )
        }
    }
}

@Composable private fun GcMajlisFantasySection(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    val rows = state.majlisFantasy?.rows.orEmpty()
    if (rows.isEmpty()) return GcSectionEmptyFull("لا تشكيلات بعد", "كوّن تشكيلتك من تبويب الفانتازي وابدأ المنافسة.", colors)
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { GcSectionHeading("فانتازي المجلس", "ترتيب تشكيلات أعضاء المجلس فقط", Icons.Filled.Group, colors) }
        items(rows, key = { it.userId }) { row -> GcRankRow(row.rank, row.name + if (row.isOwner) " 👑" else "", row.avatar, row.totalPoints, row.isViewer, colors, if (row.hasSquad) "نقاط التشكيلة" else "لم يكوّن تشكيلة بعد") }
    }
}

@Composable private fun GcChampionPicksSection(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    val data = state.championPicks ?: return GcCenteredLoading("يتم تحميل اختيارات البطل", colors)
    if (data.members.isEmpty()) return GcSectionEmptyFull("لا اختيارات بعد", "ستظهر مشاركة الأعضاء هنا.", colors)
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(16.dp)).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (data.visibility == "sealed") Icons.Filled.Lock else Icons.Filled.Star, null, tint = colors.sky)
                Text(if (data.visibility == "sealed") " الاختيارات مختومة حتى إقفال توقع البطل" else " اختيارات أعضاء المجلس للبطل", color = colors.ink, fontSize = 12.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
            }
        }
        items(data.members, key = { it.userId }) { member ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(if (member.isViewer) colors.sky.copy(.06f) else colors.card).border(1.dp, colors.line, RoundedCornerShape(15.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                GcAvatar(member.avatar, member.name, 30, colors)
                Text(member.name + if (member.isOwner) " 👑" else "", color = colors.ink, fontWeight = if (member.isViewer) FontWeight.Black else FontWeight.SemiBold, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f), maxLines = 1)
                when {
                    data.visibility == "sealed" -> Text(if (member.hasPicked) "اختار ✓" else "لم يختر", color = if (member.hasPicked) colors.emerald else colors.inkFaint, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                    member.pick != null -> Column(horizontalAlignment = Alignment.End) { Text(member.pick.teamName, color = colors.skyDeep, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic); if (member.pick.points > 0) Text("+${member.pick.points}", color = colors.emerald, fontSize = 9.sp) }
                    else -> Text("بلا اختيار", color = colors.inkFaint, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
                }
            }
        }
    }
}

@Composable private fun GcDuelsSection(state: GcPredictionsViewModel.UiState, vm: GcPredictionsViewModel, colors: GcMajlisPalette) {
    val data = state.duels
    var showCreate by remember { mutableStateOf(false) }
    val eligibleMatches = state.matchday?.matches.orEmpty().filter { !it.fixture.status.live && !it.fixture.status.finished && it.fixture.timestamp.toLong() > System.currentTimeMillis() / 1000L }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) { Text("تحديات 1×1", color = colors.ink, fontSize = 17.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic); Text("تحدَّ عضوًا على مباراة بنقاط الولاء", color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) }
                Button(onClick = { showCreate = true }, enabled = data?.eligibleMembers?.isNotEmpty() == true && eligibleMatches.isNotEmpty()) { Icon(Icons.Filled.Add, null, modifier = Modifier.size(15.dp)); Text(" تحدٍ جديد", fontFamily = IbmPlexSansArabic, fontSize = 11.sp) }
            }
        }
        if (data == null) item { GcLoadingCardDetail("يتم تحميل التحديات", colors) }
        else if (data.duels.isEmpty()) item { GcSectionEmpty("لا تحديات بعد", "اختر عضوًا ومباراة وابدأ أول تحدٍ.", colors) }
        else items(data.duels, key = { it.id }) { duel -> GcDuelCard(duel, state.user?.id, state.matchday, state.mutationInFlight, colors, vm::mutateDuel) }
    }
    if (showCreate && data != null) {
        GcCreateDuelDialog(
            members = data.eligibleMembers,
            matches = eligibleMatches,
            loading = state.mutationInFlight,
            error = state.mutationError,
            colors = colors,
            onDismiss = { showCreate = false; vm.clearMutationError() },
            onSubmit = { member, fixture, stake -> vm.createDuel(member, fixture, stake) { showCreate = false } },
        )
    }
}

@Composable private fun GcDuelCard(duel: GcMajlisDuel, viewerId: String?, matchday: GcMajlisMatchdayResponse?, loading: Boolean, colors: GcMajlisPalette, mutate: (String, String) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(13.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row { GcPill(GcDuelStatus.label(duel.status), GcDuelStatus.color(duel.status, colors), colors); Spacer(Modifier.weight(1f)); Text("◆ ${duel.stake}", color = colors.skyDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            GcDuelParticipant(duel.challenger, colors, Modifier.weight(1f)); Text("⚡ ضد", color = colors.sky, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic); GcDuelParticipant(duel.challenged, colors, Modifier.weight(1f))
        }
        matchday?.matches?.firstOrNull { it.fixture.id == duel.fixtureId }?.fixture?.let { fixture -> Text("${fixture.home.name} × ${fixture.away.name}", color = colors.inkDim, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
        if (duel.status == "pending" && viewerId == duel.challenged.userId) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { GcDuelAction("قبول", colors.emerald, loading, Modifier.weight(1f)) { mutate(duel.id, "accept") }; GcDuelAction("رفض", colors.crimson, loading, Modifier.weight(1f)) { mutate(duel.id, "decline") } }
        } else if (duel.status == "pending" && viewerId == duel.challenger.userId) {
            GcDuelAction("إلغاء التحدي", colors.crimson, loading, Modifier.fillMaxWidth()) { mutate(duel.id, "cancel") }
        }
    }
}

@Composable private fun GcDuelParticipant(person: GcMajlisDuelParticipant, colors: GcMajlisPalette, modifier: Modifier) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) { GcAvatar(person.avatar, person.name, 38, colors); Text(person.name, color = colors.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, maxLines = 1) }
}

@Composable private fun GcDuelAction(title: String, tint: Color, loading: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Text(title, color = tint, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center, modifier = modifier.clip(RoundedCornerShape(12.dp)).background(tint.copy(.10f)).clickable(enabled = !loading, onClick = onClick).padding(vertical = 12.dp))
}

@Composable private fun GcCreateDuelDialog(members: List<GcMajlisDuelParticipant>, matches: List<GcMajlisMatchdayMatch>, loading: Boolean, error: String?, colors: GcMajlisPalette, onDismiss: () -> Unit, onSubmit: (String, Int, Int) -> Unit) {
    var memberId by remember { mutableStateOf("") }
    var fixtureId by remember { mutableIntStateOf(0) }
    var stake by remember { mutableIntStateOf(50) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("تحدٍ جديد", fontFamily = IbmPlexSansArabic, fontWeight = FontWeight.Black) },
        text = {
            Column(
                Modifier.fillMaxWidth().heightIn(max = 470.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(9.dp),
            ) {
                Text("العضو المنافس", color = colors.inkDim, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                members.forEach { member -> GcChoiceRow(member.name, memberId == member.userId, colors) { memberId = member.userId } }
                Text("المباراة", color = colors.inkDim, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                matches.take(5).forEach { match -> GcChoiceRow("${match.fixture.home.name} × ${match.fixture.away.name}", fixtureId == match.fixture.id, colors) { fixtureId = match.fixture.id } }
                Text("نقاط التحدي", color = colors.inkDim, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.fillMaxWidth()) { listOf(10, 50, 100).forEach { value -> Text("$value", color = if (stake == value) Color.White else colors.inkDim, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, modifier = Modifier.weight(1f).clip(RoundedCornerShape(50)).background(if (stake == value) colors.emerald else colors.chip).clickable { stake = value }.padding(9.dp)) } }
                error?.let { Text(it, color = colors.crimson, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) }
            }
        },
        confirmButton = { Button(onClick = { onSubmit(memberId, fixtureId, stake) }, enabled = !loading && memberId.isNotEmpty() && fixtureId != 0) { Text("إرسال التحدي", fontFamily = IbmPlexSansArabic) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء", fontFamily = IbmPlexSansArabic) } },
    )
}

@Composable private fun GcChoiceRow(label: String, selected: Boolean, colors: GcMajlisPalette, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (selected) colors.sky.copy(.10f) else colors.chip).clickable(onClick = onClick).padding(10.dp), verticalAlignment = Alignment.CenterVertically) { Text(label, color = colors.ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f), maxLines = 1); if (selected) Icon(Icons.Filled.CheckCircle, null, tint = colors.sky, modifier = Modifier.size(17.dp)) }
}

@Composable private fun GcHarvestSection(state: GcPredictionsViewModel.UiState, colors: GcMajlisPalette) {
    val data = state.harvest ?: return GcCenteredLoading("يتم تجهيز حصاد المجلس", colors)
    if (data.status != "ready") return GcSectionEmptyFull("الحصاد بعد النهائي", "تُفتح بطاقة أبطال المجلس وألقابه فور نهاية البطولة.", colors)
    val context = LocalContext.current
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
        item {
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Brush.linearGradient(listOf(colors.heroTop, colors.heroDeep))).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Filled.EmojiEvents, null, tint = colors.skyLite, modifier = Modifier.size(32.dp))
                Text("حصاد المجلس", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                data.awards.champions.forEach { champion -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(Color.White.copy(.08f)).padding(11.dp), verticalAlignment = Alignment.CenterVertically) { GcAvatar(champion.avatar, champion.name, 38, colors); Text(champion.name, color = Color.White, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f).padding(horizontal = 9.dp)); Text("${champion.totalPoints}", color = colors.skyLite, fontSize = 21.sp, fontWeight = FontWeight.Black) } }
            }
        }
        item { GcActionButton("شارك حصاد المجلس", colors.skyDeep, { GcMajlisShare.shareHarvest(context, data) }) }
        if (data.awards.mostAccurate.isNotEmpty()) item { GcAwardBlock("الأدق", data.awards.mostAccurate.map { Triple(it.name, "دقة ${GcPercent.format(it.accuracy)}", it.avatar) }, Icons.Filled.TrackChanges, colors) }
        if (data.awards.boldest.isNotEmpty()) item { GcAwardBlock("الأجرأ", data.awards.boldest.map { Triple(it.name, "أصاب اختيارًا باحتمال ${GcPercent.format(it.pickProb)}", it.avatar) }, Icons.Filled.Bolt, colors) }
        if (data.awards.stubborn.isNotEmpty()) item { GcAwardBlock("العنيد", data.awards.stubborn.map { Triple(it.name, "اختار ${it.teamName} في ${it.picksCount} مباريات", it.avatar) }, Icons.Filled.Replay, colors) }
    }
}

@Composable private fun GcAwardBlock(title: String, rows: List<Triple<String, String, String?>>, icon: androidx.compose.ui.graphics.vector.ImageVector, colors: GcMajlisPalette) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        GcSectionHeading(title, null, icon, colors)
        rows.forEach { row -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(15.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(15.dp)).padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) { GcAvatar(row.third, row.first, 32, colors); Column { Text(row.first, color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic); Text(row.second, color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) } } }
    }
}

@Composable private fun GcSectionHeading(title: String, subtitle: String?, icon: androidx.compose.ui.graphics.vector.ImageVector, colors: GcMajlisPalette) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) { Icon(icon, null, tint = colors.sky, modifier = Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(colors.sky.copy(.10f)).padding(7.dp)); Column { Text(title, color = colors.ink, fontSize = 16.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic); subtitle?.let { Text(it, color = colors.inkDim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) } } }
}

@Composable private fun GcAvatar(url: String?, name: String, size: Int, colors: GcMajlisPalette) {
    if (url.isNullOrBlank()) Box(Modifier.size(size.dp).clip(CircleShape).background(colors.chip), contentAlignment = Alignment.Center) { Icon(Icons.Filled.Person, name, tint = colors.inkFaint, modifier = Modifier.size((size * .52f).dp)) }
    else AsyncImage(url, name, modifier = Modifier.size(size.dp).clip(CircleShape).background(colors.chip))
}

@Composable private fun GcSectionEmptyFull(title: String, subtitle: String, colors: GcMajlisPalette) { Box(Modifier.fillMaxSize().padding(16.dp), contentAlignment = Alignment.Center) { GcSectionEmpty(title, subtitle, colors) } }
@Composable private fun GcSectionEmpty(title: String, subtitle: String, colors: GcMajlisPalette) { Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(colors.card).border(1.dp, colors.line, RoundedCornerShape(18.dp)).padding(vertical = 26.dp, horizontal = 18.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) { Icon(Icons.Filled.Group, null, tint = colors.emerald, modifier = Modifier.size(30.dp)); Text(title, color = colors.ink, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic); Text(subtitle, color = colors.inkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic, textAlign = TextAlign.Center) } }
@Composable private fun GcLoadingCardDetail(title: String, colors: GcMajlisPalette) { Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(colors.card).padding(20.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(color = colors.sky, strokeWidth = 2.dp, modifier = Modifier.size(20.dp)); Text("  $title", color = colors.inkDim, fontFamily = IbmPlexSansArabic) } }

private object GcEvaluation {
    const val VOID = "void"
    fun isVoid(vararg values: String?): Boolean = values.any { it.equals(VOID, ignoreCase = true) }
    fun label(value: String) = when (value) { VOID -> "أُلغيت المباراة — لا تُحتسب"; "exact" -> "النتيجة الدقيقة"; "margin" -> "الفارق الصحيح"; "outcome" -> "النتيجة الصحيحة"; "pending" -> "بانتظار النتيجة"; else -> "لم تُصب" }
    fun color(value: String, colors: GcMajlisPalette) = if (value in setOf("exact", "margin", "outcome")) colors.emerald else if (value == "pending" || value == VOID) colors.inkDim else colors.inkFaint
}
private object GcDuelStatus {
    fun label(value: String) = when (value) { "pending" -> "بانتظار الرد"; "accepted" -> "مقبول"; "declined" -> "مرفوض"; "cancelled" -> "ملغى"; "expired" -> "انتهت صلاحيته"; "settled" -> "تمت التسوية"; "refunded" -> "أُعيد الرهان"; else -> value }
    fun color(value: String, colors: GcMajlisPalette) = when (value) { "accepted", "settled" -> colors.emerald; "declined", "cancelled", "expired", "refunded" -> colors.inkFaint; else -> colors.skyDeep }
}
private object GcPercent { fun format(value: Double): String = "${if (value <= 1) (value * 100).toInt() else value.toInt()}%" }
