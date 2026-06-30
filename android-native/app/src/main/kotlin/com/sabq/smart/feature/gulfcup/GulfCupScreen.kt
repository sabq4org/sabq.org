package com.sabq.smart.feature.gulfcup

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

@Composable
fun GulfCupScreen(
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    onOpenTeam: (GcTeam) -> Unit,
    viewModel: GulfCupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    Box(Modifier.fillMaxSize().background(GcColors.background)) {
        Column(Modifier.fillMaxSize()) {
            Row(
                Modifier.fillMaxWidth().statusBarsPadding().padding(horizontal = 8.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = GcColors.onDark) }
                Text(GcConstants.TOURNAMENT_NAME, color = GcColors.gold, fontSize = 18.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f))
            }
            if (state.loading && state.overview == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = GcColors.emeraldSoft)
                }
            } else {
                when (state.tab) {
                    GulfCupViewModel.Tab.HOME -> GcHomeTab(state, onOpenMatch)
                    GulfCupViewModel.Tab.MATCHES -> GcMatchesTab(state.fixtures, onOpenMatch)
                    GulfCupViewModel.Tab.PREDICTIONS -> GcPredictionsPlaceholder()
                    GulfCupViewModel.Tab.GROUPS -> GcGroupsTab(state.standings)
                    GulfCupViewModel.Tab.MORE -> GcMoreTab(state, onOpenMatch, onOpenTeam)
                }
            }
            NavigationBar(containerColor = GcColors.card) {
                navItem("الرئيسية", Icons.Filled.Home, state.tab == GulfCupViewModel.Tab.HOME) { viewModel.selectTab(GulfCupViewModel.Tab.HOME) }
                navItem("المباريات", Icons.Filled.CalendarMonth, state.tab == GulfCupViewModel.Tab.MATCHES) { viewModel.selectTab(GulfCupViewModel.Tab.MATCHES) }
                navItem("التوقعات", Icons.Filled.SportsSoccer, state.tab == GulfCupViewModel.Tab.PREDICTIONS) { viewModel.selectTab(GulfCupViewModel.Tab.PREDICTIONS) }
                navItem("المجموعات", Icons.Filled.GridView, state.tab == GulfCupViewModel.Tab.GROUPS) { viewModel.selectTab(GulfCupViewModel.Tab.GROUPS) }
                navItem("المزيد", Icons.Filled.MoreHoriz, state.tab == GulfCupViewModel.Tab.MORE) { viewModel.selectTab(GulfCupViewModel.Tab.MORE) }
            }
        }
    }
}

@Composable
private fun navItem(label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, selected: Boolean, onClick: () -> Unit) {
    NavigationBarItem(selected = selected, onClick = onClick, icon = { Icon(icon, null) }, label = { Text(label, fontSize = 10.sp, fontFamily = IbmPlexSansArabic) })
}

@Composable
private fun GcHomeTab(state: GulfCupViewModel.UiState, onOpenMatch: (Int) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        item {
            Box(
                Modifier.fillMaxWidth().height(160.dp).clip(RoundedCornerShape(20.dp))
                    .background(Brush.linearGradient(listOf(GcColors.emerald, GcColors.emeraldSoft.copy(alpha = 0.6f)))),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Filled.EmojiEvents, null, tint = GcColors.gold, modifier = Modifier.size(40.dp))
                    Text(GcConstants.TOURNAMENT_NAME, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
                    Text("جدة 2026 · السعودية", color = Color.White.copy(0.8f), fontSize = 12.sp, fontFamily = IbmPlexSansArabic)
                }
            }
        }
        item { Text("أقرب المباريات", color = GcColors.gold, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }
        items(state.fixtures.filter { !it.status.finished }.take(5)) { GcMatchCard(it, onOpenMatch) }
    }
}

@Composable
private fun GcMatchesTab(fixtures: List<GcFixture>, onOpenMatch: (Int) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        items(fixtures) { GcMatchCard(it, onOpenMatch) }
    }
}

