package com.sabq.smart.feature.roshn

import android.content.Intent
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic

// صفحة النادي في مركز روشن — port ‏1:1 لـiOS `RoshnTeamView.swift`:
// نفس عقد الويب `/api/sports/team/:id?with=stats` في تمرير واحد: الهوية،
// المركز، المدرب، الملعب، أرقام الموسم، المباريات، هدافو الفريق، والقائمة.

private val POSITION_ORDER = listOf("Goalkeeper", "Defender", "Midfielder", "Attacker")

@Composable
fun RoshnTeamScreen(
    teamId: Int,
    previewName: String,
    previewLogo: String,
    onBack: () -> Unit,
    onOpenMatch: (Int) -> Unit,
    viewModel: RoshnTeamViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(teamId) { viewModel.load(teamId) }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(RoshnColors.canvas)) {
            Row(
                Modifier.fillMaxWidth().background(RoshnColors.canvas).statusBarsPadding().padding(horizontal = 4.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = RoshnColors.ink) }
                Text(
                    state.profile?.team?.name ?: previewName.ifEmpty { "النادي" },
                    color = RoshnColors.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.weight(1f), textAlign = TextAlign.Center, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                // نفس رابط مشاركة iOS (`ShareLink`) — صفحة النادي على الويب.
                IconButton(onClick = {
                    val send = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_TEXT, "https://sabq.org/sports/team/$teamId")
                    }
                    context.startActivity(Intent.createChooser(send, null))
                }) { Icon(Icons.Filled.Share, null, tint = RoshnColors.sky) }
            }

            val profile = state.profile
            when {
                profile == null && state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = RoshnColors.sky)
                }
                profile == null -> Column(
                    Modifier.fillMaxWidth().padding(vertical = 34.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("تعذّر تحميل صفحة النادي", color = RoshnColors.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    Text(state.error ?: "", color = RoshnColors.inkSoft, fontSize = 12.sp, textAlign = TextAlign.Center)
                    Text(
                        "إعادة المحاولة", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.sky)
                            .clickable { viewModel.load(teamId) }.padding(horizontal = 18.dp, vertical = 10.dp),
                    )
                }
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = 8.dp, bottom = 26.dp),
                    verticalArrangement = Arrangement.spacedBy(18.dp),
                ) {
                    item { TeamHero(profile, previewName, previewLogo) }
                    item { QuickFacts(profile) }
                    profile.coach?.let { coach -> item { CoachCard(coach) } }
                    profile.team.venue?.let { venue -> item { VenueCard(venue) } }
                    profile.stats?.let { stats -> item { StatsSection(stats) } }
                    item { MatchesSection(profile.fixtures, onOpenMatch) }
                    if (profile.topScorers.isNotEmpty()) item { TeamScorersSection(profile.topScorers) }
                    item { SquadSection(profile.squad) }
                }
            }
        }
    }
}

// ── الهوية ──

@Composable
private fun TeamHero(profile: RsTeamProfile, previewName: String, previewLogo: String) {
    Box(
        modifier = Modifier.fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(24.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(24.dp))
            .background(RoshnColors.hero),
    ) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(15.dp)) {
            Box(
                modifier = Modifier.size(84.dp).clip(RoundedCornerShape(22.dp)).background(Color.White).padding(9.dp),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(
                    model = profile.team.logo.ifEmpty { previewLogo }, contentDescription = null,
                    contentScale = ContentScale.Fit, modifier = Modifier.fillMaxWidth(),
                )
            }
            Column(verticalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.weight(1f)) {
                Text(
                    profile.team.name.ifEmpty { previewName }, color = RoshnColors.heroOn,
                    fontSize = 24.sp, fontWeight = FontWeight.Bold, maxLines = 2,
                )
                Text(
                    profile.competitionName?.takeIf { it.isNotEmpty() } ?: "دوري روشن السعودي",
                    color = RoshnColors.heroOnSoft, fontSize = 11.sp, maxLines = 1,
                )
                profile.standing?.let { standing ->
                    Text(
                        "المركز ${standing.rank} · ${standing.points} نقطة",
                        color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        modifier = Modifier.clip(RoundedCornerShape(50)).background(RoshnColors.heroChip)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                    )
                }
            }
        }
    }
}

