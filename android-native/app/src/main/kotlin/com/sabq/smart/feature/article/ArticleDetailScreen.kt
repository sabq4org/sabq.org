package com.sabq.smart.feature.article

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.data.Comment
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.ui.components.BreakingPill
import com.sabq.smart.ui.components.CommentComposer
import com.sabq.smart.ui.components.CommentRow
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import com.sabq.smart.ui.components.SmallActionButton
import com.sabq.smart.ui.components.StatusChip
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.util.BlockNode
import com.sabq.smart.util.HtmlSimpleParser
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.sabq.smart.feature.article.CommentsViewModel
import com.sabq.smart.feature.article.SubmitException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.filled.PersonAddAlt1
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.HorizontalDivider

/**
 * Article detail view — mirrors iOS `ArticleDetailView.swift` for v1.
 * Hero 260dp + meta + excerpt highlight + HTML body split into block
 * nodes. Tags, related articles, share helpers, comments — all deferred
 * to later sessions.
 */
@Composable
fun ArticleDetailScreen(
    slug: String,
    onBack: () -> Unit,
    onLoginRequested: () -> Unit = {},
    viewModel: ArticleDetailViewModel = hiltViewModel(),
    commentsViewModel: CommentsViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(SabqTheme.colors.background),
    ) {
        when (val s = uiState) {
            ArticleDetailUiState.Loading -> LoadingState()
            is ArticleDetailUiState.Error -> ErrorState(message = s.message, onRetry = viewModel::retry)
            is ArticleDetailUiState.Loaded -> ArticleBody(
                article = s.article,
                commentsViewModel = commentsViewModel,
                authViewModel = authViewModel,
                onLoginRequested = onLoginRequested,
            )
        }

        // Back button — floating top-trailing (which in RTL is top-left,
        // matching iOS NavigationStack default back chevron).
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(12.dp)
                .size(40.dp)
                .clip(CircleShape)
                .background(SabqTheme.colors.surface.copy(alpha = 0.85f), CircleShape),
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                contentDescription = "رجوع",
                tint = SabqTheme.colors.ink,
            )
        }
    }
}

