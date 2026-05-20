package com.sabq.smart.feature.article

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FormatQuote
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.PersonAddAlt1
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.TextFields
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material.icons.outlined.AutoStories
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.sabq.smart.data.Article
import com.sabq.smart.data.BookmarksStore
import com.sabq.smart.data.LikesStore
import com.sabq.smart.data.BehaviorTracker
import com.sabq.smart.data.Comment
import com.sabq.smart.feature.auth.AuthViewModel
import com.sabq.smart.feature.settings.SettingsViewModel
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.text.ClickableText
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.filled.Collections
import android.net.Uri
import com.sabq.smart.util.InlineRun
import com.sabq.smart.util.GalleryImage
import com.sabq.smart.util.VideoProvider
import com.sabq.smart.ui.components.BreakingPill
import com.sabq.smart.ui.components.CommentComposer
import com.sabq.smart.ui.components.CommentRow
import com.sabq.smart.ui.components.FocalCachedAsyncImage
import androidx.compose.ui.layout.ContentScale
import coil.compose.SubcomposeAsyncImage
import coil.request.ImageRequest
import androidx.compose.ui.platform.LocalContext
import com.sabq.smart.ui.components.SmallActionButton
import com.sabq.smart.ui.components.StatusChip
import com.sabq.smart.ui.theme.SabqTheme
import com.sabq.smart.ui.theme.IbmPlexSansArabic
import com.sabq.smart.util.BlockNode
import com.sabq.smart.util.HtmlSimpleParser
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Article detail screen — 1:1 port of iOS `ArticleDetailView.swift`.
 *
 * Vertical layout order (matches iOS `articleDetailContent`,
 * `HomeFeedView.swift` siblings ignored):
 *   1. Hero (natural aspect, no parallax, AI badge overlay)
 *   2. Labels row     (category + breaking + Passport)
 *   3. Title
 *   4. Meta row       (author · readingTime · dateFormatted)
 *   5. Smart Summary  (sparkles + 3-line collapse + listen pill)
 *   6. Divider
 *   7. Body           (HtmlSimpleParser → BlockNode renderer)
 *   8. Action bar     (مشاركة / حفظ / Aa / قراءة)
 *   9. Tags section
 *   10. Related section (max 5)
 *   11. Comments section
 *
 * Overlays:
 *   - Top reading-progress bar (brand gradient, 4 dp, top edge)
 *   - Top toolbar: back chevron (top-end) + bookmark + share
 */
@Composable
fun ArticleDetailScreen(
    slug: String,
    onBack: () -> Unit,
    onLoginRequested: () -> Unit = {},
    onTagClick: (String) -> Unit = {},
    onAuthorClick: (String) -> Unit = {},
    onRelatedClick: (Article) -> Unit = {},
    viewModel: ArticleDetailViewModel = hiltViewModel(),
    commentsViewModel: CommentsViewModel = hiltViewModel(),
    authViewModel: AuthViewModel = hiltViewModel(),
    settingsViewModel: SettingsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.state.collectAsStateWithLifecycle()
    val settings by settingsViewModel.settings.collectAsStateWithLifecycle()

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
                related = s.related,
                fontSize = settings.articleFontSize,
                lineSpacing = settings.articleLineSpacing,
                useSerif = settings.articleUseReaderFont,
                settingsViewModel = settingsViewModel,
                commentsViewModel = commentsViewModel,
                authViewModel = authViewModel,
                onLoginRequested = onLoginRequested,
                onBack = onBack,
                onTagClick = onTagClick,
                onAuthorClick = onAuthorClick,
                onRelatedClick = onRelatedClick,
            )
        }
    }
}

