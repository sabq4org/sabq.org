package com.sabq.smart.feature.worldcup

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// معرّفات المنتخبات العربية المشاركة — يطابق ثابت الويب/iOS حرفيًا.
private val WC_ARAB_TEAM_IDS = setOf(23, 28, 31, 32, 1532, 1548, 1567, 1569)

data class WcArabTeamDigest(
    val team: WcTeam,
    val row: WcStandingRow?,
    val group: WcGroup?,
    val fixtures: List<WcFixture>,
    val next: WcFixture?,
    val latest: WcFixture?,
) {
    val id: Int get() = team.id
}

/**
 * يبني ملخّص كل منتخب عربي (مجموعته/ترتيبه/مبارياته القادمة والأخيرة) من نفس
 * بيانات fixtures/standings المُحمّلة أصلًا للصفحة — يطابق iOS/الويب حرفيًا.
 */
fun wcBuildArabTeams(fixtures: List<WcFixture>, groups: List<WcGroup>): List<WcArabTeamDigest> {
    data class Entry(val team: WcTeam, val row: WcStandingRow?, val group: WcGroup?)
    val entries = LinkedHashMap<Int, Entry>()

    for (group in groups) {
        for (row in group.rows) {
            if (row.team.id in WC_ARAB_TEAM_IDS) entries[row.team.id] = Entry(row.team, row, group)
        }
    }
    for (fixture in fixtures) {
        for (team in listOf(fixture.home, fixture.away)) {
            if (team.id in WC_ARAB_TEAM_IDS && entries[team.id] == null) {
                entries[team.id] = Entry(team, null, null)
            }
        }
    }

    return entries.values
        .map { entry ->
            val teamFixtures = fixtures
                .filter { it.home.id == entry.team.id || it.away.id == entry.team.id }
                .sortedBy { it.timestamp }
            val next = teamFixtures.firstOrNull { !it.status.finished }
            val latest = teamFixtures.lastOrNull { it.status.finished }
            WcArabTeamDigest(entry.team, entry.row, entry.group, teamFixtures, next, latest)
        }
        .filter { it.fixtures.isNotEmpty() || it.row != null }
        .sortedWith(compareBy(
            { it.next == null },
            { if (it.row?.qualifyStatus == "eliminated") 1 else 0 },
            { it.next?.timestamp ?: it.latest?.timestamp ?: Int.MAX_VALUE },
            { it.team.name },
        ))
}

private data class ArabState(val label: String, val bg: Color, val fg: Color)

private val arabWaiting get() = ArabState("بانتظار الترتيب", Color.White.copy(alpha = 0.10f), Color.White.copy(alpha = 0.90f))
private val arabQualified get() = ArabState("متأهل", WcColors.leaf, WcColors.stadiumTop)
private val arabEliminated get() = ArabState("خارج المنافسة", Color.White.copy(alpha = 0.12f), Color.White.copy(alpha = 0.85f))
private val arabContention get() = ArabState("في المنافسة", Color.White.copy(alpha = 0.92f), WcColors.stadiumTop)

/**
 * الخادم يرسل qualifyStatus أثناء دور المجموعات فقط ويجعله null بعد انتهائه —
 * فلا يكفي الاعتماد عليه وحده وإلا ظهر الجميع بحالة واحدة. عند غياب القيمة نستنتج
 * الحالة محليًا (مطابق iOS/computeQualified): المجموعة مكتملة والمركز ضمن الأوّلين
 * ⇒ متأهل، وله مباراة قادمة (أفضل ثالث تأهّل) ⇒ في المنافسة، وإلا ⇒ خارج المنافسة.
 */
private fun wcArabTeamState(row: WcStandingRow?, groupComplete: Boolean, hasUpcoming: Boolean): ArabState {
    if (row == null) return arabWaiting
    when (row.qualifyStatus) {
        "qualified" -> return arabQualified
        "eliminated" -> return arabEliminated
        "contention" -> return arabContention
    }
    // qualifyStatus == null (انتهى دور المجموعات) — نستنتج
    if (!groupComplete) return arabContention
    if (row.rank <= 2) return arabQualified
    if (hasUpcoming) return arabContention
    return arabEliminated
}

