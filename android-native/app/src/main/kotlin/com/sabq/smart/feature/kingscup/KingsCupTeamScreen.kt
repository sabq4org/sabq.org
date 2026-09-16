package com.sabq.smart.feature.kingscup

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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

// صفحة نادي كأس الملك — port ‏1:1 لـiOS `KcTeamSheet` + `KingsCupTeamSections`:
// الأساس يرسم فورًا، والإثراء (?with=stats) والمباريات والسجل تظهر تباعًا.
// iOS يعرضها كورقة بينما أندرويد وجهة كاملة — عرف بقية أقسام التطبيق.

@Composable
fun KingsCupTeamScreen(
    teamId: Int,
    previewName: String,
    previewLogo: String,
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    viewModel: KcTeamViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var openPlayerId by rememberSaveable { mutableStateOf<Int?>(null) }
    LaunchedEffect(teamId) { viewModel.load(teamId) }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(KingsCupColors.sectionBackground)) {
            KcScreenHeader(state.profile?.team?.name ?: previewName.ifEmpty { "النادي" }, onBack)
            val profile = state.profile
            when {
                profile == null && state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = KingsCupColors.emeraldDeep)
                }
                profile == null -> Column(
                    Modifier.fillMaxWidth().padding(vertical = 40.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("تعذر جلب صفحة النادي", color = KingsCupColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text(state.error.orEmpty(), color = KingsCupColors.onDarkDim, fontSize = 12.sp, textAlign = TextAlign.Center)
                    Text(
                        "إعادة المحاولة", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.emeraldDeep)
                            .clickable { viewModel.load(teamId) }.padding(horizontal = 18.dp, vertical = 9.dp),
                    )
                }
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 4.dp, bottom = 26.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    item { KcTeamHeader(profile, previewName, previewLogo) }
                    (state.extras?.coach ?: profile.coach)?.let { coach -> item { KcCoachCard(coach) } }
                    state.extras?.kcStats?.let { cup ->
                        item { KcTeamStatsCard("مشوار النادي في كأس الملك", "نسخة ${KcFormat.seasonLabel(cup.season)}", cup.stats) }
                    }
                    state.extras?.stats?.let { league ->
                        item { KcTeamStatsCard("نبض الأرقام", profile.competitionName ?: "بطولة النادي", league) }
                    }
                    val m = state.matches
                    if (m != null && (m.fixtures.isNotEmpty() || m.previous != null)) {
                        item { KcTeamMatchesBlock(m, onOpenMatch) }
                    } else if (profile.fixtures.isNotEmpty()) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("مباريات النادي", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                                profile.fixtures.forEach { f -> KcTeamFixtureRow(f) { onOpenMatch(f.id) } }
                            }
                        }
                    }
                    val scorers = state.extras?.topScorers ?: profile.topScorers
                    if (scorers.isNotEmpty()) {
                        item { KcTeamScorersBlock(scorers) { openPlayerId = it } }
                    }
                    state.extras?.transfers?.takeIf { it.arrivals.isNotEmpty() || it.departures.isNotEmpty() }?.let { t ->
                        item { KcTransfersBlock(t) }
                    }
                    state.record?.let { record -> item { KcTeamTitlesBlock(teamId, record) } }
                    if (profile.squad.isNotEmpty()) {
                        item { KcSquadBlock(profile.squad) { openPlayerId = it } }
                    }
                }
            }
        }
    }

    openPlayerId?.let { playerId ->
        KcPlayerSheet(playerId = playerId, onDismiss = { openPlayerId = null })
    }
}

// ── الهوية ──

