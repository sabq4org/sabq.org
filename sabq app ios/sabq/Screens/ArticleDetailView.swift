import SwiftUI
import AVFoundation

struct ArticleDetailView: View {
    let article: Article
    @Environment(BookmarksStore.self) private var bookmarksStore
    @Environment(AuthStore.self) private var authStore
    @Environment(\.dismiss) private var dismiss
    @AppStorage("articleFontSize") private var fontSize: Double = 17
    @AppStorage("articleLineSpacing") private var lineSpacing: Double = 6
    @AppStorage("articleUseReaderFont") private var useReaderFont: Bool = false

    @State private var showReaderControls = false
    @State private var isFocusMode = false
    @State private var aiInsights: [String: String] = [:]

    @State private var relatedArticles: [Article] = []
    @State private var audioSummary: APIAudioSummary?
    @State private var isPlayingAudio = false
    @State private var audioPlayer: AVPlayer?
    /// Comments are owned by a per-article store. Lazily created the first time
    /// the article slug is available — `nil` for articles that have no slug
    /// (extremely rare; we hide the section in that case).
    @State private var commentsStore: CommentsStore?
    @State private var showLoginForCommentSheet = false
    @State private var commentFeedback: CommentFeedback?
    /// Collapsed (3-line) vs. expanded display state for the smart summary
    /// card. Local — resets to collapsed whenever the user opens a new
    /// article (`@State` is owned by the view instance).
    @State private var isSummaryExpanded = false
    @State private var fullArticle: Article?
    @State private var resolvedTags: [String] = []
    @State private var isExcerptExpanded = false
    @State private var shortlinkURL: URL?
    @State private var shortlinkTask: Task<URL?, Never>?
    @State private var isCopyFeedbackVisible = false
    @State private var copyFeedbackTask: Task<Void, Never>?
    @State private var scrollProgress: CGFloat = 0
    @State private var scrollOffsetY: CGFloat = 0
    @State private var heroAppeared: Bool = false
    @State private var isLiked: Bool = false
    @State private var likesCount: Int = 0
    @State private var isLikeBusy: Bool = false
    @State private var isPassportPresented = false
    /// Index of the weekly photo opened in fullscreen lightbox, or nil when
    /// no lightbox is showing. Mirrors the `selectedIndex` state on the web
    /// `WeeklyPhotosDisplay` component.
    @State private var weeklyPhotoIndex: Int? = nil
    /// Set when the slug we tried to load turns out to be an opinion
    /// (e.g. an old `sabq://article/<opinion-slug>` deep link emitted
    /// before the backend started splitting article vs opinion deep
    /// links). When non-nil, the body redirects in-place to
    /// OpinionDetailView so the user never sees the empty article
    /// skeleton.
    @State private var redirectToOpinion: OpinionArticle? = nil
    /// Cached output of `Article.displayParagraphs(for:)` keyed by body
    /// content. Recomputed only when the body text changes (i.e. when
    /// `fullArticle` lands). Without this cache, the paragraph split
    /// would run on every body re-render — including each font-size or
    /// line-spacing tick.
    @State private var cachedParagraphs: (body: String, items: [String]) = ("", [])
    /// Mirror of `cachedParagraphs` for the rich-HTML pipeline. Without this,
    /// `ArticleHtmlParser.parse(html)` ran on every body re-render (font-size
    /// slider, line-spacing change, scroll-progress tick, like-button toggle),
    /// stalling scroll on long articles. Cache key is the raw HTML string so
    /// a same-article re-render is a dictionary hit.
    @State private var cachedBlocks: (html: String, items: [ArticleBlock]) = ("", [])

    /// Hero scale combines a one-shot 1.06→1.0 "zoom-on-appear" with a
    /// rubber-band zoom when the user pulls down (scrollOffsetY < 0). Capped
    /// so violent flicks don't overscale.
    private var heroScale: CGFloat {
        let appearOffset = heroAppeared ? 0 : 0.06
        let pullZoom = min(0.18, max(0, -scrollOffsetY * 0.0015))
        return 1 + appearOffset + pullZoom
    }

    /// Hero moves slower than the surrounding content (40%) for parallax;
    /// only applied when user is scrolling AWAY from the top to avoid
    /// fighting the pull-zoom above.
    private var heroParallaxY: CGFloat {
        max(0, scrollOffsetY * 0.4)
    }

    var body: some View {
        if let opinion = redirectToOpinion {
            // Slug landed here as an article but the API returned opinion
            // content — render OpinionDetailView in place so old deep links
            // still work after the article/opinion split.
            OpinionDetailView(opinion: opinion)
        } else {
            articleDetailContent
        }
    }

    private var articleDetailContent: some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    heroImage
                        .frame(width: proxy.size.width)
                        // Phase-1 motion: zoom-on-appear (1.06→1.0 spring),
                        // pull-down rubber-band zoom, gentle parallax when
                        // scrolling away from the top. heroAppeared flips
                        // via the .onAppear at the bottom of the body.
                        .scaleEffect(heroScale, anchor: .top)
                        .offset(y: heroParallaxY)
                        .animation(.spring(response: 0.6, dampingFraction: 0.85), value: heroAppeared)
                        // Clip AFTER the transforms so the zoomed-up hero
                        // doesn't visually bleed into the labelsRow below.
                        .frame(height: 300)
                        .clipped()