@HiltViewModel
class ArabSquadViewModel @Inject constructor(private val repo: WorldCupRepository) : ViewModel() {
    private val cache = mutableMapOf<Int, List<WcSquadPlayer>>()
    private val _players = MutableStateFlow<List<WcSquadPlayer>>(emptyList())
    val players: StateFlow<List<WcSquadPlayer>> = _players.asStateFlow()

    fun load(teamId: Int) {
        cache[teamId]?.let { _players.value = it; return }
        _players.value = emptyList()
        viewModelScope.launch {
            val list = runCatching { repo.squad(teamId).players }.getOrDefault(emptyList())
            cache[teamId] = list
            if (_players.value !== list) _players.value = list
        }
    }
}

/**
 * بطاقة «المنتخبات العربية في المونديال» — شريط تبديل أعلى بطاقة المنتخب المختار
 * (حالة + إحصاءات + المباراة القادمة/آخر نتيجة + مصغّر ترتيب المجموعة + التشكيلة).
 * يستهلك fixtures/standings المحمَّلة أصلًا للصفحة. تكافؤ iOS/الويب.
 */
@Composable
fun ArabTeamsSpotlight(
    fixtures: List<WcFixture>,
    groups: List<WcGroup>,
    onOpenMatch: (Int) -> Unit,
    onOpenPlayer: (Int) -> Unit,
    onOpenTeam: (WcTeam) -> Unit,
) {
    val teams = remember(fixtures, groups) { wcBuildArabTeams(fixtures, groups) }
    if (teams.isEmpty()) return

    var selectedId by remember { mutableStateOf<Int?>(null) }
    LaunchedEffect(teams.map { it.id }) {
        if (selectedId == null || teams.none { it.id == selectedId }) selectedId = teams.first().id
    }
    val selected = teams.firstOrNull { it.id == selectedId } ?: teams.first()

    androidx.compose.runtime.CompositionLocalProvider(LocalWcForceDark provides true) {
    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Box(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(24.dp))
                .background(Brush.linearGradient(listOf(WcColors.emeraldDeep, WcColors.stadiumTop))),
        ) {
            // علامة درع مائية خفيفة في الزاوية السفلى (مطابق iOS)
            Icon(
                Icons.Filled.Shield, null, tint = Color.White.copy(alpha = 0.06f),
                modifier = Modifier.align(Alignment.BottomEnd).size(150.dp),
            )
            Column(
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.fillMaxWidth().padding(20.dp),
            ) {
                ArabHeader(teams.size)
                ArabTeamRail(teams, selected.id) { selectedId = it }
                ArabTeamPanel(selected, fixtures, onOpenMatch, onOpenPlayer, onOpenTeam)
            }
        }
    }
    }
}

@Composable
private fun ArabHeader(count: Int) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Filled.Flag, null, tint = WcColors.emerald.copy(alpha = 0.85f), modifier = Modifier.size(16.dp))
                Text("المنتخبات العربية في المونديال", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Black)
            }
            Text(
                "نتائج ومواعيد المنتخبات العربية المتبقية في البطولة، مع وضع المجموعة في بطاقة واحدة.",
                color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp,
            )
        }
        Text(
            "$count منتخبات", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(Color.White.copy(alpha = 0.15f)).padding(horizontal = 8.dp, vertical = 3.dp),
        )
    }
}