@Composable
private fun KcTeamHeader(p: KcTeamProfile, previewName: String, previewLogo: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = kcCardModifier(20).padding(16.dp),
    ) {
        Box(
            Modifier.size(72.dp).clip(CircleShape).background(Color.White)
                .border(1.dp, KingsCupColors.cardStroke, CircleShape).padding(8.dp),
            contentAlignment = Alignment.Center,
        ) {
            AsyncImage(
                model = p.team.logo.ifEmpty { previewLogo }, contentDescription = null,
                contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth(),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(p.team.name.ifEmpty { previewName }, color = KingsCupColors.onDark, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            p.team.founded?.let {
                Text("تأسّس $it", color = KingsCupColors.onDarkDim, fontSize = 12.sp)
            }
            p.team.venue?.takeIf { it.name.isNotEmpty() }?.let { v ->
                Text(
                    "🏟 ${v.name}${if (v.city.isEmpty()) "" else " — ${v.city}"}",
                    color = KingsCupColors.onDarkDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

// ── بطاقة المدرب بمسيرته ──

@Composable
private fun KcCoachCard(coach: KcCoach) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = kcCardModifier(16).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (coach.photo.isEmpty()) {
                Box(Modifier.size(44.dp).clip(CircleShape).background(KingsCupColors.chipFill), contentAlignment = Alignment.Center) {
                    Text("👤", fontSize = 15.sp)
                }
            } else {
                AsyncImage(
                    model = coach.photo, contentDescription = null, contentScale = ContentScale.Crop,
                    modifier = Modifier.size(44.dp).clip(CircleShape)
                        .border(2.dp, KingsCupColors.emeraldDeep.copy(alpha = 0.4f), CircleShape),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text("المدرّب", color = KingsCupColors.emeraldDeep, fontSize = 10.sp, fontWeight = FontWeight.Medium)
                Text(coach.name, color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                val details = buildList {
                    coach.nationality?.takeIf { it.isNotEmpty() }?.let { add(it) }
                    coach.age?.let { add("$it سنة") }
                }.joinToString(" · ")
                if (details.isNotEmpty()) Text(details, color = KingsCupColors.onDarkDim, fontSize = 10.sp)
            }
        }
        if (coach.career.size > 1) {
            Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text("المسيرة التدريبية", color = KingsCupColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                coach.career.take(5).forEach { stop ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(5.dp).clip(CircleShape).background(KingsCupColors.emerald.copy(alpha = 0.5f)))
                        Text(stop.team, color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1, modifier = Modifier.weight(1f))
                        KcLtrText(
                            "${stop.start?.take(7) ?: "—"} – ${stop.end?.take(7) ?: "الآن"}",
                            KingsCupColors.onDarkDim, 10, FontWeight.Normal,
                        )
                    }
                }
            }
        }
    }
}

// ── نبض الأرقام (إحصائيات موسمية — كأس أو دوري) ──

@Composable
private fun KcTeamStatsCard(title: String, subtitle: String, stats: KcTeamStats) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = kcCardModifier(16).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("📈", fontSize = 14.sp)
            Column {
                Text(title, color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = KingsCupColors.onDarkDim, fontSize = 10.sp)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KcFactTile("${stats.fixtures.played.total}", "مباريات", Modifier.weight(1f))
            KcFactTile("${stats.fixtures.wins.total}-${stats.fixtures.draws.total}-${stats.fixtures.loses.total}", "ف-ت-خ", Modifier.weight(1f))
            KcFactTile("${stats.goals.scored.total}/${stats.goals.against.total}", "له/عليه", Modifier.weight(1f))
            KcFactTile("${stats.summary.cleanSheets.total}", "نظافة شباك", Modifier.weight(1f))
        }

        val chips = buildList {
            stats.biggest?.winsHome?.let { add("أكبر فوز بالأرض $it") }
            stats.biggest?.winsAway?.let { add("أكبر فوز خارجًا $it") }
            stats.biggest?.streakWin?.takeIf { it > 1 }?.let { add("سلسلة فوز $it") }
            stats.summary.mostUsedFormation?.let { add("التشكيلة $it") }
            add("🟨 ${stats.summary.cards.yellowTotal} · 🟥 ${stats.summary.cards.redTotal}")
        }
        if (chips.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                chips.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        row.forEach { chip ->
                            Text(
                                chip, color = KingsCupColors.onDark, fontSize = 10.sp,
                                maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
                                modifier = Modifier.weight(1f).clip(RoundedCornerShape(50))
                                    .background(KingsCupColors.chipFill).padding(horizontal = 8.dp, vertical = 5.dp),
                            )
                        }
                        repeat(2 - row.size) { Spacer(Modifier.weight(1f)) }
                    }
                }
            }
        }

        if (stats.timing.isNotEmpty()) KcGoalTimingChart(stats.timing)
    }
}

