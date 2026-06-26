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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.Cake
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.QueryStats
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import androidx.compose.foundation.Canvas
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * بطاقة اللاعب الشاملة — تُفتح بالضغط على أي لاعب في قسم المونديال
 * (قائمة المنتخب، السباقات، التشكيلات، التقييمات، الأحداث، شريط الأخضر).
 * مطابقة لـiOS WCPlayerSheet وويب PlayerCardDialog، بثيم الملعب الليلي.
 * ModalBottomSheet بكامل الارتفاع — نفس عرض sheet في تطبيق iOS بلا هوامش مهدرة.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlayerCardDialog(
    card: WcPlayerCard?,
    loading: Boolean,
    onDismiss: () -> Unit,
    extrasVm: WorldCupPlayerExtrasViewModel = androidx.hilt.navigation.compose.hiltViewModel(),
) {
    val extras by extrasVm.state.collectAsStateWithLifecycle()
    androidx.compose.runtime.LaunchedEffect(card?.id) {
        card?.id?.takeIf { it > 0 }?.let { extrasVm.load(it) }
    }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = WcColors.sheetBackground,
        dragHandle = { WcSheetHandle() },
    ) {
        ProvideTextStyle(LocalTextStyle.current.copy(fontFamily = IbmPlexSansArabic)) {
            Column(
                modifier = Modifier.fillMaxWidth().fillMaxHeight(0.96f)
                    .padding(horizontal = 18.dp).padding(bottom = 18.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Text("بطاقة اللاعب", color = WcColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                    Text("✕", color = WcColors.onDark, fontSize = 18.sp,
                        modifier = Modifier.clip(RoundedCornerShape(50)).clickable { onDismiss() }.padding(8.dp))
                }
                Spacer(Modifier.height(8.dp))
                when {
                    loading -> WcLoading()
                    card == null -> WcEmptyText("ملف اللاعب غير متاح حاليًا")
                    else -> Column(
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.verticalScroll(rememberScrollState()),
                    ) {
                        IdentityHeader(card)
                        FactTilesRow(card)
                        BirthLine(card)
                        extras.market?.let { MarketSection(it) }
                        card.stats?.let { PlayerStatsGrid(it, isGoalkeeper = card.positionEn == "Goalkeeper") }
                        extras.form?.let { FormSection(it) }
                        if (card.career.isNotEmpty()) CareerSection(card.career)
                        if (card.trophies.isNotEmpty()) TrophiesSection(card.trophies)
                    }
                }
            }
        }
    }
}

/** مقبض سحب تكيّفي — خافت على الفاتح والداكن معًا. */
@Composable
fun WcSheetHandle() {
    Box(
        modifier = Modifier.padding(top = 10.dp, bottom = 6.dp).size(width = 40.dp, height = 4.dp)
            .clip(RoundedCornerShape(50)).background(WcColors.onDark.copy(alpha = 0.25f)),
    )
}

// ---------- الهوية ----------

@Composable
private fun IdentityHeader(card: WcPlayerCard) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(modifier = Modifier.size(76.dp).clip(CircleShape).border(3.dp, WcColors.emeraldDeep, CircleShape)) {
            WcPlayerPhoto(card.photo, card.name, 76)
        }
        Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.weight(1f)) {
            Text(card.name, color = WcColors.onDark, fontSize = 19.sp, fontWeight = FontWeight.Black, maxLines = 2)
            card.fullName?.let {
                Text(it, color = WcColors.onDarkDim, fontSize = 11.sp, maxLines = 1)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                if (card.position.isNotBlank()) {
                    Chip(card.position, WcColors.emeraldDeep.copy(alpha = 0.35f), WcColors.emerald)
                }
                card.number?.let { Chip("رقم $it", WcColors.chipFill, WcColors.onDark) }
                if (card.injury != null) {
                    Chip("مصاب حاليًا", WcColors.gold.copy(alpha = 0.2f), WcColors.gold)
                }
            }
        }
    }
}

@Composable
private fun Chip(text: String, bg: Color, fg: Color) {
    Text(text, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold,
        modifier = Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 8.dp, vertical = 3.dp))
}

// ---------- شريط الحقائق ----------

@Composable
private fun FactTilesRow(card: WcPlayerCard) {
    val facts = listOfNotNull(
        card.age?.let { "$it سنة" to "العمر" },
        card.height?.let { "$it سم" to "الطول" },
        card.weight?.let { "$it كجم" to "الوزن" },
    )
    if (facts.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        facts.forEach { (value, label) -> Box(Modifier.weight(1f)) { FactTile(value, label) } }
    }
}

