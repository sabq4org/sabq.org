package com.sabq.vara.ui

// مكوّنات مشتركة بين شاشات التفاصيل (ترويسة رجوع، تبويبات، صفوف انتقال،
// قوائم عامة) + شاشة البحث. الشاشات الكبيرة انتقلت لملفات مستقلة:
// MatchCenterScreen / TeamPlayerScreens / TransferScreens / CompetitionScreens.

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import com.sabq.vara.core.Competition
import com.sabq.vara.core.Team
import com.sabq.vara.core.Transfer
import com.sabq.vara.core.VaraViewModel
import com.sabq.vara.core.findArray
import com.sabq.vara.core.long
import com.sabq.vara.core.obj
import com.sabq.vara.core.parseCompetition
import com.sabq.vara.core.parseStanding
import com.sabq.vara.core.string
import com.sabq.vara.core.int
import com.sabq.vara.core.bool
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Locale

@Composable
fun BackHeader(nav: NavHostController, title: String, action: (@Composable () -> Unit)? = null) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().background(c.surface).padding(horizontal = 8.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton({ nav.popBackStack() }) { Icon(Icons.AutoMirrored.Filled.ArrowForward, "رجوع", tint = c.text) }
        Text(title, color = c.text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        action?.invoke()
    }
}

@Composable
fun DetailTabs(labels: List<String>, selected: Int, choose: (Int) -> Unit) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        labels.forEachIndexed { index, label ->
            Text(label, color = if (selected == index) Color.White else c.textDim, modifier = Modifier.clip(CircleShape).background(if (selected == index) c.accent else c.chip).clickable { choose(index) }.padding(horizontal = 14.dp, vertical = 8.dp), fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
        }
    }
}

@Composable
fun JsonListSection(title: String, rows: JsonArray) {
    val c = LocalVaraColors.current
    VaraCard(Modifier.padding(horizontal = 16.dp)) {
        SectionHeader(title, count = rows.size)
        Spacer(Modifier.padding(top = 9.dp))
        if (rows.isEmpty()) EmptyState("لا بيانات متاحة الآن") else rows.take(40).forEachIndexed { index, e ->
            val o = e as? JsonObject
            val label = o?.string("label", "type", "name", "title", "player", "text") ?: (e as? JsonPrimitive)?.content ?: "عنصر ${index + 1}"
            val value = o?.string("value", "score", "minute", "formation", "detail") ?: o?.int("value", "minute", "count")?.toString().orEmpty()
            Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (value.isNotBlank()) Text(value, color = c.accent, fontWeight = FontWeight.Bold, modifier = Modifier.width(58.dp))
                Text(label, color = c.text, modifier = Modifier.weight(1f), maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
            if (index != rows.lastIndex) VaraDivider()
        }
    }
}

fun parseTransfer(e: JsonElement): Transfer? {
    val o = e as? JsonObject ?: return null
    val player = o.obj("player") ?: o
    val from = o.obj("from", "fromTeam", "clubFrom")
    val to = o.obj("to", "toTeam", "clubTo")
    val name = player.string("nameAr", "name", "playerName") ?: o.string("player") ?: return null
    val playerId = player.int("id", "playerId")
    // فيد روشن لا يحمل صورة لاعب — تُبنى من مزوّد API-Football كما في iOS.
    val image = player.string("photo", "image")
        ?: playerId?.let { "https://media.api-sports.io/football/players/$it.png" }.orEmpty()
    return Transfer(
        id = o.string("id", "transferId") ?: "${playerId}-${o.string("date")}-${to?.string("name")}",
        playerId = playerId, player = name, playerImage = image,
        position = player.string("position", "positionAr") ?: o.string("position") ?: "",
        from = from?.string("nameAr", "name") ?: o.string("from", "fromTeam") ?: "",
        fromLogo = from?.string("logo") ?: o.string("fromLogo") ?: "",
        to = to?.string("nameAr", "name") ?: o.string("to", "toTeam") ?: "",
        toLogo = to?.string("logo") ?: o.string("toLogo") ?: "",
        date = o.string("date", "confirmedAt") ?: "",
        fee = o.string("fee", "marketValue") ?: formatTransferMoney(o),
        probability = o.string("probability", "confidence"),
        confirmed = o.bool("confirmed", "isConfirmed") ?: false,
        kind = o.string("kind") ?: "",
        typeAr = o.string("type", "typeAr") ?: "",
        hereWeGo = o.bool("hereWeGo", "here_we_go") ?: false,
        sourceTier = o.string("sourceTier", "source_tier", "tier") ?: "",
    )
}

// «85 مليون €» — نظير TcMoney.format في iOS.
fun formatTransferMoney(o: JsonObject): String {
    val amount = o.long("amount") ?: return ""
    if (amount <= 0) return ""
    val symbol = when (o.string("currency")?.uppercase()) {
        "EUR" -> "€"; "GBP" -> "£"; "USD" -> "$"; "SAR" -> "ر.س"; else -> o.string("currency") ?: ""
    }
    val text = when {
        amount >= 1_000_000 -> {
            val m = amount / 1_000_000.0
            if (m % 1.0 == 0.0) "${m.toInt()} مليون" else "${"%.1f".format(Locale.US, m)} مليون"
        }
        amount >= 1_000 -> "${amount / 1_000} ألف"
        else -> "$amount"
    }
    return if (symbol.isBlank()) text else "$text $symbol"
}

@Composable
fun TransferRow(t: Transfer, open: () -> Unit) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraCardShape).background(c.surface).clickable(onClick = open).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
        RemoteLogo(t.playerImage, t.player, 46); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(t.player, color = c.text, fontWeight = FontWeight.Bold); Text("${t.from.ifBlank { "—" }} ← ${t.to.ifBlank { "—" }}", color = c.textDim, fontSize = 11.sp, maxLines = 1); if (t.fee.isNotBlank()) Text(t.fee, color = c.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold) else if (t.typeAr.isNotBlank()) Text(t.typeAr, color = c.gold, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
        if (t.probabilityLabelAr.isNotBlank()) Text(t.probabilityLabelAr, color = c.accent, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clip(CircleShape).background(c.accent.copy(.1f)).padding(7.dp))
    }
}

