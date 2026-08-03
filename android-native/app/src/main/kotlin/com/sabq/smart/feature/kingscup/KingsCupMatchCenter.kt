package com.sabq.smart.feature.kingscup

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.net.Uri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import java.util.Locale

// مركز مباراة كأس الملك — port ‏1:1 لـiOS `KingsCupMatchCenter.swift`:
// ترويسة مبذورة من البطاقة الفاتحة (رسم فوري)، شريط احتمالات + قنوات البث
// قبل النهاية، وأربعة تبويبات: الأحداث/التشكيلات/الإحصائيات/التقييمات.
// iOS يعرضه كورقة بينما أندرويد وجهة كاملة — عرف بقية مراكز التطبيق.

private enum class KcCenterTab(val label: String) {
    EVENTS("الأحداث"), LINEUPS("التشكيلات"), STATS("الإحصائيات"), RATINGS("التقييمات")
}

@Composable
fun KingsCupMatchScreen(
    fixtureId: Int,
    onBack: () -> Unit,
    onOpenTeam: (KcTeam) -> Unit,
    viewModel: KcMatchViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableStateOf(KcCenterTab.EVENTS) }
    var openPlayerId by rememberSaveable { mutableStateOf<Int?>(null) }
    LaunchedEffect(fixtureId) { viewModel.load(fixtureId, null) }

    ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
        Column(Modifier.fillMaxSize().background(KingsCupColors.sectionBackground)) {
            KcScreenHeader("مركز المباراة", onBack)
            val detail = state.detail
            when {
                detail == null && state.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = KingsCupColors.emeraldDeep)
                }
                detail == null -> KcCenterError(state.error ?: "تعذر جلب تفاصيل المباراة") { viewModel.retry(fixtureId) }
                else -> LazyColumn(
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    item { KcCenterHeader(detail.fixture, onOpenTeam) }
                    if (!detail.fixture.status.finished) {
                        state.prediction?.let { p -> item { KcProbabilityBar(detail.fixture, p) } }
                        if (state.channels.isNotEmpty()) item { KcTvStrip(state.channels) }
                    }
                    item { KcCenterTabBar(tab) { tab = it } }
                    when (tab) {
                        KcCenterTab.EVENTS -> kcEventsTab(detail)
                        KcCenterTab.LINEUPS -> kcLineupsTab(detail)
                        KcCenterTab.STATS -> item { KcStatsTab(detail) }
                        KcCenterTab.RATINGS -> kcRatingsTab(state) { openPlayerId = it }
                    }
                }
            }
        }
    }

    openPlayerId?.let { playerId ->
        KcPlayerSheet(playerId = playerId, onDismiss = { openPlayerId = null })
    }
}

// ── الترويسة ──

@Composable
private fun KcCenterHeader(f: KcFixture, onOpenTeam: (KcTeam) -> Unit) {
    Column(
        kcCardModifier(20).padding(vertical = 16.dp, horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            KcCenterTeamColumn(f.home, Modifier.weight(1f)) { onOpenTeam(f.home) }
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp), modifier = Modifier.width(96.dp)) {
                if (f.started) {
                    KcLtrText("${f.goals.away ?: 0} - ${f.goals.home ?: 0}", KingsCupColors.onDark, 26)
                } else {
                    Text(KcFormat.time(f), color = KingsCupColors.onDark, fontSize = 20.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                KcStatusPill(f)
            }
            KcCenterTeamColumn(f.away, Modifier.weight(1f)) { onOpenTeam(f.away) }
        }
        f.penaltyOutcome?.let { po ->
            Text(
                "فاز ${po.winnerName} بركلات الترجيح (${po.winnerScore}-${po.loserScore})",
                color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium,
            )
        }
        val venue = listOf(f.venue.name, f.venue.city).filter { it.isNotEmpty() }.joinToString(" — ")
        val line = listOf(f.round, venue, KcFormat.day(f)).filter { it.isNotEmpty() }.joinToString(" · ")
        Text(line, color = KingsCupColors.onDarkDim, fontSize = 11.sp, textAlign = TextAlign.Center)
    }
}

