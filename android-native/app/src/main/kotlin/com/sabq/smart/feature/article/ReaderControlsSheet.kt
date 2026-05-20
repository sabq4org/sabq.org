package com.sabq.smart.feature.article

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.feature.settings.SettingsViewModel
import com.sabq.smart.ui.theme.SabqTheme

/**
 * Bottom sheet that surfaces the three reader preferences (font size,
 * line spacing, reader serif font) with a live preview panel at the
 * top. 1:1 port of iOS `ReaderControlsSheet`
 * (`Screens/ArticleDetailView.swift:1687-1814`).
 *
 * Persists every change immediately via [SettingsViewModel] →
 * [com.sabq.smart.data.SettingsStore], so the next article opens with
 * the same prefs (matches iOS `@AppStorage` behaviour).
 *
 * Driven by a parent-owned visibility flag (typically the Aa button in
 * the article action bar). Closes via tap on the drag handle, swipe
 * down, scrim tap, OR the "تم" button at the top-end of the sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReaderControlsSheet(
    onDismiss: () -> Unit,
    settingsViewModel: SettingsViewModel = hiltViewModel(),
) {
    val settings by settingsViewModel.settings.collectAsStateWithLifecycle()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = SabqTheme.colors.background,
        contentColor = SabqTheme.colors.ink,
        dragHandle = null,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 22.dp)
                .padding(top = 18.dp, bottom = 30.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            // Top bar — title + "تم" close button (top-end, which in
            // RTL is the visual top-left).
            HeaderBar(onDone = onDismiss)

            // Live preview — re-renders on every slider tick so the
            // user sees the reflow before they commit.
            PreviewPanel(
                fontSize = settings.articleFontSize,
                lineSpacing = settings.articleLineSpacing,
                useSerif = settings.articleUseReaderFont,
            )

            Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                SliderSection(
                    title = "حجم الخط",
                    valueText = "${settings.articleFontSize.toInt()} pt",
                    value = settings.articleFontSize,
                    range = 13f..22f,
                    steps = 22 - 13 - 1, // discrete integer ticks
                    leftLabel = "أ",
                    leftSize = 12.sp,
                    rightLabel = "أ",
                    rightSize = 20.sp,
                    onValueChange = { settingsViewModel.setFontSize(it.toInt().toFloat()) },
                )

                SliderSection(
                    title = "تباعد الأسطر",
                    valueText = settings.articleLineSpacing.toInt().toString(),
                    value = settings.articleLineSpacing,
                    range = 2f..12f,
                    steps = 12 - 2 - 1,
                    leftLabel = "≡",
                    leftSize = 14.sp,
                    rightLabel = "≣",
                    rightSize = 14.sp,
                    onValueChange = { settingsViewModel.setLineSpacing(it.toInt().toFloat()) },
                )

                ReaderFontToggle(
                    useSerif = settings.articleUseReaderFont,
                    onToggle = settingsViewModel::setUseReaderFont,
                )
            }

            Spacer(modifier = Modifier.height(0.dp))
        }
    }
}

// ============================================================
// Header — title + "تم"
// ============================================================

@Composable
private fun HeaderBar(onDone: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "تنسيق القراءة",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = "تم",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.primaryEnd,
            modifier = Modifier
                .clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onDone)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        )
    }
}

// ============================================================
// Preview panel — live re-renders with current prefs
// ============================================================

@Composable
private fun PreviewPanel(fontSize: Float, lineSpacing: Float, useSerif: Boolean) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface, shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.4f), shape = shape)
            .padding(16.dp),
    ) {
        Text(
            text = "تظهر القراءة بهذا الحجم والتباعد. عدّل الإعدادات أدناه لتجد المريح لعينيك.",
            fontSize = fontSize.sp,
            lineHeight = (fontSize + lineSpacing).sp,
            color = SabqTheme.colors.ink,
            fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
        )
    }
}

// ============================================================
// Slider row — title + value · left-glyph + slider + right-glyph
// ============================================================

@Composable
private fun SliderSection(
    title: String,
    valueText: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    steps: Int,
    leftLabel: String,
    leftSize: androidx.compose.ui.unit.TextUnit,
    rightLabel: String,
    rightSize: androidx.compose.ui.unit.TextUnit,
    onValueChange: (Float) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = title,
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = valueText,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(
                text = leftLabel,
                fontSize = leftSize,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.widthIn(min = 18.dp),
            )
            Slider(
                value = value.coerceIn(range.start, range.endInclusive),
                onValueChange = onValueChange,
                valueRange = range,
                steps = steps,
                colors = SliderDefaults.colors(
                    thumbColor = SabqTheme.colors.primaryEnd,
                    activeTrackColor = SabqTheme.colors.primaryEnd,
                    inactiveTrackColor = SabqTheme.colors.outline,
                ),
                modifier = Modifier.weight(1f),
            )
            Text(
                text = rightLabel,
                fontSize = rightSize,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.tertiaryInk,
                modifier = Modifier.widthIn(min = 18.dp),
            )
        }
    }
}

// ============================================================
// Reader-font toggle
// ============================================================

@Composable
private fun ReaderFontToggle(useSerif: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                text = "خط القراءة",
                fontSize = 14.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = "خط متّسع لقراءة مريحة",
                fontSize = 11.sp,
                color = SabqTheme.colors.tertiaryInk,
            )
        }
        Switch(
            checked = useSerif,
            onCheckedChange = onToggle,
            colors = SwitchDefaults.colors(
                checkedThumbColor = androidx.compose.ui.graphics.Color.White,
                checkedTrackColor = SabqTheme.colors.primaryEnd,
                uncheckedTrackColor = SabqTheme.colors.outline,
            ),
        )
    }
}
