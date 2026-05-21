package com.sabq.smart.feature.brief

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Section
import com.sabq.smart.ui.theme.SabqTheme

/**
 * "اختر ما يهمّك" — full-screen interests picker. Ports iOS
 * `InterestsPickerSheet`. Sticky header (selection counter + bulk
 * actions) → adaptive chip grid → bottom save bar with brand gradient.
 *
 * Saving pops back so the [DailyBriefScreen] underneath shows the
 * updated interests immediately (its VM observes [AuthRepository.user]).
 */
@Composable
fun InterestsPickerScreen(
    onBack: () -> Unit,
    viewModel: InterestsPickerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    // Dismiss on a successful save — same UX as iOS sheet.
    LaunchedEffect(state.saveOutcome) {
        if (state.saveOutcome is InterestsPickerViewModel.SaveOutcome.Saved) {
            viewModel.consumeOutcome()
            onBack()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        TopBar(onBack = onBack)
        StickyHeader(
            selectionCount = state.selectedIds.size,
            isClearDisabled = state.selectedIds.isEmpty(),
            onSelectAll = viewModel::selectAll,
            onClearAll = viewModel::clearAll,
        )

        when {
            state.isLoading && state.categories.isEmpty() ->
                SkeletonGrid(modifier = Modifier.weight(1f))
            state.categories.isEmpty() ->
                EmptyState(
                    modifier = Modifier.weight(1f),
                    onRetry = viewModel::reload,
                )
            else ->
                ChipGrid(
                    modifier = Modifier.weight(1f),
                    categories = state.categories,
                    selectedIds = state.selectedIds,
                    onToggle = viewModel::toggle,
                )
        }

        SaveBar(
            selectionCount = state.selectedIds.size,
            isSaving = state.isSaving,
            failure = (state.saveOutcome as? InterestsPickerViewModel.SaveOutcome.Failed)?.message,
            onSave = viewModel::save,
        )
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
                contentDescription = "إلغاء",
                tint = SabqTheme.colors.ink,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(modifier = Modifier.weight(1f))
        Text(
            text = "اهتماماتك",
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Spacer(modifier = Modifier.size(40.dp))
    }
}

@Composable
private fun StickyHeader(
    selectionCount: Int,
    isClearDisabled: Boolean,
    onSelectAll: () -> Unit,
    onClearAll: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface.copy(alpha = 0.94f))
            .padding(horizontal = 18.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(
                    text = "اختر ما يهمّك",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                )
                Text(
                    text = "سبق ترتّب موجزك اليومي على هذه التصنيفات.",
                    fontSize = 12.sp,
                    color = SabqTheme.colors.secondaryInk,
                )
            }
            Box(
                modifier = Modifier
                    .heightIn(min = 32.dp)
                    .clip(CircleShape)
                    .background(
                        Brush.linearGradient(
                            listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                        ),
                    )
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "$selectionCount",
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            BulkPill(
                label = "حدد الكل",
                tint = SabqTheme.colors.primaryEnd,
                background = SabqTheme.colors.primaryEnd.copy(alpha = 0.10f),
                onClick = onSelectAll,
            )
            BulkPill(
                label = "امسح الكل",
                tint = SabqTheme.colors.secondaryInk,
                background = SabqTheme.colors.paleFill,
                onClick = onClearAll,
                isDisabled = isClearDisabled,
            )
        }
        Spacer(
            modifier = Modifier
                .fillMaxWidth()
                .height(0.5.dp)
                .background(SabqTheme.colors.outline.copy(alpha = 0.35f)),
        )
    }
}

@Composable
private fun BulkPill(
    label: String,
    tint: Color,
    background: Color,
    onClick: () -> Unit,
    isDisabled: Boolean = false,
) {
    val alpha = if (isDisabled) 0.5f else 1f
    Box(
        modifier = Modifier
            .clip(CircleShape)
            .background(background.copy(alpha = background.alpha * alpha))
            .then(if (isDisabled) Modifier else Modifier.clickable { onClick() })
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = tint.copy(alpha = alpha),
        )
    }
}

@Composable
private fun ChipGrid(
    modifier: Modifier = Modifier,
    categories: List<Section>,
    selectedIds: Set<String>,
    onToggle: (String) -> Unit,
) {
    LazyVerticalGrid(
        modifier = modifier,
        columns = GridCells.Adaptive(minSize = 140.dp),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(items = categories, key = { it.id }) { category ->
            InterestChip(
                category = category,
                isOn = selectedIds.contains(category.id),
                onClick = { onToggle(category.id) },
            )
        }
    }
}

@Composable
private fun InterestChip(category: Section, isOn: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(16.dp)
    val background = if (isOn) SabqTheme.colors.primaryEnd else SabqTheme.colors.surface
    val border = if (isOn) Color.Transparent else SabqTheme.colors.outline.copy(alpha = 0.45f)
    val textColor = if (isOn) Color.White else SabqTheme.colors.ink
    val iconColor = if (isOn) Color.White else SabqTheme.colors.tertiaryInk
    Column(
        modifier = Modifier
            .clip(shape)
            .background(background, shape)
            .border(width = 0.8.dp, color = border, shape = shape)
            .clickable { onClick() }
            .heightIn(min = 72.dp)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = if (isOn) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked,
            contentDescription = null,
            tint = iconColor,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = category.name.ifBlank { category.slug },
            fontSize = 14.sp,
            fontWeight = FontWeight.Black,
            color = textColor,
            maxLines = 2,
        )
    }
}

@Composable
private fun SkeletonGrid(modifier: Modifier = Modifier) {
    LazyVerticalGrid(
        modifier = modifier,
        columns = GridCells.Adaptive(minSize = 140.dp),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(count = 10) { _ ->
            com.sabq.smart.ui.components.SkeletonBox(
                height = 72.dp,
                radius = 16.dp,
            )
        }
    }
}

@Composable
private fun EmptyState(modifier: Modifier = Modifier, onRetry: () -> Unit) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(top = 60.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.GridView,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = "لم نستطع تحميل التصنيفات",
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.secondaryInk,
        )
        Box(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onRetry() }
                .padding(horizontal = 18.dp, vertical = 9.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = Color.White,
            )
        }
    }
}

@Composable
private fun SaveBar(
    selectionCount: Int,
    isSaving: Boolean,
    failure: String?,
    onSave: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.surface.copy(alpha = 0.94f)),
    ) {
        Spacer(
            modifier = Modifier
                .fillMaxWidth()
                .height(0.5.dp)
                .background(SabqTheme.colors.outline.copy(alpha = 0.35f)),
        )
        if (failure != null) {
            Text(
                text = failure,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.coral,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 18.dp, vertical = 6.dp),
            )
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 18.dp, vertical = 12.dp)
                .clip(RoundedCornerShape(SabqTheme.dimens.buttonRadius))
                .background(
                    if (selectionCount == 0) {
                        Brush.linearGradient(
                            listOf(
                                SabqTheme.colors.tertiaryInk,
                                SabqTheme.colors.tertiaryInk,
                            ),
                        )
                    } else {
                        Brush.linearGradient(
                            listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                        )
                    },
                )
                .clickable(enabled = !isSaving) { onSave() }
                .padding(vertical = 15.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (isSaving) {
                    CircularProgressIndicator(
                        color = Color.White,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp),
                    )
                }
                Text(
                    text = if (selectionCount == 0) "تخطّي الآن" else "حفظ $selectionCount تصنيف",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Black,
                    color = Color.White,
                )
            }
        }
    }
}