@Composable
private fun KcCenterTeamColumn(team: KcTeam, modifier: Modifier, onOpen: () -> Unit) {
    Column(
        modifier.clickable(onClick = onOpen),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        KcTeamLogo(team.logo, size = 48, padding = 6)
        Text(
            team.name, color = KingsCupColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Medium,
            maxLines = 2, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun KcCenterTabBar(selected: KcCenterTab, onSelect: (KcCenterTab) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        KcCenterTab.entries.forEach { t ->
            val active = t == selected
            Box(
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(50))
                    .background(if (active) KingsCupColors.emeraldDeep else KingsCupColors.chipFill)
                    .clickable { onSelect(t) }.padding(vertical = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    t.label, color = if (active) Color.White else KingsCupColors.onDarkDim,
                    fontSize = 12.sp, fontWeight = FontWeight.Medium, maxLines = 1,
                )
            }
        }
    }
}

// ── قنوات البث ──

@Composable
private fun KcTvStrip(channels: List<KcTvChannel>) {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("📺 القنوات الناقلة", color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Medium)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(channels, key = { "${it.name}-${it.country ?: ""}" }) { ch ->
                Row(
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.chipFill)
                        .border(0.5.dp, KingsCupColors.cardStroke.copy(alpha = 0.6f), RoundedCornerShape(50))
                        .clickable(enabled = !ch.url.isNullOrEmpty()) {
                            ch.url?.let { url ->
                                runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                            }
                        }
                        .padding(horizontal = 10.dp, vertical = 7.dp),
                ) {
                    if (!ch.logo.isNullOrEmpty()) {
                        AsyncImage(model = ch.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(18.dp))
                    } else {
                        Text("📡", fontSize = 11.sp)
                    }
                    Text(ch.name, color = KingsCupColors.onDark, fontSize = 11.sp, maxLines = 1)
                    ch.country?.takeIf { it.isNotEmpty() }?.let {
                        Text(it, color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
                    }
                }
            }
        }
    }
}

// ── الأحداث ──

private fun androidx.compose.foundation.lazy.LazyListScope.kcEventsTab(d: KcMatchDetail) {
    if (d.events.isEmpty()) {
        item { KcEmptyText("الأحداث تظهر هنا لحظة بلحظة مع انطلاق المباراة") }
        return
    }
    val sorted = d.events.sortedWith(compareByDescending<KcMatchEvent> { it.minute ?: 0 }.thenByDescending { it.extra ?: 0 })
    items(sorted) { ev -> KcEventRow(ev, d) }
}

@Composable
private fun KcEventRow(ev: KcMatchEvent, d: KcMatchDetail) {
    val isHome = ev.teamId == d.fixture.home.id
    val team = if (isHome) d.fixture.home else d.fixture.away
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(13).padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(if (isHome) KingsCupColors.emerald else KingsCupColors.gold))
        Box(Modifier.width(40.dp), contentAlignment = Alignment.Center) {
            KcLtrText(ev.minuteLabel, KingsCupColors.onDarkDim, 11, FontWeight.Medium)
        }
        KcEventIcon(ev.type)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                if (ev.player.isEmpty()) ev.label else "${ev.player} (${ev.label})",
                color = KingsCupColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            ev.assist?.takeIf { it.isNotEmpty() }?.let { assist ->
                Text(
                    if (ev.type == "substitution") "بديلًا عن: $assist" else "صناعة: $assist",
                    color = KingsCupColors.onDarkDim, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        AsyncImage(model = team.logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(20.dp))
    }
}

@Composable
private fun KcEventIcon(type: String) {
    Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) {
        when (type) {
            "goal" -> Text("⚽", fontSize = 13.sp)
            "missed-penalty" -> Text("❌", fontSize = 12.sp)
            "yellow-card" -> Box(Modifier.size(width = 11.dp, height = 15.dp).clip(RoundedCornerShape(2.dp)).background(KingsCupColors.gold))
            "red-card" -> Box(Modifier.size(width = 11.dp, height = 15.dp).clip(RoundedCornerShape(2.dp)).background(KingsCupColors.liveRed))
            "substitution" -> Text("⇄", color = KingsCupColors.sky, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            "var" -> Text("📺", fontSize = 12.sp)
            else -> Box(Modifier.size(8.dp).clip(CircleShape).background(KingsCupColors.onDarkDim))
        }
    }
}

// ── التشكيلات (ملعب 2D) ──

private fun androidx.compose.foundation.lazy.LazyListScope.kcLineupsTab(d: KcMatchDetail) {
    if (d.lineups.isEmpty()) {
        item { KcEmptyText("التشكيلات تُعلن قبل انطلاق المباراة بنحو 20–40 دقيقة") }
        return
    }
    items(d.lineups, key = { "lineup-${it.team.id}" }) { lineup -> KcPitchCard(lineup) }
}

