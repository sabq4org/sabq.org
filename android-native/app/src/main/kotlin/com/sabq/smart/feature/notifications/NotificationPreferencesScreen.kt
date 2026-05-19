package com.sabq.smart.feature.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
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
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Per-type toggles. Mirrors iOS `NotificationPreferencesView`
 * (lines 726-868). Intro card + four toggle rows in a single
 * SurfaceCard, auto-save on change.
 */
@Composable
fun NotificationPreferencesScreen(
    onBack: () -> Unit,
    viewModel: NotificationPreferencesViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val colors = SabqTheme.colors

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        PreferencesTopBar(onBack = onBack, saving = state.saving)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            IntroCard()
            SurfaceCard {
                Column {
                    ToggleRow(
                        icon = Icons.Filled.Schedule,
                        tint = colors.sky,
                        title = "جدولة المحتوى",
                        subtitle = "عند جدولة مقالتك/خبرك لوقت لاحق",
                        checked = state.prefs.scheduledEnabled,
                        onChange = viewModel::setScheduled,
                    )
                    HorizontalDivider(color = colors.outline.copy(alpha = 0.4f), thickness = 0.5.dp)
                    ToggleRow(
                        icon = Icons.Filled.CheckCircle,
                        tint = colors.leaf,
                        title = "النشر",
                        subtitle = "عند نشر المحتوى وإتاحته للقراء",
                        checked = state.prefs.publishedEnabled,
                        onChange = viewModel::setPublished,
                    )
                    HorizontalDivider(color = colors.outline.copy(alpha = 0.4f), thickness = 0.5.dp)
                    ToggleRow(
                        icon = Icons.Filled.Edit,
                        tint = colors.primaryEnd,
                        title = "طلب تعديل",
                        subtitle = "حين يطلب المحرّر تعديلاً قبل النشر",
                        checked = state.prefs.revisionEnabled,
                        onChange = viewModel::setRevision,
                    )
                    HorizontalDivider(color = colors.outline.copy(alpha = 0.4f), thickness = 0.5.dp)
                    ToggleRow(
                        icon = Icons.Filled.Cancel,
                        tint = colors.coral,
                        title = "الاعتذار / الرفض",
                        subtitle = "عند الاعتذار عن النشر مع توضيح السبب",
                        checked = state.prefs.rejectedEnabled,
                        onChange = viewModel::setRejected,
                    )
                }
            }
        }
    }
}

@Composable
private fun PreferencesTopBar(onBack: () -> Unit, saving: Boolean) {
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
                imageVector = Icons.Filled.Close,
                contentDescription = "إغلاق",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "إعدادات الإشعارات",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 15.sp),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Box(
            modifier = Modifier.size(40.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (saving) {
                CircularProgressIndicator(
                    color = SabqTheme.colors.primaryEnd,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun IntroCard() {
    SurfaceCard(accent = SabqTheme.colors.primaryEnd) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.NotificationsActive,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(18.dp),
                )
                Text(
                    text = "إشعاراتك الشخصية",
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                )
            }
            Text(
                text = "تحكم في الأنواع التي تصلك على هذا الجهاز. تطفئة نوع لا يلغي إرسالها — يمكن الاطلاع عليها لاحقاً من شاشة الإشعارات.",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                ),
            )
        }
    }
}

@Composable
private fun ToggleRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    subtitle: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(15.dp),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = title,
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
            Text(
                text = subtitle,
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.secondaryInk,
                ),
                maxLines = 2,
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = tint,
                uncheckedThumbColor = Color.White,
                uncheckedTrackColor = SabqTheme.colors.outline,
            ),
        )
    }
}
