package com.sabq.smart.feature.asiancup

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

private object AcColors {
    val navy = Color(0xFF071B2C); val card = Color(0xFF102D43); val cardHi = Color(0xFF173B54)
    val green = Color(0xFF00A878); val mint = Color(0xFF56D6AD); val gold = Color(0xFFF2C14E)
    val text = Color(0xFFF7FBFF); val dim = Color(0xFFAFC2D1); val live = Color(0xFFE65454)
}

@Composable
fun AsianCupScreen(
    onBack: () -> Unit, onOpenMatch: (Int) -> Unit, onOpenTeam: (AcTeam) -> Unit,
    onRequireLogin: () -> Unit, viewModel: AsianCupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().background(AcColors.navy)) {
        AcHeader(AcConstants.TOURNAMENT_NAME, onBack)
        Box(Modifier.weight(1f)) {
            when {
                state.loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = AcColors.mint)
                state.error != null && state.overview == null -> AcError(state.error!!, viewModel::refresh)
                else -> when (state.tab) {
                    AsianCupViewModel.Tab.HOME -> AcHome(state, onOpenMatch)
                    AsianCupViewModel.Tab.MATCHES -> AcMatches(state.fixtures, onOpenMatch)
                    AsianCupViewModel.Tab.PREDICTIONS -> AcPredictions(state, onRequireLogin, viewModel::submit)
                    AsianCupViewModel.Tab.GROUPS -> AcGroups(state.groups)
                    AsianCupViewModel.Tab.MORE -> AcMore(state, onOpenMatch, onOpenTeam)
                }
            }
        }
        NavigationBar(containerColor = AcColors.card) {
            AcNavItem("الرئيسية", Icons.Filled.Home, state.tab == AsianCupViewModel.Tab.HOME) { viewModel.select(AsianCupViewModel.Tab.HOME) }
            AcNavItem("المباريات", Icons.Filled.CalendarMonth, state.tab == AsianCupViewModel.Tab.MATCHES) { viewModel.select(AsianCupViewModel.Tab.MATCHES) }
            AcNavItem("التوقعات", Icons.Filled.SportsSoccer, state.tab == AsianCupViewModel.Tab.PREDICTIONS) { viewModel.select(AsianCupViewModel.Tab.PREDICTIONS) }
            AcNavItem("المجموعات", Icons.Filled.GridView, state.tab == AsianCupViewModel.Tab.GROUPS) { viewModel.select(AsianCupViewModel.Tab.GROUPS) }
            AcNavItem("المزيد", Icons.Filled.MoreHoriz, state.tab == AsianCupViewModel.Tab.MORE) { viewModel.select(AsianCupViewModel.Tab.MORE) }
        }
    }
}

@Composable private fun RowScope.AcNavItem(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, click: () -> Unit) {
    NavigationBarItem(selected, click, { Icon(icon, null) }, label = { Text(label, fontSize = 9.sp, fontFamily = IbmPlexSansArabic) }, colors = NavigationBarItemDefaults.colors(selectedIconColor = AcColors.gold, selectedTextColor = AcColors.gold, indicatorColor = AcColors.cardHi, unselectedIconColor = AcColors.dim, unselectedTextColor = AcColors.dim))
}

@Composable private fun AcHeader(title: String, back: () -> Unit) {
    Row(Modifier.fillMaxWidth().statusBarsPadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(back) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = AcColors.text) }
        Column(Modifier.weight(1f)) {
            Text(title, color = AcColors.gold, fontSize = 18.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
            Text("السعودية 2027", color = AcColors.dim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic)
        }
        Icon(Icons.Filled.EmojiEvents, null, tint = AcColors.gold)
    }
}

@Composable private fun AcHome(state: AsianCupViewModel.State, openMatch: (Int) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Box(Modifier.fillMaxWidth().height(184.dp).clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(listOf(AcColors.green, AcColors.cardHi))), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.EmojiEvents, null, tint = AcColors.gold, modifier = Modifier.size(52.dp))
                    Text("كأس آسيا 2027", color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                    Text("السعودية تجمع نخبة قارة آسيا", color = Color.White.copy(.82f), fontFamily = IbmPlexSansArabic)
                }
            }
        }
        state.overview?.let { overview ->
            item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                AcMetric("${overview.teamsCount}", "منتخب", Modifier.weight(1f)); AcMetric("${overview.groupsCount}", "مجموعات", Modifier.weight(1f)); AcMetric("${overview.venues.size}", "ملاعب", Modifier.weight(1f))
            } }
            overview.nextMatch?.let { next -> item { AcSection("المباراة القادمة"); AcMatchCard(next, openMatch) } }
        }
        item { AcSection("أقرب المباريات") }
        items(state.fixtures.filter { !it.status.finished }.take(5)) { AcMatchCard(it, openMatch) }
    }
}