@Composable
private fun ArticleBody(
    article: Article,
    commentsViewModel: CommentsViewModel,
    authViewModel: AuthViewModel,
    onLoginRequested: () -> Unit,
) {
    val blocks = HtmlSimpleParser.parse(article.body)
    val commentsState by commentsViewModel.state.collectAsStateWithLifecycle()
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var feedback by remember { mutableStateOf<CommentFeedback?>(null) }
    // Capture composable theme colors outside coroutine scopes — they
    // can't be read from inside a `scope.launch` block directly.
    val errorTint = SabqTheme.colors.coral

    // Auto-dismiss the feedback banner after 4.5 s, matching iOS
    // `scheduleFeedbackDismissal`.
    LaunchedEffect(feedback) {
        if (feedback != null) {
            delay(4_500)
            feedback = null
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        // Hero image — full-width, ~260dp, with focal-point crop.
        item {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(260.dp)
                    .background(SabqTheme.colors.paleFill),
            ) {
                if (!article.imageUrl.isNullOrBlank()) {
                    FocalCachedAsyncImage(
                        url = article.imageUrl,
                        focalPoint = article.focalPoint,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                // Hero overlays:
                //   - Opinion articles get the "مقال رأي" pill instead
                //     of the category chip (matches iOS labelsRow at
                //     OpinionDetailView.swift line 365-384).
                //   - News articles get the category chip + optional
                //     breaking pill.
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (article.isOpinion) {
                        OpinionMarkerPill()
                    } else {
                        if (article.isBreaking) BreakingPill()
                        StatusChip(title = article.category.title, tint = article.category.tint())
                    }
                }
            }
        }

        // Meta row — opinion articles get the gendered byline
        // (apple-pencil icon + "<bylineLabel>: <name>" in primaryEnd),
        // news articles get the plain author/clock/calendar triplet.
        item {
            if (article.isOpinion) {
                OpinionMetaRow(article = article)
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SabqTheme.dimens.screenPaddingH),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    article.authorName?.let {
                        MetaItem(icon = Icons.Outlined.Person, text = it)
                    }
                    MetaItem(icon = Icons.Outlined.Schedule, text = article.readingTime)
                    MetaItem(icon = Icons.Outlined.CalendarMonth, text = article.dateFormatted)
                }
            }
        }

        // Title.
        item {
            Text(
                text = article.title,
                style = SabqTheme.typography.articleDetailTitle,
                color = SabqTheme.colors.ink,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SabqTheme.dimens.screenPaddingH),
            )
        }

        // Excerpt — boxed in a primary-tinted rounded rect.
        if (article.excerpt.isNotBlank()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SabqTheme.dimens.screenPaddingH)
                        .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                        .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f))
                        .padding(16.dp),
                ) {
                    Text(
                        text = article.excerpt,
                        style = SabqTheme.typography.excerpt,
                        color = SabqTheme.colors.ink,
                    )
                }
            }
        }

        // Body blocks.
        items(blocks) { block ->
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = SabqTheme.dimens.screenPaddingH),
            ) {
                when (block) {
                    is BlockNode.Paragraph -> Text(
                        text = block.text,
                        style = SabqTheme.typography.body,
                        color = SabqTheme.colors.ink,
                    )
                    is BlockNode.Heading -> Text(
                        text = block.text,
                        style = SabqTheme.typography.sectionHeader,
                        color = SabqTheme.colors.ink,
                    )
                    is BlockNode.Image -> Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 10f)
                            .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                            .background(SabqTheme.colors.paleFill),
                    ) {
                        FocalCachedAsyncImage(
                            url = block.src,
                            focalPoint = null,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    is BlockNode.Quote -> Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                            .background(SabqTheme.colors.paleFill)
                            .padding(16.dp),
                    ) {
                        Text(
                            text = "« ${block.text} »",
                            style = SabqTheme.typography.body.copy(
                                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                            ),
                            color = SabqTheme.colors.secondaryInk,
                        )
                    }
                }
            }
        }

        // Empty-body fallback (e.g. if the detail endpoint returned
        // only metadata): show a hint instead of a blank screen.
        if (blocks.isEmpty() && article.body.isNullOrBlank()) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = SabqTheme.dimens.screenPaddingH, vertical = 24.dp),
                ) {
                    Text(
                        text = "النص الكامل للمقال غير متوفر حالياً.",
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
            }
        }

        // ── Comments section ────────────────────────────────────────
        item {
            CommentsSection(
                state = commentsState,
                isSignedIn = currentUser != null,
                feedback = feedback,
                onFeedbackDismiss = { feedback = null },
                onComposeSubmit = { content ->
                    scope.launch {
                        try {
                            val outcome = commentsViewModel.submit(content)
                            feedback = CommentFeedback.fromOutcome(outcome)
                        } catch (e: SubmitException) {
                            if (e.unauthorized) onLoginRequested()
                            else feedback = CommentFeedback(
                                icon = Icons.Filled.WifiOff,
                                tint = errorTint,
                                message = e.message ?: "تعذر إرسال التعليق",
                            )
                        }
                    }
                },
                onCancelReply = { commentsViewModel.setReplyTarget(null) },
                onReply = { commentsViewModel.setReplyTarget(it) },
                onRetryLoad = { commentsViewModel.load() },
                onLoginClick = onLoginRequested,
            )
        }
    }
}

// MARK: - Comments section helpers

@Composable
private fun CommentsSection(
    state: CommentsViewModel.UiState,
    isSignedIn: Boolean,
    feedback: CommentFeedback?,
    onFeedbackDismiss: () -> Unit,
    onComposeSubmit: (String) -> Unit,
    onCancelReply: () -> Unit,
    onReply: (Comment) -> Unit,
    onRetryLoad: () -> Unit,
    onLoginClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = SabqTheme.dimens.screenPaddingH)
            .padding(top = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        HorizontalDivider(color = SabqTheme.colors.outline)

        CommentsSectionHeader(state = state)

        feedback?.let {
            CommentFeedbackBanner(feedback = it, onDismiss = onFeedbackDismiss)
        }

        if (isSignedIn) {
            CommentComposer(
                replyingTo = state.replyingTo,
                isSubmitting = state.isSubmitting,
                onSubmit = onComposeSubmit,
                onCancelReply = onCancelReply,
            )
        } else {
            SignInPromptCard(onLoginClick = onLoginClick)
        }

        CommentsList(
            state = state,
            onReply = onReply,
            onRetryLoad = onRetryLoad,
        )
    }
}

