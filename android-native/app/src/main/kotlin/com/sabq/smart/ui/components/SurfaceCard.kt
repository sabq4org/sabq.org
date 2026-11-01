package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Ports iOS `SurfaceCard`: a white rounded surface with the soft
 * «مكتب سبق» shadow ([sabqNewsSurface]) and no outline, plus an optional
 * accent-tinted decorative circle peeking from the top-right corner.
 */
@Composable
fun SurfaceCard(
    modifier: Modifier = Modifier,
    accent: Color? = null,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
    // هوية «مكتب سبق» (iOS #2039–#2041): بطاقة بيضاء بظل خفيف بلا حدّ.
    Box(
        modifier = modifier
            .fillMaxWidth()
            .sabqNewsSurface(shape)
            .background(SabqTheme.colors.surface, shape),
    ) {
        // هوية «مكتب سبق»: لا دائرة زخرفية في الزاوية؛ [accent] محفوظ للتوافق مع النداءات القائمة.
        Column(
            modifier = Modifier.padding(SabqTheme.dimens.cardPadding),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            content()
        }
    }
}
