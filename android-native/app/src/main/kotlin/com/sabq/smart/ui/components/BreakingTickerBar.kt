package com.sabq.smart.ui.components

import androidx.compose.animation.Crossfade
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.BreakingTickerHeadline
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/**
 * شريط الأخبار العاجلة — the editorially-curated breaking-news strip
 * driven by the dashboard's "Breaking Ticker" manager
 * (`GET /api/breaking-ticker/active`). 1:1 port of iOS
 * `Components/BreakingTickerBar.swift`: a coral gradient bar carrying a
 * bolt + "عاجل" capsule and headlines that auto-rotate every 5 seconds.
 * Pager dots appear when more than one headline is queued; a chevron
 * otherwise.
 *
 * Distinct from the single breaking-article pill (HomeFeedScreen's
 * `BreakingNewsPill`), which is the fallback when no ticker topic is
 * active. Tap handling (article slug vs. external URL) is resolved by
 * the caller via [onHeadlineClick].
 */
@Composable
fun BreakingTickerBar(
    headlines: List<BreakingTickerHeadline>,
    onHeadlineClick: (BreakingTickerHeadline) -> Unit,
) {
    if (headlines.isEmpty()) return
    // Reset to the first headline whenever the dashboard swaps the
    // active topic (the headline set changes) so we never index past
    // the new array — mirrors iOS `.onChange(of: headlines.map(\.id))`.
    val idsKey = headlines.joinToString("|") { it.id }
    var index by remember(idsKey) { mutableIntStateOf(0) }

    // 5s cadence matches the web ticker's auto-advance (iOS Timer).
    LaunchedEffect(idsKey) {
        if (headlines.size > 1) {
            while (true) {
                delay(5_000)
                index = (index + 1) % headlines.size
            }
        }
    }

    val current = headlines[index.coerceIn(0, headlines.size - 1)]
    val coral = SabqTheme.colors.coral
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                Brush.horizontalGradient(listOf(coral, coral.copy(alpha = 0.82f))),
                shape,
            )
            .clickable { onHeadlineClick(current) }
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // Bolt + "عاجل" capsule on white 20% — iOS `Capsule().fill(...)`.
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(Color.White.copy(alpha = 0.20f), CircleShape)
                .padding(horizontal = 10.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Bolt,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(12.dp),
            )
            Text(
                text = "عاجل",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = Color.White,
                ),
            )
        }

        // Rotating headline — crossfade matches iOS `.transition(.opacity)`.
        Crossfade(
            targetState = current,
            label = "breaking-ticker-headline",
            modifier = Modifier.weight(1f),
        ) { headline ->
            Text(
                text = headline.headline,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                    color = Color.White,
                ),
                maxLines = 2,
            )
        }

        if (headlines.size > 1) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                headlines.indices.forEach { i ->
                    Box(
                        modifier = Modifier
                            .size(5.dp)
                            .clip(CircleShape)
                            .background(Color.White.copy(alpha = if (i == index) 1f else 0.4f)),
                    )
                }
            }
        } else {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.7f),
                modifier = Modifier.size(14.dp),
            )
        }
    }
}
