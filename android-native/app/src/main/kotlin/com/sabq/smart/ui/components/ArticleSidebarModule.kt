package com.sabq.smart.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.ui.theme.SabqTheme

/**
 * الحاوية الموحدة لكل بلوك قائمة بجوار/تحت الخبر — نقل `ArticleSidebarModule`
 * من الويب (#1610) ونظير iOS: سطح بدرجة الويب، عنوان واحد بأيقونة في مربع،
 * وصف، رابط إجراء اختياري، ثم صفوف بشكل بطاقة الخبر المضغوطة يفصلها خط شعري.
 */
@Composable
fun ArticleSidebarModule(
    title: String,
    description: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    fill: Color = SabqTheme.colors.publicSurface,
    action: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .background(fill, shape)
            .border(1.dp, SabqTheme.colors.outline, shape)
            .padding(18.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(16.dp),
                )
            }
            Text(
                text = title,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                text = description,
                fontSize = 14.sp,
                color = SabqTheme.colors.secondaryInk,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            action?.invoke()
        }
        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = SabqTheme.colors.outline)
        Spacer(Modifier.height(2.dp))
        content()
    }
}

/** الخط الشعري بين صفوف القائمة داخل الحاوية الموحدة. */
@Composable
fun SidebarRowDivider() {
    HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.8f))
}

/**
 * صف بشكل بطاقة الخبر المضغوطة داخل الحاوية الموحدة: صورة 104×84 بإطار خفيف،
 * عنوان سطرين، ثم سطر بيانات (صورة الكاتب الصغيرة + اسمه · الوقت).
 * نقل `SidebarArticleCard` من الويب (#1610/#1612/#1624).
 */
@Composable
fun SidebarArticleRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    imageUrl: String? = null,
    /** اسم الكاتب لمقالات الرأي أو اسم القسم للتوصيات. */
    byline: String? = null,
    /** صورة دائرية صغيرة (20) قبل الاسم — لمقالات الرأي. */
    bylineAvatarUrl: String? = null,
    /** الوقت النسبي؛ null لبلوك الرأي داخل الخبر (يُقرأ كقائمة كتّاب لا خطًّا زمنيًا). */
    date: String? = null,
    placeholderIcon: ImageVector,
    placeholderTint: Color = SabqTheme.colors.primaryEnd,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val thumbShape = RoundedCornerShape(10.dp)
        Box(
            modifier = Modifier
                .size(width = 104.dp, height = 84.dp)
                .clip(thumbShape)
                .background(placeholderTint.copy(alpha = 0.10f))
                .border(1.dp, SabqTheme.colors.ink.copy(alpha = 0.12f), thumbShape),
            contentAlignment = Alignment.Center,
        ) {
            val placeholder: @Composable () -> Unit = {
                Icon(
                    imageVector = placeholderIcon,
                    contentDescription = null,
                    tint = placeholderTint.copy(alpha = 0.45f),
                    modifier = Modifier.size(20.dp),
                )
            }
            if (!imageUrl.isNullOrBlank()) {
                SubcomposeAsyncImage(
                    model = imageUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(width = 104.dp, height = 84.dp),
                    loading = { placeholder() },
                    error = { placeholder() },
                )
            } else {
                placeholder()
            }
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(
                text = title,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
                lineHeight = 21.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (byline != null || date != null) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (byline != null) {
                        if (!bylineAvatarUrl.isNullOrBlank()) {
                            SubcomposeAsyncImage(
                                model = bylineAvatarUrl,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(20.dp).clip(CircleShape),
                            )
                        }
                        Text(
                            text = byline,
                            fontSize = 12.sp,
                            color = SabqTheme.colors.secondaryInk,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.weight(1f, fill = false),
                        )
                    }
                    if (byline != null && date != null) {
                        Text("·", fontSize = 12.sp, color = SabqTheme.colors.secondaryInk)
                    }
                    if (date != null) {
                        Icon(
                            imageVector = Icons.Outlined.Schedule,
                            contentDescription = null,
                            tint = SabqTheme.colors.secondaryInk,
                            modifier = Modifier.size(11.dp),
                        )
                        Spacer(Modifier.width(0.dp))
                        Text(
                            text = date,
                            fontSize = 12.sp,
                            color = SabqTheme.colors.secondaryInk,
                            maxLines = 1,
                        )
                    }
                }
            }
        }
    }
}