@Composable
private fun ArticleBody(
    article: Article,
    related: List<Article>,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
    settingsViewModel: SettingsViewModel,
    commentsViewModel: CommentsViewModel,
    authViewModel: AuthViewModel,
    onLoginRequested: () -> Unit,
    onBack: () -> Unit,
    onTagClick: (String) -> Unit,
    onAuthorClick: (String) -> Unit,
    onRelatedClick: (Article) -> Unit,
) {
    android.util.Log.d("ArticleBody", "Article: ${article.title}, tags: ${article.tags}, related size: ${related.size}")
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    // Resolve dependencies via EntryPoint
    val entryPoint = remember {
        EntryPointAccessors.fromApplication(
            context.applicationContext,
            ArticleDetailEntryPoint::class.java,
        )
    }

    val bookmarks = remember { entryPoint.bookmarksStore() }
    val bookmarkedIds by bookmarks.ids.collectAsState(initial = emptySet())
    val isBookmarked = article.bookmarkKey in bookmarkedIds

    val likesStore = remember { entryPoint.likesStore() }
    val likedIds by likesStore.likedIds.collectAsState(initial = emptySet())
    val isLiked = article.id in likedIds
    var isLikeBusy by remember { mutableStateOf(false) }

    val behaviorTracker = remember { entryPoint.behaviorTracker() }

    // Behavior tracking session lifecycle
    DisposableEffect(article.id) {
        behaviorTracker.startSession(article.id)
        onDispose {
            behaviorTracker.endSession()
        }
    }

    // Scroll progress collection to track max scroll percentage
    LaunchedEffect(listState) {
        snapshotFlow {
            val info = listState.layoutInfo
            val total = info.totalItemsCount
            if (total <= 0) 0f
            else {
                val last = info.visibleItemsInfo.lastOrNull()?.index ?: 0
                (last.toFloat() / (total - 1).coerceAtLeast(1).toFloat()).coerceIn(0f, 1f)
            }
        }.collect { progress ->
            behaviorTracker.updateScroll(progress.toDouble())
        }
    }

    // Reconcile likes on entry/id change
    LaunchedEffect(article.id) {
        likesStore.reconcile(article.id)
    }

    val commentsState by commentsViewModel.state.collectAsStateWithLifecycle()
    val currentUser by authViewModel.currentUser.collectAsStateWithLifecycle()
    val errorTint = SabqTheme.colors.coral
    var feedback by remember { mutableStateOf<CommentFeedback?>(null) }

    // Auto-dismiss the feedback banner after 4.5 s (matches iOS).
    LaunchedEffect(feedback) {
        if (feedback != null) {
            delay(4_500)
            feedback = null
        }
    }

    // Parse body once. iOS caches the parsed blocks per-article in
    // `cachedBlocks` for the same reason — re-parsing on every recompose
    // stalls scroll on long articles.
    val blocks = remember(article.id, article.body) {
        HtmlSimpleParser.parse(article.body)
    }

    // Reader controls — `fontSize`, `lineSpacing`, `useSerif` arrive
    // pre-resolved from the parent (SettingsViewModel.settings flow,
    // backed by DataStore). The ReaderControlsSheet writes back via the
    // injected `settingsViewModel`, so a slider tick here also persists
    // for the next article.
    var isFocusMode by remember { mutableStateOf(false) }
    var isReaderSheetOpen by remember { mutableStateOf(false) }
    var isPassportSheetOpen by remember { mutableStateOf(false) }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = 60.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            // 1. Hero — full-width, NATURAL aspect ratio (no fixed
            // height, no focal-point crop). Matches the Capacitor web
            // app the user reads on Play Store today and the iOS
            // ArticleDetailView. Don't reintroduce a fixed 300dp box
            // here — portrait photos lose the subject's face.
            item { HeroImage(article = article) }

            // Everything else lives in the 20 dp horizontal column.
            // We feed each row as its own item so the lazy column can
            // recycle them cleanly, but each shares the same horizontal
            // padding.

            // 2. Labels row (under the hero, NOT overlaid).
            if (!isFocusMode) {
                item { LabelsRow(article = article, onPassportClick = { isPassportSheetOpen = true }) }
            }

            // 3. Title.
            item { ArticleTitle(article = article, fontSize = fontSize, useSerif = useSerif) }

            // 4. Meta row (author · reading time · date).
            item { MetaRow(article = article, onAuthorClick = onAuthorClick) }

            // 5. Smart Summary Card.
            if (!isFocusMode) {
                item { SmartSummaryCard(article = article) }
            }

            // 6. Divider.
            item {
                HorizontalDivider(
                    color = SabqTheme.colors.outline.copy(alpha = 0.6f),
                    modifier = Modifier.padding(horizontal = 20.dp),
                )
            }

            // 7. Article body.
            items(blocks) { block ->
                BodyBlock(
                    block = block,
                    fontSize = fontSize,
                    lineSpacing = lineSpacing,
                    useSerif = useSerif,
                )
            }
            // Empty-body fallback.
            if (blocks.isEmpty() && article.body.isNullOrBlank()) {
                item {
                    Text(
                        text = "النص الكامل للمقال غير متوفر حالياً.",
                        style = SabqTheme.typography.meta,
                        color = SabqTheme.colors.tertiaryInk,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    )
                }
            }

            // 8. Action bar (مشاركة / حفظ / Aa / قراءة) — extra top
            // padding per iOS (`.padding(.top, 16)` on top of the
            // 18 spacing).
            item {
                Spacer(modifier = Modifier.height(0.dp))
                ActionBar(
                    isBookmarked = isBookmarked,
                    isFocusMode = isFocusMode,
                    onShare = { shareArticle(context, article) },
                    onBookmark = { scope.launch { bookmarks.toggle(article.bookmarkKey) } },
                    onFormat = { isReaderSheetOpen = true },
                    onFocus = { isFocusMode = !isFocusMode },
                )
            }

            // 9. Tags.
            if (!isFocusMode && article.tags.isNotEmpty()) {
                item { TagsSection(tags = article.tags, onTagClick = onTagClick) }
            }

            // 10. Related articles (max 5).
            if (!isFocusMode && related.isNotEmpty()) {
                item { RelatedSection(related = related, onClick = onRelatedClick) }
            }

            // 11. Comments.
            if (!isFocusMode) {
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

        // OVERLAYS

        // Reading-progress bar — top edge, brand gradient, hidden when
        // we haven't scrolled. iOS at `ArticleDetailView.swift:302`.
        ReadingProgressBar(state = listState)

        // Top toolbar: back (top-end / RTL right) + bookmark + share + like.
        TopToolbar(
            isLiked = isLiked,
            isBookmarked = isBookmarked,
            isLikeBusy = isLikeBusy,
            onBack = onBack,
            onLike = {
                if (!isLikeBusy) {
                    isLikeBusy = true
                    scope.launch {
                        likesStore.toggle(article.id)
                        isLikeBusy = false
                    }
                }
            },
            onBookmark = { scope.launch { bookmarks.toggle(article.bookmarkKey) } },
            onShare = { shareArticle(context, article) },
        )

        // Bottom sheet for reader prefs (Aa). The sheet itself reads
        // and writes the same SettingsViewModel that drives the body
        // text above, so any slider tick reflows the article live.
        if (isReaderSheetOpen) {
            ReaderControlsSheet(
                onDismiss = { isReaderSheetOpen = false },
                settingsViewModel = settingsViewModel,
            )
        }

        // Content Passport sheet — opens when the user taps the
        // "موثَّق" pill in the labels row. iOS counterpart:
        // `PassportSheetView` opened via `PassportInlineBadge`.
        if (isPassportSheetOpen) {
            article.slug?.let { slug ->
                com.sabq.smart.feature.passport.PassportSheet(
                    slug = slug,
                    onDismiss = { isPassportSheetOpen = false },
                )
            }
        }
    }
}