// ── حقائق سريعة ──

@Composable
private fun QuickFacts(profile: RsTeamProfile) {
    val facts = buildList {
        profile.standing?.let { add(Triple("${it.rank}", "المركز", "📋")) }
        profile.standing?.let { add(Triple("${it.points}", "نقطة", "⭐")) }
        profile.team.founded?.let { add(Triple("$it", "التأسيس", "🗓")) }
        if (profile.squad.isNotEmpty()) add(Triple("${profile.squad.size}", "لاعبًا", "👥"))
    }
    if (facts.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        facts.forEach { (value, label, emoji) ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier.weight(1f)
                    .shadow(2.dp, RoundedCornerShape(18.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
                    .clip(RoundedCornerShape(18.dp)).background(RoshnColors.card).padding(vertical = 11.dp),
            ) {
                Text(emoji, fontSize = 12.sp)
                Text(value, color = RoshnColors.ink, fontSize = 17.sp, fontWeight = FontWeight.Bold)
                Text(label, color = RoshnColors.inkSoft, fontSize = 9.sp)
            }
        }
    }
}

// ── بطاقات الأقسام ──

@Composable
private fun SectionCard(title: String, emoji: String, content: @Composable () -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth()
            .shadow(2.dp, RoundedCornerShape(18.dp), spotColor = RoshnColors.cardShadow, ambientColor = RoshnColors.cardShadow)
            .clip(RoundedCornerShape(18.dp)).background(RoshnColors.card).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(emoji, fontSize = 13.sp)
            Text(title, color = RoshnColors.ink, fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        content()
    }
}

@Composable
private fun CoachCard(coach: RsCoach) {
    SectionCard("المدرب", "🧑‍💼") {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AsyncImage(
                model = coach.photo, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(54.dp).clip(CircleShape).background(RoshnColors.skySoft),
            )
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(coach.name, color = RoshnColors.ink, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                val details = buildList {
                    if (coach.nationality.isNotEmpty()) add(coach.nationality)
                    coach.age?.let { add("$it سنة") }
                }.joinToString(" · ")
                if (details.isNotEmpty()) Text(details, color = RoshnColors.inkSoft, fontSize = 11.sp)
            }
        }
    }
}

@Composable
private fun VenueCard(venue: RsTeamVenue) {
    SectionCard("ملعب النادي", "🏟") {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
            Box(
                modifier = Modifier.size(46.dp).clip(RoundedCornerShape(13.dp)).background(RoshnColors.pitchSoft),
                contentAlignment = Alignment.Center,
            ) { Text("📍", fontSize = 17.sp) }
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(venue.name.ifEmpty { "يُعلن لاحقًا" }, color = RoshnColors.ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                val meta = buildList {
                    if (venue.city.isNotEmpty()) add(venue.city)
                    venue.capacity?.let { add("$it متفرج") }
                }.joinToString(" · ")
                if (meta.isNotEmpty()) Text(meta, color = RoshnColors.inkSoft, fontSize = 10.sp)
            }
        }
    }
}

// ── أرقام الموسم ──