@Composable private fun AcMetric(value: String, label: String, modifier: Modifier) {
    Column(modifier.clip(RoundedCornerShape(16.dp)).background(AcColors.card).padding(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = AcColors.gold, fontSize = 22.sp, fontWeight = FontWeight.Black)
        Text(label, color = AcColors.dim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
    }
}

@Composable private fun AcMatches(fixtures: List<AcFixture>, open: (Int) -> Unit) {
    if (fixtures.isEmpty()) AcEmpty("لم يُعلن جدول المباريات بعد") else LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        items(fixtures) { AcMatchCard(it, open) }
    }
}

@Composable fun AcMatchCard(fixture: AcFixture, open: (Int) -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(17.dp)).background(AcColors.card).clickable { open(fixture.id) }.padding(14.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(fixture.round, color = AcColors.dim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
            if (fixture.status.live) Text("● مباشر ${fixture.status.elapsed ?: ""}", color = AcColors.live, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            AcTeamCell(fixture.home, Modifier.weight(1f))
            Text(if (fixture.status.live || fixture.status.finished) "${fixture.goals.home ?: 0} - ${fixture.goals.away ?: 0}" else "VS", color = AcColors.text, fontSize = 20.sp, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 8.dp))
            AcTeamCell(fixture.away, Modifier.weight(1f), end = true)
        }
        if (fixture.venue.name.isNotBlank()) Text("${fixture.venue.name} · ${fixture.venue.city}", color = AcColors.dim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic, modifier = Modifier.padding(top = 8.dp))
    }
}

@Composable private fun AcTeamCell(team: AcTeam, modifier: Modifier, end: Boolean = false) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, if (end) Alignment.End else Alignment.Start)) {
        if (end) Text(team.name, color = AcColors.text, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f, false))
        AsyncImage(team.logo, null, Modifier.size(30.dp).clip(CircleShape).background(Color.White).padding(3.dp))
        if (!end) Text(team.name, color = AcColors.text, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f, false))
    }
}

@Composable private fun AcGroups(groups: List<AcGroup>) {
    if (groups.isEmpty()) AcEmpty("تظهر المجموعات بعد القرعة الرسمية") else LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        items(groups) { group ->
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(AcColors.card).padding(12.dp)) {
                Text(group.name, color = AcColors.gold, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) { Text("المنتخب", color = AcColors.dim, fontSize = 10.sp, modifier = Modifier.weight(1f), fontFamily = IbmPlexSansArabic); Text("ل", color = AcColors.dim); Spacer(Modifier.width(18.dp)); Text("ف", color = AcColors.dim); Spacer(Modifier.width(18.dp)); Text("ن", color = AcColors.dim) }
                group.rows.forEach { row -> Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("${row.rank}", color = AcColors.dim, modifier = Modifier.width(22.dp), fontSize = 11.sp); AsyncImage(row.team.logo, null, Modifier.size(24.dp)); Spacer(Modifier.width(7.dp)); Text(row.team.name, color = AcColors.text, modifier = Modifier.weight(1f), fontSize = 12.sp, fontFamily = IbmPlexSansArabic); Text("${row.played}", color = AcColors.dim); Spacer(Modifier.width(18.dp)); Text("${row.goalsDiff}", color = AcColors.dim); Spacer(Modifier.width(18.dp)); Text("${row.points}", color = AcColors.gold, fontWeight = FontWeight.Black)
                } }
            }
        }
    }
}

@Composable private fun AcMore(state: AsianCupViewModel.State, openMatch: (Int) -> Unit, openTeam: (AcTeam) -> Unit) {
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { AcSection("المنتخبات") }
        items(state.teams) { team -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(AcColors.card).clickable { openTeam(team) }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { AsyncImage(team.logo, null, Modifier.size(38.dp).clip(CircleShape).background(Color.White).padding(4.dp)); Spacer(Modifier.width(10.dp)); Text(team.name, color = AcColors.text, fontFamily = IbmPlexSansArabic) } }
        item { AcSection("الهدافون") }
        items(state.scorers.take(10)) { scorer -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(AcColors.card).padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Text("${scorer.rank}", color = AcColors.gold, modifier = Modifier.width(28.dp)); AsyncImage(scorer.photo, null, Modifier.size(38.dp).clip(CircleShape)); Spacer(Modifier.width(9.dp)); Column(Modifier.weight(1f)) { Text(scorer.name, color = AcColors.text, fontFamily = IbmPlexSansArabic); Text(scorer.team.name, color = AcColors.dim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) }; Text("${scorer.goals}", color = AcColors.gold, fontSize = 20.sp, fontWeight = FontWeight.Black) } }
        item { AcSection("طريق النهائي") }
        state.bracket.rounds.forEach { round -> item { Text(round.round, color = AcColors.mint, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }; items(round.matches) { AcMatchCard(it, openMatch) } }
    }
}