@Composable
private fun FactTile(value: String, label: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(12.dp)).padding(vertical = 9.dp, horizontal = 6.dp),
    ) {
        Text(value, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Black, maxLines = 1)
        Text(label, color = WcColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
    }
}

/** تاريخ الميلاد يصل "yyyy-MM-dd" — جافا ميلادي افتراضًا، وDecimalStyle للأرقام اللاتينية */
private val birthFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.forLanguageTag("ar")).withDecimalStyle(DecimalStyle.STANDARD)

@Composable
private fun BirthLine(card: WcPlayerCard) {
    val date = card.birthDate?.let { runCatching { LocalDate.parse(it.take(10)).format(birthFmt) }.getOrNull() }
    val parts = listOfNotNull(date, card.birthPlace)
    if (parts.isEmpty()) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(Icons.Filled.Cake, null, tint = WcColors.onDarkDim, modifier = Modifier.size(14.dp))
        Text(parts.joinToString(" — "), color = WcColors.onDarkDim, fontSize = 12.sp)
    }
}

// ---------- أرقام البطولة ----------

@Composable
private fun PlayerStatsGrid(stats: WcPlayerTournamentStats, isGoalkeeper: Boolean) {
    // البلاطات تُبنى حسب المركز — لا «تصديات» لمهاجم ولا «مراوغات» لحارس
    val tiles = buildList {
        add("مباريات" to "${stats.matches}")
        add("دقائق اللعب" to "${stats.minutes}")
        add("أساسي" to "${stats.lineups}")
        add("أهداف" to "${stats.goals}")
        add("صناعة" to "${stats.assists}")
        if (isGoalkeeper) {
            add("تصديات" to "${stats.saves}")
            add("أهداف استقبلها" to "${stats.conceded}")
        } else {
            add("تسديدات (على المرمى)" to "${stats.shots} (${stats.shotsOn})")
            add("تمريرات مفتاحية" to "${stats.keyPasses}")
            add("مراوغات ناجحة" to "${stats.dribblesSuccess}/${stats.dribblesAttempts}")
            add("تدخلات" to "${stats.tackles}")
        }
        if (stats.penaltiesScored + stats.penaltiesMissed > 0) {
            add("ركلات جزاء" to "${stats.penaltiesScored}/${stats.penaltiesScored + stats.penaltiesMissed}")
        }
        if (stats.yellow + stats.red > 0) {
            add("بطاقات (صفراء/حمراء)" to "${stats.yellow}/${stats.red}")
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.Filled.QueryStats, null, tint = WcColors.emerald, modifier = Modifier.size(14.dp))
            Text("أرقامه في مونديال 2026", color = WcColors.emerald, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            stats.rating?.let { r ->
                val color = when {
                    r >= 8 -> WcColors.emeraldDeep
                    r >= 7 -> WcColors.leaf
                    r >= 6 -> WcColors.gold
                    else -> WcColors.liveRed
                }
                Box(modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(color).padding(horizontal = 7.dp, vertical = 3.dp)) {
                    LtrText(String.format(Locale.US, "%.1f", r), Color.White, 12, FontWeight.Black)
                }
            }
        }
        tiles.chunked(3).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                row.forEach { (label, value) -> Box(Modifier.weight(1f)) { FactTile(value, label) } }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

// ---------- المسيرة ----------

@Composable
private fun CareerSection(career: List<WcPlayerCareerStop>) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SectionTitle(Icons.Filled.History, "المسيرة")
        career.forEach { stop ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Box(
                    modifier = Modifier.size(30.dp).clip(CircleShape).background(Color.White).padding(4.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    AsyncImage(model = stop.logo, contentDescription = null, modifier = Modifier.fillMaxWidth())
                }
                Text(stop.team, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f))
                if (stop.seasons.isNotEmpty()) {
                    LtrText(stop.seasonsLabel, WcColors.onDarkDim, 12, FontWeight.SemiBold)
                }
            }
        }
    }
}

// ---------- الألقاب ----------