@Composable
private fun KcPitchCard(lineup: KcLineup) {
    // صفوف الشبكة "row:col" — صف 1 الحارس (أسفل الملعب)، وصف 0 مُهمَل.
    val rows: List<List<KcLineupPlayer>> = lineup.startXI
        .groupBy { (it.grid ?: "0:0").split(":").firstOrNull()?.toIntOrNull() ?: 0 }
        .filterKeys { it > 0 }
        .toSortedMap()
        .map { (_, players) -> players.sortedBy { (it.grid ?: "0:0").split(":").getOrNull(1)?.toIntOrNull() ?: 0 } }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(lineup.team.name, color = KingsCupColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            lineup.formation?.let { formation ->
                Box(Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.chipFill).padding(horizontal = 8.dp, vertical = 2.dp)) {
                    KcLtrText(formation, KingsCupColors.onDarkDim, 12, FontWeight.Medium)
                }
            }
        }

        BoxWithConstraints(
            Modifier.fillMaxWidth().aspectRatio(3f / 4f)
                .clip(RoundedCornerShape(18.dp))
                .background(Brush.verticalGradient(listOf(KingsCupColors.pitchTop, KingsCupColors.pitchBottom))),
        ) {
            val pitchW = maxWidth
            val pitchH = maxHeight
            // خطوط الملعب: إطار داخلي + خط المنتصف + دائرة الوسط.
            Box(
                Modifier.fillMaxSize().padding(8.dp)
                    .border(1.dp, Color.White.copy(alpha = 0.25f), RoundedCornerShape(12.dp)),
            )
            Box(Modifier.fillMaxWidth().height(1.dp).align(Alignment.Center).background(Color.White.copy(alpha = 0.2f)))
            Box(Modifier.size(64.dp).align(Alignment.Center).border(1.dp, Color.White.copy(alpha = 0.25f), CircleShape))

            if (rows.isEmpty()) {
                Text(
                    "التشكيلة غير متاحة بعد", color = Color.White.copy(alpha = 0.8f), fontSize = 12.sp,
                    modifier = Modifier.align(Alignment.Center),
                )
            } else {
                val rowHeight = 46.dp
                rows.forEachIndexed { ri, players ->
                    // y = height*(1-(ri+0.6)/(count+0.4)) — نفس معادلة iOS KcPitch.
                    val y = pitchH * (1f - (ri + 0.6f) / (rows.size + 0.4f))
                    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
                        Row(
                            horizontalArrangement = Arrangement.SpaceEvenly,
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.width(pitchW).offset(y = y - rowHeight / 2),
                        ) {
                            players.forEach { p -> KcPlayerDot(p) }
                        }
                    }
                }
            }
        }

        lineup.coach?.takeIf { it.isNotEmpty() }?.let {
            Text("المدرب: $it", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
        }
        if (lineup.substitutes.isNotEmpty()) KcBench(lineup.substitutes)
    }
}

