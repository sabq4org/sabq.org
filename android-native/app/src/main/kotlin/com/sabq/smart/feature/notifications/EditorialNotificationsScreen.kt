package com.sabq.smart.feature.notifications

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Checklist
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsActive
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import com.sabq.smart.data.EditorialNotification
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.formatRelativeDateAr

/**
 * Editorial-notifications history list — ports
 * `EditorialNotificationsView.swift:12-417`. Same flow:
 *   - Loading / failed / empty / loaded states.
 *   - markAllRead pill at the top when unread > 0.
 *   - Swipe-to-delete on each row (optimistic, rolls back on failure).
 *   - clearAll capsule + confirm dialog at the bottom.
 *   - Tap row → opens detail (navigates via [onOpenDetail]).
 *   - Gear icon in the top bar → preferences screen
 *     (navigates via [onOpenPreferences]).
 */
@Composable
fun EditorialNotificationsScreen(
    onBack: () -> Unit,
    onOpenDetail: (String) -> Unit,
    onOpenPreferences: () -> Unit,
    viewModel: EditorialNotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showClearAll by remember { mutableStateOf(false) }

    if (showClearAll) {
        ClearAllConfirmDialog(
            onConfirm = {
                showClearAll = false
                viewModel.clearAll()
            },
            onDismiss = { showClearAll = false },
        )
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        NotificationsTopBar(
            onBack = onBack,
            onOpenPreferences = onOpenPreferences,
        )

        Box(modifier = Modifier.fillMaxSize()) {
            when (val s = state.load) {
                EditorialNotificationsViewModel.LoadState.Loading -> LoadingCenter()
                is EditorialNotificationsViewModel.LoadState.Failed -> FailedState(
                    message = s.message,
                    onRetry = viewModel::load,
                )
                EditorialNotificationsViewModel.LoadState.Loaded -> {
                    if (state.items.isEmpty()) {
                        EmptyState()
                    } else {
                        NotificationsList(
                            items = state.items,
                            unread = state.unread,
                            onTap = { item ->
                                viewModel.markRead(item)
                                onOpenDetail(item.id)
                            },
                            onDelete = viewModel::deleteItem,
                            onMarkAllRead = viewModel::markAllRead,
                            onClearAll = { showClearAll = true },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NotificationsTopBar(
    onBack: () -> Unit,
    onOpenPreferences: () -> Unit,
) {
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
            text = "الإشعارات",
            style = SabqTheme.typography.cardTitle.copy(fontSize = 17.sp),
            color = SabqTheme.colors.ink,
        )
        Spacer(modifier = Modifier.weight(1f))
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.92f))
                .clickable { onOpenPreferences() },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Tune,
                contentDescription = "إعدادات الإشعارات",
                tint = SabqTheme.colors.secondaryInk,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun NotificationsList(
    items: List<EditorialNotification>,
    unread: Int,
    onTap: (EditorialNotification) -> Unit,
    onDelete: (EditorialNotification) -> Unit,
    onMarkAllRead: () -> Unit,
    onClearAll: () -> Unit,
) {
    LazyColumn(
        contentPadding = PaddingValues(
            start = SabqTheme.dimens.screenPaddingH,
            end = SabqTheme.dimens.screenPaddingH,
            top = 4.dp,
            bottom = 40.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (unread > 0) {
            item { MarkAllReadButton(onClick = onMarkAllRead) }
        }

        items(items, key = { it.id }) { item ->
            SwipeToDeleteRow(
                item = item,
                onTap = { onTap(item) },
                onDelete = { onDelete(item) },
            )
        }

        item { ClearAllFooter(onClick = onClearAll) }
    }
}

@Composable
private fun MarkAllReadButton(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(CircleShape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f))
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(14.dp),
        )
        Spacer(modifier = Modifier.size(6.dp))
        Text(
            text = "تحديد الكل كمقروء",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = SabqTheme.colors.primaryEnd,
            ),
        )
    }
}

@Composable
private fun ClearAllFooter(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 16.dp)
            .clip(CircleShape)
            .background(SabqTheme.colors.coral.copy(alpha = 0.08f))
            .border(
                BorderStroke(0.6.dp, SabqTheme.colors.coral.copy(alpha = 0.22f)),
                CircleShape,
            )
            .clickable { onClick() }
            .padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Delete,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(12.dp),
        )
        Spacer(modifier = Modifier.size(6.dp))
        Text(
            text = "مسح كل الإشعارات",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.coral,
            ),
        )
    }
}

@Composable
private fun SwipeToDeleteRow(
    item: EditorialNotification,
    onTap: () -> Unit,
    onDelete: () -> Unit,
) {
    val swipeState = rememberSwipeToDismissBoxState(
        confirmValueChange = { target ->
            if (target == SwipeToDismissBoxValue.EndToStart || target == SwipeToDismissBoxValue.StartToEnd) {
                onDelete()
                true
            } else false
        },
    )
    // Reset swipe state when items list changes underneath this row
    // (e.g. after a successful delete or roll-back).
    LaunchedEffect(item.id) { /* fresh state when key changes */ }

    SwipeToDismissBox(
        state = swipeState,
        backgroundContent = {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .clip(RoundedCornerShape(SabqTheme.dimens.chipRadius))
                    .background(SabqTheme.colors.coral),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(horizontal = 20.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.Delete,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = "حذف",
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                        ),
                    )
                }
            }
        },
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = true,
    ) {
        NotificationRow(item = item, onClick = onTap)
    }
}