@Composable private fun AcPredictions(state: AsianCupViewModel.State, requireLogin: () -> Unit, submit: (Int, Int, Int, () -> Unit) -> Unit) {
    val scores = remember { mutableStateMapOf<Int, Pair<Int, Int>>() }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.predictions.me?.let { me -> item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { AcMetric("${me.points}", "نقطة", Modifier.weight(1f)); AcMetric("${me.correct}", "صحيح", Modifier.weight(1f)); AcMetric("${me.exact}", "دقيق", Modifier.weight(1f)) } } }
        if (state.predictions.matches.isEmpty()) item { AcEmpty("لا توجد مباريات مفتوحة للتوقع الآن") }
        items(state.predictions.matches) { item ->
            val initial = item.myPrediction?.let { it.predHome to it.predAway } ?: (0 to 0)
            val score = scores[item.fixture.id] ?: initial
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(AcColors.card).padding(14.dp)) {
                AcMatchCard(item.fixture) {}
                Spacer(Modifier.height(8.dp))
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) { AcStepper(score.first) { scores[item.fixture.id] = it to score.second }; Text("-", color = AcColors.dim); AcStepper(score.second) { scores[item.fixture.id] = score.first to it } }
                Button(onClick = { submit(item.fixture.id, score.first, score.second, requireLogin) }, enabled = !item.locked && state.savingFixture != item.fixture.id, modifier = Modifier.fillMaxWidth().padding(top = 10.dp), colors = ButtonDefaults.buttonColors(containerColor = AcColors.green)) { Text(if (item.locked) "أُغلق التوقع" else if (state.savingFixture == item.fixture.id) "جارٍ الحفظ…" else "حفظ التوقع", fontFamily = IbmPlexSansArabic) }
            }
        }
        if (state.leaders.isNotEmpty()) { item { AcSection("لوحة الصدارة") }; items(state.leaders.take(20)) { leader -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(AcColors.card).padding(11.dp)) { Text("${leader.rank}", color = AcColors.gold, modifier = Modifier.width(30.dp)); Text(leader.name, color = AcColors.text, modifier = Modifier.weight(1f), fontFamily = IbmPlexSansArabic); Text("${leader.totalPoints}", color = AcColors.gold, fontWeight = FontWeight.Black) } } }
    }
}

@Composable private fun AcStepper(value: Int, change: (Int) -> Unit) { Row(verticalAlignment = Alignment.CenterVertically) { IconButton({ change((value - 1).coerceAtLeast(0)) }) { Icon(Icons.Filled.Remove, null, tint = AcColors.text) }; Text("$value", color = AcColors.gold, fontSize = 22.sp, fontWeight = FontWeight.Black); IconButton({ change((value + 1).coerceAtMost(20)) }) { Icon(Icons.Filled.Add, null, tint = AcColors.text) } } }

@Composable fun AsianCupMatchScreen(fixtureId: Int, onBack: () -> Unit, viewModel: AsianCupMatchViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle(); LaunchedEffect(fixtureId) { viewModel.load(fixtureId) }
    Column(Modifier.fillMaxSize().background(AcColors.navy)) { AcHeader("مركز المباراة", onBack); when { state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = AcColors.mint); state.detail == null -> AcError(state.error ?: "تعذر تحميل المباراة") { viewModel.load(fixtureId) }; else -> { val d = state.detail!!; LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { AcMatchCard(d.fixture) {} }
        d.prediction?.let { p -> item { AcSection("احتمال الفوز"); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { AcMetric("${p.home}%", d.fixture.home.name, Modifier.weight(1f)); Spacer(Modifier.width(6.dp)); AcMetric("${p.draw}%", "تعادل", Modifier.weight(1f)); Spacer(Modifier.width(6.dp)); AcMetric("${p.away}%", d.fixture.away.name, Modifier.weight(1f)) } } }
        if (d.events.isNotEmpty()) { item { AcSection("أحداث المباراة") }; items(d.events) { e -> Text("${e.minute}${e.extraMinute?.let { "+$it" } ?: ""}'  ${e.label} · ${e.player}", color = AcColors.text, fontFamily = IbmPlexSansArabic, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(AcColors.card).padding(11.dp)) } }
        if (d.statistics.isNotEmpty()) { item { AcSection("الإحصاءات") }; items(d.statistics) { s -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(AcColors.card).padding(11.dp)) { Text(s.home, color = AcColors.gold, modifier = Modifier.width(54.dp), fontWeight = FontWeight.Bold); Text(s.label, color = AcColors.text, modifier = Modifier.weight(1f), fontFamily = IbmPlexSansArabic); Text(s.away, color = AcColors.gold, fontWeight = FontWeight.Bold) } } }
        if (d.lineups.isNotEmpty()) { item { AcSection("التشكيلات") }; items(d.lineups) { l -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(AcColors.card).padding(12.dp)) { Text("${l.teamName} · ${l.formation ?: ""}", color = AcColors.gold, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic); Text(l.startXI.joinToString(" · ") { it.name }, color = AcColors.text, fontSize = 12.sp, fontFamily = IbmPlexSansArabic) } } }
        if (d.ratings.isNotEmpty()) { item { AcSection("تقييم اللاعبين") }; items(d.ratings.sortedByDescending { it.rating }.take(12)) { r -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(AcColors.card).padding(10.dp), verticalAlignment = Alignment.CenterVertically) { AsyncImage(r.photo, null, Modifier.size(34.dp).clip(CircleShape)); Spacer(Modifier.width(8.dp)); Text(r.name, color = AcColors.text, modifier = Modifier.weight(1f), fontFamily = IbmPlexSansArabic); Text(String.format("%.1f", r.rating), color = AcColors.gold, fontWeight = FontWeight.Black) } } }
    } } } }
}