@Composable
private fun KcPlayerDot(p: KcLineupPlayer) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier.width(56.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) {
            Text(p.number?.toString() ?: "•", color = KingsCupColors.pitchBottom, fontSize = 11.sp, fontWeight = FontWeight.Black)
        }
        Text(
            p.name, color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Medium,
            maxLines = 1, textAlign = TextAlign.Center, overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun KcBench(subs: List<KcLineupPlayer>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 4.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("دكة البدلاء", color = KingsCupColors.emerald, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text("(${subs.size})", color = KingsCupColors.onDarkDim, fontSize = 11.sp)
        }
        subs.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                pair.forEach { p ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.weight(1f).clip(RoundedCornerShape(10.dp)).background(KingsCupColors.chipFill)
                            .padding(horizontal = 8.dp, vertical = 6.dp),
                    ) {
                        Box(
                            Modifier.size(22.dp).clip(CircleShape).background(KingsCupColors.emerald.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(p.number?.toString() ?: "•", color = KingsCupColors.emeraldDeep, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                        Text(p.name, color = KingsCupColors.onDark, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

// ── الإحصائيات ──

@Composable
private fun KcStatsTab(d: KcMatchDetail) {
    val rows = d.statistics?.rows.orEmpty()
    if (rows.isEmpty()) {
        KcEmptyText("الإحصائيات تظهر هنا أثناء المباراة")
        return
    }
    Column(
        verticalArrangement = Arrangement.spacedBy(14.dp),
        modifier = kcCardModifier(16).padding(14.dp),
    ) {
        rows.forEach { row -> KcStatBarRow(row) }
    }
}

/** شريطان متقابلان من المنتصف: المضيف (يمين المشهد) زمردي، والضيف سماوي. */
@Composable
private fun KcStatBarRow(row: KcStatRow) {
    val h = row.homeText.replace("%", "").toDoubleOrNull() ?: 0.0
    val a = row.awayText.replace("%", "").toDoubleOrNull() ?: 0.0
    val total = (h + a).takeIf { it > 0 } ?: 1.0
    Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(row.homeText, color = KingsCupColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text(row.label, color = KingsCupColors.onDarkDim, fontSize = 12.sp)
            Spacer(Modifier.weight(1f))
            Text(row.awayText, color = KingsCupColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold)
        }
        // بلا قلب اتجاه: الصف RTL — نصف المضيف أول عنصر فيظهر يمينًا، وشريطه
        // ينمو من المنتصف نحو رقمه (قاعدة المالك — لا dir=ltr على الأشرطة).
        Row(Modifier.fillMaxWidth().height(6.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            Box(Modifier.weight(1f).fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
                Box(
                    Modifier.fillMaxWidth((h / total).toFloat().coerceIn(0.02f, 1f))
                        .fillMaxSize().clip(RoundedCornerShape(3.dp)).background(KingsCupColors.emeraldDeep),
                )
            }
            Box(Modifier.weight(1f).fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                Box(
                    Modifier.fillMaxWidth((a / total).toFloat().coerceIn(0.02f, 1f))
                        .fillMaxSize().clip(RoundedCornerShape(3.dp)).background(KingsCupColors.sky),
                )
            }
        }
    }
}

// ── التقييمات ──

private fun androidx.compose.foundation.lazy.LazyListScope.kcRatingsTab(
    state: KcMatchViewModel.State,
    onOpenPlayer: (Int) -> Unit,
) {
    val rated = state.ratings?.players.orEmpty().filter { it.rating != null }.sortedByDescending { it.rating ?: 0.0 }
    when {
        !state.ratingsLoaded -> item { KcLoading() }
        rated.isEmpty() -> item { KcEmptyText("تقييمات اللاعبين تظهر هنا بعد انطلاق المباراة") }
        else -> {
            state.ratings?.motm?.let { motm ->
                item {
                    Row(
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxWidth()
                            .clip(RoundedCornerShape(16.dp)).background(KingsCupColors.gold.copy(alpha = 0.12f))
                            .border(1.dp, KingsCupColors.gold.copy(alpha = 0.3f), RoundedCornerShape(16.dp))
                            .clickable(enabled = motm.id > 0) { onOpenPlayer(motm.id) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        Text("👑", fontSize = 16.sp)
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                            Text("رجل المباراة", color = KingsCupColors.gold, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                            Text(motm.name, color = KingsCupColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                        KcRatingBadge(motm.rating)
                    }
                }
            }
            items(rated, key = { "rate-${it.id}" }) { p ->
                KcRatedPlayerRow(p, state.detail) { onOpenPlayer(p.id) }
            }
        }
    }
}

@Composable
private fun KcRatedPlayerRow(p: KcMatchRating, detail: KcMatchDetail?, onOpen: () -> Unit) {
    val teamLogo = detail?.fixture?.let { if (p.teamId == it.home.id) it.home.logo else it.away.logo }.orEmpty()
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = kcCardModifier(13).clickable(enabled = p.id > 0, onClick = onOpen).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        if (p.photo.isEmpty()) {
            Box(Modifier.size(32.dp).clip(CircleShape).background(KingsCupColors.chipFill))
        } else {
            AsyncImage(
                model = p.photo, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.size(32.dp).clip(CircleShape).background(KingsCupColors.chipFill),
            )
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                "${p.name}${if (p.captain) " (ك)" else ""}",
                color = KingsCupColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            val parts = buildList {
                if (p.pos.isNotEmpty()) add(p.pos)
                if (p.minutes > 0) add("${p.minutes} د")
                if (p.goals > 0) add("⚽ ${p.goals}")
                if (p.assists > 0) add("${p.assists} صناعة")
            }
            Text(parts.joinToString(" · "), color = KingsCupColors.onDarkDim, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        if (teamLogo.isNotEmpty()) {
            AsyncImage(model = teamLogo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.size(16.dp))
        }
        p.rating?.let { KcRatingBadge(it) }
    }
}

/** شارة التقييم: ≥8 زمردي عميق، ≥7 ورقي، ≥6 ذهبي، وإلا أحمر — عقد iOS. */
@Composable
internal fun KcRatingBadge(rating: Double) {
    val color = when {
        rating >= 8.0 -> KingsCupColors.emeraldDeep
        rating >= 7.0 -> KingsCupColors.leaf
        rating >= 6.0 -> KingsCupColors.gold
        else -> KingsCupColors.liveRed
    }
    Box(Modifier.clip(RoundedCornerShape(8.dp)).background(color).padding(horizontal = 7.dp, vertical = 3.dp)) {
        KcLtrText(String.format(Locale.US, "%.1f", rating), Color.White, 11)
    }
}

// ── الأخطاء ──

@Composable
private fun KcCenterError(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 54.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(message, color = KingsCupColors.onDarkDim, fontSize = 14.sp, textAlign = TextAlign.Center)
        Text(
            "إعادة المحاولة", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium,
            modifier = Modifier.clip(RoundedCornerShape(50)).background(KingsCupColors.emeraldDeep)
                .clickable(onClick = onRetry).padding(horizontal = 20.dp, vertical = 8.dp),
        )
    }
}