@Composable
private fun CommentsSectionHeader(state: CommentsViewModel.UiState) {
    val subtitle = when (val ls = state.loadState) {
        CommentsViewModel.LoadState.Idle,
        CommentsViewModel.LoadState.Loading -> "يتم التحميل…"
        is CommentsViewModel.LoadState.Failed -> "تعذر التحميل"
        CommentsViewModel.LoadState.Loaded ->
            if (state.totalCount == 0) "كن أول من يعلّق"
            else "${state.totalCount} تعليق"
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            Text(
                text = "التعليقات",
                style = SabqTheme.typography.sectionHeader.copy(fontSize = 19.sp),
                color = SabqTheme.colors.ink,
            )
            Text(
                text = subtitle,
                style = SabqTheme.typography.metaSmall.copy(fontSize = 14.sp),
                color = SabqTheme.colors.secondaryInk,
            )
        }
        // Teal-tinted square icon badge — matches iOS SectionHeader.
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(androidx.compose.foundation.shape.RoundedCornerShape(13.dp))
                .background(SabqTheme.colors.teal.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.ChatBubbleOutline,
                contentDescription = null,
                tint = SabqTheme.colors.teal,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun CommentsList(
    state: CommentsViewModel.UiState,
    onReply: (Comment) -> Unit,
    onRetryLoad: () -> Unit,
) {
    if (state.comments.isEmpty()) {
        when (val ls = state.loadState) {
            CommentsViewModel.LoadState.Idle,
            CommentsViewModel.LoadState.Loading -> CommentSkeletonList()
            is CommentsViewModel.LoadState.Failed -> CommentErrorState(
                message = ls.message,
                onRetry = onRetryLoad,
            )
            CommentsViewModel.LoadState.Loaded -> CommentEmptyState()
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            state.comments.forEach { comment ->
                CommentRow(comment = comment) { tapped -> onReply(tapped) }
                HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.4f))
            }
        }
    }
}

@Composable
private fun SignInPromptCard(onLoginClick: () -> Unit) {
    val cardShape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.cardRadius)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(cardShape)
            .background(SabqTheme.colors.paleFill, cardShape)
            .padding(vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PersonAddAlt1,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(26.dp),
        )
        Text(
            text = "سجّل دخولك لإضافة تعليق",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 14.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
        )
        Row(
            modifier = Modifier
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onLoginClick() }
                .padding(horizontal = 18.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "تسجيل الدخول",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    color = androidx.compose.ui.graphics.Color.White,
                ),
            )
        }
    }
}

@Composable
private fun CommentEmptyState() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Outlined.ChatBubbleOutline,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = "لا توجد تعليقات بعد",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
    }
}

@Composable
private fun CommentSkeletonList() {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        repeat(3) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(
                    modifier = Modifier
                        .size(32.dp)
                        .clip(androidx.compose.foundation.shape.CircleShape)
                        .background(SabqTheme.colors.paleFill),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(width = 110.dp, height = 12.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                    Box(
                        modifier = Modifier
                            .size(width = 220.dp, height = 10.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                }
            }
        }
    }
}

@Composable
private fun CommentErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.WifiOff,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(22.dp),
        )
        Text(
            text = message,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                color = SabqTheme.colors.secondaryInk,
            ),
        )
        Row(
            modifier = Modifier
                .clip(androidx.compose.foundation.shape.CircleShape)
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f))
                .clickable { onRetry() }
                .padding(horizontal = 14.dp, vertical = 6.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                style = SabqTheme.typography.metaSmall.copy(
                    fontSize = 13.sp,
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold,
                    color = SabqTheme.colors.primaryEnd,
                ),
            )
        }
    }
}

@Composable
private fun CommentFeedbackBanner(feedback: CommentFeedback, onDismiss: () -> Unit) {
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(SabqTheme.dimens.chipRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(feedback.tint.copy(alpha = 0.12f), shape)
            .padding(12.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(
            imageVector = feedback.icon,
            contentDescription = null,
            tint = feedback.tint,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = feedback.message,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 13.sp,
                fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
                color = SabqTheme.colors.ink,
            ),
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = androidx.compose.material.icons.Icons.Filled.Close,
            contentDescription = "إغلاق",
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier
                .size(14.dp)
                .clickable { onDismiss() },
        )
    }
}

// MARK: - Opinion-specific UI atoms (port of iOS OpinionDetailView)

/**
 * "مقال رأي" capsule pill — drops in place of the category status
 * chip on the hero overlay for opinion articles. Ports iOS
 * `labelsRow` (OpinionDetailView.swift line 365-384):
 *   - text.quote leading icon, 11sp heavy
 *   - "مقال رأي" 11sp heavy rounded with letter-spacing 0.5
 *   - primaryEnd foreground
 *   - primaryEnd 10% capsule fill + 25% stroke
 */