@Composable
private fun ArabTeamRail(teams: List<WcArabTeamDigest>, selectedId: Int, onSelect: (Int) -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
    ) {
        teams.forEach { digest ->
            val isSel = digest.id == selectedId
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.clip(RoundedCornerShape(50))
                    .background(if (isSel) Color.White else Color.White.copy(alpha = 0.08f))
                    .border(1.dp, Color.White.copy(alpha = if (isSel) 0f else 0.12f), RoundedCornerShape(50))
                    .clickable { onSelect(digest.id) }.padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                WcTeamLogo(digest.team, size = 24, ring = Color.Transparent)
                Text(digest.team.name, color = if (isSel) WcColors.stadiumTop else Color.White, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ArabTeamPanel(
    digest: WcArabTeamDigest,
    allFixtures: List<WcFixture>,
    onOpenMatch: (Int) -> Unit,
    onOpenPlayer: (Int) -> Unit,
    onOpenTeam: (WcTeam) -> Unit,
) {
    // اكتمال المجموعة = كل مباريات فرقها انتهت — لاستنتاج الحالة عند غياب qualifyStatus.
    val groupIds = digest.group?.rows?.map { it.team.id }?.toSet() ?: emptySet()
    val groupMatches = allFixtures.filter { it.home.id in groupIds && it.away.id in groupIds }
    val groupComplete = groupMatches.isNotEmpty() && groupMatches.all { it.status.finished }
    val state = wcArabTeamState(digest.row, groupComplete, digest.next != null)
    val diff = digest.row?.let { if (it.goalsDiff > 0) "+${it.goalsDiff}" else "${it.goalsDiff}" } ?: "-"

    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f).clickable { onOpenTeam(digest.team) },
            ) {
                WcTeamLogo(digest.team, size = 50, ring = Color.White.copy(alpha = 0.25f))
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(digest.team.name, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Black)
                    Text(arabGroupSubtitle(digest), color = Color.White.copy(alpha = 0.7f), fontSize = 12.sp)
                }
            }
            Text(
                state.label, color = state.fg, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(state.bg).padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            ArabStatPill("المركز", digest.row?.rank?.toString() ?: "-", Modifier.weight(1f))
            ArabStatPill("النقاط", digest.row?.points?.toString() ?: "-", Modifier.weight(1f))
            ArabStatPill("فاز", digest.row?.win?.toString() ?: "-", Modifier.weight(1f))
            ArabStatPill("الفارق", diff, Modifier.weight(1f))
        }

        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (digest.next != null) ArabMatchRow(digest, digest.next, "المباراة القادمة", onOpenMatch)
            else ArabEmptyLine("لا توجد مباراة قادمة مجدولة.")
            if (digest.latest != null) ArabMatchRow(digest, digest.latest, "آخر نتيجة", onOpenMatch)
            else ArabEmptyLine("لم يلعب بعد في البطولة.")
        }

        ArabGroupMiniTable(digest.group, digest.team.id, onOpenTeam)

        ArabTeamSquadStrip(digest.team.id, onOpenPlayer)
    }
}

private fun arabGroupSubtitle(digest: WcArabTeamDigest): String {
    val parts = mutableListOf(digest.group?.group ?: "كأس العالم 2026")
    digest.row?.let { parts.add("${it.played} لعب · ${it.points} ن") }
    return parts.joinToString(" · ")
}

@Composable
private fun ArabStatPill(label: String, value: String, modifier: Modifier = Modifier) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = modifier.clip(RoundedCornerShape(10.dp)).background(Color.White.copy(alpha = 0.06f)).padding(vertical = 8.dp),
    ) {
        Text(label, color = Color.White.copy(alpha = 0.6f), fontSize = 10.sp)
        LtrText(value, Color.White, 14, FontWeight.Black)
    }
}

