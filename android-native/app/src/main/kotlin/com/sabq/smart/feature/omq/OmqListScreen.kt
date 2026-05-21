package com.sabq.smart.feature.omq

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.components.EmptyStateView
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "تحليلات عميقة" — 1:1 port of iOS `OmqListView`
 * (`Screens/OmqListView.swift`). Surfaces the OMQ deep-analysis feed
 * — weekly multi-model AI analyses (GPT + Gemini + Claude + merged).
 *
 * iOS layout:
 *   1. Header HStack: 56 dp sky circle + brain icon + "تحليلات عميقة"
 *      title + subtitle "تحليلات أسبوعية لأهم القضايا بمزيج من نماذج
 *      الذكاء الاصطناعي".
 *   2. LazyVStack of analysis cards (category chip + title + topic +
 *      keywords + views count).
 *
 * Android v1: header renders fully; the analyses list is a "coming
 * soon" empty state because the backend `/api/omq` endpoint isn't
 * wired through `SabqApi` yet. Lands the navigation surface so we
 * can hook the feed in a follow-up without re-shipping the route.
 */
@Composable
fun OmqListScreen(onBack: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)

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
            item { OmqHeader() }
            item {
                EmptyStateView(
                    icon = Icons.Filled.Psychology,
                    tint = SabqTheme.colors.sky,
                    title = "لا توجد تحليلات بعد",
                    subtitle = "تحليلات الذكاء الاصطناعي العميقة قيد التحضير — قريباً.",
                )
            }
        }
    }
}

@Composable
private fun OmqHeader() {
    Row(
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.sky.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Psychology,
                contentDescription = null,
                tint = SabqTheme.colors.sky,
                modifier = Modifier.size(26.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = "تحليلات عميقة",
                fontSize = 20.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "تحليلات أسبوعية لأهم القضايا بمزيج من نماذج الذكاء الاصطناعي",
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
                maxLines = 2,
            )
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
    }
}