// MARK: - البحث

@Composable
fun SearchScreen(nav: NavHostController, vm: VaraViewModel) {
    val c = LocalVaraColors.current
    var query by remember { mutableStateOf("") }
    var revision by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<LoadState<SearchData>>(LoadState.Loading) }
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focusRequester.requestFocus() } }
    LaunchedEffect(revision) {
        // فشل مصدر واحد لا يُفشل البحث كله — نواصل بما توفر (نظير try? في iOS).
        state = coroutineScope {
            val compsRoot = async { runCatching { vm.api.publicGet("/sports/competitions") }.getOrNull() }
            val roshnRoot = async { runCatching { vm.api.publicGet("/sports/pro-league/standings") }.getOrNull() }
            val worldRoot = async { runCatching { vm.api.publicGet("/world-cup/standings") }.getOrNull() }
            val comps = compsRoot.await()?.let { findArray(it, "competitions", "items").mapNotNull(::parseCompetition) }.orEmpty()
            val roshn = roshnRoot.await()?.let { findArray(it, "standings", "table", "items").mapNotNull { e -> parseStanding(e) } }.orEmpty().map { SearchTeam(it.team, "دوري روشن") }
            val world = worldRoot.await()?.let(::worldCupSearchTeams).orEmpty()
            if (comps.isEmpty() && roshn.isEmpty() && world.isEmpty()) LoadState.Error("تعذّر تحميل بيانات البحث")
            else LoadState.Data(SearchData(comps, (roshn + world).distinctBy { it.team.id }))
        }
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(c.screenTop, c.screenBottom)))) {
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            item { BackHeader(nav, "البحث") }
            item {
                OutlinedTextField(
                    query, { query = it },
                    Modifier.fillMaxWidth().padding(16.dp).focusRequester(focusRequester),
                    placeholder = { Text("ابحث عن نادٍ أو منتخب أو بطولة") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    trailingIcon = {
                        if (query.isNotBlank()) IconButton({ query = "" }) { Icon(Icons.Default.Close, "مسح", tint = c.textFaint) }
                    },
                    singleLine = true, shape = VaraTileShape,
                )
            }
            when (val s = state) {
                LoadState.Loading -> item { LoadStateHost(s, { revision++ }) {} }
                is LoadState.Error -> item { LoadStateHost(s, { revision++ }) {} }
                is LoadState.Data -> {
                    val q = normalizeArabic(query)
                    val teams = if (q.isBlank()) emptyList() else s.value.teams.filter { normalizeArabic(it.team.name).contains(q) }
                    val comps = if (q.isBlank()) emptyList() else s.value.competitions.filter { normalizeArabic(it.name).contains(q) }
                    if (q.isBlank()) item {
                        Column(Modifier.padding(horizontal = 22.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("نبحث لك في:", color = c.text, fontWeight = FontWeight.SemiBold)
                            Text("• كل البطولات المتاحة", color = c.textDim, fontSize = 12.sp)
                            Text("• أندية دوري روشن السعودي", color = c.textDim, fontSize = 12.sp)
                            Text("• منتخبات كأس العالم 2026", color = c.textDim, fontSize = 12.sp)
                        }
                    }
                    else if (teams.isEmpty() && comps.isEmpty()) item { EmptyState("لا نتائج", "جرّب اسمًا آخر") }
                    else {
                        if (teams.isNotEmpty()) item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHeader("أندية ومنتخبات", count = teams.size) } }
                        items(teams, key = { "team-${it.team.id}" }) { row -> SearchTeamRow(row, nav) }
                        if (comps.isNotEmpty()) item { Box(Modifier.padding(horizontal = 16.dp)) { SectionHeader("بطولات", count = comps.size) } }
                        items(comps, key = { "comp-${it.slug}" }) { row -> SearchCompetitionRow(row, nav) }
                    }
                }
            }
        }
    }
}

