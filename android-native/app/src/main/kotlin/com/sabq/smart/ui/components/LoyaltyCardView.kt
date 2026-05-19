package com.sabq.smart.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.LoyaltyTier
import com.sabq.smart.data.LoyaltyTiers
import com.sabq.smart.ui.theme.SabqTheme
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale

/**
 * Loyalty membership card — port of iOS `LoyaltyCardView`
 * (Components/LoyaltyCardView.swift). Mirrors the web LoyaltyCard.tsx
 * layout so a screenshot from any platform reads the same.
 *
 * Credit-card aspect (1.586) so the same render can later seed an
 * Apple/Google Wallet pass.
 *
 * Layers, bottom → top:
 *   1. Tier gradient fill (the one declared on each LoyaltyTier).
 *   2. Diagonal stripes at 7 % opacity, 18 dp spacing (subtle texture).
 *   3. Radial highlight in the top-leading corner (white 20 % → clear).
 *   4. Card content (header + lifetime + holder/id), 20 dp padding.
 *   5. Outer shadow tinted with `tier.color` at 35 % opacity.
 */
@Composable
fun LoyaltyCardView(
    userName: String,
    userId: String,
    lifetimePoints: Int,
    memberSinceIso: String? = null,
    rankLevelOverride: Int? = null,
    modifier: Modifier = Modifier,
) {
    val tier: LoyaltyTier = rankLevelOverride
        ?.let { LoyaltyTiers.forLevel(it) }
        ?: LoyaltyTiers.forLifetimePoints(lifetimePoints)

    val cardShape = RoundedCornerShape(22.dp)

    Box(
        modifier = modifier
            .fillMaxWidth()
            .aspectRatio(1.586f)
            .shadow(
                elevation = 14.dp,
                shape = cardShape,
                ambientColor = tier.color.copy(alpha = 0.35f),
                spotColor = tier.color.copy(alpha = 0.35f),
            )
            .clip(cardShape)
            .background(tier.gradient),
    ) {
        // Layer 2 — diagonal stripes at 7 % opacity.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val spacing = 18.dp.toPx()
            val stripeStroke = 1.dp.toPx()
            val path = Path()
            var x = -size.height
            while (x < size.width + size.height) {
                path.moveTo(x, 0f)
                path.lineTo(x + size.height, size.height)
                x += spacing
            }
            drawPath(
                path = path,
                color = Color.White.copy(alpha = 0.07f),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = stripeStroke),
            )
        }

        // Layer 3 — radial highlight in the top-leading corner. The
        // outer Compose tree is in RTL, so the top-leading visual
        // corner is top-RIGHT in absolute coordinates. iOS does the
        // same — the highlight follows the top-leading semantic.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = size.width * 0.7f
            // top-leading in RTL = top-right pixel-wise. Compose handles
            // the layoutDirection automatically inside drawScope only
            // for some APIs, so we explicitly position the centre.
            val centerX = size.width // RTL → right side
            val centerY = 0f
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color.White.copy(alpha = 0.20f), Color.Transparent),
                    center = Offset(centerX, centerY),
                    radius = radius,
                ),
                radius = radius,
                center = Offset(centerX, centerY),
            )
        }

        // Layer 4 — content.
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp),
        ) {
            // Top row: tier label + trophy.
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "سبق · LOYALTY",
                        style = SabqTheme.typography.metaSmall.copy(
                            letterSpacing = 2.5.sp,
                            fontSize = 10.sp,
                            color = Color.White.copy(alpha = 0.70f),
                        ),
                    )
                    Text(
                        text = tier.nameAr,
                        style = SabqTheme.typography.cardTitle.copy(
                            fontSize = 22.sp,
                            color = Color.White,
                        ),
                    )
                    Text(
                        text = tier.nameEn,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            color = Color.White.copy(alpha = 0.70f),
                        ),
                    )
                }
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.18f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.EmojiEvents,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(22.dp),
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Centre — lifetime points block.
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = "Lifetime Points",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 10.sp,
                        letterSpacing = 2.sp,
                        color = Color.White.copy(alpha = 0.70f),
                    ),
                )
                Text(
                    text = lifetimePoints.toString(),
                    style = SabqTheme.typography.screenTitle.copy(
                        fontSize = 44.sp,
                        color = Color.White,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.AutoAwesome,
                        contentDescription = null,
                        tint = Color.White.copy(alpha = 0.65f),
                        modifier = Modifier.size(10.dp),
                    )
                    Text(
                        text = "المستوى ${tier.level} من 5",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 10.sp,
                            color = Color.White.copy(alpha = 0.65f),
                        ),
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Bottom — holder + member id.
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.Bottom,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "حامل البطاقة",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 10.sp,
                            letterSpacing = 1.5.sp,
                            color = Color.White.copy(alpha = 0.60f),
                        ),
                    )
                    Text(
                        text = userName,
                        style = SabqTheme.typography.compactCardTitle.copy(
                            fontSize = 16.sp,
                            color = Color.White,
                        ),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    memberSinceLabel(memberSinceIso)?.let {
                        Text(
                            text = it,
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 10.sp,
                                color = Color.White.copy(alpha = 0.60f),
                            ),
                        )
                    }
                }
                Column(
                    horizontalAlignment = Alignment.End,
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text(
                        text = "رقم العضوية",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 10.sp,
                            letterSpacing = 1.5.sp,
                            color = Color.White.copy(alpha = 0.60f),
                        ),
                    )
                    Text(
                        text = memberIdShort(userId),
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 12.sp,
                            letterSpacing = 2.sp,
                            fontFamily = FontFamily.Monospace,
                            color = Color.White,
                        ),
                    )
                }
            }
        }
    }
}

/** Last 10 alphanumeric chars of the user id, uppercased + zero-padded. */
private fun memberIdShort(userId: String): String {
    val clean = userId.filter { it.isLetterOrDigit() }
    val tail = clean.takeLast(10).uppercase()
    return tail.padStart(10, '0')
}

/** Renders "عضو منذ <month name> <year>" in Arabic when a parseable
 *  ISO date is supplied; null otherwise. iOS uses ar_SA locale —
 *  Android's `Locale("ar")` mirrors the same long month names. */
private fun memberSinceLabel(iso: String?): String? {
    if (iso.isNullOrBlank()) return null
    val date = parseIso(iso) ?: return null
    val month = date.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale("ar")))
    return "عضو منذ $month"
}

private fun parseIso(s: String): LocalDate? {
    return runCatching { LocalDate.parse(s) }
        .recoverCatching {
            // ISO date-time with optional fractional seconds + Z.
            val trimmed = s.substringBefore('T')
            LocalDate.parse(trimmed)
        }
        .getOrNull()
}