@Composable
private fun StatsSection(stats: RsTeamStats) {
    val tiles = listOf(
        "${stats.fixtures.played.total}" to "مباراة",
        "${stats.fixtures.wins.total}" to "فوز",
        "${stats.fixtures.draws.total}" to "تعادل",
        "${stats.fixtures.loses.total}" to "خسارة",
        "${stats.goals.scored.total}" to "له",
        "${stats.goals.against.total}" to "عليه",
        "${stats.summary.cleanSheets.total}" to "شباك نظيفة",
        "${stats.summary.cards.yellowTotal}/${stats.summary.cards.redTotal}" to "بطاقات",
    )
    SectionCard("أرقام الفريق في الموسم", "📊") {
        tiles.chunked(4).forEach { rowTiles ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                rowTiles.forEach { (value, label) ->
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                            .background(RoshnColors.skySoft.copy(alpha = 0.55f)).padding(vertical = 10.dp),
                    ) {
                        RsLtrText(value, RoshnColors.ink, 18)
                        Text(label, color = RoshnColors.inkSoft, fontSize = 9.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

// ── المباريات ──

@Composable
private fun MatchesSection(fixtures: List<RsFixture>, onOpenMatch: (Int) -> Unit) {
    val live = fixtures.filter { it.status.live }
    val upcoming = fixtures.filter { !it.started }.take(5)
    val results = fixtures.filter { it.status.finished }.takeLast(5).reversed()
    SectionCard("مباريات النادي", "🗓") {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            MatchGroup("مباشر الآن", live, onOpenMatch)
            MatchGroup("القادمة", upcoming, onOpenMatch)
            MatchGroup("النتائج", results, onOpenMatch)
            if (fixtures.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                    Text("لا توجد مباريات معلنة بعد", color = RoshnColors.inkSoft, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun MatchGroup(title: String, fixtures: List<RsFixture>, onOpenMatch: (Int) -> Unit) {
    if (fixtures.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text(
            "$title · ${fixtures.size}",
            color = if (title == "مباشر الآن") RoshnColors.liveRed else RoshnColors.inkSoft,
            fontSize = 11.sp, fontWeight = FontWeight.Bold,
        )
        fixtures.forEach { fixture -> RoshnMatchRow(fixture) { onOpenMatch(fixture.id) } }
    }
}

// ── الهدافون والقائمة ──

@Composable
private fun TeamScorersSection(scorers: List<RsTeamScorer>) {
    SectionCard("هدّافو الفريق", "⚽") {
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            scorers.forEach { scorer ->
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(RoshnColors.canvas).padding(10.dp),
                ) {
                    Text(
                        "${scorer.rank}", color = if (scorer.rank <= 3) RoshnColors.gold else RoshnColors.inkSoft,
                        fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.width(20.dp),
                    )
                    AsyncImage(
                        model = scorer.photo, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.size(38.dp).clip(CircleShape).background(RoshnColors.skySoft),
                    )
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(scorer.name, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${scorer.matches} مباراة · ${scorer.assists} صناعة", color = RoshnColors.inkSoft, fontSize = 9.sp)
                    }
                    Text("${scorer.goals}", color = RoshnColors.pitch, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
private fun SquadSection(squad: List<RsSquadPlayer>) {
    val groups = squad.groupBy { it.positionEn }
    val keys = groups.keys.sortedBy { POSITION_ORDER.indexOf(it).let { i -> if (i < 0) 9 else i } }
    SectionCard("قائمة الفريق", "👥") {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            if (squad.isEmpty()) {
                Box(Modifier.fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
                    Text("القائمة الرسمية لم تُعلن بعد", color = RoshnColors.inkSoft, fontSize = 12.sp)
                }
            }
            keys.forEach { key ->
                Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(
                        groups[key]?.firstOrNull()?.position?.takeIf { it.isNotEmpty() } ?: key,
                        color = RoshnColors.sky, fontSize = 12.sp, fontWeight = FontWeight.Bold,
                    )
                    groups[key].orEmpty().forEach { player ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(13.dp)).background(RoshnColors.canvas).padding(10.dp),
                        ) {
                            AsyncImage(
                                model = player.photo, contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.size(38.dp).clip(CircleShape).background(RoshnColors.skySoft),
                            )
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(player.name, color = RoshnColors.ink, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                player.age?.let { Text("$it سنة", color = RoshnColors.inkSoft, fontSize = 9.sp) }
                            }
                            Text(player.number?.toString() ?: "—", color = RoshnColors.inkSoft, fontSize = 15.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