                    VStack(alignment: .leading, spacing: 18) {
                        // Editorial column order (per user 2026-05-14):
                        //   labels → title → metadata → smart summary →
                        //   audio (if any) → divider → body.
                        // Focus mode collapses secondary surfaces to keep
                        // only the reading column.

                        if !isFocusMode {
                            labelsRow
                                .animatedAppear(index: 0)
                        }

                        articleTitle
                            .animatedAppear(index: 1)

                        articleMeta
                            .animatedAppear(index: 2)

                        if !isFocusMode {
                            smartSummaryCard
                                .animatedAppear(index: 3)
                        }

                        Divider().foregroundStyle(SabqTheme.outline.opacity(0.6))
                        articleBody

                        // Weekly-photos pack — only renders when the
                        // backend tagged this article as a photo
                        // collection. Shows up right after the intro
                        // paragraph, before the action bar.
                        if let photos = displayArticle.weeklyPhotos, !photos.isEmpty {
                            weeklyPhotosGallery(photos)
                        }

                        // Lower sections — body / keywords / share /
                        // related / comments — used to all share the
                        // VStack's 18 pt spacing, which made the page
                        // feel cramped right where the reader's eye is
                        // already tired. Add explicit top-padding so each
                        // section settles into its own breathing room
                        // (effective gap = 18 base + N below).
                        actionBar
                            .padding(.top, 16)

                        if !isFocusMode, !displayTags.isEmpty {
                            tagsSection
                                .padding(.top, 20)
                        }

                        if !isFocusMode, !relatedArticles.isEmpty {
                            relatedSection
                                .padding(.top, 24)
                        }

                        if !isFocusMode, let store = commentsStore {
                            commentsSection(store: store)
                                .padding(.top, 24)
                        }
                    }
                    .frame(width: max(0, proxy.size.width - 40), alignment: .leading)
                    .padding(.horizontal, 20)
                    .padding(.top, 24)
                    .padding(.bottom, 60)
                }
                .frame(width: proxy.size.width, alignment: .leading)
            }
            .onScrollGeometryChange(for: CGSize.self) { geo in
                let contentHeight = max(1, geo.contentSize.height - geo.containerSize.height)
                let progress = min(1, max(0, geo.contentOffset.y / contentHeight))
                // Packed as CGSize so a single observer feeds both the
                // reading progress bar AND the hero parallax math.
                return CGSize(width: progress, height: geo.contentOffset.y)
            } action: { _, newValue in
                scrollProgress = newValue.width
                scrollOffsetY = newValue.height
                BehaviorTracker.shared.updateScroll(percent: Double(newValue.width))
            }
            .overlay(alignment: .top) {
                readingProgressBar
            }
        }
        .background(focusBackground)
        .sabqRTL()
        .sabqScreen("ArticleDetail")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .onAppear {
            SabqAnalytics.articleView(
                id: article.id,
                title: article.title,
                category: article.category.title
            )
            // Unified behavior tracker — writes reading_history seed
            // row + bumps articles.views so iOS reads show up in the
            // home "Reading Journey" card and the trending opinion
            // ranking on equal footing with web reads.
            BehaviorTracker.shared.startSession(articleId: article.id)
            // Trigger one-shot zoom-on-appear unless we've already settled.
            if !heroAppeared {
                heroAppeared = true
            }
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    SabqHaptics.light()
                    dismiss()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 14, weight: .bold))
                    }
                    .foregroundStyle(SabqTheme.ink)
                    .padding(8)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                    )
                }
            }

            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 8) {
                    likeButton

                    Button {
                        SabqHaptics.medium()
                        bookmarksStore.toggle(article.id, article: article)
                    } label: {
                        Image(systemName: bookmarksStore.isBookmarked(article.id) ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(
                                bookmarksStore.isBookmarked(article.id) ? SabqTheme.primaryEnd : SabqTheme.secondaryInk
                            )
                            .padding(8)
                            .background(
                                Circle()
                                    .fill(.ultraThinMaterial)
                            )
                    }

                    Button {
                        SabqHaptics.light()
                        shareArticle()
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .padding(8)
                            .background(
                                Circle()
                                    .fill(.ultraThinMaterial)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task {
            updateResolvedTags(from: article)
            await loadExtras()
            await refreshLikeStatus()
        }
        .onDisappear {
            audioPlayer?.pause()
            audioPlayer = nil
            isPlayingAudio = false
            shortlinkTask?.cancel()
            copyFeedbackTask?.cancel()
            BehaviorTracker.shared.endSession()
        }
        .navigationDestination(for: Article.self) { related in
            ArticleDetailView(article: related)
        }
    }

    // MARK: - Reading Progress Bar

    private var readingProgressBar: some View {
        ProgressView(value: scrollProgress)
            .progressViewStyle(ReadingProgressStyle())
            .frame(height: 4)
            .animation(.spring(response: 0.35, dampingFraction: 0.88), value: scrollProgress)
            .opacity(scrollProgress > 0.001 ? 1 : 0)
            .animation(.easeOut(duration: 0.25), value: scrollProgress > 0.001)
    }

    private var fallbackShareURL: URL {
        if let urlStr = displayArticle.articleURL, let url = URL(string: urlStr) {
            return url
        }
        return URL(string: URLConstants.webOrigin)!
    }

    // Like button — heart that toggles a reactions row server-side.
    // Mirrors the bookmark/share affordance; surfaces likesCount as a
    // small overlay badge once we know it. Disabled while a toggle is
    // in flight so a rapid double-tap can't create duplicate rows.
    private var likeButton: some View {
        Button {
            SabqHaptics.medium()
            toggleLike()
        } label: {
            Image(systemName: isLiked ? "heart.fill" : "heart")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(isLiked ? Color(red: 0.95, green: 0.30, blue: 0.36) : SabqTheme.secondaryInk)
                .padding(8)
                .background(Circle().fill(.ultraThinMaterial))
        }
        .disabled(isLikeBusy)
        .buttonStyle(.plain)
    }

    @MainActor
    private func refreshLikeStatus() async {
        do {
            let status = try await BehaviorTracker.shared.fetchLikeStatus(articleId: article.id)
            isLiked = status.liked
            likesCount = status.count
        } catch {
            // Silent — the button defaults to unliked and re-tries
            // on next .task firing.
        }
    }

    private func toggleLike() {
        guard !isLikeBusy else { return }
        isLikeBusy = true
        let articleId = article.id
        // Optimistic flip — server response wins.
        isLiked.toggle()
        likesCount += isLiked ? 1 : -1
        if likesCount < 0 { likesCount = 0 }
        Task { @MainActor in
            defer { isLikeBusy = false }
            do {
                let result = try await BehaviorTracker.shared.toggleLike(articleId: articleId)
                isLiked = result.liked
                likesCount = result.count
            } catch {
                // Revert optimistic update on failure.
                isLiked.toggle()
                likesCount += isLiked ? 1 : -1
                if likesCount < 0 { likesCount = 0 }
            }
        }
    }

    @MainActor
    private func loadExtras() async {
        Task { try? await APIClient.shared.trackView(articleId: article.id) }

        if let slug = article.slug {
            // Create the per-article comments store on first appearance so the
            // section can show its own skeleton while the article bundle loads.
            if commentsStore == nil {
                commentsStore = CommentsStore(slug: slug)
            }
            let store = commentsStore

            async let detail = NewsService.fetchArticleDetail(slug: slug)
            async let a = NewsService.fetchAudioSummary(slug: slug)
            // Best-effort: returns sentiment + credibility hints when ai
            // processing has run for this article. Failures are silent.
            async let insights: [String: String]? = try? await APIClient.shared.fetchAIInsights(slug: slug)
            // Drive the comments store load in parallel — it manages its own
            // state, so we don't await its return value.
            if let store {
                Task { await store.load() }
            }

            let (bundle, aud, ins) = await (detail, a, insights)
            audioSummary = aud
            if let ins { aiInsights = ins }

            if let bundle {
                fullArticle = bundle.article
                relatedArticles = bundle.related
                updateResolvedTags(from: bundle.article)
            } else {
                // No news bundle for this slug. Old `sabq://article/<slug>`
                // deep links emitted before the article/opinion split point
                // here for opinion slugs too — try the opinion endpoint and
                // redirect in-place so the user never sees an empty article
                // skeleton.
                if let opinion = await NewsService.fetchOpinionDetail(slug: slug) {
                    redirectToOpinion = opinion
                    return
                }
            }

            if relatedArticles.isEmpty {
                relatedArticles = await NewsService.fetchRelated(slug: slug)
            }
        }

        _ = await prepareShareURL()
    }

    // MARK: - Hero Image

    // Hero is intentionally clean — no text/badges overlaid on the image.
    // Category chip, breaking pill, and publication metadata now live below
    // the hero between the title and excerpt (calm row, low-emphasis).
    private var heroImage: some View {
        Group {
            if let urlString = article.imageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fill) {
                    heroPlaceholder
                }
                .frame(maxWidth: .infinity, maxHeight: 300)
                .clipped()
            } else {
                heroPlaceholder
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .clipped()
        // AI-generated disclosure on the top-LEFT of the hero visually
        // — matches the web's `top-3 left-3` placement. In RTL,
        // `.topTrailing` resolves to top-left.
        .overlay(alignment: .topTrailing) {
            if displayArticle.isAiGeneratedImage {
                AIImageBadge(model: displayArticle.aiImageModel)
            }
        }
    }

    private var heroPlaceholder: some View {
        LinearGradient(
            colors: [article.category.tint.opacity(0.20), article.category.tint.opacity(0.05)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .overlay {
            Image(systemName: article.category.icon)
                .font(.system(size: 100, weight: .ultraLight))
                .foregroundStyle(article.category.tint.opacity(0.15))
        }
    }

    // MARK: - Audio Summary

    private var audioSummarySection: some View {
        Button {
            toggleAudio()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isPlayingAudio ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(SabqTheme.primaryEnd)

                VStack(alignment: .leading, spacing: 3) {
                    Text("ملخص صوتي")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)

                    Text(isPlayingAudio ? "جاري التشغيل..." : "استمع لملخص المقال")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                }

                Spacer(minLength: 0)

                if let duration = audioSummary?.duration {
                    Text("\(duration / 60):\(String(format: "%02d", duration % 60))")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .fill(SabqTheme.primaryEnd.opacity(0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                    .stroke(SabqTheme.primaryEnd.opacity(0.12), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    private func toggleAudio() {
        if isPlayingAudio {
            audioPlayer?.pause()
            isPlayingAudio = false
            return
        }
        // The backend's /api/articles/:slug/summary-audio streams
        // ElevenLabs (or Google fallback) MP3 bytes directly, not a
        // JSON envelope. We don't need to pre-fetch metadata — point
        // AVPlayer at the URL and let it start streaming. ElevenLabs
        // synthesis takes ~3-8s the first time; subsequent loads hit
        // the backend's 24h Cache-Control header.
        guard let slug = displayArticle.slug, !slug.isEmpty,
              let url = URL(string: "\(URLConstants.publicAPI)/articles/\(slug)/summary-audio")
        else { return }
        SabqHaptics.medium()
        audioPlayer = AVPlayer(url: url)
        audioPlayer?.play()
        isPlayingAudio = true
    }

    // MARK: - Meta

    /// Unified labels row under the hero: category + breaking (when applicable)
    /// + sentiment (when AI insights returned one) + موثوق passport pill.
    /// FlowLayout wraps onto a second line on narrow screens.
    private var labelsRow: some View {
        FlowLayout(spacing: 8) {
            // Category pill
            Text(article.category.title)
                .font(.system(size: 11, weight: .heavy, design: .rounded))
                .tracking(0.5)
                .foregroundStyle(article.category.tint)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule(style: .continuous).fill(article.category.tint.opacity(0.10))
                )
                .overlay(
                    Capsule(style: .continuous).stroke(article.category.tint.opacity(0.25), lineWidth: 0.5)
                )

            // Breaking pill (only when applicable)
            if article.isBreaking {
                HStack(spacing: 5) {
                    PulsingDot(color: SabqTheme.coral)
                        .scaleEffect(0.6)
                        .frame(width: 12, height: 12)
                    Text("عاجل")
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(SabqTheme.coral)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Capsule(style: .continuous).fill(SabqTheme.coral.opacity(0.10)))
            }

            sentimentPill

            // Passport "موثوق" pill — opens the same sheet as the action bar.
            if let slug = article.slug {
                PassportInlineBadge(slug: slug)
            }
        }
    }

    /// Renders a small sentiment pill when aiInsights returns one. Accepts
    /// either localized Arabic labels or the canonical English keys.
    @ViewBuilder
    private var sentimentPill: some View {
        if let raw = aiInsights["sentiment"]?.lowercased(),
           let mapped = sentimentMapping(for: raw) {
            HStack(spacing: 5) {
                Image(systemName: mapped.icon)
                    .font(.system(size: 11, weight: .semibold))
                Text(mapped.label)
                    .font(.system(size: 11, weight: .heavy))
            }
            .foregroundStyle(mapped.tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule(style: .continuous)
                    .fill(mapped.tint.opacity(0.10))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(mapped.tint.opacity(0.25), lineWidth: 0.5)
            )
        }
    }

    private func sentimentMapping(for raw: String) -> (label: String, icon: String, tint: Color)? {
        switch raw {
        case "positive", "ايجابي", "إيجابي":
            return ("إيجابي", "face.smiling", Color(red: 0.16, green: 0.68, blue: 0.40))
        case "neutral", "محايد":
            return ("محايد", "minus.circle", SabqTheme.secondaryInk)
        case "negative", "سلبي":
            return ("سلبي", "exclamationmark.triangle.fill", SabqTheme.coral)
        case "mixed", "مختلط":
            return ("مختلط", "circle.lefthalf.fill", Color(red: 0.62, green: 0.36, blue: 0.92))
        default:
            return nil
        }
    }

    // Cream surface when in focus mode for a warmer reading experience;
    // standard surface otherwise.
    private var focusBackground: Color {
        isFocusMode
            ? Color(UIColor { t in
                t.userInterfaceStyle == .dark
                    ? UIColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1)
                    : UIColor(red: 0.98, green: 0.95, blue: 0.91, alpha: 1)
            })
            : SabqTheme.surface
    }

    /// Source of truth for the "الموجز الذكي" card body. Mirrors the web
    /// (`ArticleDetail.tsx`: `article.aiSummary || article.excerpt`) — prefer
    /// the dashboard-generated AI summary, fall back to the editor's excerpt
    /// when the AI hasn't processed the article yet.
    private var smartSummaryText: String {
        let ai = displayArticle.aiSummary.trimmingCharacters(in: .whitespacesAndNewlines)
        if !ai.isEmpty { return ai }
        return displayArticle.excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Single unified smart-summary card. Shows the AI summary text capped at
    /// 3 lines by default with an expand/collapse toggle when the content
    /// overflows. The audio-summary play button sits inline at the top right
    /// when an audio file exists, keeping the listen action visually
    /// connected to the textual summary.
    @ViewBuilder
    private var smartSummaryCard: some View {
        let body = smartSummaryText
        // The listen button drives ElevenLabs TTS at request time, so
        // we surface it whenever there's actual text to speak (and a
        // slug to address the backend endpoint with). The previous
        // `hasAudio = audioSummary?.url != nil` gate was permanently
        // false because /api/articles/:slug/summary-audio responds
        // with raw MP3 bytes, not a JSON URL envelope, so the
        // decode-on-fetch always failed.
        let canListen = !body.isEmpty
            && (displayArticle.slug?.isEmpty == false)

        if body.isEmpty && !canListen {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("الموجز الذكي")
                        .font(.system(size: 13, weight: .heavy, design: .rounded))
                        .foregroundStyle(SabqTheme.ink)
                    Spacer(minLength: 0)
                    if canListen {
                        listenButton
                    }
                }

                if !body.isEmpty {
                    Text(body)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(SabqTheme.secondaryInk)
                        .multilineTextAlignment(.leading)
                        .lineSpacing(4)
                        .lineLimit(isSummaryExpanded ? nil : 3)
                        .fixedSize(horizontal: false, vertical: true)

                    if Self.summaryNeedsToggle(body) {
                        Button {
                            withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                                isSummaryExpanded.toggle()
                            }
                            SabqHaptics.light()
                        } label: {
                            HStack(spacing: 4) {
                                Text(isSummaryExpanded ? "طيّ" : "عرض المزيد")
                                    .font(.system(size: 12, weight: .semibold))
                                Image(systemName: isSummaryExpanded ? "chevron.up" : "chevron.down")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .foregroundStyle(SabqTheme.primaryEnd)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay(
                        RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                            .fill(SabqTheme.primaryEnd.opacity(0.04))
                    )
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .stroke(SabqTheme.primaryEnd.opacity(0.18), lineWidth: 0.5)
            )
        }
    }

    /// Heuristic: at 14pt on standard mobile widths, ~50 chars/line fits, so
    /// 3 lines ≈ 150 chars. Showing the toggle for slightly-shorter content
    /// is fine — tapping it just does nothing visible. The worst case is
    /// hiding the toggle for content that would have wrapped to a 4th line
    /// due to long Arabic words, so we err on the generous side at 120 chars.
    private static func summaryNeedsToggle(_ text: String) -> Bool {
        text.count > 120
    }

    /// Compact play/pause pill for the audio summary. Sits in the smart-
    /// summary card header. Hooks into the existing `toggleAudio` logic
    /// so audio state stays synchronised with the rest of the screen.
    private var listenButton: some View {
        Button {
            SabqHaptics.light()
            toggleAudio()
        } label: {
            HStack(spacing: 5) {
                Image(systemName: isPlayingAudio ? "pause.fill" : "play.fill")
                    .font(.system(size: 11, weight: .heavy))
                Text(isPlayingAudio ? "إيقاف" : "استماع")
                    .font(.system(size: 11, weight: .heavy))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous).fill(SabqTheme.primaryEnd)
            )
            .shadow(color: SabqTheme.primaryEnd.opacity(0.30), radius: 6, x: 0, y: 3)
        }
        .buttonStyle(.plain)
    }

    // Publication metadata between title and excerpt. Single calm row,
    // tertiary ink, bullet separators — should not visually disrupt the
    // text flow above or below it.
    private var articleMeta: some View {
        HStack(spacing: 8) {
            // Use `displayArticle.author` (not `article.author`) so the byline
            // refreshes from the home-feed cached value to the freshly-loaded
            // full-article value. The backend prefers `reporterId` over
            // `authorId`, so the full-article fetch can replace a "staff who
            // entered" name with the actual reporter chosen in the dashboard.
            NavigationLink(value: AuthorRoute(name: displayArticle.author)) {
                Text(displayArticle.author)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .buttonStyle(.plain)
            .layoutPriority(2)

            Text("·")
                .font(.system(size: 11))
                .foregroundStyle(SabqTheme.tertiaryInk.opacity(0.6))

            Text(article.readingTime)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .monospacedDigit()
                .lineLimit(1)
                .layoutPriority(1)

            Text("·")
                .font(.system(size: 11))
                .foregroundStyle(SabqTheme.tertiaryInk.opacity(0.6))

            Text(article.dateFormatted)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .layoutPriority(3)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Action Bar

    // Bar trimmed to 4 calmer buttons: مشاركة / حفظ / Aa / قراءة.
    // Passport is reachable from the inline pill above; copy-link lives
    // inside the iOS share sheet.
    private var actionBar: some View {
        HStack(spacing: 0) {
            Button {
                SabqHaptics.light()
                shareArticle()
            } label: {
                actionButton(icon: "square.and.arrow.up", label: "مشاركة")
            }
            .buttonStyle(.plain)

            Divider().frame(height: 28)

            Button {
                SabqHaptics.medium()
                bookmarksStore.toggle(article.id, article: article)
            } label: {
                actionButton(
                    icon: bookmarksStore.isBookmarked(article.id) ? "bookmark.fill" : "bookmark",
                    label: bookmarksStore.isBookmarked(article.id) ? "تم الحفظ" : "حفظ",
                    isActive: bookmarksStore.isBookmarked(article.id)
                )
            }
            .buttonStyle(.plain)

            Divider().frame(height: 28)

            Button {
                SabqHaptics.light()
                showReaderControls = true
            } label: {
                actionButton(icon: "textformat.size", label: "تنسيق")
            }
            .buttonStyle(.plain)

            Divider().frame(height: 28)

            Button {
                SabqHaptics.medium()
                withAnimation(.spring(response: 0.5, dampingFraction: 0.85)) {
                    isFocusMode.toggle()
                }
            } label: {
                actionButton(
                    icon: isFocusMode ? "book.closed.fill" : "book",
                    label: isFocusMode ? "خروج" : "قراءة",
                    isActive: isFocusMode
                )
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.4))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
        )
        .sheet(isPresented: $isPassportPresented) {
            if let slug = article.slug {
                PassportSheetView(slug: slug)
            }
        }
        .sheet(isPresented: $showReaderControls) {
            ReaderControlsSheet(
                fontSize: $fontSize,
                lineSpacing: $lineSpacing,
                useReaderFont: $useReaderFont
            )
        }
    }

    private func actionButton(icon: String, label: String, isActive: Bool = false) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .semibold))
            Text(label)
                .font(.system(size: 12, weight: .bold, design: .rounded))
        }
        .foregroundStyle(isActive ? SabqTheme.primaryEnd : SabqTheme.secondaryInk)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
    }

    // MARK: - Title

    private var articleTitle: some View {
        Text(displayArticle.title)
            // Editorial headline font — IBM Plex Sans Arabic Bold matches
            // the web brand and reads more "newspaper" than SF Arabic.
            .font(SabqFonts.headline(size: CGFloat(fontSize + 8)))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            // Tightened from 8 → 3 per user direction: the headline reads as a
            // single editorial block instead of feeling double-spaced.
            .lineSpacing(3)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }

    // MARK: - Excerpt

    private var articleExcerpt: some View {
        HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(SabqTheme.primaryEnd)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(SabqTheme.primaryEnd.opacity(0.7))
                    Text("الموجز الذكي")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.tertiaryInk)
                }

                Text(displayArticle.excerpt)
                    .font(.system(size: CGFloat(fontSize - 1), weight: .regular))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(6)
                    .lineLimit(isExcerptExpanded ? nil : 3)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .animation(.easeInOut(duration: 0.25), value: isExcerptExpanded)

                Button {
                    withAnimation(.spring(response: 0.3)) {
                        isExcerptExpanded.toggle()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Text(isExcerptExpanded ? "عرض أقل" : "عرض المزيد")
                            .font(.system(size: 13, weight: .medium))
                        Image(systemName: isExcerptExpanded ? "chevron.up" : "chevron.down")
                            .font(.system(size: 9, weight: .semibold))
                    }
                    .foregroundStyle(SabqTheme.primaryEnd)
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Body

    private var displayArticle: Article { fullArticle ?? article }
    private var displayTags: [String] { resolvedTags }

    @MainActor
    private func updateResolvedTags(from source: Article) {
        var seen = Set<String>()
        let newTags = source.tags
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
        if !newTags.isEmpty {
            resolvedTags = newTags
        }
    }

    /// Weekly-photos gallery — iOS port of the web `WeeklyPhotosDisplay`
    /// component. Layout intent:
    ///   • Header: rounded-square camera tile + "صور الأسبوع" + gradient
    ///     divider trailing into the empty space.
    ///   • Continuous vertical timeline rail on the leading (right, in
    ///     RTL) edge.
    ///   • For each photo, a dot marker sits on the rail next to a
    ///     stacked photo + caption pair.
    ///   • Photo: 16:10 image with a primary-coloured rank pill in the
    ///     top-leading corner. Tappable — opens a fullscreen lightbox.
    ///   • Caption card: muted-bg rounded panel with caption text and a
    ///     border-separated credit row (camera glyph + photographer).
    ///   • Footer: a tiny primary dot under the last entry, matching web.
    private func weeklyPhotosGallery(_ photos: [APIWeeklyPhoto]) -> some View {
        let validPhotos = photos.filter { !$0.imageUrl.isEmpty }
        return VStack(alignment: .leading, spacing: 0) {
            weeklyPhotosHeader

            ZStack(alignment: .topLeading) {
                // Vertical timeline rail on the leading edge (visual
                // right in RTL — matches the web's `right-6` placement).
                // Padded from top/bottom so it doesn't bleed past the
                // first / last dot.
                LinearGradient(
                    colors: [
                        SabqTheme.primaryEnd.opacity(0.20),
                        SabqTheme.primaryEnd.opacity(0.40),
                        SabqTheme.primaryEnd.opacity(0.20),
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(width: 2)
                .padding(.top, 20)
                .padding(.bottom, 20)
                .padding(.leading, 10)

                VStack(spacing: 28) {
                    ForEach(Array(validPhotos.enumerated()), id: \.element.id) { index, photo in
                        weeklyPhotoEntry(index: index, photo: photo)
                    }
                }
            }

            // Closing dot below the last entry, same as web.
            HStack {
                Spacer()
                Circle()
                    .fill(SabqTheme.primaryEnd)
                    .frame(width: 8, height: 8)
                Spacer()
            }
            .padding(.top, 22)
        }
        .fullScreenCover(
            isPresented: Binding(
                get: { weeklyPhotoIndex != nil },
                set: { if !$0 { weeklyPhotoIndex = nil } }
            )
        ) {
            if let startIndex = weeklyPhotoIndex {
                WeeklyPhotosLightbox(
                    photos: validPhotos,
                    startIndex: startIndex
                )
            }
        }
    }

    private var weeklyPhotosHeader: some View {
        HStack(spacing: 12) {
            Image(systemName: "camera.fill")
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(SabqTheme.primaryEnd)
                .frame(width: 40, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(SabqTheme.primaryEnd.opacity(0.10))
                )

            Text("صور الأسبوع")
                .font(.system(size: 22, weight: .heavy, design: .rounded))
                .foregroundStyle(SabqTheme.ink)

            LinearGradient(
                colors: [.clear, SabqTheme.outline, .clear],
                startPoint: .trailing,
                endPoint: .leading
            )
            .frame(height: 1)
        }
        .padding(.bottom, 28)
    }

    private func weeklyPhotoEntry(index: Int, photo: APIWeeklyPhoto) -> some View {
        HStack(alignment: .top, spacing: 16) {
            // Dot column rendered FIRST so it occupies the leading edge
            // (visual right in RTL). Its width (22pt) is centred at 11pt
            // from the leading edge — exactly where the rail's `.leading
            // padding 10pt + rail width 2pt` puts the rail's centre.
            ZStack {
                Circle()
                    .fill(SabqTheme.primaryEnd)
                    .frame(width: 14, height: 14)
                    .overlay(
                        Circle().stroke(SabqTheme.background, lineWidth: 4)
                    )
                    .shadow(color: SabqTheme.primaryEnd.opacity(0.4), radius: 4, y: 2)
            }
            .frame(width: 22, alignment: .top)
            .padding(.top, 16)

            VStack(alignment: .leading, spacing: 14) {
                weeklyPhotoImage(index: index, photo: photo)
                weeklyPhotoCaption(photo: photo)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func weeklyPhotoImage(index: Int, photo: APIWeeklyPhoto) -> some View {
        Button {
            SabqHaptics.light()
            weeklyPhotoIndex = index
        } label: {
            ZStack(alignment: .topLeading) {
                Color.clear
                    .aspectRatio(16.0 / 10.0, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .overlay(
                        Group {
                            if let url = URL(string: photo.imageUrl) {
                                CachedAsyncImage(url: url, contentMode: .fill) {
                                    weeklyPhotoPlaceholder
                                }
                            } else {
                                weeklyPhotoPlaceholder
                            }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(SabqTheme.outline.opacity(0.30), lineWidth: 0.5)
                    )
                    .shadow(color: SabqTheme.shadow, radius: 10, x: 0, y: 4)

                // Rank pill in the top-leading corner (visual top-right
                // in RTL — matches web's `top-3 right-3` placement).
                Text("\(index + 1)")
                    .font(.system(size: 13, weight: .heavy, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .padding(.horizontal, 11)
                    .padding(.vertical, 5)
                    .background(
                        Capsule(style: .continuous)
                            .fill(SabqTheme.primaryEnd)
                    )
                    .shadow(color: SabqTheme.primaryEnd.opacity(0.4), radius: 5, y: 2)
                    .padding(12)
            }
        }
        .buttonStyle(.plain)
    }

    private var weeklyPhotoPlaceholder: some View {
        LinearGradient(
            colors: [
                SabqTheme.primaryEnd.opacity(0.10),
                SabqTheme.coral.opacity(0.06),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .overlay {
            Image(systemName: "photo")
                .font(.system(size: 36, weight: .light))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.35))
        }
    }

    private func weeklyPhotoCaption(photo: APIWeeklyPhoto) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if !photo.caption.isEmpty {
                Text(photo.caption)
                    .font(.system(size: CGFloat(fontSize), weight: .regular))
                    .foregroundStyle(SabqTheme.ink.opacity(0.92))
                    .multilineTextAlignment(.leading)
                    .lineSpacing(CGFloat(lineSpacing))
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if !photo.credit.isEmpty {
                Divider()
                    .background(SabqTheme.outline.opacity(0.5))

                HStack(spacing: 8) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 12, weight: .semibold))
                    Text(photo.credit)
                        .font(.system(size: 12, weight: .semibold))
                }
                .foregroundStyle(SabqTheme.tertiaryInk)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .fill(SabqTheme.paleFill.opacity(0.40))
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(SabqTheme.outline.opacity(0.35), lineWidth: 0.5)
        )
    }

    private var articleBody: some View {
        Group {
            let html = displayArticle.bodyHTML
            let plain = displayArticle.body
            if html.isEmpty && plain.isEmpty {
                VStack(spacing: 16) {
                    ForEach(0..<5, id: \.self) { i in
                        SkeletonBox(width: i == 4 ? 200 : nil, height: 14)
                    }
                }
                .padding(.vertical, 20)
            } else if !html.isEmpty && isHTMLContent(html) {
                // Rich HTML pipeline: parse into structured blocks and render
                // each natively (paragraph/heading/list/quote/image/gallery/
                // tweet/video). Honours the Aa controls live. Parse result
                // is memoised in `cachedBlocks` so the heavy regex/scanner
                // work only runs on the first render of a new article.
                let blocks: [ArticleBlock] = {
                    if cachedBlocks.html == html { return cachedBlocks.items }
                    let parsed = ArticleHtmlParser.parse(html)
                    DispatchQueue.main.async { cachedBlocks = (html, parsed) }
                    return parsed
                }()
                ArticleContentView(
                    blocks: blocks,
                    fontSize: fontSize,
                    lineSpacing: lineSpacing,
                    useReaderFont: useReaderFont
                )
                .padding(.horizontal, 6)
            } else {
                // Legacy plain-text fallback for articles still stored as
                // newline-separated paragraphs (or list-payload previews).
                // Cached so the paragraph split doesn't rerun on every
                // body re-render (font-size slider, line-spacing tick…).
                let paragraphs: [String] = {
                    if cachedParagraphs.body == plain { return cachedParagraphs.items }
                    let items = Article.displayParagraphs(for: plain)
                    DispatchQueue.main.async { cachedParagraphs = (plain, items) }
                    return items
                }()
                VStack(alignment: .leading, spacing: 18) {
                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, paragraph in
                        Text(paragraph)
                            .font(.system(
                                size: CGFloat(index == 0 ? fontSize + 1 : fontSize),
                                weight: index == 0 ? .medium : .regular,
                                design: useReaderFont ? .serif : .default
                            ))
                            .foregroundStyle(SabqTheme.ink.opacity(0.92))
                            .multilineTextAlignment(.leading)
                            .lineSpacing(CGFloat(lineSpacing) + (index == 0 ? 4 : 3))
                            .lineLimit(nil)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 6)
            }
        }
    }

    /// Detects HTML-flavoured content. Looks for any common block-level
    /// opening tag — cheap and reliable for our TipTap output.
    private func isHTMLContent(_ html: String) -> Bool {
        let lower = html.lowercased()
        let markers = ["<p", "<h1", "<h2", "<h3", "<h4", "<ul", "<ol", "<blockquote", "<img", "<div", "<a "]
        return markers.contains { lower.contains($0) }
    }

    private func shareArticle() {
        Task {
            let url = await prepareShareURL()
            presentShareSheet(with: url)
        }
    }

    private func copyShareLink() {
        Task {
            let url = await prepareShareURL()
            await MainActor.run {
                UIPasteboard.general.string = url.absoluteString
                showCopyFeedback()
            }
        }
    }

    @MainActor
    private func showCopyFeedback() {
        copyFeedbackTask?.cancel()

        let feedback = UINotificationFeedbackGenerator()
        feedback.notificationOccurred(.success)

        withAnimation(.spring(response: 0.28, dampingFraction: 0.82)) {
            isCopyFeedbackVisible = true
        }

        copyFeedbackTask = Task {
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isCopyFeedbackVisible = false
                }
                copyFeedbackTask = nil
            }
        }
    }

    @MainActor
    private func prepareShareURL() async -> URL {
        // Share the canonical `/article/<englishSlug>` URL directly. The
        // shortlink path (sabq.link/…) was producing URLs that crawlers
        // (Twitter/WhatsApp) couldn't unfurl into the article's OG image +
        // title + summary, AND the shortlink format differed from the web
        // app's own URL. The canonical URL goes through `seoInjector.ts`
        // and exposes the full og:image / og:title / og:description.
        return fallbackShareURL
    }

    private func resolveShortlinkURL(articleId: String) async -> URL? {
        await SabqShareHelper.resolveShortlink(articleId: articleId)
    }

    @MainActor
    private func presentShareSheet(with url: URL) {
        SabqShareHelper.presentShareSheet(with: url)
    }

    // MARK: - Tags

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("الوسوم")
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(SabqTheme.secondaryInk)

            FlowLayout(spacing: 8) {
                ForEach(displayTags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        Text(tag)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(SabqTheme.primaryStart)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(
                                Capsule(style: .continuous)
                                    .fill(SabqTheme.primaryEnd.opacity(0.08))
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - Related Articles

    private var relatedSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().foregroundStyle(SabqTheme.outline)

            SectionHeader(
                title: "أخبار ذات صلة",
                subtitle: "مقالات مشابهة قد تهمك",
                icon: "link",
                tint: SabqTheme.primaryEnd
            )

            ForEach(relatedArticles.prefix(5)) { related in
                NavigationLink(value: related) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(related.title)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)

                            Text(related.relativeDate)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        if let urlStr = related.imageURL, let url = URL(string: urlStr) {
                            CachedAsyncImage(url: url, contentMode: .fill) {
                                relatedPlaceholder(related)
                            }
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        } else {
                            relatedPlaceholder(related)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)

                if related.id != relatedArticles.prefix(5).last?.id {
                    Divider().foregroundStyle(SabqTheme.outline.opacity(0.5))
                }
            }
        }
    }

    private func relatedPlaceholder(_ article: Article) -> some View {
        RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(article.category.tint.opacity(0.1))
            .frame(width: 56, height: 56)
            .overlay {
                Image(systemName: article.category.icon)
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(article.category.tint.opacity(0.4))
            }
    }

    // MARK: - Comments

    @ViewBuilder
    private func commentsSection(store: CommentsStore) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().foregroundStyle(SabqTheme.outline)

            SectionHeader(
                title: "التعليقات",
                subtitle: commentsSubtitle(for: store),
                icon: "bubble.left.and.bubble.right.fill",
                tint: SabqTheme.teal
            )

            if let feedback = commentFeedback {
                commentFeedbackBanner(feedback)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            if authStore.isLoggedIn {
                CommentComposer(
                    store: store,
                    onSubmit: { outcome in
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            commentFeedback = .init(outcome: outcome)
                        }
                        scheduleFeedbackDismissal()
                    },
                    onAuthRequired: { showLoginForCommentSheet = true },
                    onError: { message in
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                            commentFeedback = .init(message: message, isError: true)
                        }
                        scheduleFeedbackDismissal()
                    }
                )
            } else {
                signInPromptCard
            }

            commentsList(store: store)
        }
        .sheet(isPresented: $showLoginForCommentSheet) {
            LoginSheet()
        }
    }

    private func commentsSubtitle(for store: CommentsStore) -> String {
        switch store.loadState {
        case .idle, .loading: return "يتم التحميل…"
        case .failed: return "تعذر التحميل"
        case .loaded:
            let total = store.comments.reduce(0) { $0 + 1 + $1.replies.count }
            return total == 0 ? "كن أول من يعلّق" : "\(total) تعليق"
        }
    }

    @ViewBuilder
    private func commentsList(store: CommentsStore) -> some View {
        if store.comments.isEmpty {
            switch store.loadState {
            case .idle, .loading:
                commentSkeletonList
            case .failed(let message):
                commentErrorState(message: message, store: store)
            case .loaded:
                commentEmptyState
            }
        } else {
            LazyVStack(alignment: .leading, spacing: 6) {
                ForEach(store.comments) { comment in
                    CommentRow(comment: comment) { tapped in
                        store.replyingTo = tapped
                    }
                    Divider().foregroundStyle(SabqTheme.outline.opacity(0.4))
                }
            }
        }
    }

    private var signInPromptCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.crop.circle.badge.plus")
                .font(.system(size: 26, weight: .light))
                .foregroundStyle(SabqTheme.primaryEnd)
            Text("سجّل دخولك لإضافة تعليق")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
            Button {
                SabqHaptics.light()
                showLoginForCommentSheet = true
            } label: {
                Text("تسجيل الدخول")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(SabqTheme.primaryEnd)
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.cardRadius, style: .continuous)
                .fill(SabqTheme.paleFill)
        )
    }

    private var commentEmptyState: some View {
        HStack(spacing: 8) {
            Image(systemName: "bubble.left")
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text("لا توجد تعليقات بعد")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
            Spacer(minLength: 0)
        }
        .padding(.vertical, 10)
    }

    private var commentSkeletonList: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(0..<3, id: \.self) { _ in
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(SabqTheme.paleFill)
                        .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 6) {
                        RoundedRectangle(cornerRadius: 4)
                            .fill(SabqTheme.paleFill)
                            .frame(width: 110, height: 12)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(SabqTheme.paleFill)
                            .frame(maxWidth: .infinity)
                            .frame(height: 10)
                        RoundedRectangle(cornerRadius: 4)
                            .fill(SabqTheme.paleFill)
                            .frame(width: 220, height: 10)
                    }
                }
            }
        }
        .redacted(reason: .placeholder)
    }

    private func commentErrorState(message: String, store: CommentsStore) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 22, weight: .light))
                .foregroundStyle(SabqTheme.tertiaryInk)
            Text(message)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(SabqTheme.secondaryInk)
                .multilineTextAlignment(.center)
            Button {
                Task { await store.load() }
            } label: {
                Text("إعادة المحاولة")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(SabqTheme.primaryEnd)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 6)
                    .background(
                        Capsule().fill(SabqTheme.primaryEnd.opacity(0.12))
                    )
            }
            .buttonStyle(.plain)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
    }

    private func commentFeedbackBanner(_ feedback: CommentFeedback) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: feedback.icon)
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(feedback.tint)
            Text(feedback.message)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(SabqTheme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                withAnimation { commentFeedback = nil }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: SabqTheme.chipRadius, style: .continuous)
                .fill(feedback.tint.opacity(0.12))
        )
    }

    private func scheduleFeedbackDismissal() {
        Task {
            try? await Task.sleep(nanoseconds: 4_500_000_000)
            await MainActor.run {
                withAnimation(.easeOut(duration: 0.25)) {
                    commentFeedback = nil
                }
            }
        }
    }
}