// ============================================================
// HERO
// ============================================================

@Composable
private fun HeroImage(article: Article) {
    // Natural aspect ratio: image fills width, height follows the
    // intrinsic w/h of the photo. No fixed-height crop — matches the
    // Capacitor web app the user reads on Play Store today and the
    // iOS ArticleDetailView. Tall portraits keep the face visible.
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(SabqTheme.colors.paleFill),
    ) {
        if (!article.imageUrl.isNullOrBlank()) {
            val context = LocalContext.current
            val request = ImageRequest.Builder(context)
                .data(article.imageUrl)
                .crossfade(250)
                .build()
            SubcomposeAsyncImage(
                model = request,
                contentDescription = null,
                modifier = Modifier.fillMaxWidth(),
                contentScale = ContentScale.FillWidth,
                loading = {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .background(SabqTheme.colors.paleFill),
                    )
                },
                error = {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(220.dp)
                            .background(SabqTheme.colors.paleFill),
                    )
                },
            )
        } else {
            // Category-tinted fallback hero — fixed height because we
            // have no image to derive an aspect ratio from.
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(220.dp)
                    .background(
                        Brush.linearGradient(
                            colors = listOf(
                                article.category.tint().copy(alpha = 0.20f),
                                article.category.tint().copy(alpha = 0.05f),
                            ),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Outlined.AutoStories,
                    contentDescription = null,
                    tint = article.category.tint().copy(alpha = 0.30f),
                    modifier = Modifier.size(72.dp),
                )
            }
        }

        // AI image badge — top-leading corner (visual top-right in RTL).
        if (article.isAiGeneratedImage) {
            AiImageBadge(
                model = article.aiImageModel,
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .statusBarsPadding()
                    .padding(12.dp),
            )
        }
    }
}

@Composable
private fun AiImageBadge(model: String?, modifier: Modifier = Modifier) {
    val shape = CircleShape
    Row(
        modifier = modifier
            .clip(shape)
            .background(Color.Black.copy(alpha = 0.55f), shape)
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = if (model.isNullOrBlank()) "صورة AI" else "صورة AI · $model",
            fontSize = 10.sp,
            fontWeight = FontWeight.SemiBold,
            color = Color.White,
            maxLines = 1,
        )
    }
}

// ============================================================
// LABELS ROW (below hero, not on it)
// ============================================================

@Composable
private fun LabelsRow(article: Article, onPassportClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (article.isOpinion) {
            OpinionMarkerPill()
        } else {
            StatusChip(title = article.category.title, tint = article.category.tint())
            if (article.isBreaking) BreakingPill()
        }
        // Always-visible "موثَّق" pill — tap opens the Content Passport
        // sheet. Mirrors iOS `PassportInlineBadge` in `labelsRow`.
        if (!article.slug.isNullOrBlank()) {
            com.sabq.smart.ui.components.PassportInlineBadge(onClick = onPassportClick)
        }
    }
}

// ============================================================
// TITLE
// ============================================================

@Composable
private fun ArticleTitle(article: Article, fontSize: Float, useSerif: Boolean) {
    Text(
        text = article.title,
        fontSize = (fontSize + 8).sp,
        fontWeight = FontWeight.Black,
        color = SabqTheme.colors.ink,
        fontFamily = if (useSerif) FontFamily.Serif else IbmPlexSansArabic,
        lineHeight = (fontSize + 8 + 4).sp,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
    )
}

// ============================================================
// META ROW
// ============================================================