@Composable
private fun TrophiesSection(trophies: List<WcPlayerTrophy>) {
    val titles = trophies.count { it.winner }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SectionTitle(Icons.Filled.EmojiEvents, "الألقاب")
            if (titles > 0) {
                Text("$titles بطولة", color = WcColors.onDarkDim, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 7.dp, vertical = 2.dp))
            }
        }
        trophies.forEach { trophy ->
            Row(
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Icon(Icons.Filled.EmojiEvents, null,
                    tint = if (trophy.winner) WcColors.gold else WcColors.onDarkDim.copy(alpha = 0.5f),
                    modifier = Modifier.size(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(trophy.competition, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                    if (trophy.country.isNotBlank()) {
                        Text(trophy.country, color = WcColors.onDarkDim, fontSize = 10.sp)
                    }
                }
                Text(trophy.place, color = if (trophy.winner) Color.White else WcColors.onDarkDim, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(if (trophy.winner) WcColors.emeraldDeep else WcColors.chipFill)
                        .padding(horizontal = 7.dp, vertical = 2.dp))
                LtrText(trophy.season, WcColors.onDarkDim, 11, FontWeight.SemiBold)
            }
        }
    }
}

@Composable
private fun SectionTitle(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Icon(icon, null, tint = WcColors.emerald, modifier = Modifier.size(14.dp))
        Text(text, color = WcColors.emerald, fontSize = 14.sp, fontWeight = FontWeight.Bold)
    }
}

// ---------- القيمة السوقية + مخطّط تاريخها ----------

@Composable
private fun MarketSection(m: WcPlayerMarket) {
    val current = m.marketValue ?: m.history.lastOrNull()?.value
    if (!m.available || (current == null && m.history.size < 2)) return
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(WcColors.card)
            .border(1.dp, WcColors.gold.copy(alpha = 0.25f), RoundedCornerShape(16.dp)).padding(14.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.AutoMirrored.Filled.TrendingUp, null, tint = WcColors.gold, modifier = Modifier.size(14.dp))
            Text("القيمة السوقية", color = WcColors.gold, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            current?.let { LtrText(formatMarket(it, m.currency), WcColors.onDark, 15, FontWeight.Black) }
        }
        if (m.history.size >= 2) MarketChart(m.history)
    }
}

@Composable
private fun MarketChart(points: List<WcMarketPoint>) {
    val minV = points.minOf { it.value }
    val maxV = points.maxOf { it.value }
    val range = (maxV - minV).coerceAtLeast(1.0)
    val gold = WcColors.gold
    Canvas(modifier = Modifier.fillMaxWidth().height(120.dp).padding(vertical = 4.dp)) {
        val w = size.width
        val h = size.height
        // LTR: الأقدم يسارًا، الأحدث يمينًا
        val stepX = if (points.size > 1) w / (points.size - 1) else w
        fun px(i: Int) = i * stepX
        fun py(v: Double) = (h - ((v - minV) / range * h)).toFloat()

        val line = Path()
        val area = Path()
        points.forEachIndexed { i, p ->
            val x = px(i)
            val y = py(p.value)
            if (i == 0) { line.moveTo(x, y); area.moveTo(x, h); area.lineTo(x, y) }
            else { line.lineTo(x, y); area.lineTo(x, y) }
        }
        area.lineTo(px(points.size - 1), h)
        area.close()
        drawPath(area, color = gold.copy(alpha = 0.15f))
        drawPath(line, color = gold, style = Stroke(width = 3f))
        points.forEachIndexed { i, p ->
            drawCircle(color = gold, radius = 3.5f, center = Offset(px(i), py(p.value)))
        }
    }
}

private fun formatMarket(value: Double, currency: String): String = when {
    value >= 1_000_000 -> String.format(Locale.US, "%.1f مليون %s", value / 1_000_000, currency)
    value >= 1_000 -> String.format(Locale.US, "%.0f ألف %s", value / 1_000, currency)
    else -> String.format(Locale.US, "%.0f %s", value, currency)
}

// ---------- الفورمة الأخيرة + xG ----------

@Composable
private fun FormSection(form: WcPlayerForm) {
    if (!form.available || form.matches.isEmpty()) return
    val matches = form.matches
    val hasXg = matches.any { it.xg != null }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth()) {
            Icon(Icons.AutoMirrored.Filled.ShowChart, null, tint = WcColors.emerald, modifier = Modifier.size(14.dp))
            Text(if (hasXg) "الفورمة الأخيرة · xG" else "الفورمة الأخيرة", color = WcColors.emerald, fontSize = 14.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            Text("آخر ${matches.size}", color = WcColors.onDarkDim, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.chipFill).padding(horizontal = 7.dp, vertical = 2.dp))
        }
        // شريط النتائج — الأحدث يمينًا
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            matches.reversed().forEach { m ->
                Box(modifier = Modifier.size(24.dp).clip(CircleShape).background(resultColor(m.result)), contentAlignment = Alignment.Center) {
                    Text(resultAr(m.result), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        if (hasXg) XgBarChart(matches)
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            matches.forEach { FormMatchRow(it) }
        }
    }
}