/// One-shot toast/banner state for the comments section. Lives on the view
/// (not on the store) so it can be cleared by user interaction independently
/// from the underlying submission state.
struct CommentFeedback: Equatable {
    let message: String
    let icon: String
    let tint: Color
    let isError: Bool

    init(message: String, icon: String = "info.circle.fill", tint: Color = SabqTheme.teal, isError: Bool = false) {
        self.message = message
        self.icon = icon
        self.tint = tint
        self.isError = isError
    }

    init(outcome: CommentsStore.SubmitOutcome) {
        switch outcome {
        case .published:
            self.init(
                message: "تم نشر تعليقك",
                icon: "checkmark.circle.fill",
                tint: SabqTheme.teal
            )
        case .awaitingReview:
            self.init(
                message: "SABQ AI يراجع تعليقك الآن — يظهر فور الاعتماد",
                icon: "sparkles",
                tint: SabqTheme.primaryEnd
            )
        case .rejected:
            self.init(
                message: "لم يستوفِ التعليق سياسة النشر",
                icon: "xmark.octagon.fill",
                tint: .red,
                isError: true
            )
        }
    }
}

// MARK: - Reading Progress Style

struct ReadingProgressStyle: ProgressViewStyle {
    @Environment(\.layoutDirection) private var layoutDirection