@Composable
private fun MetaRow(article: Article, onAuthorClick: (String) -> Unit) {
    if (article.isOpinion) {
        OpinionMetaRow(article = article, onAuthorClick = onAuthorClick)
    } else {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
                Text(
                    text = name,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable { onAuthorClick(name) }
                )
                MiddleDot()
            }
            Text(
                text = article.readingTime,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
                maxLines = 1,
            )
            MiddleDot()
            Text(
                text = article.dateFormatted,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.tertiaryInk,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun MiddleDot() {
    Text(
        text = "·",
        fontSize = 11.sp,
        color = SabqTheme.colors.tertiaryInk.copy(alpha = 0.6f),
    )
}

// ============================================================
// SMART SUMMARY CARD
// ============================================================

@Composable
private fun SmartSummaryCard(article: Article) {
    val rawBody = (article.aiSummary?.takeIf { it.isNotBlank() } ?: article.excerpt).trim()
    // Defensive: some editors copy-paste the headline into the
    // `excerpt` field. iOS hides the smart-summary card in that case
    // so the reader doesn't see "الموجز الذكي: <title>" right under
    // the actual title. Mirror that behaviour here.
    val title = article.title.trim()
    val body = if (rawBody.isNotEmpty() && rawBody == title) "" else rawBody
    if (body.isEmpty()) return

    var isExpanded by remember(article.id) { mutableStateOf(false) }
    val needsToggle = body.length > 120
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), shape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.04f), shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.primaryEnd.copy(alpha = 0.18f), shape = shape)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.AutoAwesome,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd,
                modifier = Modifier.size(12.dp),
            )
            Text(
                text = "الموجز الذكي",
                fontSize = 13.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Spacer(modifier = Modifier.weight(1f))
            // Listen pill — visible whenever there's a slug. Tap is a
            // no-op until Stage 2 wires the ExoPlayer + /summary-audio
            // streaming endpoint.
            if (!article.slug.isNullOrBlank()) {
                ListenPillStub()
            }
        }

        Text(
            text = body,
            fontSize = 14.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.secondaryInk,
            lineHeight = 22.sp,
            maxLines = if (isExpanded) Int.MAX_VALUE else 3,
            overflow = TextOverflow.Ellipsis,
        )

        if (needsToggle) {
            Row(
                modifier = Modifier.clickable { isExpanded = !isExpanded },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = if (isExpanded) "طيّ" else "عرض المزيد",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                )
                Icon(
                    imageVector = if (isExpanded) Icons.AutoMirrored.Filled.KeyboardArrowLeft
                        else Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(10.dp),
                )
            }
        }
    }
}

@Composable
private fun ListenPillStub() {
    val shape = CircleShape
    Row(
        modifier = Modifier
            .clip(shape)
            .background(SabqTheme.colors.primaryEnd, shape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = Color.White,
            modifier = Modifier.size(11.dp),
        )
        Text(
            text = "استماع",
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            color = Color.White,
        )
    }
}

// ============================================================
// BODY BLOCKS
// ============================================================

@Composable
fun rememberAnnotatedString(
    runs: List<InlineRun>,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
): AnnotatedString {
    val linkColor = SabqTheme.colors.primaryEnd
    return remember(runs, fontSize, lineSpacing, useSerif, linkColor) {
        buildAnnotatedString {
            runs.forEach { run ->
                val start = length
                append(run.text)
                val end = length

                var style = SpanStyle()
                if (run.bold) {
                    style = style.copy(fontWeight = FontWeight.Bold)
                }
                if (run.italic) {
                    style = style.copy(fontStyle = FontStyle.Italic)
                }
                if (run.underline || run.strikethrough) {
                    style = style.copy(
                        textDecoration = TextDecoration.combine(
                            listOfNotNull(
                                if (run.underline) TextDecoration.Underline else null,
                                if (run.strikethrough) TextDecoration.LineThrough else null
                            )
                        )
                    )
                }
                if (run.colorHex != null) {
                    try {
                        val color = Color(android.graphics.Color.parseColor(if (run.colorHex!!.startsWith("#")) run.colorHex else "#${run.colorHex}"))
                        style = style.copy(color = color)
                    } catch (e: Exception) {
                        // ignore
                    }
                } else if (run.link != null) {
                    style = style.copy(color = linkColor)
                    addStringAnnotation(
                        tag = "URL",
                        annotation = run.link!!,
                        start = start,
                        end = end
                    )
                }

                addStyle(style, start, end)
            }
        }
    }
}

@Composable
private fun RichText(
    runs: List<InlineRun>,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
    modifier: Modifier = Modifier,
    color: Color = SabqTheme.colors.ink.copy(alpha = 0.92f),
    fontWeight: FontWeight = FontWeight.Normal,
    fontStyle: FontStyle = FontStyle.Normal,
    textAlign: TextAlign = TextAlign.Start,
) {
    val context = LocalContext.current
    val annotatedString = rememberAnnotatedString(runs, fontSize, lineSpacing, useSerif)

    ClickableText(
        text = annotatedString,
        modifier = modifier,
        style = TextStyle(
            fontSize = fontSize.sp,
            lineHeight = (fontSize + lineSpacing + 3).sp,
            color = color,
            fontFamily = if (useSerif) FontFamily.Serif else FontFamily.Default,
            fontWeight = fontWeight,
            fontStyle = fontStyle,
            textAlign = textAlign,
        ),
        onClick = { offset ->
            annotatedString.getStringAnnotations(tag = "URL", start = offset, end = offset)
                .firstOrNull()?.let { annotation ->
                    try {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(annotation.item))
                        context.startActivity(intent)
                    } catch (e: Exception) {
                        // ignore
                    }
                }
        }
    )
}