@Composable
private fun ArabMatchRow(digest: WcArabTeamDigest, fixture: WcFixture, label: String, onOpenMatch: (Int) -> Unit) {
    val opponent = if (fixture.home.id == digest.team.id) fixture.away else fixture.home
    val teamGoals = if (fixture.home.id == digest.team.id) fixture.goals.home else fixture.goals.away
    val oppGoals = if (fixture.home.id == digest.team.id) fixture.goals.away else fixture.goals.home
    val started = fixture.status.live || fixture.status.finished

    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.08f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
            .clickable { onOpenMatch(fixture.id) }.padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        WcTeamLogo(opponent, size = 32, ring = Color.Transparent)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text("ضد ${opponent.name}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Text("$label · ${fixture.round} · ${WcFormat.day(fixture)}", color = Color.White.copy(alpha = 0.65f), fontSize = 11.sp, maxLines = 1)
        }
        if (started) {
            LtrText("${teamGoals ?: 0} - ${oppGoals ?: 0}", Color.White, 17, FontWeight.Black)
            Spacer(Modifier.width(2.dp))
            WcStatusPill(fixture)
        } else {
            Text(WcFormat.time(fixture), color = WcColors.emerald, fontSize = 14.sp, fontWeight = FontWeight.Bold)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, null, tint = Color.White.copy(alpha = 0.5f), modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun ArabEmptyLine(text: String) {
    Text(
        text, color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp,
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White.copy(alpha = 0.06f)).padding(horizontal = 14.dp, vertical = 12.dp),
    )
}

@Composable
private fun ArabGroupMiniTable(group: WcGroup?, selectedId: Int, onOpenTeam: (WcTeam) -> Unit) {
    if (group == null) return
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
            .background(Color.Black.copy(alpha = 0.20f))
            .border(1.dp, Color.White.copy(alpha = 0.10f), RoundedCornerShape(12.dp))
            .padding(14.dp),
    ) {
        Text(group.group, color = Color.White.copy(alpha = 0.9f), fontSize = 14.sp, fontWeight = FontWeight.Bold)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            group.rows.forEach { row ->
                val isSel = row.team.id == selectedId
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp))
                        .background(if (isSel) Color.White.copy(alpha = 0.14f) else Color.Transparent)
                        .border(1.dp, if (isSel) Color.White.copy(alpha = 0.30f) else Color.Transparent, RoundedCornerShape(10.dp))
                        .clickable { onOpenTeam(row.team) }.padding(horizontal = 8.dp, vertical = 6.dp),
                ) {
                    Text("${row.rank}", color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp, modifier = Modifier.width(16.dp))
                    WcTeamLogo(row.team, size = 18, ring = Color.Transparent)
                    Text(row.team.name, color = Color.White.copy(alpha = if (isSel) 1f else 0.85f), fontSize = 13.sp,
                        fontWeight = if (isSel) FontWeight.Bold else FontWeight.Normal, maxLines = 1, modifier = Modifier.weight(1f))
                    Text("${row.played} لعب", color = Color.White.copy(alpha = 0.6f), fontSize = 11.sp)
                    Text("${row.points} ن", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Black)
                }
            }
        }
    }
}

/** شريط تشكيلة المنتخب المختار — يُعاد الجلب عند تبدّل المنتخب. */
@Composable
private fun ArabTeamSquadStrip(teamId: Int, onOpenPlayer: (Int) -> Unit) {
    val vm: ArabSquadViewModel = hiltViewModel()
    val players by vm.players.collectAsStateWithLifecycle()
    LaunchedEffect(teamId) { vm.load(teamId) }
    if (players.isEmpty()) return

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("التشكيلة — اضغط على اللاعب لملفه الكامل",
            color = WcColors.emerald.copy(alpha = 0.85f), fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Row(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        ) {
            players.forEach { p ->
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.size(width = 58.dp, height = 78.dp).clickable(enabled = p.id > 0) { onOpenPlayer(p.id) },
                ) {
                    Box(modifier = Modifier.size(46.dp).clip(CircleShape).border(2.dp, Color.White.copy(alpha = 0.25f), CircleShape)) {
                        WcPlayerPhoto(p.photo, p.name, 46)
                    }
                    Text(p.name, color = Color.White.copy(alpha = 0.9f), fontSize = 9.sp, fontWeight = FontWeight.SemiBold,
                        maxLines = 2, textAlign = TextAlign.Center, lineHeight = 11.sp)
                }
            }
        }
    }
}
