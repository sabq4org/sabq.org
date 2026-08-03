package com.sabq.smart.feature.revisions

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.outlined.Article
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.SubcomposeAsyncImage
import com.sabq.smart.feature.settings.SheetTopBar
import com.sabq.smart.ui.components.SurfaceCard
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.formatRelativeDateAr
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.launch

/**
 * كهرماني دافئ بدل coral — «يحتاج انتباهك، لا ذعرك».
 * iOS `RevisionPalette.accent` = RGB(0.95, 0.62, 0.20).
 */
internal val RevisionAccent = Color(0xFFF29E33)

@HiltViewModel
class RevisionsListViewModel @Inject constructor(
    val store: RevisionsStore,
) : ViewModel() {
    fun refresh() {
        viewModelScope.launch { store.refresh() }
    }
}

/**
 * «مقالات تنتظر التعديل» — قائمة المقالات التي أعادها فريق التحرير.
 * نقل لواجهة iOS `ArticleRevisionsListView`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RevisionsListScreen(
    onBack: () -> Unit,
    onOpenEditor: (String) -> Unit,
    viewModel: RevisionsListViewModel = hiltViewModel(),
) {
    val state by viewModel.store.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        SheetTopBar(title = "مقالات تنتظر التعديل", onClose = onBack)

        PullToRefreshBox(
            isRefreshing = state.isLoading && state.hasLoaded,
            onRefresh = viewModel::refresh,
            modifier = Modifier.fillMaxSize(),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item { RevisionsHeader() }

                when {
                    state.isLoading && !state.hasLoaded -> item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 40.dp),
                            contentAlignment = Alignment.Center,
                        ) {
                            CircularProgressIndicator(color = RevisionAccent, strokeWidth = 2.5.dp)
                        }
                    }
                    state.items.isEmpty() -> item {
                        RevisionsEmptyState(errorText = state.lastError)
                    }
                    else -> items(state.items, key = { it.id }) { item ->
                        RevisionCard(item = item, onClick = { onOpenEditor(item.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun RevisionsHeader() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(CircleShape)
                .background(RevisionAccent.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.EditNote,
                contentDescription = null,
                tint = RevisionAccent,
                modifier = Modifier.size(34.dp),
            )
        }
        Text(
            text = "ملاحظات هيئة التحرير",
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = "اضغط أي مقال لقراءة الملاحظة وإعادة الإرسال",
            fontSize = 13.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun RevisionsEmptyState(errorText: String?) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 40.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = SabqTheme.colors.leaf,
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = "لا توجد مقالات تنتظر تعديلك",
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.ink,
        )
        Text(
            text = "ستظهر هنا أي مقالات يطلب فريق التحرير تعديلها.",
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
        )
        errorText?.let {
            Text(
                text = it,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.coral,
            )
        }
    }
}

@Composable
private fun RevisionCard(item: ApiRevisionSummary, onClick: () -> Unit) {
    SurfaceCard(accent = RevisionAccent) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clickable { onClick() },
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                RevisionThumb(imageUrl = item.imageUrl)
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = if (item.isOpinion) Icons.Filled.FormatQuote else Icons.Outlined.Article,
                            contentDescription = null,
                            tint = RevisionAccent,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = if (item.isOpinion) "مقال رأي" else "خبر",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = RevisionAccent,
                        )
                    }
                    Text(
                        text = item.title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Bold,
                        color = SabqTheme.colors.ink,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                    formatRelativeDateAr(item.requestedAt).takeIf { it.isNotBlank() }?.let { when_ ->
                        Text(
                            text = when_,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.tertiaryInk,
                        )
                    }
                }
            }

            if (item.reviewNotes.isNotBlank()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(RevisionAccent.copy(alpha = 0.10f))
                        .padding(12.dp),
                    verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Filled.FormatQuote,
                        contentDescription = null,
                        tint = RevisionAccent,
                        modifier = Modifier.size(13.dp),
                    )
                    Text(
                        text = item.reviewNotes,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.ink,
                        maxLines = 4,
                        overflow = TextOverflow.Ellipsis,
                        lineHeight = 19.sp,
                    )
                }
            }

            Row(
                modifier = Modifier.align(Alignment.End),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = "افتح وعدّل",
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    color = SabqTheme.colors.primaryEnd,
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(14.dp),
                )
            }
        }
    }
}

@Composable
private fun RevisionThumb(imageUrl: String?) {
    Box(
        modifier = Modifier
            .size(84.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.linearGradient(
                    listOf(
                        RevisionAccent.copy(alpha = 0.20f),
                        RevisionAccent.copy(alpha = 0.05f),
                    ),
                ),
            ),
        contentAlignment = Alignment.Center,
    ) {
        if (!imageUrl.isNullOrBlank()) {
            SubcomposeAsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
                loading = {
                    Box(modifier = Modifier.fillMaxSize().background(SabqTheme.colors.paleFill))
                },
            )
        } else {
            Icon(
                imageVector = Icons.Outlined.Description,
                contentDescription = null,
                tint = RevisionAccent.copy(alpha = 0.55f),
                modifier = Modifier.size(22.dp),
            )
        }
    }
}