    func makeBody(configuration: Configuration) -> some View {
        let fraction = configuration.fractionCompleted ?? 0
        let anchor: UnitPoint = layoutDirection == .rightToLeft ? .trailing : .leading
        GeometryReader { geo in
            ZStack(alignment: layoutDirection == .rightToLeft ? .trailing : .leading) {
                // Track stays barely visible so the bar reads as a single
                // accent stroke at the top edge — calmer than a 3pt solid.
                Capsule(style: .continuous)
                    .fill(SabqTheme.outline.opacity(0.18))

                Capsule(style: .continuous)
                    .fill(SabqTheme.brandGradient)
                    .frame(width: max(0, geo.size.width * fraction))
                    .shadow(color: SabqTheme.primaryEnd.opacity(0.35),
                            radius: 6, x: 0, y: 0)
            }
        }
        // Hidden anchor reference (avoids removing the param)
        .scaleEffect(x: 1, y: 1, anchor: anchor)
    }
}

// MARK: - Reader Controls Sheet

/// Aa popover — surfaces the already-persisted reader settings
/// (articleFontSize, articleLineSpacing, articleUseReaderFont). Each control
/// previews the change instantly via @AppStorage so the user sees the body
/// re-flow behind the sheet.
struct ReaderControlsSheet: View {
    @Binding var fontSize: Double
    @Binding var lineSpacing: Double
    @Binding var useReaderFont: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 22) {
                preview

                VStack(alignment: .leading, spacing: 18) {
                    sliderSection(
                        title: "حجم الخط",
                        valueText: "\(Int(fontSize)) pt",
                        value: $fontSize,
                        range: 13...22,
                        step: 1,
                        leftLabel: "أ",
                        leftSize: 12,
                        rightLabel: "أ",
                        rightSize: 20
                    )

                    sliderSection(
                        title: "تباعد الأسطر",
                        valueText: String(format: "%.0f", lineSpacing),
                        value: $lineSpacing,
                        range: 2...12,
                        step: 1,
                        leftLabel: "≡",
                        leftSize: 14,
                        rightLabel: "≣",
                        rightSize: 14
                    )

                    Toggle(isOn: $useReaderFont) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("خط القراءة")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                            Text("خط متّسع لقراءة مريحة")
                                .font(.system(size: 11))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                    }
                    .tint(SabqTheme.primaryEnd)
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 22)
            .padding(.top, 18)
            .padding(.bottom, 30)
            .background(SabqTheme.background)
            .navigationTitle("تنسيق القراءة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("تم") { dismiss() }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                }
            }
        }
        .sabqRTL()
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private var preview: some View {
        Text("تظهر القراءة بهذا الحجم والتباعد. عدّل الإعدادات أدناه لتجد المريح لعينيك.")
            .font(.system(
                size: fontSize,
                weight: .regular,
                design: useReaderFont ? .serif : .default
            ))
            .lineSpacing(lineSpacing)
            .foregroundStyle(SabqTheme.ink)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .fill(SabqTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: SabqTheme.tileRadius, style: .continuous)
                    .stroke(SabqTheme.outline.opacity(0.4), lineWidth: 0.5)
            )
    }

    private func sliderSection(
        title: String,
        valueText: String,
        value: Binding<Double>,
        range: ClosedRange<Double>,
        step: Double,
        leftLabel: String,
        leftSize: CGFloat,
        rightLabel: String,
        rightSize: CGFloat
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(SabqTheme.ink)
                Spacer()
                Text(valueText)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(SabqTheme.tertiaryInk)
            }
            HStack(spacing: 10) {
                Text(leftLabel)
                    .font(.system(size: leftSize, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .frame(width: 18)
                Slider(value: value, in: range, step: step)
                    .tint(SabqTheme.primaryEnd)
                Text(rightLabel)
                    .font(.system(size: rightSize, weight: .semibold))
                    .foregroundStyle(SabqTheme.tertiaryInk)
                    .frame(width: 18)
            }
        }
    }
}

