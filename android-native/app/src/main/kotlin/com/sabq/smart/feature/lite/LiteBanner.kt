package com.sabq.smart.feature.lite

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.SignalWifi4Bar
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme
import kotlinx.coroutines.delay

/**
 * الشريط العائم لوضع Lite — يُركّب فوق المحتوى (Box overlay) ويتغذى من
 * [LiteModeManager]:
 *  - [LiteBannerState.AutoActivated]: حبة «تم التحويل لسبق Lite» تختفي
 *    ذاتياً بعد 4 ثوانٍ.
 *  - [LiteBannerState.RecoveryOffered]: بطاقة «الاتصال تحسّن» بزرّي
 *    «عودة» / «ابقَ في Lite»، تختفي بعد 8 ثوانٍ والبقاء هو الافتراضي.
 *
 * لا يلتقط أي لمسات إلا عندما يكون ظاهراً (لا يُركَّب شيء في None).
 */
@Composable
fun LiteBanner(
    banner: LiteBannerState,
    onClearActivation: () -> Unit,
    onAcceptRecovery: () -> Unit,
    onDismissRecovery: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (banner) {
        LiteBannerState.None -> Unit
        LiteBannerState.AutoActivated -> {
            LaunchedEffect(banner) {
                delay(4_000)
                onClearActivation()
            }
            AutoActivatedPill(modifier)
        }
        LiteBannerState.RecoveryOffered -> {
            LaunchedEffect(banner) {
                delay(8_000)
                onDismissRecovery() // البقاء في Lite هو الافتراضي
            }
            RecoveryCard(
                onAccept = onAcceptRecovery,
                onStay = onDismissRecovery,
                modifier = modifier,
            )
        }
    }
}

@Composable
private fun AutoActivatedPill(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 24.dp, vertical = 10.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        Row(
            modifier = Modifier
                .shadow(8.dp, CircleShape, spotColor = SabqTheme.colors.shadow)
                .clip(CircleShape)
                .background(SabqTheme.colors.ink)
                .padding(horizontal = 16.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.Bolt,
                contentDescription = null,
                tint = SabqTheme.colors.gold,
                modifier = Modifier.size(15.dp),
            )
            Text(
                text = "الاتصال بطيء — تم التحويل لتصفح سبق Lite ⚡",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.surface,
            )
        }
    }
}

@Composable
private fun RecoveryCard(
    onAccept: () -> Unit,
    onStay: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 20.dp, vertical = 10.dp),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .shadow(10.dp, RoundedCornerShape(18.dp), spotColor = SabqTheme.colors.shadow)
                .clip(RoundedCornerShape(18.dp))
                .background(SabqTheme.colors.surface)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.SignalWifi4Bar,
                    contentDescription = null,
                    tint = SabqTheme.colors.leaf,
                    modifier = Modifier.size(17.dp),
                )
                Text(
                    text = "الاتصال تحسّن — العودة للوضع الطبيعي؟",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "عودة",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(SabqTheme.colors.primaryEnd)
                        .clickable { onAccept() }
                        .padding(vertical = 9.dp),
                )
                Text(
                    text = "ابقَ في Lite",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.ink,
                    textAlign = TextAlign.Center,
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(SabqTheme.colors.paleFill)
                        .clickable { onStay() }
                        .padding(vertical = 9.dp),
                )
            }
        }
    }
}
