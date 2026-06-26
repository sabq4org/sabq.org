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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.ImageFocalPoint
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

// ---------- حقائق البطولة (/world-cup/facts) ----------

@Composable
fun FactsSection(facts: WcCompetitionFacts?) {
    if (facts == null || !facts.hasContent) return
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.MilitaryTech, "حقائق البطولة", "أرقام وذاكرة كأس العالم", tint = WcColors.gold)
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        ) {
            facts.defendingChampion?.let { champ ->
                FactCard(
                    icon = Icons.Filled.WorkspacePremium,
                    caption = "حامل اللقب",
                    logo = champ.logo,
                    title = champ.name,
                    detail = facts.defendingChampionTitles?.let { "$it ألقاب عالمية" },
                )
            }
            facts.mostTitles?.takeIf { it.teams.isNotEmpty() }?.let { most ->
                FactCard(
                    icon = Icons.Filled.EmojiEvents,
                    caption = "الأكثر تتويجًا",
                    logo = most.teams.first().logo,
                    title = most.teams.joinToString(" · ") { it.name },
                    detail = "${most.count} ألقاب",
                )
            }
            facts.host?.takeIf { it.isNotBlank() }?.let { host ->
                FactCard(
                    icon = Icons.Filled.LocationOn,
                    caption = "الاستضافة",
                    logo = null,
                    title = host,
                    detail = "مونديال 2026",
                )
            }
        }
    }
}

@Composable
private fun FactCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    caption: String,
    logo: String?,
    title: String,
    detail: String?,
) {
    val shape = RoundedCornerShape(13.dp)
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.width(168.dp).clip(shape).background(WcColors.card, shape)
            .border(0.5.dp, WcColors.gold.copy(alpha = 0.20f), shape)
            .padding(horizontal = 10.dp, vertical = 7.dp),
    ) {
        if (!logo.isNullOrEmpty()) {
            Box(
                modifier = Modifier.size(30.dp).clip(CircleShape).background(Color.White)
                    .border(1.dp, WcColors.gold.copy(alpha = 0.35f), CircleShape).padding(3.dp),
                contentAlignment = Alignment.Center,
            ) {
                AsyncImage(model = logo, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
            }
        } else {
            Box(
                modifier = Modifier.size(30.dp).clip(CircleShape).background(WcColors.gold.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, contentDescription = null, tint = WcColors.gold, modifier = Modifier.size(15.dp))
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(caption, color = WcColors.gold, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            Text(title, color = WcColors.onDark, fontSize = 12.sp, fontWeight = FontWeight.Black, maxLines = 1, overflow = TextOverflow.Ellipsis)
            detail?.let { Text(it, color = WcColors.onDarkDim, fontSize = 9.sp, maxLines = 1) }
        }
    }
}

// ---------- الأدوار الإقصائية (/world-cup/bracket) ----------

@Composable
fun KnockoutSection(bracket: WcBracket?, onOpenMatch: (Int) -> Unit) {
    if (bracket == null) return
    val playable = bracket.rounds.filter { it.matches.isNotEmpty() }

    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        if (playable.isEmpty()) {
            Box(Modifier.padding(horizontal = 16.dp)) {
                WcSectionHeader(Icons.Filled.EmojiEvents, "الأدوار الإقصائية", "تبدأ بعد اكتمال دور المجموعات")
            }
            Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
                listOf("دور الـ32", "دور الـ16", "دور الـ8", "دور الـ4", "النهائي").forEach { label ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(WcColors.card)
                            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(14.dp))
                            .padding(horizontal = 14.dp, vertical = 11.dp),
                    ) {
                        Icon(Icons.Filled.Flag, null, tint = WcColors.gold, modifier = Modifier.size(14.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(label, color = WcColors.onDark, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.weight(1f))
                        Text("يُحدَّد لاحقًا", color = WcColors.onDarkDim, fontSize = 11.sp)
                    }
                }
            }
            return@Column
        }

        val defaultRound = playable.firstOrNull { r -> r.matches.any { it.status.live } }?.roundEn
            ?: playable.firstOrNull { r -> r.matches.any { !it.status.finished } }?.roundEn
            ?: playable.first().roundEn
        var userRound by remember { mutableStateOf<String?>(null) }
        val selectedEn = userRound ?: defaultRound
        val selected = playable.firstOrNull { it.roundEn == selectedEn } ?: playable.first()

        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.EmojiEvents, "الأدوار الإقصائية", "طريق اللقب من دور الـ32 حتى النهائي")
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
        ) {
            playable.forEach { round ->
                val active = round.roundEn == selectedEn
                Text(
                    round.round,
                    color = if (active) Color.White else WcColors.onDarkDim,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(if (active) WcColors.emeraldDeep else WcColors.chipFill)
                        .clickable { userRound = round.roundEn }.padding(horizontal = 13.dp, vertical = 7.dp),
                )
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
            selected.matches.forEach { f -> WcKnockoutMatchCard(f, onOpenMatch) }
        }
    }
}

