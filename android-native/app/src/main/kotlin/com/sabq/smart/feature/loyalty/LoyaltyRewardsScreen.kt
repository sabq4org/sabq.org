package com.sabq.smart.feature.loyalty

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CardGiftcard
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import com.sabq.smart.data.LoyaltyRepository
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

@HiltViewModel
class LoyaltyRewardsViewModel @Inject constructor(
    private val repo: LoyaltyRepository,
) : ViewModel() {
    private val _balance = MutableStateFlow(0)
    val balance: StateFlow<Int> = _balance.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            runCatching { repo.getSummary() }
                .onSuccess { _balance.value = it.totalPoints }
        }
    }
}

/**
 * "متجر المكافآت" — 1:1 port of iOS `LoyaltyRewardsView`
 * (`Screens/LoyaltyRewardsView.swift`).
 *
 * iOS layout:
 *   1. Balance gradient hero card (primaryEnd → primaryStart) with
 *      "رصيدك من النقاط" sparkles label + big number + "نقطة" label.
 *   2. LazyVStack of reward cards (image + partner + name + cost +
 *      redeem button) — each with confirm alert before burning points.
 *
 * Android v1: balance card renders against the live LoyaltyRepository
 * total. The rewards LazyVStack lands as a "قريباً" empty state because
 * the backend's `/api/loyalty/rewards` endpoint isn't wired through
 * `SabqApi` yet — the screen is reachable but the inventory shows
 * blank with a friendly placeholder until the data layer follows.
 */
@Composable
fun LoyaltyRewardsScreen(
    onBack: () -> Unit,
    viewModel: LoyaltyRewardsViewModel = hiltViewModel(),
) {
    val balance by viewModel.balance.collectAsStateWithLifecycle()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack, title = "متجر المكافآت")

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = SabqTheme.dimens.screenPaddingH,
                end = SabqTheme.dimens.screenPaddingH,
                top = 18.dp,
                bottom = SabqTheme.dimens.tabBarSafeArea,
            ),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item { BalanceHeroCard(balance = balance) }
            item {
                EmptyStateView(
                    icon = Icons.Filled.CardGiftcard,
                    tint = SabqTheme.colors.primaryEnd,
                    title = "متجر المكافآت قريباً",
                    subtitle = "نعمل على إضافة مكافآت قابلة للاستبدال بنقاطك. تابعنا.",
                )
            }
        }
    }
}

@Composable
private fun BalanceHeroCard(balance: Int) {
    val shape = RoundedCornerShape(20.dp)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            // iOS: shadow(primaryEnd × 0.30, radius:18, y:8)
            .shadow(
                elevation = 12.dp,
                shape = shape,
                ambientColor = Color.Transparent,
                spotColor = SabqTheme.colors.primaryEnd.copy(alpha = 0.30f),
            )
            .clip(shape)
            .background(
                brush = Brush.linearGradient(
                    listOf(SabqTheme.colors.primaryEnd, SabqTheme.colors.primaryStart),
                ),
                shape = shape,
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
            text = balance.toString(),
            fontSize = 42.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
        )
        Text(
            text = "نقطة",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = Color.White.copy(alpha = 0.7f),
        )
    }
}

@Composable
private fun TopBar(onBack: () -> Unit, title: String) {
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
            text = title,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}
