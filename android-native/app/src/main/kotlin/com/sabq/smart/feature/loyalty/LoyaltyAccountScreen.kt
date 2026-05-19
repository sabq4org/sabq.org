package com.sabq.smart.feature.loyalty

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.LoyaltySummary
import com.sabq.smart.data.LoyaltyTier
import com.sabq.smart.data.LoyaltyTiers
import com.sabq.smart.data.User
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.components.LoyaltyCardView
import com.sabq.smart.ui.components.SmallActionButton
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "نقاطي والمكافآت" screen — port of iOS [LoyaltyAccountView]
 * (Screens/LoyaltyAccountView.swift). Three blocks stacked
 * vertically with 20 dp spacing inside 16 dp horizontal padding:
 *
 *   1. heroCard      — full LoyaltyCardView (credit-card design).
 *   2. statsTriplet  — three 16 dp-corner tiles (week / month /
 *                      streak) with ultraThinMaterial bg + outline.
 *   3. tierLadder    — 5 tiers on a continuous vertical timeline,
 *                      each tier in its real brand color regardless
 *                      of locked state. Reached but past = filled
 *                      disc + check; current = halo + larger disc;
 *                      locked = outlined ring at full color.
 */
@Composable
fun LoyaltyAccountScreen(
    onBack: () -> Unit,
    viewModel: LoyaltyAccountViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val user by authViewModel.currentUser.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        // Inline navigation bar — takes its own space at the top
        // (no overlay), matching iOS `.navigationTitle(...)`
        // .navigationBarTitleDisplayMode(.inline) behaviour where
        // the system bar lives ABOVE the scroll content.
        TopBar(onBack = onBack)

        Box(modifier = Modifier.weight(1f)) {
            when (val s = state) {
                LoyaltyUiState.Loading -> CenterSpinner()
                LoyaltyUiState.Anonymous -> AnonymousHint()
                is LoyaltyUiState.Error -> ErrorHint(message = s.message, onRetry = viewModel::refresh)
                is LoyaltyUiState.Loaded -> Content(summary = s.summary, user = user)
            }
        }
    }
}

@Composable
private fun TopBar(onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onBack() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "نقاطي والمكافآت",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 17.sp),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp)) // balances the back button
    }
}

@Composable
private fun Content(summary: LoyaltySummary, user: User?) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(top = 16.dp, start = 16.dp, end = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        // 1) Hero card — full credit-card render.
        LoyaltyCardView(
            userName = user?.displayName ?: "حامل البطاقة",
            userId = user?.id ?: "00000000",
            lifetimePoints = summary.lifetimePoints,
            memberSinceIso = user?.createdAt,
            rankLevelOverride = summary.rankLevel,
        )

        // 2) Stats triplet — week (orange accent) + month + streak.
        StatsTriplet(summary = summary)

        // 3) Tier ladder.
        TierLadder(currentLevel = summary.resolvedTier.level)
    }
}

@Composable
private fun StatsTriplet(summary: LoyaltySummary) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        StatTile(
            label = "هذا الأسبوع",
            value = summary.weekPoints,
            accent = true,
            icon = Icons.Filled.Bolt,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            label = "هذا الشهر",
            value = summary.monthPoints,
            accent = false,
            icon = Icons.Filled.Star,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            label = "streak",
            value = summary.streakDays,
            accent = false,
            icon = Icons.Filled.LocalFireDepartment,
            suffix = "يوم",
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatTile(
    label: String,
    value: Int,
    accent: Boolean,
    icon: ImageVector,
    suffix: String? = null,
    modifier: Modifier = Modifier,
) {
    val orange = Color(red = 1.00f, green = 0.62f, blue = 0.20f)
    val accentColor = if (accent) orange else SabqTheme.colors.secondaryInk
    val valueColor = if (accent) orange else SabqTheme.colors.ink
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f)), shape)
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = accentColor,
                modifier = Modifier.size(11.dp),
            )
            Text(
                text = label,
                style = SabqTheme.typography.metaSmall.copy(fontSize = 11.sp, color = accentColor),
            )
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = value.toString(),
                style = SabqTheme.typography.screenTitle.copy(
                    fontSize = 22.sp,
                    fontWeight = FontWeight.Black,
                    color = valueColor,
                ),
            )
            if (suffix != null) {
                Text(
                    text = suffix,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 10.sp,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }
        }
    }
}

