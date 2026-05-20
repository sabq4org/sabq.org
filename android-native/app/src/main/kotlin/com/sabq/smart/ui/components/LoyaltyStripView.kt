package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.LoyaltyProgress
import com.sabq.smart.data.LoyaltyRepository
import com.sabq.smart.data.LoyaltySummary
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import androidx.compose.ui.platform.LocalContext

/**
 * Slim horizontal strip placed inside `personalJourneyBlock` on the
 * home feed. 1:1 port of iOS `LoyaltyStripView`
 * (`Components/LoyaltyStripView.swift`): tier dot + tier name + week
 * points + streak chip + progress fragment + chevron. Tapping it
 * navigates to the Loyalty Account screen. Renders nothing while the
 * summary is loading or if the call fails — the strip is treated as
 * best-effort, matching iOS behaviour.
 */
@Composable
fun LoyaltyStripView(
    onTap: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val repo = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            LoyaltyStripEntryPoint::class.java,
        ).loyaltyRepository()
    }

    var summary by remember { mutableStateOf<LoyaltySummary?>(null) }

    LaunchedEffect(Unit) {
        if (summary == null) {
            runCatching { repo.getSummary() }.onSuccess { summary = it }
        }
    }

    val s = summary ?: return
    LoyaltyStripContent(summary = s, onTap = onTap, modifier = modifier)
}

@Composable
private fun LoyaltyStripContent(
    summary: LoyaltySummary,
    onTap: () -> Unit,
    modifier: Modifier,
) {
    val progress: LoyaltyProgress = summary.progress
    val tierColor = progress.current.color
    val shape = RoundedCornerShape(12.dp)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(tierColor.copy(alpha = 0.08f), shape)
            .border(width = 0.5.dp, color = tierColor.copy(alpha = 0.25f), shape = shape)
            .clickable { onTap() }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Trophy badge — tier-coloured filled circle.
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(tierColor.copy(alpha = 0.18f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.EmojiEvents,
                contentDescription = null,
                tint = tierColor,
                modifier = Modifier.size(13.dp),
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            // Top line: tier name + optional week-points + optional streak.
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = progress.current.nameAr,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    color = tierColor,
                )
                if (summary.weekPoints > 0) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Text(
                            text = "+${summary.weekPoints}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(red = 1.00f, green = 0.58f, blue = 0.00f, alpha = 1f),
                        )
                        Text(
                            text = "هذا الأسبوع",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.secondaryInk,
                        )
                    }
                }
                if (summary.streakDays >= 3) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(2.dp),
                    ) {
                        Icon(
                            imageVector = Icons.Filled.LocalFireDepartment,
                            contentDescription = null,
                            tint = Color(red = 1.00f, green = 0.58f, blue = 0.00f, alpha = 1f),
                            modifier = Modifier.size(9.dp),
                        )
                        Text(
                            text = "${summary.streakDays}",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(red = 1.00f, green = 0.58f, blue = 0.00f, alpha = 1f),
                        )
                    }
                }
            }

            // Progress bar + "points to next" line (or top-tier message).
            val next = progress.next
            if (next != null) {
                BoxWithConstraints(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp),
                ) {
                    val barWidth = maxWidth
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(4.dp)
                            .clip(CircleShape)
                            .background(SabqTheme.colors.outline.copy(alpha = 0.25f)),
                    )
                    Box(
                        modifier = Modifier
                            .width(barWidth * progress.fraction)
                            .height(4.dp)
                            .clip(CircleShape)
                            .background(tierColor),
                    )
                }
                Text(
                    text = "${formatArabicNumber(progress.pointsToNext)} نقطة لـ ${next.nameAr}",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                )
            } else {
                Text(
                    text = "وصلت إلى أعلى مستوى ✨",
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
        }

        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = null,
            tint = SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(12.dp),
        )
    }
}

private fun formatArabicNumber(value: Int): String {
    val western = value.toString()
    val arabicDigits = "٠١٢٣٤٥٦٧٨٩"
    return buildString(western.length) {
        for (ch in western) {
            append(if (ch in '0'..'9') arabicDigits[ch - '0'] else ch)
        }
    }
}

@EntryPoint
@InstallIn(SingletonComponent::class)
interface LoyaltyStripEntryPoint {
    fun loyaltyRepository(): LoyaltyRepository
}