@Composable
private fun GcGroupsTab(groups: List<GcGroup>) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        items(groups) { g ->
            Column(Modifier.clip(RoundedCornerShape(16.dp)).background(GcColors.cardHi).padding(12.dp)) {
                Text(g.name, color = GcColors.emeraldSoft, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
                g.rows.forEach { row ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("${row.rank}", color = GcColors.onDarkDim, modifier = Modifier.size(24.dp), fontSize = 12.sp)
                        AsyncImage(row.team.logo, null, modifier = Modifier.size(22.dp))
                        Text(row.team.name, color = GcColors.onDark, modifier = Modifier.weight(1f), fontSize = 13.sp, fontFamily = IbmPlexSansArabic)
                        Text("${row.points}", color = GcColors.gold, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun GcMoreTab(state: GulfCupViewModel.UiState, onOpenMatch: (Int) -> Unit, onOpenTeam: (GcTeam) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp)) {
        item { Text("المنتخبات", color = GcColors.gold, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }
        items(state.teams) { team ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(GcColors.card).clickable { onOpenTeam(team) }.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                AsyncImage(team.logo, null, modifier = Modifier.size(36.dp).clip(CircleShape).background(Color.White).padding(4.dp))
                Text(team.name, color = GcColors.onDark, fontFamily = IbmPlexSansArabic)
            }
        }
        item { Text("الأدوار الإقصائية", color = GcColors.gold, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }
        items(state.fixtures.filter { it.roundEn.contains("Semi", true) || it.roundEn.contains("Final", true) || it.round.contains("نهائي") }) {
            GcMatchCard(it, onOpenMatch)
        }
    }
}

@Composable
private fun GcPredictionsPlaceholder() {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("مسابقة التوقعات", color = GcColors.gold, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
            Spacer(Modifier.height(8.dp))
            Text("سجّل الدخول عبر تطبيق خليجي 27 iOS\nأو انتظر التحديث القادم للأندرويد", color = GcColors.onDarkDim, fontSize = 12.sp, fontFamily = IbmPlexSansArabic)
        }
    }
}

@Composable
fun GcMatchCard(fixture: GcFixture, onClick: (Int) -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(GcColors.card)
            .clickable { onClick(fixture.id) }.padding(14.dp),
    ) {
        Text(fixture.round, color = GcColors.onDarkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                AsyncImage(fixture.home.logo, null, modifier = Modifier.size(28.dp))
                Text(fixture.home.name, color = GcColors.onDark, fontSize = 12.sp, maxLines = 1, fontFamily = IbmPlexSansArabic)
            }
            val score = if (fixture.status.live || fixture.status.finished) "${fixture.goals.away ?: 0} - ${fixture.goals.home ?: 0}" else "VS"
            Text(score, color = GcColors.onDark, fontWeight = FontWeight.Black, fontSize = 18.sp, modifier = Modifier.padding(horizontal = 8.dp))
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.End), modifier = Modifier.fillMaxWidth()) {
                Text(fixture.away.name, color = GcColors.onDark, fontSize = 12.sp, maxLines = 1, fontFamily = IbmPlexSansArabic, modifier = Modifier.weight(1f))
                AsyncImage(fixture.away.logo, null, modifier = Modifier.size(28.dp))
            }
        }
    }
}

@Composable
fun GulfCupTeamScreen(teamId: Int, onBack: () -> Unit, onOpenMatch: (Int) -> Unit, viewModel: GulfCupTeamViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(teamId) { viewModel.load(teamId) }
    Column(Modifier.fillMaxSize().background(GcColors.background)) {
        Row(Modifier.statusBarsPadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = GcColors.onDark) }
            Text(state.profile?.team?.name ?: "المنتخب", color = GcColors.onDark, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic)
        }
        if (state.loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = GcColors.emeraldSoft) }
        } else {
            LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                state.profile?.let { p ->
                    item {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            stat("${p.stats.points}", "نقاط")
                            stat("${p.stats.played}", "لعب")
                            stat("${p.stats.goalsDiff}", "فارق")
                        }
                    }
                    items(p.fixtures) { GcMatchCard(it, onOpenMatch) }
                }
            }
        }
    }
}

@Composable
private fun stat(v: String, l: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(v, color = GcColors.gold, fontWeight = FontWeight.Black, fontSize = 20.sp)
        Text(l, color = GcColors.onDarkDim, fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
    }
}

@Composable
fun GulfCupMatchScreen(fixtureId: Int, onBack: () -> Unit, viewModel: GulfCupMatchViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(fixtureId) { viewModel.load(fixtureId) }
    val fx = state.detail?.fixture
    Column(Modifier.fillMaxSize().background(GcColors.background)) {
        Row(Modifier.statusBarsPadding().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = GcColors.onDark) }
            Text("تفاصيل المباراة", color = GcColors.onDark, fontFamily = IbmPlexSansArabic)
        }
        if (state.loading || fx == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = GcColors.emeraldSoft) }
        } else {
            LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { GcMatchCard(fx) {} }
                item { Text("${fx.venue.name} — ${fx.venue.city}", color = GcColors.onDarkDim, fontFamily = IbmPlexSansArabic) }
                if (state.detail!!.events.isNotEmpty()) {
                    item { Text("الأحداث", color = GcColors.gold, fontWeight = FontWeight.Bold, fontFamily = IbmPlexSansArabic) }
                    items(state.detail!!.events) { ev ->
                        Text("${ev.minute}' ${ev.player ?: ev.label}", color = GcColors.onDark, fontFamily = IbmPlexSansArabic)
                    }
                }
            }
        }
    }
}

@Composable
fun GulfCupHomeStrip(onClick: () -> Unit, viewModel: GulfCupViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val next = state.fixtures.firstOrNull { !it.status.finished } ?: return
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(16.dp))
            .background(Brush.horizontalGradient(listOf(GcColors.emerald, GcColors.emeraldSoft.copy(0.5f))))
            .clickable(onClick = onClick).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.EmojiEvents, null, tint = GcColors.gold)
        Column(Modifier.weight(1f).padding(horizontal = 10.dp)) {
            Text(GcConstants.TOURNAMENT_NAME, color = Color.White, fontWeight = FontWeight.Black, fontFamily = IbmPlexSansArabic)
            Text("${next.home.name} × ${next.away.name}", color = Color.White.copy(0.85f), fontSize = 11.sp, fontFamily = IbmPlexSansArabic)
        }
    }
}