@Composable
private fun BodyBlock(
    block: BlockNode,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
    ) {
        when (block) {
            is BlockNode.Heading -> {
                val size = when (block.level) {
                    1 -> fontSize + 9
                    2 -> fontSize + 6
                    3 -> fontSize + 4
                    4 -> fontSize + 2
                    else -> fontSize + 1
                }
                RichText(
                    runs = block.runs,
                    fontSize = size,
                    lineSpacing = lineSpacing,
                    useSerif = useSerif,
                    fontWeight = FontWeight.Black,
                    color = SabqTheme.colors.ink,
                    modifier = Modifier.padding(top = 6.dp)
                )
            }
            is BlockNode.Paragraph -> {
                RichText(
                    runs = block.runs,
                    fontSize = fontSize,
                    lineSpacing = lineSpacing,
                    useSerif = useSerif,
                    color = SabqTheme.colors.ink.copy(alpha = 0.92f)
                )
            }
            is BlockNode.ListBlock -> {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    block.items.forEachIndexed { idx, runs ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Text(
                                text = if (block.ordered) "${idx + 1}." else "•",
                                fontSize = fontSize.sp,
                                fontWeight = FontWeight.Bold,
                                color = SabqTheme.colors.primaryEnd,
                                modifier = Modifier.width(18.dp),
                                textAlign = TextAlign.End,
                            )
                            RichText(
                                runs = runs,
                                fontSize = fontSize,
                                lineSpacing = lineSpacing,
                                useSerif = useSerif,
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            is BlockNode.Blockquote -> {
                QuoteBlock(
                    runs = block.runs,
                    fontSize = fontSize,
                    lineSpacing = lineSpacing,
                    useSerif = useSerif,
                )
            }
            is BlockNode.Image -> {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .aspectRatio(16f / 10f)
                            .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                            .background(SabqTheme.colors.paleFill),
                    ) {
                        FocalCachedAsyncImage(
                            url = block.url,
                            focalPoint = null,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                    if (!block.caption.isNullOrEmpty()) {
                        Text(
                            text = block.caption,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium,
                            color = SabqTheme.colors.tertiaryInk,
                            lineHeight = 16.sp,
                        )
                    }
                }
            }
            is BlockNode.ImageGallery -> {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Collections,
                                contentDescription = null,
                                tint = SabqTheme.colors.primaryEnd,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "ألبوم صور",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                color = SabqTheme.colors.primaryEnd
                            )
                        }
                        Text(
                            text = "${block.images.size} صورة",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = SabqTheme.colors.tertiaryInk
                        )
                    }
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        block.images.forEach { img ->
                            Column(
                                modifier = Modifier.width(260.dp),
                                verticalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                Box(
                                    modifier = Modifier
                                        .size(260.dp)
                                        .clip(RoundedCornerShape(16.dp))
                                        .background(SabqTheme.colors.paleFill)
                                ) {
                                    FocalCachedAsyncImage(
                                        url = img.url,
                                        focalPoint = null,
                                        modifier = Modifier.fillMaxSize()
                                    )
                                }
                                if (!img.caption.isNullOrEmpty()) {
                                    Text(
                                        text = img.caption,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        color = SabqTheme.colors.tertiaryInk,
                                        maxLines = 2,
                                        overflow = TextOverflow.Ellipsis,
                                        lineHeight = 15.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }
            is BlockNode.TwitterEmbed -> {
                val context = LocalContext.current
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(SabqTheme.dimens.tileRadius))
                        .border(
                            width = 1.dp,
                            color = SabqTheme.colors.outline.copy(alpha = 0.5f),
                            shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
                        )
                        .clickable {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(block.tweetUrl))
                                context.startActivity(intent)
                            } catch (e: Exception) {}
                        }
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "𝕏",
                            fontSize = 18.sp,
                            fontWeight = FontWeight.Black,
                            color = SabqTheme.colors.ink
                        )
                        Text(
                            text = "منصة إكس (تويتر سابقاً)",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = SabqTheme.colors.ink
                        )
                    }
                    Text(
                        text = block.tweetUrl,
                        fontSize = 11.sp,
                        color = Color(0xFF007AFF),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(
                        text = "انقر لعرض التغريدة الكاملة",
                        fontSize = 11.sp,
                        color = SabqTheme.colors.tertiaryInk
                    )
                }
            }
            is BlockNode.VideoEmbed -> {
                val context = LocalContext.current
                val openUrl = block.sourceUrl ?: block.embedUrl
                val providerColor = when (block.provider) {
                    VideoProvider.YOUTUBE -> Color(0xFFEC3333)
                    VideoProvider.DAILYMOTION -> Color(0xFF00ADEE)
                    VideoProvider.OTHER -> SabqTheme.colors.secondaryInk
                }
                val providerName = when (block.provider) {
                    VideoProvider.YOUTUBE -> "يوتيوب"
                    VideoProvider.DAILYMOTION -> "Dailymotion"
                    VideoProvider.OTHER -> "فيديو"
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(18.dp))
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    providerColor.copy(alpha = 0.20f),
                                    providerColor.copy(alpha = 0.05f)
                                )
                            )
                        )
                        .border(
                            width = 0.5.dp,
                            color = providerColor.copy(alpha = 0.25f),
                            shape = RoundedCornerShape(18.dp)
                        )
                        .clickable {
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(openUrl))
                                context.startActivity(intent)
                            } catch (e: Exception) {}
                        },
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(60.dp)
                                .clip(CircleShape)
                                .background(Color.White),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Filled.PlayArrow,
                                contentDescription = null,
                                tint = providerColor,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        Box(
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(providerColor)
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = providerName,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                color = Color.White
                            )
                        }
                    }
                }
            }
            is BlockNode.Divider -> {
                HorizontalDivider(
                    color = SabqTheme.colors.outline.copy(alpha = 0.5f)
                )
            }
        }
    }
}