@Composable
private fun TierLadder(currentLevel: Int) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.5f)), shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Text(
            text = "المستويات الخمسة",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            ),
        )
        Column {
            LoyaltyTiers.all.forEachIndexed { idx, tier ->
                TierTimelineRow(
                    tier = tier,
                    currentLevel = currentLevel,
                    isFirst = idx == 0,
                    isLast = idx == LoyaltyTiers.all.lastIndex,
                )
            }
        }
    }
}

@Composable
private fun TierTimelineRow(
    tier: LoyaltyTier,
    currentLevel: Int,
    isFirst: Boolean,
    isLast: Boolean,
) {
    val reached = tier.level <= currentLevel
    val isCurrent = tier.level == currentLevel
    val nextReached = tier.level < currentLevel
    val nodeColWidth = 36.dp
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        // Timeline column: top connector → node → bottom connector.
        Column(
            modifier = Modifier.width(nodeColWidth),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Top connector (14 dp). Hidden on first row.
            Box(
                modifier = Modifier
                    .width(2.dp)
                    .height(14.dp)
                    .background(
                        if (isFirst) Color.Transparent
                        else if (reached) tier.color
                        else tier.color.copy(alpha = 0.25f),
                    ),
            )
            TierNode(tier = tier, isCurrent = isCurrent, reached = reached)
            // Bottom connector — fills the remaining space so the line
            // stays continuous regardless of the text-block height.
            Box(
                modifier = Modifier
                    .width(2.dp)
                    .height(34.dp)
                    .background(
                        if (isLast) Color.Transparent
                        else if (nextReached) tier.color
                        else tier.color.copy(alpha = 0.25f),
                    ),
            )
        }

        // Tier info column.
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(top = 14.dp, bottom = if (isLast) 4.dp else 18.dp),
            verticalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = tier.nameAr,
                    style = SabqTheme.typography.compactCardTitle.copy(
                        fontSize = 15.sp,
                        color = tier.color,
                    ),
                )
                if (isCurrent) {
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(tier.color)
                            .padding(horizontal = 8.dp, vertical = 3.dp),
                    ) {
                        Text(
                            text = "مستواك الآن",
                            style = SabqTheme.typography.metaSmall.copy(
                                fontSize = 10.sp,
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                    }
                }
            }
            Text(
                text = "يبدأ من ${tier.minLifetimePoints} نقطة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 11.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun TierNode(tier: LoyaltyTier, isCurrent: Boolean, reached: Boolean) {
    Box(
        modifier = Modifier.size(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        if (isCurrent) {
            // Soft halo behind the current-tier disc.
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(tier.color.copy(alpha = 0.18f)),
            )
        }
        when {
            reached && isCurrent -> {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(tier.color),
                )
            }
            reached -> {
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(tier.color),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(8.dp),
                    )
                }
            }
            else -> {
                // Locked tier — outlined ring on white in the tier's
                // real brand color. iOS keeps the color visible per
                // "كل مرحلة بلونها الحقيقي" editorial preference.
                Box(
                    modifier = Modifier
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(Color.White)
                        .border(BorderStroke(2.dp, tier.color), CircleShape),
                )
            }
        }
    }
}

@Composable
private fun CenterSpinner() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
    }
}

@Composable
private fun AnonymousHint() {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "سجّل دخولك لعرض نقاطك",
                style = SabqTheme.typography.sectionHeader,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "نقاط الولاء متاحة فقط للأعضاء المسجلين.",
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
        }
    }
}

@Composable
private fun ErrorHint(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                text = "تعذّر تحميل النقاط",
                style = SabqTheme.typography.sectionHeader,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = message,
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
            Spacer(modifier = Modifier.height(8.dp))
            SmallActionButton(
                title = "إعادة المحاولة",
                icon = Icons.AutoMirrored.Filled.ArrowForward,
                tint = SabqTheme.colors.primaryEnd,
                onClick = onRetry,
            )
        }
    }
}