@Composable
private fun WcKnockoutMatchCard(f: WcFixture, onOpenMatch: (Int) -> Unit) {
    Column(
        verticalArrangement = Arrangement.spacedBy(10.dp),
        modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(WcColors.card)
            .border(0.5.dp, WcColors.cardStroke, RoundedCornerShape(18.dp))
            .clickable { onOpenMatch(f.id) }.padding(14.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(f.round, color = WcColors.onDarkDim, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            WcStatusPill(f, onDark = false)
        }
        KnockoutTeamRow(f.home, if (f.started) f.goals.home ?: 0 else null, f.home.winner == true)
        KnockoutTeamRow(f.away, if (f.started) f.goals.away ?: 0 else null, f.away.winner == true)
        f.penalties?.let {
            Text("ركلات الترجيح: ${it.home ?: 0} - ${it.away ?: 0}", color = WcColors.onDarkDim, fontSize = 11.sp)
        }
    }
}

@Composable
private fun KnockoutTeamRow(team: WcTeam, goals: Int?, win: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        WcTeamLogo(team, size = 26)
        Text(team.name, color = WcColors.onDark, fontSize = 14.sp, fontWeight = if (win) FontWeight.Black else FontWeight.SemiBold, modifier = Modifier.weight(1f))
        if (goals != null) {
            Text("$goals", color = if (win) WcColors.emerald else WcColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Black)
        }
    }
}

// ---------- أخبار المونديال (/world-cup/news) ----------

@Composable
fun NewsSection(news: List<WcNewsItem>, onOpenArticle: (slug: String) -> Unit) {
    if (news.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
        Box(Modifier.padding(horizontal = 16.dp)) {
            WcSectionHeader(Icons.Filled.Newspaper, "أخبار المونديال", "آخر مستجدّات كأس العالم 2026")
        }
        Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(horizontal = 16.dp)) {
            news.forEach { item -> NewsCard(item) { onOpenArticle(item.slug) } }
        }
    }
}

@Composable
private fun NewsCard(item: WcNewsItem, onClick: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier.fillMaxWidth().clip(shape).background(WcColors.card, shape)
            .border(0.5.dp, WcColors.cardStroke.copy(alpha = 0.5f), shape)
            .clickable(enabled = item.slug.isNotBlank()) { onClick() },
    ) {
        Box(modifier = Modifier.fillMaxWidth().height(168.dp)) {
            if (!item.imageUrl.isNullOrEmpty()) {
                FocalCachedAsyncImage(
                    url = item.imageUrl,
                    focalPoint = ImageFocalPoint.normalised(
                        item.imageFocalPoint?.x?.toFloat(),
                        item.imageFocalPoint?.y?.toFloat(),
                    ),
                    modifier = Modifier.fillMaxSize(),
                    placeholder = { MatchupVisual(item) },
                )
            } else {
                MatchupVisual(item)
            }
        }
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(
                    kindLabel(item.kind),
                    color = WcColors.emeraldDeep, fontSize = 10.sp, fontWeight = FontWeight.Bold,
                    modifier = Modifier.clip(RoundedCornerShape(50)).background(WcColors.emerald.copy(alpha = 0.14f)).padding(horizontal = 8.dp, vertical = 3.dp),
                )
                Spacer(Modifier.weight(1f))
                relativeTime(item.publishedAt)?.let {
                    Text(it, color = WcColors.onDarkDim, fontSize = 11.sp)
                }
            }
            Text(item.title, color = WcColors.onDark, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 22.sp)
            item.excerpt?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = WcColors.onDarkDim, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun MatchupVisual(item: WcNewsItem) {
    Box(
        modifier = Modifier.fillMaxSize().background(Brush.linearGradient(listOf(WcColors.heroTop, WcColors.heroBottom))),
        contentAlignment = Alignment.Center,
    ) {
        val home = item.home
        val away = item.away
        if (home != null && away != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                LogoBubble(home.logo)
                Text("VS", color = WcColors.gold, fontSize = 16.sp, fontWeight = FontWeight.Black)
                LogoBubble(away.logo)
            }
        } else {
            Icon(Icons.Filled.EmojiEvents, null, tint = WcColors.gold.copy(alpha = 0.85f), modifier = Modifier.size(40.dp))
        }
    }
}

@Composable
private fun LogoBubble(url: String) {
    Box(
        modifier = Modifier.size(56.dp).clip(CircleShape).background(Color.White)
            .border(1.5.dp, Color.White.copy(alpha = 0.4f), CircleShape).padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
    }
}

private fun kindLabel(kind: String): String = when (kind) {
    "preview" -> "ما قبل المباراة"
    "report" -> "تقرير المباراة"
    else -> "مونديال 2026"
}

private val newsDayFmt: DateTimeFormatter =
    DateTimeFormatter.ofPattern("EEEE، d MMMM", Locale.forLanguageTag("ar"))
        .withDecimalStyle(DecimalStyle.STANDARD).withZone(ZoneId.of("Asia/Riyadh"))

/** وقت نسبي عربي بأرقام لاتينية ("منذ 5 د"). */
private fun relativeTime(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val instant = runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull() ?: return null
    val seconds = ((System.currentTimeMillis() - instant.toEpochMilli()) / 1000L).coerceAtLeast(0L)
    val minutes = (seconds / 60).toInt()
    val hours = minutes / 60
    val days = hours / 24
    return when {
        minutes < 1 -> "الآن"
        minutes < 60 -> "منذ $minutes د"
        hours < 24 -> "منذ $hours س"
        days == 1 -> "أمس"
        days < 7 -> "منذ $days أيام"
        else -> newsDayFmt.format(instant)
    }
}
