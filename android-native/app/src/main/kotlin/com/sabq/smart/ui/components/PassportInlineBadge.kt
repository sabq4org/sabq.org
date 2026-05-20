package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material3.Icon
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
 * Inline "موثَّق" pill shown on the article hero labels row. Tapping
 * it opens the full Content Passport sheet.
 *
 * 1:1 port of iOS `PassportInlineBadge`
 * (`Components/PassportInlineBadge.swift`):
 *   - Always-visible emerald-green pill: `rgb(0.16, 0.68, 0.40)`
 *   - checkmark.shield.fill icon (Android equivalent:
 *     `Icons.Filled.VerifiedUser` — same outline shape)
 *   - 11 sp Black weight "موثَّق" text
 *   - 10% fill + 30% stroke of the emerald color
 *   - Capsule shape
 *
 * Distinct from a future "موثَّق" action-bar CTA — both surfaces coexist.
 */
@Composable
fun PassportInlineBadge(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val capsule = CircleShape
    Row(
        modifier = modifier
            .clip(capsule)
            .background(EMERALD.copy(alpha = 0.10f), capsule)
            .border(width = 0.5.dp, color = EMERALD.copy(alpha = 0.30f), shape = capsule)
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.VerifiedUser,
            contentDescription = null,
            tint = EMERALD,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = "موثَّق",
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            color = EMERALD,
        )
    }
}

private val EMERALD = Color(red = 0.16f, green = 0.68f, blue = 0.40f, alpha = 1f)