@Composable
private fun XgBarChart(matches: List<WcFormMatch>) {
    val maxXg = matches.maxOf { it.xg ?: 0.0 }.coerceAtLeast(0.1)
    val emerald = WcColors.emerald
    Canvas(modifier = Modifier.fillMaxWidth().height(96.dp).padding(top = 2.dp)) {
        val w = size.width
        val h = size.height
        val slot = w / matches.size
        val barW = (slot * 0.55f).coerceAtMost(22f)
        matches.forEachIndexed { i, m ->
            val cx = i * slot + slot / 2
            val barH = ((m.xg ?: 0.0) / maxXg * (h - 6)).toFloat()
            drawRoundRect(
                color = emerald,
                topLeft = Offset(cx - barW / 2, h - barH),
                size = androidx.compose.ui.geometry.Size(barW, barH),
                cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f, 3f),
            )
        }
    }
}

@Composable
private fun FormMatchRow(m: WcFormMatch) {
    Row(
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card).padding(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Box(modifier = Modifier.size(22.dp).clip(CircleShape).background(resultColor(m.result)), contentAlignment = Alignment.Center) {
            Text(resultAr(m.result), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Black)
        }
        if (m.opponentLogo.isNotEmpty()) {
            Box(modifier = Modifier.size(24.dp).clip(CircleShape).background(Color.White).padding(2.dp), contentAlignment = Alignment.Center) {
                AsyncImage(model = m.opponentLogo, contentDescription = null, modifier = Modifier.fillMaxWidth())
            }
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(m.opponent.ifEmpty { "—" }, color = WcColors.onDark, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(if (m.homeAway == "home") "أرضه" else "خارج أرضه", color = WcColors.onDarkDim, fontSize = 10.sp)
                if (m.league.isNotEmpty()) Text("· ${m.league}", color = WcColors.onDarkDim, fontSize = 10.sp, maxLines = 1)
            }
        }
        m.xg?.let {
            Box(modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emerald.copy(alpha = 0.12f)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                LtrText("xG ${String.format(Locale.US, "%.1f", it)}", WcColors.emerald, 11, FontWeight.Black)
            }
        }
        if (m.goals > 0) LtrText("⚽${m.goals}", WcColors.onDark, 11, FontWeight.Black)
        LtrText("${m.scoreFor}-${m.scoreAgainst}", WcColors.onDark, 12, FontWeight.Black)
        m.rating?.let { r ->
            Box(modifier = Modifier.clip(RoundedCornerShape(7.dp)).background(formRatingColor(r)).padding(horizontal = 6.dp, vertical = 2.dp)) {
                LtrText(String.format(Locale.US, "%.1f", r), Color.White, 11, FontWeight.Black)
            }
        }
    }
}

private fun resultAr(r: String): String = when (r) { "W" -> "ف"; "L" -> "خ"; else -> "ت" }

@androidx.compose.runtime.Composable
@androidx.compose.runtime.ReadOnlyComposable
private fun resultColor(r: String): Color = when (r) {
    "W" -> WcColors.emeraldDeep
    "L" -> WcColors.liveRed
    else -> WcColors.gold
}

@androidx.compose.runtime.Composable
@androidx.compose.runtime.ReadOnlyComposable
private fun formRatingColor(r: Double): Color = when {
    r >= 8 -> WcColors.emeraldDeep
    r >= 7 -> WcColors.leaf
    r >= 6 -> WcColors.gold
    else -> WcColors.liveRed
}

// ---------- شريط تشكيلة الأخضر (مشوار الأخضر) ----------

/** كل لاعب يفتح بطاقته الشاملة — يُعرض فقط عند توفر القائمة. */
@Composable
fun SaudiSquadStrip(players: List<WcSquadPlayer>, onOpenPlayer: (Int) -> Unit) {
    if (players.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("تشكيلة الأخضر — اضغط على اللاعب لملفه الكامل",
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
