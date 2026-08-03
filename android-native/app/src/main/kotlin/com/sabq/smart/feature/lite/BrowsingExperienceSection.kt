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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.sabq.smart.data.AppSettings
import com.sabq.smart.data.SabqBrowsingMode
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * قسم «تجربة التصفح» في الإعدادات — محدد ثلاثي (كامل / Lite / تلقائي)
 * بنمط SurfaceCard + رأس القسم المعتمد في SettingsScreen. مكوّن مكتفٍ
 * بذاته: المنسّق يدرجه بين DisplaySection وSubscriptionSection ويمرر
 * (settings, onSelect = viewModel::setBrowsingMode).
 */
@Composable
fun BrowsingExperienceSection(
    settings: AppSettings,
    onSelect: (SabqBrowsingMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    SurfaceCard(modifier = modifier) {
        BrowsingSectionHeader()

        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // صف مقسّم بنمط تبويبات التوقعات (PredictionCenterScreen.TabsBar).
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                SabqBrowsingMode.entries.forEach { mode ->
                    val selected = settings.browsingMode == mode
                    Text(
                        text = mode.arabicLabel,
                        style = SabqTheme.typography.tabLabel,
                        color = if (selected) Color.White else SabqTheme.colors.secondaryInk,
                        textAlign = TextAlign.Center,
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (selected) SabqTheme.colors.primaryStart
                                else SabqTheme.colors.paleFill,
                            )
                            .clickable { onSelect(mode) }
                            .padding(vertical = 9.dp),
                    )
                }
            }
            Text(
                text = settings.browsingMode.arabicSubtitle,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun BrowsingSectionHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Bolt,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(15.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "تجربة التصفح",
                style = SabqTheme.typography.sectionHeader.copy(
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = "اختر بين التجربة الكاملة أو وضع أخف وأسرع",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}