@Composable
private fun QuoteBlock(
    runs: List<InlineRun>,
    fontSize: Float,
    lineSpacing: Float,
    useSerif: Boolean,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), shape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.04f), shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.primaryEnd.copy(alpha = 0.18f), shape = shape)
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(((fontSize + 4) * 1.6f).dp.coerceAtLeast(40.dp))
                .clip(RoundedCornerShape(3.dp))
                .background(SabqTheme.colors.primaryEnd),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.FormatQuote,
                contentDescription = null,
                tint = SabqTheme.colors.primaryEnd.copy(alpha = 0.55f),
                modifier = Modifier.size(18.dp),
            )
            RichText(
                runs = runs,
                fontSize = fontSize + 1,
                lineSpacing = lineSpacing + 1,
                useSerif = useSerif,
                fontWeight = FontWeight.Medium,
                fontStyle = FontStyle.Italic,
                color = SabqTheme.colors.ink.copy(alpha = 0.88f)
            )
        }
    }
}

// ============================================================
// ACTION BAR
// ============================================================

@Composable
private fun ActionBar(
    isBookmarked: Boolean,
    isFocusMode: Boolean,
    onShare: () -> Unit,
    onBookmark: () -> Unit,
    onFormat: () -> Unit,
    onFocus: () -> Unit,
) {
    val shape = RoundedCornerShape(SabqTheme.dimens.tileRadius)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .clip(shape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), shape)
            .background(SabqTheme.colors.paleFill.copy(alpha = 0.4f), shape)
            .border(width = 0.5.dp, color = SabqTheme.colors.outline.copy(alpha = 0.4f), shape = shape)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        ActionCell(
            icon = Icons.Filled.Share,
            label = "مشاركة",
            isActive = false,
            modifier = Modifier.weight(1f),
            onClick = onShare,
        )
        VerticalSeparator()
        ActionCell(
            icon = if (isBookmarked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
            label = if (isBookmarked) "تم الحفظ" else "حفظ",
            isActive = isBookmarked,
            modifier = Modifier.weight(1f),
            onClick = onBookmark,
        )
        VerticalSeparator()
        ActionCell(
            icon = Icons.Filled.TextFields,
            label = "تنسيق",
            isActive = false,
            modifier = Modifier.weight(1f),
            onClick = onFormat,
        )
        VerticalSeparator()
        ActionCell(
            icon = Icons.Outlined.AutoStories,
            label = if (isFocusMode) "خروج" else "قراءة",
            isActive = isFocusMode,
            modifier = Modifier.weight(1f),
            onClick = onFocus,
        )
    }
}

@Composable
private fun ActionCell(
    icon: ImageVector,
    label: String,
    isActive: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier
            .clickable { onClick() }
            .padding(vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            tint = if (isActive) SabqTheme.colors.primaryEnd else SabqTheme.colors.secondaryInk,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = if (isActive) SabqTheme.colors.primaryEnd else SabqTheme.colors.secondaryInk,
        )
    }
}

@Composable
private fun VerticalSeparator() {
    Box(
        modifier = Modifier
            .width(0.5.dp)
            .height(28.dp)
            .background(SabqTheme.colors.outline.copy(alpha = 0.5f)),
    )
}

// ============================================================
// TAGS
// ============================================================

@Composable
private fun TagsSection(tags: List<String>, onTagClick: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "الوسوم",
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
            color = SabqTheme.colors.secondaryInk,
        )
        FlowChips(items = tags, onClick = onTagClick)
    }
}

