package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.material3.Text
import com.sabq.smart.ui.theme.SabqTheme

/**
 * سطح تحريري واحد لكل مجموعة: أبيض بظل خفيف بلا حدّ — نظير
 * `sabqNewsSurface()` في iOS (SabqDesignSystem.swift: ظل #1B2B3A 6%،
 * نصف قطر 10، إزاحة 3). ظل أندرويد يُحسب من الارتفاع، فـ 6dp بلون
 * الظل المضاعف يقارب المظهر نفسه.
 */
fun Modifier.sabqNewsSurface(
    shape: Shape = RoundedCornerShape(16.dp),
): Modifier = this
    .shadow(
        elevation = 6.dp,
        shape = shape,
        ambientColor = Color(0x141B2B3A),
        spotColor = Color(0x2E1B2B3A),
    )
    .clip(shape)

/** خلفية السطح بعد [sabqNewsSurface] — منفصلة لأن اللون من الثيم. */
@Composable
fun Modifier.sabqNewsSurfaceFilled(
    shape: Shape = RoundedCornerShape(SabqTheme.dimens.cardRadius),
): Modifier = this.sabqNewsSurface(shape).background(SabqTheme.colors.surface, shape)

/**
 * رأس القسم الموحّد في الرئيسية — iOS `HomeSectionHeader`: شريط عمودي
 * 4×18 بلون الأساس، ثم العنوان 20 عريضًا، ثم سياق قصير اختياري، ثم الرابط.
 */
@Composable
fun HomeSectionHeader(
    title: String,
    modifier: Modifier = Modifier,
    context: String? = null,
    link: (@Composable () -> Unit)? = null,
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(width = 4.dp, height = 18.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(SabqTheme.colors.primaryEnd),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = title,
            style = SabqTheme.typography.sectionHeader,
            color = SabqTheme.colors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.semantics { heading() },
        )
        if (context != null) {
            Spacer(Modifier.width(12.dp))
            Text(
                text = context,
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.tertiaryInk,
                maxLines = 1,
            )
        }
        Spacer(Modifier.weight(1f).width(8.dp))
        link?.invoke()
    }
}

/** فاصل الصفوف على السطح التحريري — iOS `SidebarRowDivider`. */
@Composable
fun SabqRowDivider(modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(SabqTheme.colors.separator),
    )
}

/** شارة القسم: نص 12 بلون الأساس على كبسولة بشفافية 7% — iOS `categoryPill`. */
@Composable
fun SabqCategoryPill(
    title: String,
    modifier: Modifier = Modifier,
    tint: Color = SabqTheme.colors.primaryEnd,
    fillAlpha: Float = 0.07f,
) {
    Text(
        text = title,
        style = SabqTheme.typography.statusChip,
        color = tint,
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(tint.copy(alpha = fillAlpha))
            .padding(horizontal = 8.dp, vertical = 2.5.dp),
    )
}
