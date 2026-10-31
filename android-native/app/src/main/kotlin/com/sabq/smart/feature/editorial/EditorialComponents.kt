package com.sabq.smart.feature.editorial

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PanTool
import androidx.compose.material.icons.outlined.PersonOff
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.sabq.smart.ui.theme.SabqTheme

// عناصر مشتركة بين «أخباري» و«بانتظار قرارك» — مرآة iOS EditorialComponents.swift.

internal val EditorialWarning = Color(0xFFD98A00)
internal val EditorialSuccess = Color(0xFF1F9D55)

@Composable
internal fun EditorialChip(title: String, count: Int, selected: Boolean, onClick: () -> Unit) {
    val shape = CircleShape
    Row(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .clip(shape)
            .background(if (selected) SabqTheme.colors.brandBlue else SabqTheme.colors.surface, shape)
            .border(BorderStroke(1.dp, if (selected) Color.Transparent else SabqTheme.colors.outline), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val ink = if (selected) Color.White else SabqTheme.colors.ink
        Text(title, style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = ink))
        Text(
            "$count",
            style = SabqTheme.typography.metaSmall.copy(fontWeight = FontWeight.Bold, color = ink.copy(alpha = 0.8f)),
        )
    }
}

@Composable
internal fun <T> EditorialChipRow(options: List<T>, selected: T, title: (T) -> String, count: (T) -> Int, onSelect: (T) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { option ->
            EditorialChip(title(option), count(option), option == selected) { if (option != selected) onSelect(option) }
        }
    }
}

internal enum class EditorialButtonStyle { Primary, Secondary, Danger }

@Composable
internal fun EditorialActionButton(
    title: String,
    modifier: Modifier = Modifier,
    style: EditorialButtonStyle = EditorialButtonStyle.Primary,
    busy: Boolean = false,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    val active = enabled && !busy
    val bg = when {
        !enabled -> SabqTheme.colors.softFill
        style == EditorialButtonStyle.Primary -> SabqTheme.colors.brandBlue
        else -> SabqTheme.colors.paleFill
    }
    val fg = when {
        !enabled -> SabqTheme.colors.tertiaryInk
        style == EditorialButtonStyle.Primary -> Color.White
        style == EditorialButtonStyle.Danger -> SabqTheme.colors.coral
        else -> SabqTheme.colors.ink
    }
    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 50.dp)
            .clip(CircleShape)
            .background(bg, CircleShape)
            .clickable(enabled = active, onClick = onClick)
            .padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) CircularProgressIndicator(color = fg, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        Text(title, style = SabqTheme.typography.ctaButton.copy(color = fg))
    }
}

/** التحميل والخطأ و«فعّل المصادقة الثنائية». */
@Composable
internal fun EditorialStatusView(error: EditorialError?, loading: Boolean, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 40.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (loading || error == null) {
            CircularProgressIndicator(color = SabqTheme.colors.brandBlue, strokeWidth = 2.dp, modifier = Modifier.size(28.dp))
            Text("نجلب البيانات…", style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk))
            return@Column
        }
        val icon = when (error) {
            is EditorialError.TwoFactorRequired -> Icons.Outlined.Lock
            is EditorialError.Forbidden -> Icons.Outlined.PanTool
            is EditorialError.Unauthorized -> Icons.Outlined.PersonOff
            else -> Icons.Outlined.WifiOff
        }
        Icon(icon, contentDescription = null, tint = SabqTheme.colors.brandBlue, modifier = Modifier.size(30.dp))
        Text(error.title, style = SabqTheme.typography.cardTitle.copy(color = SabqTheme.colors.ink))
        Text(
            error.message,
            style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            textAlign = TextAlign.Center,
        )
        if (error is EditorialError.TwoFactorRequired) {
            val uri = LocalUriHandler.current
            EditorialActionButton("افتح إعدادات الأمان على sabq.org", modifier = Modifier.widthIn(max = 320.dp)) {
                runCatching { uri.openUri("https://sabq.org/settings/security") }
            }
            Text(
                "فعّلها مرة واحدة، ثم عد إلى هنا واسحب للتحديث.",
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
                textAlign = TextAlign.Center,
            )
        }
        EditorialActionButton(
            "حاول مجددًا",
            modifier = Modifier.widthIn(max = 220.dp).padding(top = 8.dp),
            style = EditorialButtonStyle.Secondary,
            onClick = onRetry,
        )
    }
}

@Composable
internal fun EditorialThumbnail(url: String?, size: Dp = 64.dp, dimmed: Boolean = false) {
    val shape = RoundedCornerShape(10.dp)
    Box(
        Modifier
            .size(size)
            .clip(shape)
            .background(SabqTheme.colors.softFill, shape)
            .alpha(if (dimmed) 0.5f else 1f),
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(size),
            )
        }
    }
}