// MARK: - Weekly Photos Lightbox
//
// Fullscreen image viewer matching the web's `WeeklyPhotosDisplay`
// lightbox: blurred black backdrop, 16:10 photo, chevron-right (prev,
// RTL-correct) and chevron-left (next) navigation arrows, rank pill
// (N / Total) top-leading, close X top-trailing, caption + credit panel
// underneath, and a dot indicator row below.
struct WeeklyPhotosLightbox: View {
    let photos: [APIWeeklyPhoto]
    let startIndex: Int
    @Environment(\.dismiss) private var dismiss
    @State private var index: Int

    init(photos: [APIWeeklyPhoto], startIndex: Int) {
        self.photos = photos
        self.startIndex = startIndex
        _index = State(initialValue: startIndex)
    }

    private var current: APIWeeklyPhoto { photos[index] }

    var body: some View {
        ZStack {
            // Backdrop — tap anywhere to dismiss.
            Color.black.opacity(0.92).ignoresSafeArea()
                .background(.ultraThinMaterial)
                .contentShape(Rectangle())
                .onTapGesture {
                    SabqHaptics.light()
                    dismiss()
                }

            VStack(spacing: 18) {
                ZStack {
                    Color.clear
                        .aspectRatio(16.0 / 10.0, contentMode: .fit)
                        .frame(maxWidth: .infinity)
                        .overlay(
                            Group {
                                if let url = URL(string: current.imageUrl) {
                                    CachedAsyncImage(url: url, contentMode: .fit) {
                                        Color.black.opacity(0.6)
                                    }
                                } else {
                                    Color.black.opacity(0.6)
                                }
                            }
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                    // Rank pill — top-leading (visually top-right in RTL).
                    VStack {
                        HStack {
                            Text("\(index + 1) / \(photos.count)")
                                .font(.system(size: 13, weight: .heavy, design: .rounded))
                                .foregroundStyle(.white)
                                .monospacedDigit()
                                .padding(.horizontal, 14)
                                .padding(.vertical, 6)
                                .background(
                                    Capsule(style: .continuous)
                                        .fill(SabqTheme.primaryEnd)
                                )
                                .shadow(color: .black.opacity(0.4), radius: 6, y: 2)
                            Spacer()
                            Button {
                                SabqHaptics.light()
                                dismiss()
                            } label: {
                                Image(systemName: "xmark")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 36, height: 36)
                                    .background(
                                        Circle().fill(.white.opacity(0.15))
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                        Spacer()
                    }
                    .padding(14)

                    // Right-side arrow goes to PREVIOUS in RTL.
                    HStack {
                        Button { goToPrevious() } label: {
                            Image(systemName: "chevron.right")
                                .font(.system(size: 22, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 48, height: 48)
                                .background(
                                    Circle().fill(.white.opacity(0.18))
                                )
                                .shadow(color: .black.opacity(0.3), radius: 6, y: 2)
                        }
                        .buttonStyle(.plain)
                        Spacer()
                        Button { goToNext() } label: {
                            Image(systemName: "chevron.left")
                                .font(.system(size: 22, weight: .heavy))
                                .foregroundStyle(.white)
                                .frame(width: 48, height: 48)
                                .background(
                                    Circle().fill(.white.opacity(0.18))
                                )
                                .shadow(color: .black.opacity(0.3), radius: 6, y: 2)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 14)
                }
                .padding(.horizontal, 12)

                // Caption + credit panel.
                if !current.caption.isEmpty || !current.credit.isEmpty {
                    VStack(spacing: 12) {
                        if !current.caption.isEmpty {
                            Text(current.caption)
                                .font(.system(size: 15, weight: .regular))
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.center)
                                .lineSpacing(6)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if !current.credit.isEmpty {
                            HStack(spacing: 6) {
                                Image(systemName: "camera.fill")
                                    .font(.system(size: 11, weight: .semibold))
                                Text(current.credit)
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundStyle(.white.opacity(0.55))
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(.white.opacity(0.06))
                            .overlay(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(.white.opacity(0.12), lineWidth: 0.5)
                            )
                    )
                    .padding(.horizontal, 18)
                }

                // Dot indicators.
                HStack(spacing: 8) {
                    ForEach(Array(photos.enumerated()), id: \.offset) { i, _ in
                        Capsule()
                            .fill(i == index ? SabqTheme.primaryEnd : .white.opacity(0.30))
                            .frame(width: i == index ? 22 : 6, height: 6)
                            .animation(.spring(response: 0.3), value: index)
                    }
                }
                .padding(.top, 4)
                .padding(.bottom, 8)
            }
        }
        .sabqRTL()
    }

    private func goToPrevious() {
        SabqHaptics.light()
        withAnimation(.easeInOut(duration: 0.2)) {
            index = (index == 0) ? photos.count - 1 : index - 1
        }
    }

    private func goToNext() {
        SabqHaptics.light()
        withAnimation(.easeInOut(duration: 0.2)) {
            index = (index == photos.count - 1) ? 0 : index + 1
        }
    }
}