@Composable
internal fun KcFactTile(value: String, label: String, modifier: Modifier) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp),
        modifier = modifier.clip(RoundedCornerShape(12.dp)).background(KingsCupColors.chipFill).padding(vertical = 9.dp),
    ) {
        KcLtrText(value, KingsCupColors.onDark, 14)
        Text(label, color = KingsCupColors.emeraldDeep, fontSize = 9.sp, maxLines = 1)
    }
}

/** توزيع الأهداف حسب فترات الدقائق — شريطا سجّل/استقبل لكل فترة (أقصى ارتفاع 52dp). */
@Composable
private fun KcGoalTimingChart(timing: List<KcGoalTiming>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("توزيع الأهداف حسب الدقائق", color = KingsCupColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.weight(1f))
            KcChartLegend(KingsCupColors.emeraldDeep, "سجّل")
            Spacer(Modifier.width(8.dp))
            KcChartLegend(KingsCupColors.liveRed, "استقبل")
        }
        val maxVal = timing.maxOfOrNull { maxOf(it.scored, it.against) }?.coerceAtLeast(1) ?: 1
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.fillMaxWidth()) {
                timing.forEach { t ->
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
                        modifier = Modifier.weight(1f),
                    ) {
                        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                            Box(
                                Modifier.width(6.dp).height((52.dp * t.scored / maxVal).coerceAtLeast(3.dp))
                                    .clip(RoundedCornerShape(3.dp)).background(KingsCupColors.emeraldDeep.copy(alpha = 0.85f)),
                            )
                            Box(
                                Modifier.width(6.dp).height((52.dp * t.against / maxVal).coerceAtLeast(3.dp))
                                    .clip(RoundedCornerShape(3.dp)).background(KingsCupColors.liveRed.copy(alpha = 0.7f)),
                            )
                        }
                        Text(t.bucket, color = KingsCupColors.onDarkDim, fontSize = 7.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

@Composable
private fun KcChartLegend(color: Color, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        Box(Modifier.size(8.dp).clip(RoundedCornerShape(2.dp)).background(color))
        Text(label, color = KingsCupColors.onDarkDim, fontSize = 9.sp)
    }
}

// ── مباريات النادي في الكأس (نسختان) ──

@Composable
private fun KcTeamMatchesBlock(matches: KcTeamMatches, onOpenMatch: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("مباريات النادي في كأس الملك", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        if (matches.fixtures.isNotEmpty()) {
            matches.season?.let {
                Text("نسخة ${KcFormat.seasonLabel(it)}", color = KingsCupColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            }
            matches.fixtures.forEach { f -> KcTeamFixtureRow(f) { onOpenMatch(f.id) } }
        }
        matches.previous?.let { prev ->
            Text(
                "مشواره في نسخة ${KcFormat.seasonLabel(prev.season)}",
                color = KingsCupColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = if (matches.fixtures.isEmpty()) 0.dp else 6.dp),
            )
            prev.fixtures.forEach { f -> KcTeamFixtureRow(f) { onOpenMatch(f.id) } }
        }
    }
}

@Composable
private fun KcTeamFixtureRow(f: KcFixture, onOpen: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = kcCardModifier(12).clickable(onClick = onOpen).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        KcTeamLogo(f.home.logo, size = 24, padding = 2)
        Box(Modifier.width(48.dp), contentAlignment = Alignment.Center) {
            if (f.started) {
                KcLtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", KingsCupColors.onDark, 11, FontWeight.Normal)
            } else {
                Text(KcFormat.time(f), color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1)
            }
        }
        KcTeamLogo(f.away.logo, size = 24, padding = 2)
        Spacer(Modifier.weight(1f))
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(f.round, color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
            Text(KcFormat.day(f), color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
        }
    }
}

// ── هدّافو النادي ──

@Composable
private fun KcTeamScorersBlock(scorers: List<KcTeamTopScorer>, onOpenPlayer: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("هدّافو النادي", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        scorers.forEach { s ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = kcCardModifier(12).clickable(enabled = s.id > 0) { onOpenPlayer(s.id) }
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                if (s.photo.isEmpty()) {
                    Box(Modifier.size(32.dp).clip(CircleShape).background(KingsCupColors.chipFill))
                } else {
                    AsyncImage(
                        model = s.photo, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(32.dp).clip(CircleShape).background(KingsCupColors.chipFill),
                    )
                }
                Text(
                    s.name, color = KingsCupColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold,
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
                )
                Text("${s.goals}", color = KingsCupColors.emeraldDeep, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text("هدف", color = KingsCupColors.onDarkDim, fontSize = 10.sp)
            }
        }
    }
}

// ── حركة الانتقالات ──

@Composable
private fun KcTransfersBlock(transfers: KcTeamTransfers) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("حركة الانتقالات", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        if (transfers.arrivals.isNotEmpty()) KcTransfersColumn("وصل", KingsCupColors.emeraldDeep, transfers.arrivals, incoming = true)
        if (transfers.departures.isNotEmpty()) KcTransfersColumn("غادر", KingsCupColors.liveRed, transfers.departures, incoming = false)
    }
}