@Composable fun AsianCupTeamScreen(teamId: Int, onBack: () -> Unit, onOpenMatch: (Int) -> Unit, viewModel: AsianCupTeamViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle(); LaunchedEffect(teamId) { viewModel.load(teamId) }
    Column(Modifier.fillMaxSize().background(AcColors.navy)) { AcHeader(state.profile?.team?.name ?: "المنتخب", onBack); when { state.loading -> CircularProgressIndicator(Modifier.align(Alignment.CenterHorizontally), color = AcColors.mint); state.profile == null -> AcError(state.error ?: "تعذر تحميل المنتخب") { viewModel.load(teamId) }; else -> { val p = state.profile!!; LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(AcColors.card).padding(18.dp), verticalAlignment = Alignment.CenterVertically) { AsyncImage(p.team.logo, null, Modifier.size(72.dp).clip(CircleShape).background(Color.White).padding(7.dp)); Spacer(Modifier.width(14.dp)); Column { Text(p.team.name, color = AcColors.text, fontSize = 22.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic); Text(p.coach ?: "", color = AcColors.dim, fontFamily = IbmPlexSansArabic) } } }
        p.stats?.let { s -> item { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) { AcMetric("${s.points}", "نقطة", Modifier.weight(1f)); AcMetric("${s.played}", "لعب", Modifier.weight(1f)); AcMetric("${s.goalsDiff}", "فارق", Modifier.weight(1f)) } } }
        item { AcSection("مباريات المنتخب") }; items(p.fixtures) { AcMatchCard(it, onOpenMatch) }
        if (p.squad.isNotEmpty()) { item { AcSection("قائمة اللاعبين") }; items(p.squad) { player -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(AcColors.card).padding(11.dp), verticalAlignment = Alignment.CenterVertically) { AsyncImage(player.photo, null, Modifier.size(42.dp).clip(CircleShape)); Spacer(Modifier.width(9.dp)); Column(Modifier.weight(1f)) { Text(player.name, color = AcColors.text, fontFamily = IbmPlexSansArabic); Text(player.position, color = AcColors.dim, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) }; Text(player.number?.toString() ?: "", color = AcColors.gold, fontSize = 18.sp, fontWeight = FontWeight.Black) } } }
    } } } }
}

@Composable fun AsianCupHomeStrip(onClick: () -> Unit) { Box(Modifier.fillMaxWidth().height(112.dp).clip(RoundedCornerShape(20.dp)).background(Brush.horizontalGradient(listOf(AcColors.green, AcColors.cardHi))).clickable(onClick = onClick).padding(16.dp)) { Column(Modifier.align(Alignment.CenterStart)) { Text("كأس آسيا 2027", color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic); Text("المباريات · المجموعات · التوقعات", color = Color.White.copy(.8f), fontFamily = IbmPlexSansArabic) }; Icon(Icons.Filled.EmojiEvents, null, tint = AcColors.gold, modifier = Modifier.align(Alignment.CenterEnd).size(46.dp)) } }
@Composable private fun AcSection(text: String) { Text(text, color = AcColors.gold, fontSize = 16.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic) }
@Composable private fun AcEmpty(text: String) { Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) { Text(text, color = AcColors.dim, fontFamily = IbmPlexSansArabic) } }
@Composable private fun AcError(message: String, retry: () -> Unit) { Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(message, color = AcColors.text, fontFamily = IbmPlexSansArabic); TextButton(retry) { Text("إعادة المحاولة", color = AcColors.gold, fontFamily = IbmPlexSansArabic) } } }
