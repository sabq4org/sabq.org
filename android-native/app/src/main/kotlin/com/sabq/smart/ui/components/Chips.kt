package com.sabq.smart.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.ui.theme.brandGradient

/**
 * iOS [CategoryChip] (line 1046-1076) — pill button. Selected fills
 * with the brand gradient + white text; unselected uses the pale fill
 * with a subtle outline.
 */
@Composable
fun CategoryChip(
    title: String,
    isSelected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val haptics = rememberSabqHaptics()
    val capsule = CircleShape

    val backgroundModifier = if (isSelected) {
        Modifier.background(SabqTheme.colors.brandGradient(), capsule)
    } else {
        Modifier
            .background(SabqTheme.colors.paleFill, capsule)
            .border(
                BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.6f)),
                capsule,
            )
    }

    Row(
        modifier = modifier
            .clip(capsule)
            .then(backgroundModifier)
            .clickable {
                haptics.light()
                onClick()
            }
            .padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            // iOS: size 13 .medium → renders Regular (≤13 softening).
            style = SabqTheme.typography.chipLabel.copy(
                fontSize = 13.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.Normal,
            ),
            color = if (isSelected) Color.White else SabqTheme.colors.secondaryInk,
        )
    }
}

/** iOS [StatusChip] (line 1078-1093). Small tinted capsule used inline
 * to mark category, role, or status. */
@Composable
fun StatusChip(
    title: String,
    tint: Color,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val capsule = CircleShape
    val h = if (compact) 8.dp else 10.dp
    val v = if (compact) 4.dp else 6.dp
    val style = if (compact) {
        SabqTheme.typography.statusChip.copy(fontSize = 10.sp)
    } else SabqTheme.typography.statusChip
    Row(
        modifier = modifier
            .clip(capsule)
            .background(tint.copy(alpha = 0.10f), capsule)
            .padding(horizontal = h, vertical = v),
    ) {
        Text(
            text = title,
            style = style,
            color = tint,
        )
    }
}

/** iOS [DetailLabelPill] (line 1096-1126). Slightly bolder than
 * [StatusChip], with optional leading icon. Used for "موثَّق" Passport
 * pill, "مقال رأي" opinion pill, etc. */
@Composable
fun DetailLabelPill(
    title: String,
    tint: Color,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    val capsule = CircleShape
    Row(
        modifier = modifier
            .clip(capsule)
            .background(tint.copy(alpha = 0.10f), capsule)
            .border(BorderStroke(1.dp, tint.copy(alpha = 0.40f)), capsule)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(10.dp),
            )
        }
        Text(
            text = title,
            style = SabqTheme.typography.statusChip,
            color = tint,
            maxLines = 1,
        )
    }
}

/** iOS "عاجل" breaking pill — coral dot + coral text on coral 10% bg. */
@Composable
fun BreakingPill(modifier: Modifier = Modifier) {
    val capsule = CircleShape
    Row(
        modifier = modifier
            .clip(capsule)
            .background(SabqTheme.colors.coral.copy(alpha = 0.10f), capsule)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        androidx.compose.foundation.layout.Box(
            modifier = Modifier
                .size(5.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.coral),
        )
        Text(
            text = "عاجل",
            style = SabqTheme.typography.breakingPill,
            color = SabqTheme.colors.coral,
        )
    }
}

/** iOS `newPill` (SabqComponents.swift:1673-1683) — green "جديد" badge
 * shown on articles that just landed via refresh. Leaf text on a leaf
 * 12 % capsule, same 8×4 padding as [BreakingPill]. */
@Composable
fun NewPill(modifier: Modifier = Modifier) {
    val capsule = CircleShape
    Row(
        modifier = modifier
            .clip(capsule)
            .background(SabqTheme.colors.leaf.copy(alpha = 0.12f), capsule)
            .padding(horizontal = 8.dp, vertical = 4.dp),
    ) {
        Text(
            text = "جديد",
            style = SabqTheme.typography.breakingPill,
            color = SabqTheme.colors.leaf,
        )
    }
}

@Suppress("unused")
private val brandGradientHandle: (SabqTheme) -> Brush = { _ ->
    // Reserved — keeps the brandGradient extension visible to lints that
    // expect direct gradient access on SabqTheme.colors.
    Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent))
}
