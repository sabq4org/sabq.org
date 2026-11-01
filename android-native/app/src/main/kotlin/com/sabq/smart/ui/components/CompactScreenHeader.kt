package com.sabq.smart.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import com.sabq.smart.ui.theme.SabqTheme

/**
 * رأس الشاشة بنمط iOS: عنوان التنقّل في الوسط (17 شبه عريض، كالعنوان
 * المضمَّن في شريط iOS)، ثم سطر وصف قصير بلون ثانوي، وزر إجراء اختياري.
 * يُستخدم في استكشف والمحفوظات والرأي وغيرها.
 */
@Composable
fun CompactScreenHeader(
    title: String,
    subtitle: String,
    modifier: Modifier = Modifier,
    actionTitle: String? = null,
    actionIcon: ImageVector? = null,
    actionTint: androidx.compose.ui.graphics.Color = SabqTheme.colors.primaryEnd,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = title,
            style = SabqTheme.typography.compactCardTitle.copy(fontSize = 17.sp, fontWeight = FontWeight.SemiBold),
            color = SabqTheme.colors.ink,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { heading() },
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = subtitle,
                style = SabqTheme.typography.excerpt,
                color = SabqTheme.colors.secondaryInk,
                modifier = Modifier.weight(1f),
            )
            if (actionTitle != null && actionIcon != null && onAction != null) {
                SmallActionButton(
                    title = actionTitle,
                    icon = actionIcon,
                    tint = actionTint,
                    onClick = onAction,
                )
            }
        }
    }
}