private data class SearchData(val competitions: List<Competition>, val teams: List<SearchTeam>)
private data class SearchTeam(val team: Team, val context: String)

private fun worldCupSearchTeams(root: JsonElement): List<SearchTeam> {
    val groups = findArray(root, "groups", "items")
    return groups.flatMap { group ->
        val obj = group as? JsonObject ?: return@flatMap emptyList()
        findArray(obj, "rows", "standings", "table", "items").mapNotNull { parseStanding(it) }.map { SearchTeam(it.team, "كأس العالم 2026") }
    }
}

private fun normalizeArabic(value: String): String = value.lowercase(Locale.ROOT)
    .replace(Regex("[ً-ْـ]"), "")
    .replace(Regex("[أإآ]"), "ا")
    .replace('ة', 'ه').replace('ى', 'ي').replace('ؤ', 'و').replace('ئ', 'ي')
    .split(Regex("\\s+")).joinToString(" ") { if (it.startsWith("ال") && it.length > 3) it.drop(2) else it }.trim()

@Composable
private fun SearchTeamRow(row: SearchTeam, nav: NavHostController) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraTileShape).background(c.surface).clickable { nav.navigate("team/${row.team.id}") }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        RemoteLogo(row.team.logo, row.team.name, 42); Spacer(Modifier.width(10.dp)); Column(Modifier.weight(1f)) { Text(row.team.name, color = c.text, fontWeight = FontWeight.SemiBold); Text(row.context, color = c.textDim, fontSize = 10.sp) }; Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint)
    }
}

@Composable
private fun SearchCompetitionRow(row: Competition, nav: NavHostController) {
    val c = LocalVaraColors.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(VaraTileShape).background(c.surface).clickable { nav.navigate("competition/${row.slug}") }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
        RemoteLogo(row.logo, row.name, 42); Spacer(Modifier.width(10.dp)); Text(row.name, color = c.text, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f)); Icon(Icons.Default.ChevronLeft, null, tint = c.textFaint)
    }
}