/** Flowing chip layout using FlowRow to handle dynamic wrapping
 *  and match iOS tags section appearance. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FlowChips(items: List<String>, onClick: (String) -> Unit) {
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        items.forEach { tag ->
            TagChip(tag = tag, onClick = { onClick(tag) })
        }
    }
}

@Composable
private fun TagChip(tag: String, onClick: () -> Unit) {
    val shape = CircleShape
    Box(
        modifier = Modifier
            .clip(shape)
            .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.08f), shape)
            .clickable { onClick() }
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            text = tag,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.primaryStart,
        )
    }
}

// ============================================================
// RELATED ARTICLES
// ============================================================

@Composable
private fun RelatedSection(related: List<Article>, onClick: (Article) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        HorizontalDivider(color = SabqTheme.colors.outline)
        SectionHeaderRow(
            title = "أخبار ذات صلة",
            subtitle = "مقالات مشابهة قد تهمك",
            icon = Icons.Outlined.Link,
            tint = SabqTheme.colors.primaryEnd,
        )
        related.forEachIndexed { idx, item ->
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onClick(item) }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = item.title,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = SabqTheme.colors.ink,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = item.dateFormatted,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Medium,
                        color = SabqTheme.colors.tertiaryInk,
                    )
                }
                if (!item.imageUrl.isNullOrBlank()) {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(SabqTheme.colors.paleFill),
                    ) {
                        FocalCachedAsyncImage(
                            url = item.imageUrl,
                            focalPoint = item.focalPoint,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(item.category.tint().copy(alpha = 0.1f)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            imageVector = Icons.Outlined.AutoStories,
                            contentDescription = null,
                            tint = item.category.tint().copy(alpha = 0.4f),
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
            }
            if (idx != related.lastIndex) {
                HorizontalDivider(color = SabqTheme.colors.outline.copy(alpha = 0.5f))
            }
        }
    }
}

@Composable
private fun SectionHeaderRow(
    title: String,
    subtitle: String,
    icon: ImageVector,
    tint: Color,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                fontSize = 19.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = subtitle,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = SabqTheme.colors.secondaryInk,
            )
        }
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(tint.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

// ============================================================
// READING PROGRESS BAR
// ============================================================

@Composable
private fun ReadingProgressBar(state: LazyListState) {
    val progress by remember {
        derivedStateOf {
            val info = state.layoutInfo
            val total = info.totalItemsCount
            if (total <= 0) return@derivedStateOf 0f
            val last = info.visibleItemsInfo.lastOrNull()?.index ?: return@derivedStateOf 0f
            (last.toFloat() / (total - 1).coerceAtLeast(1).toFloat()).coerceIn(0f, 1f)
        }
    }
    if (progress <= 0.001f) return
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .height(4.dp),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth(progress)
                .height(4.dp)
                .background(
                    Brush.linearGradient(
                        listOf(SabqTheme.colors.primaryStart, SabqTheme.colors.primaryEnd),
                    ),
                ),
        )
    }
}

// ============================================================
// TOP TOOLBAR
// ============================================================

@Composable
private fun TopToolbar(
    isLiked: Boolean,
    isBookmarked: Boolean,
    isLikeBusy: Boolean,
    onBack: () -> Unit,
    onLike: () -> Unit,
    onBookmark: () -> Unit,
    onShare: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Trailing buttons cluster (visual LEFT in RTL by Compose
        // default) — share + bookmark + like.
        // Code order is Like -> Bookmark -> Share to match iOS visual order (Like on the right of the actions group).
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ToolbarIcon(
                icon = if (isLiked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = if (isLiked) "إلغاء الإعجاب" else "إعجاب",
                tint = if (isLiked) Color(0xFFF24D5C) else SabqTheme.colors.secondaryInk,
                onClick = if (isLikeBusy) ({}) else onLike,
            )
            ToolbarIcon(
                icon = if (isBookmarked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                contentDescription = if (isBookmarked) "إزالة الحفظ" else "حفظ",
                tint = if (isBookmarked) SabqTheme.colors.primaryEnd else SabqTheme.colors.secondaryInk,
                onClick = onBookmark,
            )
            ToolbarIcon(
                icon = Icons.Filled.Share,
                contentDescription = "مشاركة",
                tint = SabqTheme.colors.secondaryInk,
                onClick = onShare,
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        // Back chevron (visual RIGHT in RTL). Uses arrow-forward icon
        // so RTL flips it to a right-pointing chevron.
        ToolbarIcon(
            icon = Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = "رجوع",
            tint = SabqTheme.colors.ink,
            onClick = onBack,
        )
    }
}

@Composable
private fun ToolbarIcon(
    icon: ImageVector,
    contentDescription: String,
    tint: Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(SabqTheme.colors.surface.copy(alpha = 0.85f), CircleShape)
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(16.dp),
        )
    }
}

// ============================================================
// SHARE
// ============================================================

private fun shareArticle(context: android.content.Context, article: Article) {
    val url = article.articleUrl
        ?: article.slug?.let { "https://sabq.org/article/$it" }
        ?: "https://sabq.org"
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_TEXT, "${article.title}\n$url")
        putExtra(Intent.EXTRA_SUBJECT, article.title)
    }
    val chooser = Intent.createChooser(intent, "مشاركة المقال").apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    context.startActivity(chooser)
}

// ============================================================
// OPINION ATOMS
// ============================================================

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
            fontSize = 11.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 0.5.sp,
            color = SabqTheme.colors.primaryEnd,
        )
    }
}

@Composable
private fun OpinionMetaRow(article: Article, onAuthorClick: (String) -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        article.authorName?.takeIf { it.isNotBlank() }?.let { name ->
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                modifier = Modifier.clickable { onAuthorClick(name) }
            ) {
                Icon(
                    imageVector = Icons.Outlined.Edit,
                    contentDescription = null,
                    tint = SabqTheme.colors.primaryEnd,
                    modifier = Modifier.size(11.dp),
                )
                Text(
                    text = "${article.bylineLabel}:",
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                )
                Text(
                    text = name,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = SabqTheme.colors.primaryEnd,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            MiddleDot()
        }
        Text(
            text = article.readingTime,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.tertiaryInk,
            maxLines = 1,
        )
        MiddleDot()
        Text(
            text = article.dateFormatted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            color = SabqTheme.colors.tertiaryInk,
            maxLines = 1,
        )
    }
}

// ============================================================
// COMMENTS SECTION (unchanged from prior version)
// ============================================================

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
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        HorizontalDivider(color = SabqTheme.colors.outline)
        CommentsSectionHeader(state = state)
        feedback?.let { CommentFeedbackBanner(feedback = it, onDismiss = onFeedbackDismiss) }
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
        CommentsList(state = state, onReply = onReply, onRetryLoad = onRetryLoad)
    }
}

@Composable
private fun CommentsSectionHeader(state: CommentsViewModel.UiState) {
    val subtitle = when (val ls = state.loadState) {
        CommentsViewModel.LoadState.Idle,
        CommentsViewModel.LoadState.Loading -> "يتم التحميل…"
        is CommentsViewModel.LoadState.Failed -> "تعذر التحميل"
        CommentsViewModel.LoadState.Loaded ->
            if (state.totalCount == 0) "كن أول من يعلّق" else "${state.totalCount} تعليق"
    }
    SectionHeaderRow(
        title = "التعليقات",
        subtitle = subtitle,
        icon = Icons.Outlined.ChatBubbleOutline,
        tint = SabqTheme.colors.teal,
    )
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
            is CommentsViewModel.LoadState.Failed -> CommentErrorState(message = ls.message, onRetry = onRetryLoad)
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
    val cardShape = RoundedCornerShape(SabqTheme.dimens.cardRadius)
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
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
        )
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd)
                .clickable { onLoginClick() }
                .padding(horizontal = 18.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "تسجيل الدخول",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = Color.White,
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
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
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
                        .clip(CircleShape)
                        .background(SabqTheme.colors.paleFill),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Box(
                        modifier = Modifier
                            .size(width = 110.dp, height = 12.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(10.dp)
                            .clip(RoundedCornerShape(4.dp))
                            .background(SabqTheme.colors.paleFill),
                    )
                    Box(
                        modifier = Modifier
                            .size(width = 220.dp, height = 10.dp)
                            .clip(RoundedCornerShape(4.dp))
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
            fontSize = 13.sp,
            color = SabqTheme.colors.secondaryInk,
        )
        Row(
            modifier = Modifier
                .clip(CircleShape)
                .background(SabqTheme.colors.primaryEnd.copy(alpha = 0.12f))
                .clickable { onRetry() }
                .padding(horizontal = 14.dp, vertical = 6.dp),
        ) {
            Text(
                text = "إعادة المحاولة",
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                color = SabqTheme.colors.primaryEnd,
            )
        }
    }
}

@Composable
private fun CommentFeedbackBanner(feedback: CommentFeedback, onDismiss: () -> Unit) {
    val shape = RoundedCornerShape(SabqTheme.dimens.chipRadius)
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
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = SabqTheme.colors.ink,
            modifier = Modifier.weight(1f),
        )
        Icon(
            imageVector = Icons.Filled.Close,
            contentDescription = "إغلاق",
            tint = SabqTheme.colors.tertiaryInk,
            modifier = Modifier
                .size(14.dp)
                .clickable { onDismiss() },
        )
    }
}

private data class CommentFeedback(
    val icon: ImageVector,
    val tint: Color,
    val message: String,
) {
    companion object {
        fun fromOutcome(outcome: CommentsViewModel.SubmitOutcome): CommentFeedback {
            return when (outcome) {
                CommentsViewModel.SubmitOutcome.PUBLISHED -> CommentFeedback(
                    icon = Icons.Filled.Check,
                    tint = Color(0xFF2E8B57),
                    message = "تم نشر تعليقك",
                )
                CommentsViewModel.SubmitOutcome.AWAITING_REVIEW -> CommentFeedback(
                    icon = Icons.Filled.AutoAwesome,
                    tint = Color(0xFF1E88E5),
                    message = "تم استلام تعليقك — سيُراجع قبل النشر",
                )
                CommentsViewModel.SubmitOutcome.REJECTED -> CommentFeedback(
                    icon = Icons.Filled.WifiOff,
                    tint = Color(0xFFE53935),
                    message = "تعذّر قبول التعليق",
                )
            }
        }
    }
}

// ============================================================
// LOADING / ERROR
// ============================================================

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
                fontSize = 18.sp,
                fontWeight = FontWeight.Black,
                color = SabqTheme.colors.ink,
            )
            Text(
                text = message,
                fontSize = 13.sp,
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

// ============================================================
// HILT ENTRY POINT (for BookmarksStore access without a dedicated VM)
// ============================================================

@EntryPoint
@InstallIn(SingletonComponent::class)
interface ArticleDetailEntryPoint {
    fun bookmarksStore(): BookmarksStore
    fun likesStore(): LikesStore
    fun behaviorTracker(): BehaviorTracker
}