@Composable
private fun KcTransfersColumn(title: String, tint: Color, items: List<KcTeamTransfer>, incoming: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(if (incoming) "↙" else "↗", color = tint, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Text(title, color = tint, fontSize = 11.sp, fontWeight = FontWeight.Medium)
            Text("(${items.size})", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
        }
        items.take(5).forEach { t ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = kcCardModifier(12).padding(horizontal = 10.dp, vertical = 7.dp),
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text(t.player, color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(if (incoming) "من" else "إلى", color = KingsCupColors.onDarkDim, fontSize = 10.sp)
                        if (t.teamLogo.isNotEmpty()) {
                            AsyncImage(model = t.teamLogo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(14.dp))
                        }
                        Text(t.team, color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
                    }
                }
                if (t.type.isNotEmpty()) {
                    Text(
                        t.type, color = KingsCupColors.onDarkDim, fontSize = 9.sp,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.chipFill).padding(horizontal = 6.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

// ── خزينة ألقاب النادي في الكأس ──

@Composable
private fun KcTeamTitlesBlock(teamId: Int, record: KcRecord) {
    val editions = record.editions.filter { it.champion?.id == teamId }
    if (editions.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🏆", fontSize = 13.sp)
            Text("ألقابه في كأس الملك", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
            record.sinceSeason?.let {
                Text("ضمن المدى المتاح منذ ${KcFormat.seasonLabel(it)}", color = KingsCupColors.onDarkDim, fontSize = 9.sp)
            }
        }
        editions.forEach { e ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp)).background(KingsCupColors.gold.copy(alpha = 0.08f))
                    .border(0.5.dp, KingsCupColors.gold.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text("🏆", fontSize = 15.sp)
                Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text("نسخة ${KcFormat.seasonLabel(e.season)}", color = KingsCupColors.onDark, fontSize = 11.sp)
                    e.runnerUp?.let { runnerUp ->
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text("على حساب ${runnerUp.name}", color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
                            e.score?.let { KcLtrText(it, KingsCupColors.onDarkDim, 10) }
                            e.penalties?.let { KcLtrText("($it ر.ت)", KingsCupColors.onDarkDim, 10, FontWeight.Normal) }
                        }
                    }
                }
            }
        }
    }
}

// ── التشكيلة ──

@Composable
private fun KcSquadBlock(squad: List<KcSquadPlayer>, onOpenPlayer: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("التشكيلة", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        squad.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { p ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(KingsCupColors.chipFill)
                            .clickable(enabled = p.id > 0) { onOpenPlayer(p.id) }
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    ) {
                        Box(
                            Modifier.size(22.dp).clip(CircleShape).background(KingsCupColors.emerald.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(p.number?.toString() ?: "•", color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Column(verticalArrangement = Arrangement.spacedBy(0.dp)) {
                            Text(p.name, color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(p.position, color = KingsCupColors.onDarkDim, fontSize = 9.sp, maxLines = 1)
                        }
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ── بطاقة اللاعب (ورقة سفلية) — مرآة iOS KcPlayerSheet ──

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun KcPlayerSheet(
    playerId: Int,
    onDismiss: () -> Unit,
    viewModel: KcPlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(playerId) { viewModel.load(playerId) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = KingsCupColors.sheetBackground,
    ) {
        ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp).padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(18.dp),
            ) {
                val player = state.player
                when {
                    state.loading -> KcLoading()
                    player == null -> KcEmptyText("ملف اللاعب غير متاح حاليًا")
                    else -> {
                        KcPlayerIdentity(player)
                        KcPlayerFactTiles(player)
                        KcPlayerBirthLine(player)
                        player.seasonStats.firstOrNull { it.isKingsCup }?.let { kc ->
                            KcPlayerCupHighlight(kc, player.isGoalkeeper)
                        }
                        state.market?.takeIf { it.available && it.value != null }?.let { m -> KcPlayerMarketCard(m) }
                        state.form?.takeIf { it.available && it.matches.isNotEmpty() }?.let { f -> KcPlayerFormCard(f) }
                        KcPlayerOtherStats(player)
                        if (player.career.isNotEmpty()) KcPlayerCareer(player.career)
                        state.extras?.transfers?.takeIf { it.isNotEmpty() }?.let { KcPlayerTransfers(it) }
                        state.extras?.injuries?.takeIf { it.isNotEmpty() }?.let { KcPlayerInjuries(it) }
                        if (player.trophies.isNotEmpty()) KcPlayerTrophies(player.trophies)
                    }
                }
            }
        }
    }
}

@Composable
private fun KcPlayerIdentity(p: KcPlayerCard) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        if (p.photo.isEmpty()) {
            Box(
                Modifier.size(76.dp).clip(CircleShape).background(KingsCupColors.chipFill)
                    .border(3.dp, KingsCupColors.gold, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Text(p.name.take(2), color = KingsCupColors.onDarkDim, fontSize = 18.sp, fontWeight = FontWeight.Bold) }
        } else {
            AsyncImage(
                model = p.photo, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(76.dp).clip(CircleShape).border(3.dp, KingsCupColors.gold, CircleShape),
            )
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(p.name, color = KingsCupColors.onDark, fontSize = 19.sp, fontWeight = FontWeight.Bold, maxLines = 2)
            p.fullName?.let { Text(it, color = KingsCupColors.onDarkDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            p.currentTeam?.let { team ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    KcTeamLogo(team.logo, size = 20, padding = 2)
                    Text(team.name, color = KingsCupColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (p.position.isNotEmpty()) {
                    Text(
                        p.position, color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.emerald.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                p.number?.let {
                    Text(
                        "👕 $it", color = KingsCupColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Medium,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.chipFill).padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
                p.nationality?.takeIf { it.isNotEmpty() }?.let {
                    Text(
                        it, color = KingsCupColors.onDark, fontSize = 11.sp,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.chipFill).padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun KcPlayerFactTiles(p: KcPlayerCard) {
    val facts = buildList {
        p.age?.let { add("$it سنة" to "العمر") }
        p.height?.let { add("$it سم" to "الطول") }
        p.weight?.let { add("$it كجم" to "الوزن") }
    }
    if (facts.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        facts.forEach { (value, label) -> KcFactTile(value, label, Modifier.weight(1f)) }
    }
}

@Composable
private fun KcPlayerBirthLine(p: KcPlayerCard) {
    val parts = buildList {
        p.birthDate?.takeIf { it.isNotEmpty() }?.let { add(it.take(10)) }
        p.birthPlace?.takeIf { it.isNotEmpty() }?.let { add(it) }
    }
    if (parts.isEmpty()) return
    Text("🎂 ${parts.joinToString(" — ")}", color = KingsCupColors.onDarkDim, fontSize = 12.sp)
}

/** «أرقامه في كأس الملك» — البطاقة الذهبية؛ الحارس تُستبدل أهدافه بالتصديات. */
@Composable
private fun KcPlayerCupHighlight(s: KcPlayerSeasonStats, isGoalkeeper: Boolean) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(18.dp)).background(KingsCupColors.gold.copy(alpha = 0.08f))
            .border(1.dp, KingsCupColors.gold.copy(alpha = 0.35f), RoundedCornerShape(18.dp))
            .padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🏆", fontSize = 13.sp)
            Text("أرقامه في كأس الملك", color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text(s.team.name, color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KcFactTile("${s.matches}", "مباريات", Modifier.weight(1f))
            if (isGoalkeeper) {
                KcFactTile("${s.saves}", "تصديات", Modifier.weight(1f))
                KcFactTile("${s.conceded}", "استقبل", Modifier.weight(1f))
            } else {
                KcFactTile("${s.goals}", "أهداف", Modifier.weight(1f))
                KcFactTile("${s.assists}", "صناعة", Modifier.weight(1f))
            }
            KcFactTile("${s.minutes}", "دقائق", Modifier.weight(1f))
        }
        s.rating?.let { rating ->
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("التقييم في البطولة", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
                KcLtrText(KcFormat.latinDecimal(rating, 2), KingsCupColors.gold, 11, FontWeight.Normal)
            }
        }
    }
}

// ── القيمة السوقية + مخطط تاريخها ──

@Composable
private fun KcPlayerMarketCard(m: KcPlayerMarket) {
    val value = m.value ?: return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = kcCardModifier(16).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("📈", fontSize = 13.sp)
            Text("القيمة السوقية", color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            KcLtrText(KcFormat.money(value, m.currency), KingsCupColors.emeraldDeep, 15)
        }
        m.peak?.takeIf { it > value }?.let { peak ->
            Text("الذروة: ${KcFormat.money(peak, m.currency)}", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
        }
        if (m.history.size > 1) KcMarketChart(m.history)
    }
}

/** خط بسيط لتاريخ القيمة — أشرطة رفيعة بارتفاع نسبي (بلا Canvas مخصص). */
@Composable
private fun KcMarketChart(history: List<KcMarketPoint>) {
    val sorted = history.sortedBy { it.time }
    val minV = sorted.minOfOrNull { it.value } ?: 0.0
    val maxV = (sorted.maxOfOrNull { it.value } ?: 1.0).coerceAtLeast(minV + 1.0)
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Row(
            verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(2.dp),
            modifier = Modifier.fillMaxWidth().height(56.dp),
        ) {
            sorted.forEach { point ->
                val fraction = ((point.value - minV) / (maxV - minV)).toFloat().coerceIn(0.06f, 1f)
                Box(
                    Modifier.weight(1f).fillMaxWidth().height(56.dp * fraction)
                        .clip(RoundedCornerShape(2.dp)).background(KingsCupColors.emeraldDeep.copy(alpha = 0.75f)),
                )
            }
        }
    }
}

// ── الفورمة الأخيرة ──

@Composable
private fun KcPlayerFormCard(form: KcPlayerForm) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = kcCardModifier(16).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🔥", fontSize = 13.sp)
            Text("الفورمة الأخيرة", color = KingsCupColors.onDark, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        form.matches.take(6).forEach { m -> KcFormRow(m) }
    }
}

@Composable
private fun KcFormRow(m: KcFormMatch) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(KingsCupColors.chipFill)
            .padding(horizontal = 10.dp, vertical = 6.dp),
    ) {
        val (label, color) = when (m.result) {
            "W" -> "ف" to KingsCupColors.emeraldDeep
            "L" -> "خ" to KingsCupColors.liveRed
            else -> "ت" to KingsCupColors.gold
        }
        Box(Modifier.size(22.dp).clip(CircleShape).background(color), contentAlignment = Alignment.Center) {
            Text(label, color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        }
        if (m.opponentLogo.isNotEmpty()) KcTeamLogo(m.opponentLogo, size = 22, padding = 2)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(0.dp)) {
            Text(m.opponent, color = KingsCupColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(m.league, color = KingsCupColors.onDarkDim, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        // لاعبه أولًا (scoreFor) — نفس ترتيب iOS داخل عزل LTR.
        KcLtrText("${m.scoreAgainst} - ${m.scoreFor}", KingsCupColors.onDark, 11, FontWeight.Normal)
        if (m.goals > 0) Text("⚽ ${m.goals}", fontSize = 10.sp, color = KingsCupColors.onDark)
        m.rating?.let { rating -> KcRatingBadge(rating) }
    }
}

// ── أرقام بقية البطولات ──

@Composable
private fun KcPlayerOtherStats(p: KcPlayerCard) {
    val others = p.seasonStats.filter { !it.isKingsCup }
    if (others.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("أرقام الموسم في بقية البطولات", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        others.forEach { s ->
            Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = kcCardModifier(14).padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (s.team.logo.isNotEmpty()) {
                        AsyncImage(model = s.team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(16.dp))
                    }
                    Text(s.team.name, color = KingsCupColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                    Text("· ${s.competition}", color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                    s.rating?.let { KcLtrText(KcFormat.latinDecimal(it, 2), KingsCupColors.emeraldDeep, 11, FontWeight.Medium) }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    KcFactTile("${s.matches}", "مباريات", Modifier.weight(1f))
                    if (p.isGoalkeeper) {
                        KcFactTile("${s.saves}", "تصديات", Modifier.weight(1f))
                        KcFactTile("${s.conceded}", "استقبل", Modifier.weight(1f))
                    } else {
                        KcFactTile("${s.goals}", "أهداف", Modifier.weight(1f))
                        KcFactTile("${s.assists}", "صناعة", Modifier.weight(1f))
                    }
                    KcFactTile("${s.minutes}", "دقائق", Modifier.weight(1f))
                }
            }
        }
    }
}

// ── المسيرة والانتقالات والإصابات والألقاب ──

@Composable
private fun KcPlayerCareer(career: List<KcPlayerCareerStop>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("المسيرة", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        career.forEach { stop ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = kcCardModifier(12).padding(horizontal = 10.dp, vertical = 7.dp),
            ) {
                if (stop.logo.isEmpty()) {
                    Box(Modifier.size(28.dp).clip(CircleShape).background(KingsCupColors.chipFill))
                } else {
                    KcTeamLogo(stop.logo, size = 28, padding = 3)
                }
                Text(stop.team, color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1, modifier = Modifier.weight(1f))
                val minS = stop.seasons.minOrNull()
                val maxS = stop.seasons.maxOrNull()
                if (minS != null && maxS != null) {
                    KcLtrText(if (minS == maxS) "$minS" else "$minS–$maxS", KingsCupColors.onDarkDim, 11, FontWeight.Normal)
                }
            }
        }
    }
}

@Composable
private fun KcPlayerTransfers(transfers: List<KcPlayerTransfer>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("الانتقالات", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        transfers.take(6).forEach { t ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = kcCardModifier(12).padding(horizontal = 10.dp, vertical = 7.dp),
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                    Text("${t.from} ← ${t.to}", color = KingsCupColors.onDark, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    KcLtrText(t.date.take(10), KingsCupColors.onDarkDim, 9, FontWeight.Normal)
                }
                if (t.type.isNotEmpty()) {
                    Text(
                        t.type, color = KingsCupColors.onDarkDim, fontSize = 9.sp,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.chipFill).padding(horizontal = 6.dp, vertical = 3.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun KcPlayerInjuries(injuries: List<KcPlayerInjury>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🩺", fontSize = 12.sp)
            Text("سجل الإصابات", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        injuries.take(6).forEach { injury ->
            Column(verticalArrangement = Arrangement.spacedBy(1.dp), modifier = kcCardModifier(12).padding(horizontal = 10.dp, vertical = 7.dp)) {
                Text(
                    injury.reason.ifEmpty { injury.type }, color = KingsCupColors.onDark, fontSize = 11.sp,
                    fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(
                    listOf(injury.competition, injury.date.take(10)).filter { it.isNotEmpty() }.joinToString(" · "),
                    color = KingsCupColors.onDarkDim, fontSize = 9.sp,
                )
            }
        }
    }
}

@Composable
private fun KcPlayerTrophies(trophies: List<KcPlayerTrophy>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("🏆", fontSize = 12.sp)
            Text("الألقاب", color = KingsCupColors.emeraldDeep, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        }
        trophies.take(10).forEach { t ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(KingsCupColors.chipFill)
                    .padding(horizontal = 10.dp, vertical = 6.dp),
            ) {
                Text(if (t.winner) "🏆" else "🎖", fontSize = 11.sp)
                Text(t.competition, color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                if (t.place.isNotEmpty()) {
                    Text(
                        t.place, color = if (t.winner) KingsCupColors.gold else KingsCupColors.onDarkDim, fontSize = 9.sp, fontWeight = FontWeight.Medium,
                        modifier = Modifier.clip(RoundedCornerShape(50))
                            .background(if (t.winner) KingsCupColors.gold.copy(alpha = 0.15f) else KingsCupColors.chipFill)
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
                KcLtrText(t.season, KingsCupColors.onDarkDim, 10, FontWeight.Normal)
            }
        }
    }
}