/** مجموعة بيضاء هادئة بحواف ناعمة (iOS `editorialGroup` / `sabqNewsSurface`). */
@Composable
internal fun EditorialSurface(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(18.dp)
    Box(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline), shape)
            .padding(padding),
    ) { content() }
}

internal enum class PillTone { Neutral, Info, Warning, Scheduled, Success, Danger }

internal fun pillTone(label: String): PillTone = when (label) {
    EditorialStates.PUBLISHED -> PillTone.Success
    EditorialStates.SCHEDULED, EditorialStates.APPROVED -> PillTone.Scheduled
    EditorialStates.NEEDS_CHANGES -> PillTone.Warning
    EditorialStates.PENDING -> PillTone.Info
    EditorialStates.NOT_PUBLISHED -> PillTone.Danger
    else -> PillTone.Neutral
}

@Composable
internal fun EditorialStatePill(title: String) {
    val tone = pillTone(title)
    val ink = when (tone) {
        PillTone.Neutral -> SabqTheme.colors.secondaryInk
        PillTone.Info -> SabqTheme.colors.brandBlue
        PillTone.Warning -> EditorialWarning
        PillTone.Scheduled -> SabqTheme.colors.teal
        PillTone.Success -> EditorialSuccess
        PillTone.Danger -> SabqTheme.colors.coral
    }
    Text(
        title,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        style = SabqTheme.typography.metaSmall.copy(fontWeight = FontWeight.Bold, color = ink),
        modifier = Modifier
            .clip(CircleShape)
            .background(if (tone == PillTone.Neutral) SabqTheme.colors.softFill else ink.copy(alpha = 0.12f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

internal enum class RequestOutcome { Pending, Approved, Rejected }

/** ملصق طلب التعديل: نقطة نابضة للمفتوح (حمراء إن كان عاجلًا)، صح للمعتمد، × للمرفوض. */
@Composable
internal fun EditRequestBadge(outcome: RequestOutcome, detail: String, urgent: Boolean = false) {
    val ink = when (outcome) {
        RequestOutcome.Pending -> if (urgent) SabqTheme.colors.coral else EditorialWarning
        RequestOutcome.Approved -> EditorialSuccess
        RequestOutcome.Rejected -> SabqTheme.colors.coral
    }
    val base = when (outcome) {
        RequestOutcome.Pending -> if (urgent) EditorialStates.REQUEST_URGENT else EditorialStates.REQUEST_PENDING
        RequestOutcome.Approved -> EditorialStates.REQUEST_APPROVED
        RequestOutcome.Rejected -> EditorialStates.REQUEST_REJECTED
    }
    val text = if (detail.isBlank()) base else "$base · $detail"
    Row(
        modifier = Modifier
            .heightIn(min = 32.dp)
            .clip(CircleShape)
            .background(ink.copy(alpha = 0.08f))
            .border(BorderStroke(1.dp, ink.copy(alpha = 0.35f)), CircleShape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        when (outcome) {
            RequestOutcome.Pending -> {
                val transition = rememberInfiniteTransition(label = "pulse")
                val pulse by transition.animateFloat(
                    initialValue = 1f,
                    targetValue = 0.4f,
                    animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
                    label = "pulse",
                )
                Box(Modifier.size(8.dp).scale(1f).alpha(pulse).clip(CircleShape).background(ink))
            }
            RequestOutcome.Approved -> Icon(Icons.Filled.Check, null, tint = ink, modifier = Modifier.size(14.dp))
            RequestOutcome.Rejected -> Icon(Icons.Filled.Close, null, tint = ink, modifier = Modifier.size(14.dp))
        }
        Text(
            text,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = ink),
        )
    }
}

/** حبة زر صغيرة في صفوف القوائم. */
@Composable
internal fun EditorialPillButton(title: String, emphasized: Boolean = false, filled: Boolean = false, onClick: () -> Unit) {
    val bg = when {
        filled -> SabqTheme.colors.brandBlue
        emphasized -> SabqTheme.colors.brandBlue.copy(alpha = 0.1f)
        else -> SabqTheme.colors.paleFill
    }
    val fg = when {
        filled -> Color.White
        emphasized -> SabqTheme.colors.brandBlue
        else -> SabqTheme.colors.ink
    }
    Text(
        title,
        style = SabqTheme.typography.meta.copy(fontWeight = FontWeight.SemiBold, color = fg, fontSize = 13.sp),
        modifier = Modifier
            .heightIn(min = 36.dp)
            .clip(CircleShape)
            .background(bg)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
    )
}

@Composable
internal fun EditorialBottomBar(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) { content() }
}

@Composable
internal fun EditorialDoneLine(message: String) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Check, null, tint = EditorialSuccess, modifier = Modifier.size(20.dp))
        Text(message, style = SabqTheme.typography.cardTitle.copy(color = EditorialSuccess))
    }
}