@Composable
private fun OpinionMarkerPill() {
    val capsule = CircleShape
    Row(
        modifier = Modifier
            .clip(capsule)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.10f), capsule)
            .border(
                BorderStroke(width = 0.5.dp, color = SabqTheme.colors.primaryEnd.copy(alpha = 0.25f)),
                capsule,
            )
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.FormatQuote,
            contentDescription = null,
            tint = SabqTheme.colors.primaryEnd,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = "مقال رأي",
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 0.5.sp,
                color = SabqTheme.colors.primaryEnd,
            ),
        )
    }
}

/**
 * Gendered byline + reading time + date row for opinion articles.
 * Ports iOS `opinionMeta` (OpinionDetailView.swift line 402-452).
 * Renders "<icon> <bylineLabel>: <author>" in primaryEnd, with
 * neutral middle-dot separators before reading time + date.
 */
@Composable
private fun OpinionMetaRow(article: com.sabq.smart.data.Article) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = SabqTheme.dimens.screenPaddingH),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
            ) {
                Icon(
                    imageVector = Icons.Outlined.Edit,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(11.dp),
                )
                Text(
                    text = "${article.bylineLabel}:",
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.primaryEnd,
                    ),
                )
                Text(
                    text = name,
                    style = SabqTheme.typography.metaSmall.copy(
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.primaryEnd,
                    ),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        Text(
            text = "·",
            style = SabqTheme.typography.metaSmall.copy(fontSize = 11.sp),
            color = SabqTheme.colors.tertiaryInk.copy(alpha = 0.6f),
        )
        Text(
            text = article.readingTime,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            ),
            maxLines = 1,
        )
        Text(
            text = "·",
            style = SabqTheme.typography.metaSmall.copy(fontSize = 11.sp),
            color = SabqTheme.colors.tertiaryInk.copy(alpha = 0.6f),
        )
        Text(
            text = article.dateFormatted,
            style = SabqTheme.typography.metaSmall.copy(
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
            ),
            maxLines = 1,
        )
    }
}

/** One-shot feedback banner state for the comments section. Cleared
 *  by user tap or after 4.5 s (LaunchedEffect in the parent). */
private data class CommentFeedback(
    val icon: androidx.compose.ui.graphics.vector.ImageVector,
    val tint: androidx.compose.ui.graphics.Color,
    val message: String,
) {
    companion object {
        fun fromOutcome(outcome: CommentsViewModel.SubmitOutcome): CommentFeedback {
            return when (outcome) {
                CommentsViewModel.SubmitOutcome.PUBLISHED -> CommentFeedback(
                    icon = androidx.compose.material.icons.Icons.Filled.Check,
                    tint = androidx.compose.ui.graphics.Color(0xFF2E8B57),
                    message = "تم نشر تعليقك",
                )
                CommentsViewModel.SubmitOutcome.AWAITING_REVIEW -> CommentFeedback(
                    icon = androidx.compose.material.icons.Icons.Filled.AutoAwesome,
                    tint = androidx.compose.ui.graphics.Color(0xFF1E88E5),
                    message = "تم استلام تعليقك — سيُراجع قبل النشر",
                )
                CommentsViewModel.SubmitOutcome.REJECTED -> CommentFeedback(
                    icon = androidx.compose.material.icons.Icons.Filled.WifiOff,
                    tint = androidx.compose.ui.graphics.Color(0xFFE53935),
                    message = "تعذّر قبول التعليق",
                )
            }
        }
    }
}

@Composable
private fun MetaItem(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier.size(13.dp),
        )
        Text(
            text = text,
            style = SabqTheme.typography.meta,
            color = SabqTheme.colors.tertiaryInk,
        )
    }
}

@Composable
private fun LoadingState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = SabqTheme.colors.primaryEnd)
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "تعذّر تحميل المقال",
                style = SabqTheme.typography.sectionHeader,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = message,
                style = SabqTheme.typography.meta,
                color = SabqTheme.colors.secondaryInk,
            )
            SmallActionButton(
                title = "إعادة المحاولة",
                icon = Icons.AutoMirrored.Filled.ArrowForward,
                tint = SabqTheme.colors.primaryEnd,
                onClick = onRetry,
            )
        }
    }
}
