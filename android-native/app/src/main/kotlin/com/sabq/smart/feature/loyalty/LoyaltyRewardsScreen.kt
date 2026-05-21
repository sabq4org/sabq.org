package com.sabq.smart.feature.loyalty

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.sabq.smart.data.LoyaltyReward
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "متجر المكافآت" — 1:1 with iOS [LoyaltyRewardsView.swift].
 *
 * Layout: top bar → gradient balance hero → optional success/error
 * banners → reward cards (image + partner + name + cost chip + stock
 * pill + redeem) or the coming-soon empty state when the catalog is
 * empty. Redeem uses a confirm dialog so a stray tap never burns
 * the user's balance.
 */
@Composable
fun LoyaltyRewardsScreen(
    onBack: () -> Unit,
    viewModel: LoyaltyRewardsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var confirming by remember { mutableStateOf<LoyaltyReward?>(null) }

    LaunchedEffect(Unit) { viewModel.load() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item { BalanceHero(balance = state.balance) }

            state.successMessage?.let { item { SuccessBanner(it) } }
            state.redeemError?.let { item { ErrorBanner(it) } }

            when {
                state.isLoading && state.rewards.isEmpty() ->
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(
                                color = SabqTheme.colors.primaryEnd,
                                strokeWidth = 2.5.dp,
                            )
                        }
                    }

                state.loadError != null && state.rewards.isEmpty() ->
                    item {
                        Text(
                            text = state.loadError ?: "",
                            fontSize = 14.sp,
                            color = SabqTheme.colors.coral,
                            modifier = Modifier.fillMaxWidth(),
                            textAlign = TextAlign.Center,
                        )
                    }

                state.rewards.isEmpty() -> item { EmptyState() }

                else -> items(state.rewards, key = { it.id }) { reward ->
                    RewardCard(
                        reward = reward,
                        redeeming = state.redeemingId == reward.id,
                        onRedeemTap = { confirming = reward },
                    )
                }
            }

            item { Spacer(Modifier.height(24.dp)) }
        }
    }

    confirming?.let { reward ->
        AlertDialog(
            onDismissRequest = { confirming = null },
            containerColor = SabqTheme.colors.surface,
            titleContentColor = SabqTheme.colors.ink,
            textContentColor = SabqTheme.colors.secondaryInk,
            title = { Text("تأكيد الاستبدال", fontWeight = FontWeight.Bold) },
            text = {
                Text(
                    "هل تريد استبدال \"${reward.nameAr}\" مقابل ${reward.pointsCost} نقطة؟",
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    confirming = null
                    viewModel.redeem(reward)
                }) {
                    Text("استبدل", color = SabqTheme.colors.primaryEnd, fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = null }) {
                    Text("إلغاء", color = SabqTheme.colors.secondaryInk)
                }
            },
        )
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
            text = "متجر المكافآت",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.width(40.dp))
    }
}

// ============================================================
// Hero card — gradient with balance count, mirrors iOS balanceCard
// ============================================================

@Composable
private fun BalanceHero(balance: Int) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(SabqTheme.colors.primaryEnd, SabqTheme.colors.primaryStart),
                )
            )
            .padding(vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = Color.White.copy(alpha = 0.85f),
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = "رصيدك من النقاط",
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = Color.White.copy(alpha = 0.85f),
            )
        }
        Text(
            text = "$balance",
            fontSize = 42.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
        )
        Text(
            text = "نقطة",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Color.White.copy(alpha = 0.70f),
        )
    }
}

// ============================================================
// Reward card — image + partner + name + cost chip + stock pill +
// redeem button. Mirrors iOS rewardCard().
// ============================================================

@Composable
private fun RewardCard(
    reward: LoyaltyReward,
    redeeming: Boolean,
    onRedeemTap: () -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.4f), shape)
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(14.dp))
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                SabqTheme.colors.primaryEnd.copy(alpha = 0.20f),
                                SabqTheme.colors.primaryStart.copy(alpha = 0.05f),
                            )
                        )
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (!reward.imageUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = reward.imageUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Icon(
                        imageVector = Icons.Filled.CardGiftcard,
                        contentDescription = null,
                        tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.5f),
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                reward.partnerName?.let { partner ->
                    Text(
                        text = partner.uppercase(),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Black,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
                Text(
                    text = reward.nameAr,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                reward.description?.let { desc ->
                    Text(
                        text = desc,
                        fontSize = 12.sp,
                        color = SabqTheme.colors.secondaryInk,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            CostChip(points = reward.pointsCost)
            if (reward.remainingStock != null && reward.remainingStock < 20) {
                StockPill(stock = reward.remainingStock)
            }
            Spacer(Modifier.weight(1f))
            RedeemButton(
                reward = reward,
                redeeming = redeeming,
                onTap = onRedeemTap,
            )
        }
    }
}

@Composable
private fun CostChip(points: Int) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = "$points نقطة",
            fontSize = 13.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.primaryEnd,
        )
    }
}

@Composable
private fun StockPill(stock: Int) {
    Text(
        text = "متبقي $stock",
        fontSize = 11.sp,
        fontWeight = FontWeight.SemiBold,
        color = SabqTheme.colors.coral,
        modifier = Modifier
            .clip(CircleShape)
            .background(SabqTheme.colors.coral.copy(alpha = 0.10f))
            .padding(horizontal = 8.dp, vertical = 4.dp),
    )
}

@Composable
private fun RedeemButton(
    reward: LoyaltyReward,
    redeeming: Boolean,
    onTap: () -> Unit,
) {
    val label: String = when {
        redeeming -> "..."
        reward.canRedeem -> "استبدل"
        reward.reasonBlocked == "MAX_PER_USER" -> "وصلت الحد"
        else -> "تحتاج ${reward.pointsShort}+"
    }
    val brush: Brush = if (reward.canRedeem) {
        Brush.linearGradient(
            colors = listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
        )
    } else {
        Brush.linearGradient(
            colors = listOf(SabqTheme.colors.tertiaryInk, SabqTheme.colors.secondaryInk),
        )
    }
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(brush)
            .clickable(enabled = reward.canRedeem && !redeeming) { onTap() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (redeeming) {
            CircularProgressIndicator(
                color = Color.White,
                strokeWidth = 2.dp,
                modifier = Modifier.size(12.dp),
            )
        } else {
            Icon(
                imageVector = if (reward.canRedeem) Icons.Filled.CardGiftcard else Icons.Filled.Lock,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(11.dp),
            )
        }
        Text(
            text = label,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            color = Color.White,
        )
    }
}

// ============================================================
// Empty state — coming-soon treatment, mirrors iOS emptyState
// ============================================================

@Composable
private fun EmptyState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 36.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.CardGiftcard,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(38.dp),
            )
        }
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .padding(horizontal = 12.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(10.dp),
            )
            Text(
                text = "قريباً",
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
        }
        Text(
            text = "سيتم إتاحة المكافآت قريباً",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = "نقاطك محفوظة ✨ نعمل على إطلاق متجر المكافآت قريباً — تابع تفاعلك واستمر في كسب النقاط.",
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 24.dp),
        )
    }
}

@Composable
private fun SuccessBanner(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.leaf.copy(alpha = 0.10f))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = SabqTheme.colors.leaf,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = message,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.leaf,
        )
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SabqTheme.colors.coral.copy(alpha = 0.08f))
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.WarningAmber,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = message,
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.coral,
        )
    }
}
