package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * AI / human contribution bar — one horizontal bar split into amber
 * (AI portion) and emerald (human = 100 - AI). Labels above the bar
 * show side + percent.
 *
 * 1:1 port of iOS `PassportSplitBar`
 * (`Components/PassportSplitBar.swift`). Mirrors the web's
 * `SplitBar` in `client/src/components/passport/ArticlePassportPage.tsx:411`.
 */
@Composable
fun PassportSplitBar(
    aiPct: Int,
    modifier: Modifier = Modifier,
) {
    val clamped = aiPct.coerceIn(0, 100)
    val humanPct = 100 - clamped

    androidx.compose.foundation.layout.Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Top legend row — AI side on the leading edge (visual right in
        // RTL), human side on the trailing edge.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // AI side label (leading)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(AMBER),
                )
                Text(
                    text = "ذكاء اصطناعي $clamped%",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = AMBER,
                )
            }

            androidx.compose.foundation.layout.Spacer(modifier = Modifier.weight(1f))

            // Human side label (trailing)
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Text(
                    text = "$humanPct% بشري",
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = EMERALD,
                )
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(EMERALD),
                )
            }
        }

        // The bar itself. Background = emerald-tinted (human portion is
        // always visible when AI < 100). Foreground = amber bar with
        // width = `aiPct` percent.
        val barShape = RoundedCornerShape(4.dp)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(barShape)
                .background(EMERALD.copy(alpha = 0.30f), barShape)
                .border(width = 0.5.dp, color = EMERALD.copy(alpha = 0.50f), shape = barShape),
        ) {
            if (clamped > 0) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth(clamped / 100f)
                        .height(8.dp)
                        .clip(barShape)
                        .background(AMBER, barShape),
                )
            }
        }
    }
}

private val AMBER = Color(red = 0.96f, green = 0.62f, blue = 0.04f, alpha = 1f)
private val EMERALD = Color(red = 0.16f, green = 0.68f, blue = 0.40f, alpha = 1f)
