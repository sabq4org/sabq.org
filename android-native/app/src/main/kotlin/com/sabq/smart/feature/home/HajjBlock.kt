package com.sabq.smart.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.HajjArticle
import com.sabq.smart.data.HajjBlock
import com.sabq.smart.util.formatRelativeDateAr

/**
 * "صدى الحج" — seasonal homepage block. Mirrors the iOS
 * `HajjBlockView` (`Screens/HajjBlockView.swift`).
 *
 * Light mode keeps the warm ivory→gold gradient identical to the
 * web/iOS shipping look. Dark mode swaps to SabqTheme-neutral surface
 * tones with light text but keeps a warm gold accent on the
 * current-phase pill, the decorative crescent, and the pinned star —
 * the block stays identifiable as "Hajj" rather than collapsing into
 * another generic dark card.
 *
 * Visibility is fully decided upstream — [HomeExtrasRepository.getHajjBlock]
 * returns `null` for out-of-season / hidden / no-articles, so this
 * composable never has to render an empty state.
 */
@Composable
fun HajjBlockSection(
    block: HajjBlock,
    onArticleClick: (HajjArticle) -> Unit,
    modifier: Modifier = Modifier,
) {
    val isDark = isSystemInDarkTheme()
    val palette = remember(isDark) { hajjPalette(isDark) }
    val shape = RoundedCornerShape(20.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.linearGradient(
                    // 135deg in CSS = top-end → bottom-start in RTL Compose.
                    // Approximate with diagonal `Offset` defaults — readable
                    // and direction-independent for this decorative bg.
                    colors = listOf(palette.bg1, palette.bg2, palette.bg3),
                ),
                shape = shape,
            ),
    ) {
        // Decorative crescent — subtle texture in the top-leading corner.
        Text(
            text = "🌙",
            fontSize = 32.sp,
            color = palette.moonOverlay,
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 12.dp, start = 12.dp),
        )

        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Header(block = block, palette = palette)

            block.hajjPhase?.let { phase ->
                DayStrip(
                    phase = phase,
                    hajjDay = block.hajjDay,
                    daysToArafat = block.daysToArafat,
                    palette = palette,
                )
            }

            if (block.articles.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    block.articles.forEach { article ->
                        HajjArticleCard(
                            article = article,
                            palette = palette,
                            onClick = { onArticleClick(article) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Header(block: HajjBlock, palette: HajjPalette) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "🕋",
            fontSize = 26.sp,
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = block.title,
                color = palette.titleInk,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
            )
            block.subtitle?.let { sub ->
                Text(
                    text = sub,
                    color = palette.subtitleInk,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
        block.lastUpdatedAt?.let { ts ->
            val rel = formatRelativeDateAr(ts)
            if (rel.isNotBlank()) {
                Row(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(palette.chipSurface)
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Filled.Schedule,
                        contentDescription = null,
                        tint = palette.secondaryInk,
                        modifier = Modifier.size(10.dp),
                    )
                    Text(
                        text = rel,
                        color = palette.secondaryInk,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
    }
}

@Composable
private fun DayStrip(
    phase: String,
    hajjDay: Int?,
    daysToArafat: Int?,
    palette: HajjPalette,
) {
    val phases = remember {
        listOf(
            "tarwiyah" to "التروية",
            "arafat" to "عرفة",
            "nahr" to "النحر",
            "tashreeq" to "التشريق",
        )
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        phases.forEach { (id, nameAr) ->
            val isCurrent = id == phase
            val pillBg = if (isCurrent) palette.goldAccent else palette.chipSurface
            val pillFg = if (isCurrent) Color.White else palette.secondaryInk
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(pillBg)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "يوم",
                    color = pillFg.copy(alpha = 0.7f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = nameAr,
                    color = pillFg,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                )
                if (isCurrent && hajjDay != null) {
                    Text(
                        text = "· $hajjDay ذو الحجة",
                        color = pillFg.copy(alpha = 0.75f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
        if (phase == "before" && daysToArafat != null && daysToArafat > 0) {
            val label = if (daysToArafat == 1) "غدًا يوم عرفة"
                else "$daysToArafat أيام حتى يوم عرفة"
            Text(
                text = label,
                color = palette.secondaryInk,
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(palette.chipSurfaceStrong)
                    .padding(horizontal = 12.dp, vertical = 5.dp),
            )
        }
    }
}

@Composable
private fun HajjArticleCard(
    article: HajjArticle,
    palette: HajjPalette,
    onClick: () -> Unit,
) {
    val cardShape = RoundedCornerShape(14.dp)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .background(palette.articleCardBg)
            .border(0.5.dp, palette.articleCardStroke, cardShape)
            .clickable { onClick() }
            .padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(
                modifier = Modifier
                    .clip(CircleShape)
                    .background(palette.tagChipBg)
                    .padding(horizontal = 7.dp, vertical = 3.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = article.hajjEmoji,
                    fontSize = 11.sp,
                )
                Text(
                    text = article.hajjTag,
                    color = palette.secondaryInk,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Black,
                )
                if (article.isPinned) {
                    Text(
                        text = "★",
                        color = palette.pinnedStar,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Black,
                    )
                }
            }
            Text(
                text = article.title,
                color = palette.articleTitleInk,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 3,
            )
            article.publishedAt?.let { ts ->
                val rel = formatRelativeDateAr(ts)
                if (rel.isNotBlank()) {
                    Text(
                        text = rel,
                        color = palette.tertiaryInk,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }
        ThumbBox(imageUrl = article.imageUrl, palette = palette)
    }
}

@Composable
private fun ThumbBox(imageUrl: String?, palette: HajjPalette) {
    val thumbShape = RoundedCornerShape(12.dp)
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(thumbShape)
            .background(
                Brush.linearGradient(
                    listOf(palette.thumbStart, palette.thumbEnd),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (imageUrl != null) {
            coil.compose.SubcomposeAsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                error = { Text("🕋", fontSize = 24.sp) },
                loading = { Text("🕋", fontSize = 24.sp) },
            )
        } else {
            Text("🕋", fontSize = 24.sp)
        }
    }
}

// MARK: - Adaptive palette

private data class HajjPalette(
    val bg1: Color,
    val bg2: Color,
    val bg3: Color,
    val titleInk: Color,
    val articleTitleInk: Color,
    val subtitleInk: Color,
    val secondaryInk: Color,
    val tertiaryInk: Color,
    val goldAccent: Color,
    val moonOverlay: Color,
    val chipSurface: Color,
    val chipSurfaceStrong: Color,
    val articleCardBg: Color,
    val articleCardStroke: Color,
    val tagChipBg: Color,
    val pinnedStar: Color,
    val thumbStart: Color,
    val thumbEnd: Color,
)

private fun hajjPalette(isDark: Boolean): HajjPalette = if (isDark) HajjPalette(
    bg1               = Color(0xFF24242A),
    bg2               = Color(0xFF1F1F23),
    bg3               = Color(0xFF1A1A1E),
    titleInk          = Color(0xFFF2F2F7),
    articleTitleInk   = Color(0xFFF2F2F7),
    subtitleInk       = Color(0xFFAEAEB5),
    secondaryInk      = Color(0xFFC7C7CC),
    tertiaryInk       = Color(0xFF8E8E93),
    goldAccent        = Color(0xFFC78A2E),
    moonOverlay       = Color(0xFFD9A64C).copy(alpha = 0.20f),
    chipSurface       = Color.White.copy(alpha = 0.06f),
    chipSurfaceStrong = Color.White.copy(alpha = 0.10f),
    articleCardBg     = Color.White.copy(alpha = 0.05f),
    articleCardStroke = Color.White.copy(alpha = 0.08f),
    tagChipBg         = Color(0xFF665020).copy(alpha = 0.40f),
    pinnedStar        = Color(0xFFEBB84C).copy(alpha = 0.95f),
    thumbStart        = Color(0xFF5C4419),
    thumbEnd          = Color(0xFF483310),
) else HajjPalette(
    bg1               = Color(0xFFF8F4EB),
    bg2               = Color(0xFFEDE4D3),
    bg3               = Color(0xFFE2D3B0),
    titleInk          = Color(0xFF4D2F0A),
    articleTitleInk   = Color(0xFF331F05),
    subtitleInk       = Color(0xFF4D2F0A).copy(alpha = 0.70f),
    secondaryInk      = Color(0xFF734D1A).copy(alpha = 0.85f),
    tertiaryInk       = Color(0xFF734D1A).copy(alpha = 0.60f),
    goldAccent        = Color(0xFF8C5A0D),
    moonOverlay       = Color(0xFF8C5A0D).copy(alpha = 0.15f),
    chipSurface       = Color.White.copy(alpha = 0.45f),
    chipSurfaceStrong = Color.White.copy(alpha = 0.60f),
    articleCardBg     = Color.White.copy(alpha = 0.55f),
    articleCardStroke = Color.White.copy(alpha = 0.60f),
    tagChipBg         = Color(0xFFE8CF8C).copy(alpha = 0.55f),
    pinnedStar        = Color(0xFF8C5A0D).copy(alpha = 0.85f),
    thumbStart        = Color(0xFFE8CF8C),
    thumbEnd          = Color(0xFFD9B86B),
)