@Composable
private fun NotificationRow(
    item: EditorialNotification,
    onClick: () -> Unit,
) {
    val style = rowStyle(type = item.type)
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
    val background = if (item.isUnread) {
        style.tint.copy(alpha = 0.05f)
    } else {
        SabqTheme.colors.paleFill.copy(alpha = 0.3f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            // The semi-transparent tint fills below would let the
            // SwipeToDismissBox's red coral delete backdrop bleed
            // through at rest. Stack: opaque surface → tint overlay.
            .background(SabqTheme.colors.background, shape)
            .background(background, shape)
            .border(BorderStroke(0.5.dp, SabqTheme.colors.outline.copy(alpha = 0.4f)), shape)
            .clickable { onClick() }
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(style.tint.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = style.icon,
                contentDescription = null,
                tint = style.tint,
                modifier = Modifier.size(17.dp),
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = item.title,
                    style = SabqTheme.typography.cardTitle.copy(
                        fontSize = 14.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                    ),
                    maxLines = 2,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (item.isUnread) {
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(SabqTheme.colors.coral),
                    )
                }
            }
            val cleanBody = cleanBodyText(item)
            if (cleanBody.isNotEmpty()) {
                Text(
                    text = cleanBody,
                    style = SabqTheme.typography.meta.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                    maxLines = 3,
                )
            }
            val note = item.reviewerNote
            if (!note.isNullOrEmpty()) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.Top,
                    modifier = Modifier.padding(top = 2.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.FormatQuote,
                        contentDescription = null,
                        tint = style.tint,
                        modifier = Modifier
                            .padding(top = 2.dp)
                            .size(9.dp),
                    )
                    Text(
                        text = note,
                        style = SabqTheme.typography.metaSmall.copy(
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = style.tint,
                        ),
                        maxLines = 2,
                    )
                }
            }
            Text(
                text = formatRelativeDateAr(item.createdAt),
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Medium,
                    color = SabqTheme.colors.tertiaryInk,
                ),
            )
        }
    }
}

/** Type → (icon, tint) — mirrors iOS `rowStyle(for type:)`. */
@Composable
private fun rowStyle(type: String): RowStyle {
    val colors = SabqTheme.colors
    return when (type) {
        "scheduled" -> RowStyle(Icons.Filled.Schedule, colors.sky)
        "published" -> RowStyle(Icons.Filled.CheckCircle, colors.leaf)
        "rejected" -> RowStyle(Icons.Filled.Cancel, colors.coral)
        "needs_revision" -> RowStyle(Icons.Filled.Edit, colors.primaryEnd)
        "archived" -> RowStyle(Icons.Filled.Archive, colors.tertiaryInk)
        "survey_invite" -> RowStyle(Icons.Filled.Checklist, colors.sky)
        else -> RowStyle(Icons.Filled.Notifications, colors.secondaryInk)
    }
}

private data class RowStyle(val icon: ImageVector, val tint: Color)

/** Mirrors iOS `EditorialNotificationsView.cleanBody`: strip the
 *  trailing "— ..." segment from the body when a separate reviewerNote
 *  is present so the editor's note doesn't appear twice. */
private fun cleanBodyText(item: EditorialNotification): String {
    val raw = item.body
    val note = item.reviewerNote
    if (note.isNullOrEmpty()) return raw
    val dashIdx = raw.indexOf('—')
    return if (dashIdx > 0) raw.substring(0, dashIdx).trim() else raw
}

@Composable
private fun LoadingCenter() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
        CircularProgressIndicator(
            color = SabqTheme.colors.primaryEnd,
            strokeWidth = 2.dp,
            modifier = Modifier
                .padding(top = 120.dp)
                .size(28.dp),
        )
    }
}

@Composable
private fun FailedState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
    ) {
        Icon(
            imageVector = Icons.Filled.NotificationsActive,
            contentDescription = null,
            tint = SabqTheme.colors.coral,
            modifier = Modifier.size(40.dp),
        )
        Text(
            text = message,
            style = SabqTheme.typography.meta.copy(
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
        TextButton(onClick = onRetry) {
            Text(
                text = "إعادة المحاولة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.primaryEnd,
                ),
            )
        }
    }
}

@Composable
private fun EmptyState() {
    com.sabq.smart.ui.components.EmptyStateView(
        icon = Icons.Outlined.Notifications,
        tint = SabqTheme.colors.primaryEnd,
        title = "لا توجد إشعارات بعد",
        subtitle = "سيصلك هنا كل ما يخص مقالاتك وأخبارك من جدولة ونشر ومراجعة.",
    )
}

@Composable
private fun ClearAllConfirmDialog(
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = "مسح كل الإشعارات؟",
                style = SabqTheme.typography.cardTitle.copy(
                    fontSize = 17.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.ink,
                ),
            )
        },
        text = {
            Text(
                text = "سيتم حذف سجلّ إشعاراتك التحريرية بالكامل. لا يمكن التراجع عن هذه الخطوة.",
                style = SabqTheme.typography.meta.copy(color = SabqTheme.colors.secondaryInk),
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    text = "مسح",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.coral,
                    ),
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = "إلغاء",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.secondaryInk,
                    ),
                )
            }
        },
        containerColor = SabqTheme.colors.surface,
    )
}
