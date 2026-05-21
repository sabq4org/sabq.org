package com.sabq.smart.feature.hajj

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
import androidx.compose.material.icons.filled.Mosque
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "صدى الحج" — 1:1 port of iOS `HajjBlockView`
 * (`Screens/HajjBlockView.swift`).
 *
 * iOS actually embeds this as an inline widget inside HomeFeedView
 * — seasonal, invisible outside hajj season, driven by the
 * `/api/hajj-block` endpoint's `isVisible` flag. We expose it as a
 * dedicated route on Android too so the navigation surface exists;
 * when hajj season returns and the data layer is wired we can also
 * inline-embed it on the Home screen if that's the preferred UX.
 *
 * Visual palette (ported from iOS lines 56-64):
 *   - Background: warm ivory → gold gradient
 *     (0.97, 0.95, 0.92) → (0.93, 0.89, 0.83) → (0.88, 0.83, 0.69)
 *   - Title ink: deep gold-brown (0.30, 0.18, 0.04)
 *   - Decorative crescent at the top-leading corner.
 *
 * Currently shows a "خارج موسم الحج" message because the data layer
 * isn't wired. The visual chrome is in place so dropping in the API
 * binding is a fill-in-the-blanks change.
 */
@Composable
fun HajjBlockScreen(onBack: () -> Unit) {
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
            item { HajjPreviewCard() }
        }
    }
}

@Composable
private fun HajjPreviewCard() {
    val shape = RoundedCornerShape(20.dp)
    // Deep gold-brown ink, ported from iOS Color(red:0.30, green:0.18, blue:0.04).
    val deepInk = Color(0.30f, 0.18f, 0.04f)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(
                brush = Brush.linearGradient(
                    listOf(
                        Color(0.97f, 0.95f, 0.92f),
                        Color(0.93f, 0.89f, 0.83f),
                        Color(0.88f, 0.83f, 0.69f),
                    ),
                ),
                shape = shape,
            )
            .padding(16.dp),
    ) {
        // Decorative crescent at top-leading (iOS line 67-74).
        Icon(
            imageVector = Icons.Filled.Mosque,
            contentDescription = null,
            tint = Color(0.55f, 0.35f, 0.05f).copy(alpha = 0.12f),
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 12.dp, top = 12.dp)
                .size(36.dp),
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(text = "🕋", fontSize = 26.sp)
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(
                        text = "صدى الحج",
                        fontSize = 19.sp,
                        fontWeight = FontWeight.Bold,
                        color = deepInk,
                    )
                    Text(
                        text = "متابعة موسم الحج: تغطية، أرقام، وقصص الحجاج",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = deepInk.copy(alpha = 0.70f),
                    )
                }
            }
            Spacer(modifier = Modifier.size(8.dp))
            Text(
                text = "نحن خارج موسم الحج حالياً. عند بدء الموسم ستظهر التغطية والمراحل اليومية وأهم الأخبار هنا تلقائياً.",
                fontSize = 13.sp,
                color = deepInk.copy(alpha = 0.80f),
                lineHeight = 20.sp,
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
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "صدى الحج",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}
