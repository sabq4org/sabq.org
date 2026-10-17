import SwiftUI
import AVFoundation

struct OpinionDetailView: View {
    let opinion: OpinionArticle
    @Environment(BookmarksStore.self) private var bookmarksStore

    @State private var fullOpinion: OpinionArticle?
    @State private var moreOpinions: [OpinionArticle] = []
    /// آخر مقالات الرأي كما جُلبت (قبل اقتطاع «المزيد») — منها «للكاتب نفسه»
    /// في سياق العمود على Duo.
    @State private var recentOpinions: [OpinionArticle] = []
    @Environment(\.publishesReaderContext) private var publishesReaderContext
    @Environment(SabqNavigationState.self) private var navigation: SabqNavigationState?
    @AppStorage(FoldableDevice.observedDefaultsKey) private var foldableObserved = false
    /// المقال ظاهر فعلًا (ليس مغطًّى بصفحة مدفوعة فوقه) — وحده ينشر سياقه.
    @State private var isOnScreen = false
    @State private var isSummaryExpanded = false
    @State private var isCopyFeedbackVisible = false
    @State private var copyFeedbackTask: Task<Void, Never>?
    /// Same reference-type pattern as `ArticleDetailView` — mutations to
    /// `.value` only invalidate `ReadingProgressOverlay`, never this view's
    /// body. Without this, every scroll tick re-rendered the entire
    /// opinion reader (including its JustifiedText paragraphs).
    @State private var scrollProgress = ArticleScrollProgress()
    @State private var isAnalyticsVisible = false
    @State private var showReaderControls = false
    @State private var isFocusMode = false
    /// Drives the hero `ImageLightbox` fullScreenCover when the reader
    /// taps the cover photo. Inline body images on opinion pages are
    /// rare today but if they ever land in opinion bodies they'll wire
    /// through the same `inlineLightboxURL` binding.
    @State private var isHeroLightboxPresented = false
    @State private var inlineLightboxURL: URL?
    @Environment(LikesStore.self) private var likesStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var likesCount: Int = 0
    @State private var isLikeBusy: Bool = false
    /// حالة الاستماع من المشغّل المشترك (Now Playing + شاشة القفل) — F03.
    private var audioKey: String { "opinion:\(displayOpinion.slug ?? displayOpinion.id)" }
    private var isPlayingAudio: Bool { SabqAudioPlayer.shared.isPlaying(key: audioKey) }

    @AppStorage("articleFontSize") private var fontSize: Double = Double(SabqType.articleBody.size)
    @AppStorage("articleLineSpacing") private var lineSpacing: Double = Double(SabqType.articleBody.lineSpacing)
    @AppStorage("articleUseReaderFont") private var useReaderFont: Bool = false

    private var displayOpinion: OpinionArticle { fullOpinion ?? opinion }

    private var displayTags: [String] {
        var seen = Set<String>()
        return displayOpinion.tags
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .filter { seen.insert($0).inserted }
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    // Hero stays STATIC under scroll — matches the
                    // article detail behaviour (no scroll-driven
                    // zoom/parallax). Natural aspect ratio, no
                    // fixed-height crop — same rationale as
                    // ArticleDetailView.heroImage: show the editor's
                    // photo whole, no focal-point cropping in the
                    // detail view.
                    heroImage
                        .contentShape(Rectangle())
                        .onTapGesture {
                            guard displayOpinion.imageURL?.isEmpty == false else { return }
                            SabqHaptics.light()
                            isHeroLightboxPresented = true
                        }
                        .aiImageBadgeOverlay(
                            isVisible: displayOpinion.isAiGeneratedImage,
                            model: displayOpinion.aiImageModel,
                            inset: 12,
                            corner: .topLeading
                        )

                    VStack(alignment: .leading, spacing: SabqLayout.space16) {
                        // ترتيب صفحة الخبر المعتمد ومسافاته: الوسم ← العنوان ← 16 ←
                        // الكاتب ← 16 ← فاصل ← 16 ← الموجز ← النص.
                        VStack(alignment: .leading, spacing: 0) {
                            if !isFocusMode {
                                labelsRow
                            }

                            opinionTitle
                                .padding(.bottom, SabqLayout.space16)

                            opinionMeta

                            SidebarRowDivider()
                                .padding(.vertical, SabqLayout.space16)

                            if !isFocusMode {
                                smartSummaryCard
                                    .padding(.bottom, SabqLayout.space8)
                            }
                        }

                        opinionBody
                            .analyticsReadingBody()

                        // Mirrors ArticleDetailView's spacing pass —
                        // the lower share / keywords / more-opinions
                        // sections used to inherit the parent VStack's
                        // 18 pt spacing and felt squashed together.
                        // Explicit top-padding gives each its own
                        // breathing room.
                        actionBar
                            .padding(.top, SabqLayout.space16)

                        if !isFocusMode, !displayTags.isEmpty {
                            tagsSection
                                .padding(.top, SabqLayout.space16)
                        }

                        if !isFocusMode, !moreOpinions.isEmpty {
                            moreOpinionsSection
                                .padding(.top, SabqLayout.space24)
                        }
                    }
                    .frame(width: max(0, min(proxy.size.width - (SabqLayout.pageMargin * 2), SabqLayout.readingWidth)), alignment: .leading)
                    .padding(.horizontal, SabqLayout.pageMargin)
                    .padding(.top, SabqLayout.space4)
                    .padding(.bottom, SabqLayout.space40)
                    .frame(maxWidth: .infinity)
                }
                .frame(width: proxy.size.width, alignment: .leading)
            }
            .sabqNavigationEdge()
            .sabqScrollProgressTracker { progress in
                scrollProgress.value = progress
                BehaviorTracker.shared.updateScroll(percent: Double(progress))
            }
            .analyticsReadingProgress { progress in
                SabqAnalytics.updateReading(articleId: opinion.id, percent: Int(progress * 100))
            }
            .sabqAutoHideTabBar()
            .overlay(alignment: .top) {
                ReadingProgressOverlay(model: scrollProgress)
            }
        }
        .background(focusBackground)
        .sabqRTL()
        .sabqScreen("OpinionDetail")
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(isPresented: $isHeroLightboxPresented) {
            ImageLightbox(
                url: displayOpinion.imageURL.flatMap(URL.init(string:)),
                placeholderImage: displayOpinion.imageURL
                    .flatMap(URL.init(string:))
                    .flatMap { ImageCache.cachedAny($0) }
            )
        }
        .fullScreenCover(item: Binding(
            get: { inlineLightboxURL.map(IdentifiableURL.init) },
            set: { inlineLightboxURL = $0?.url }
        )) { holder in
            ImageLightbox(
                url: holder.url,
                placeholderImage: ImageCache.cachedAny(holder.url)
            )
        }
        .onAppear {
            SabqAnalytics.opinionView(
                id: opinion.id,
                title: opinion.title,
                authorName: opinion.authorName
            )
            // Unified tracker — opinion reads feed both the home
            // "Reading Journey" card and the weighted trending score.
            BehaviorTracker.shared.startSession(articleId: opinion.id)
            isAnalyticsVisible = true
            SabqAnalytics.beginReading(articleId: opinion.id)
        }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                likeButton

                Button {
                    SabqHaptics.medium()
                    // Pass an Article-shaped bookmark payload so the
                    // bookmarks list can render this opinion offline
                    // — passing `nil` only saves the ID, and the
                    // BookmarksView lookup then has nothing to show.
                    bookmarksStore.toggle(opinion.id, article: displayOpinion.asArticleForBookmark())
                } label: {
                    Image(systemName: bookmarksStore.isBookmarked(opinion.id) ? "bookmark.fill" : "bookmark")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(
                            bookmarksStore.isBookmarked(opinion.id) ? SabqTheme.primary : SabqTheme.textSecondary
                        )

                }
                .accessibilityLabel(bookmarksStore.isBookmarked(opinion.id) ? "إزالة من المحفوظات" : "حفظ المقال")

                Button {
                    SabqHaptics.light()
                    shareOpinion()
                } label: {
                    Image(systemName: "square.and.arrow.up")
                        .font(SabqFonts.app(size: 16, weight: .semibold))
                        .foregroundStyle(SabqTheme.textSecondary)

                }
                .accessibilityLabel("مشاركة")

            }
        }
        .task {
            await loadOpinion()
            await refreshLikeStatus()
        }
        .onDisappear {
            isAnalyticsVisible = false
            copyFeedbackTask?.cancel()
            BehaviorTracker.shared.endSession()
            SabqAnalytics.endReading(articleId: opinion.id)
            // مغادرة المقال توقف ملخصه فقط؛ نهاية المقطع يعالجها المشغّل المشترك.
            SabqAudioPlayer.shared.stopIfCurrent(key: audioKey)
        }
        .onReceive(NotificationCenter.default.publisher(for: SabqAnalytics.collectionDidChange)) { _ in
            guard isAnalyticsVisible, SabqAnalytics.analyticsCollectionEnabled else { return }
            SabqAnalytics.beginReading(articleId: opinion.id)
        }
        .navigationDestination(for: OpinionArticle.self) { opinion in
            OpinionDetailView(opinion: opinion)
                .duoContentInsets()
        }
        .onAppear {
            isOnScreen = true
            publishContext(opinionContext)
        }
        .onDisappear { isOnScreen = false }
        .onChange(of: opinionContext) { _, context in publishContext(context) }
    }

    // MARK: - سياق المقال (عمود Duo)

    private var opinionContext: ArticleContext {
        ArticleContext.opinion(displayOpinion, moreOpinions: recentOpinions)
    }

    private func publishContext(_ context: ArticleContext) {
        guard publishesReaderContext, isOnScreen, displayOpinion.id != displayOpinion.slug,
              FoldableDevice.isFoldable(observed: foldableObserved) else { return }
        navigation?.publishReaderContext(context)
    }

    // MARK: - Loading

    @MainActor
    private func loadOpinion() async {
        if let fetched = await NewsService.fetchOpinionDetail(opinion) {
            fullOpinion = fetched
        }

        let opinions = await NewsService.fetchOpinions()
        recentOpinions = opinions
        moreOpinions = opinions
            .filter { $0.id != displayOpinion.id }
            .prefix(4)
            .map { $0 }
    }

    // MARK: - Like

    private var likeButton: some View {
        let isLiked = likesStore.isLiked(opinion.id)
        return Button {
            SabqHaptics.medium()
            toggleLike()
        } label: {
            Image(systemName: isLiked ? "heart.fill" : "heart")
                .font(SabqFonts.app(size: 16, weight: .semibold))
                .foregroundStyle(isLiked ? SabqTheme.danger : SabqTheme.textSecondary)

        }
        .disabled(isLikeBusy)
        .accessibilityLabel(isLiked ? "إلغاء الإعجاب" : "إعجاب")
    }

    @MainActor
    private func refreshLikeStatus() async {
        await likesStore.reconcile(opinion.id)
        if let serverCount = likesStore.count(for: opinion.id) {
            likesCount = serverCount
        }
    }

    // MARK: - Audio Summary

    /// إسناد المزوّد بعبارة الويب حرفيًا — يظهر عندما يكون المقطع عبر HUMAIN.
    private var summaryAudioAttribution: some View {
        Text("الصوت عبر HUMAIN")
            .font(SabqType.meta.font)
            .foregroundStyle(SabqTheme.success)
            .lineLimit(1)
            .accessibilityLabel("الصوت عبر هيومن")
    }

    /// Compact play/pause pill that drives the summary TTS (HUMAIN, with
    /// ElevenLabs/Google fallback) for the "الموجز الذكي" card. Mirrors
    /// ArticleDetailView's listenButton.
    private var listenButton: some View {
        Button {
            SabqHaptics.light()
            toggleAudio()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isPlayingAudio ? "pause.fill" : "play.fill")
                    .font(SabqType.tag.font)
                Text(isPlayingAudio ? "إيقاف" : "استماع")
                    .font(SabqType.metaEmphasis.font)
            }
            .foregroundStyle(SabqTheme.onAction)
            .padding(.horizontal, SabqLayout.space16)
            .frame(minHeight: 36)
            .background(Capsule(style: .continuous).fill(SabqTheme.actionFill))
            .frame(minHeight: SabqLayout.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func toggleAudio() {
        // Same TTS endpoint as articles — backend's
        // /api/articles/:slug/summary-audio streams ElevenLabs MP3
        // bytes. Opinions live in the same `articles` table, so the
        // slug works for both kinds.
        guard let slug = displayOpinion.slug, !slug.isEmpty,
              let url = URL(string: "\(URLConstants.publicAPI)/articles/\(slug)/summary-audio?tts=tafqit-v2")
        else { return }
        SabqHaptics.medium()
        SabqAudioPlayer.shared.toggle(SabqAudioPlayer.Item(
            key: audioKey,
            url: url,
            title: displayOpinion.title,
            subtitle: displayOpinion.authorName.isEmpty ? "مقال رأي · سبق" : displayOpinion.authorName,
            artworkURL: displayOpinion.imageURL.flatMap { URL(string: $0) },
            delivery: .download
        ))
    }

    private func toggleLike() {
        guard !isLikeBusy else { return }
        isLikeBusy = true
        let articleId = opinion.id
        Task { @MainActor in
            defer { isLikeBusy = false }
            if let result = await likesStore.toggle(articleId) {
                likesCount = result.count
            }
        }
    }

    // MARK: - Hero (clean, no overlay text — matches ArticleDetailView)
    //
    // Natural aspect ratio, no fixed-height crop. See
    // ArticleDetailView.heroImage for the rationale.

    private var heroImage: some View {
        Group {
            if let urlString = displayOpinion.imageURL, let url = URL(string: urlString) {
                CachedAsyncImage(url: url, contentMode: .fit) {
                    heroPlaceholder
                }
            } else {
                heroPlaceholder
                    .environment(\.sabqImageLoadFailed, true)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private var heroPlaceholder: some View {
        Color.clear
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .overlay { SabqImagePlaceholder() }
    }

    // MARK: - Reading Progress Bar — see `ReadingProgressOverlay` at top
    // of ArticleDetailView.swift. The previous inline version drove its
    // own @State CGFloat and was the dominant source of scroll jank in
    // the opinion reader, same as the article reader.

    // MARK: - Labels (opinion marker pill)

    /// Labels row directly under the hero. Contains the "مقال رأي" pill —
    /// the visual differentiator from a news detail. Same FlowLayout footprint
    /// as the article labelsRow so future additions (sentiment, breaking, etc.)
    /// drop in cleanly.
    private var labelsRow: some View {
        FlowLayout(spacing: 14) {
            DetailLabelPill(title: "مقال رأي", tint: SabqTheme.primary, icon: "text.quote")
        }
    }

    // MARK: - Title

    /// عنوان 26 عريض كعنوان الخبر، ويتبع إعداد «حجم الخط» بالقدر نفسه.
    private var opinionTitle: some View {
        SabqRTLText(
            displayOpinion.title,
            uiFont: SabqType.articleTitle.uiFont(adding: CGFloat(fontSize) - SabqType.articleBody.size),
            color: SabqTheme.textPrimary,
            lineLimit: 0,
            lineSpacing: SabqType.articleTitle.lineSpacing,
            textStyle: SabqType.articleTitle.uiTextStyle
        )
    }

    // MARK: - Meta (gendered byline + reading time + date)

    /// سطر الكاتب كما في صفحة الخبر: صورة 40، ثم الاسم وتحته التاريخ ومدة القراءة.
    /// السطر كله رابط صفحة الكاتب.
    private var opinionMeta: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: SabqLayout.space8))
            : AnyLayout(HStackLayout(spacing: SabqLayout.space12))
        return NavigationLink(value: AuthorRoute(name: displayOpinion.authorName)) {
            layout {
                OpinionAuthorAvatar(
                    name: displayOpinion.authorName,
                    imageURL: displayOpinion.authorImageURL,
                    size: 40
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    // علامة RTL في أول النص كي تُرسم النقطتان بعد الكلمة لا قبلها.
                    (Text("\u{200F}\(displayOpinion.bylineLabel): ")
                        .foregroundStyle(SabqTheme.textSecondary)
                     + Text(displayOpinion.authorName)
                        .foregroundStyle(SabqTheme.textPrimary))
                        .font(SabqType.label)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        .truncationMode(.tail)

                    // U+200F: التاريخ قد يبدأ برقم فينقلب ترتيب السطر بلا علامة اتجاه.
                    Text("\u{200F}\(displayOpinion.dateFormatted) · \(displayOpinion.readingTime)")
                        .font(SabqType.meta.font)
                        .foregroundStyle(SabqTheme.textTertiary)
                        .monospacedDigit()
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: SabqLayout.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(displayOpinion.bylineLabel) \(displayOpinion.authorName)، \(displayOpinion.dateFormatted)، \(displayOpinion.readingTime)")
        .accessibilityAddTraits(.isLink)
    }

    // MARK: - Smart Summary Card

    private var smartSummaryText: String {
        let excerpt = displayOpinion.excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
        return (excerpt == displayOpinion.body) ? "" : excerpt
    }

    @ViewBuilder
    private var smartSummaryCard: some View {
        let body = smartSummaryText
        let canListen = !body.isEmpty
            && (displayOpinion.slug?.isEmpty == false)
        if body.isEmpty {
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: SabqLayout.space8) {
                HStack(spacing: SabqLayout.space8) {
                    HStack(spacing: 6) {
                        Image(systemName: "sparkles")
                            .font(SabqType.tag.font)
                        Text("الموجز الذكي")
                            .font(SabqType.label)
                    }
                    .foregroundStyle(SabqTheme.primary)
                    Spacer(minLength: 0)
                    if canListen {
                        if SabqAudioPlayer.shared.provider(for: audioKey) == "humain" {
                            summaryAudioAttribution
                        }
                        listenButton
                    }
                }

                Text(body)
                    .sabqText(SabqType.excerpt)
                    .foregroundStyle(SabqTheme.textSecondary)
                    .multilineTextAlignment(.leading)
                    .lineLimit(isSummaryExpanded ? nil : 3)
                    .fixedSize(horizontal: false, vertical: true)

                if body.count > 120 {
                    Button {
                        withAnimation(.spring(response: 0.42, dampingFraction: 0.86)) {
                            isSummaryExpanded.toggle()
                        }
                        SabqHaptics.light()
                    } label: {
                        HStack(spacing: 4) {
                            Text(isSummaryExpanded ? "طيّ" : "عرض المزيد")
                                .font(SabqType.metaEmphasis.font)
                            Image(systemName: isSummaryExpanded ? "chevron.up" : "chevron.down")
                                .font(SabqType.tag.font)
                        }
                        .foregroundStyle(SabqTheme.primary)
                        .frame(minHeight: SabqLayout.touchTarget)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(SabqLayout.cardInset)
            .frame(maxWidth: .infinity, alignment: .leading)
            .sabqBlockSurface()
        }
    }

    // MARK: - Body

    private var opinionBody: some View {
        Group {
            let body = displayOpinion.body
            if body.isEmpty {
                EmptyStateView(
                    icon: "doc.text.magnifyingglass",
                    tint: SabqTheme.textSecondary,
                    title: "لا يتوفر نص المقال بعد",
                    subtitle: "سنُظهر محتوى المقال الكامل فور وصوله من الخدمة"
                )
            } else {
                let paragraphs = Article.displayParagraphs(for: body)

                VStack(alignment: .leading, spacing: 18) {
                    ForEach(Array(paragraphs.enumerated()), id: \.offset) { index, paragraph in
                        JustifiedText(
                            text: paragraph,
                            fontSize: CGFloat(index == 0 ? fontSize + 1 : fontSize),
                            weight: index == 0 ? .medium : .regular,
                            useSerifReader: useReaderFont,
                            lineSpacing: CGFloat(lineSpacing) + (index == 0 ? 4 : 3),
                            textColor: UIColor(SabqTheme.textPrimary)
                        )
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(.horizontal, 6)
            }
        }
    }

    // MARK: - Action Bar (مشاركة / نسخ / تنسيق / قراءة)

    private var actionBar: some View {
        HStack(spacing: 0) {
            Button {
                SabqHaptics.light()
                shareOpinion()
            } label: {
                actionButton(icon: "square.and.arrow.up", label: "مشاركة")
            }
            .buttonStyle(.plain)

            Divider().frame(height: 28)

            Button {
                SabqHaptics.light()
                copyShareLink()
            } label: {
                actionButton(
                    icon: isCopyFeedbackVisible ? "checkmark.circle.fill" : "link",
                    label: isCopyFeedbackVisible ? "تم النسخ" : "نسخ",
                    isActive: isCopyFeedbackVisible
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
        .padding(.vertical, SabqLayout.space4)
        .sabqBlockSurface()
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
                .font(SabqFonts.app(size: 16, weight: .semibold))
            Text(label)
                .font(SabqType.tag.font)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
        }
        .foregroundStyle(isActive ? SabqTheme.primary : SabqTheme.textSecondary)
        .frame(maxWidth: .infinity, minHeight: SabqLayout.touchTarget)
        .padding(.vertical, SabqLayout.space4)
    }

    // MARK: - Focus background (warmer cream tone in focus mode)

    private var focusBackground: Color {
        isFocusMode
            ? Color(UIColor { t in
                t.userInterfaceStyle == .dark
                    ? UIColor(red: 0.10, green: 0.09, blue: 0.08, alpha: 1)
                    : UIColor(red: 0.98, green: 0.95, blue: 0.91, alpha: 1)
            })
            : SabqTheme.surface
    }

    // MARK: - Tags

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space12) {
            Text("الوسوم")
                .sabqText(SabqType.sectionHeading)
                .foregroundStyle(SabqTheme.textPrimary)

            FlowLayout(spacing: SabqLayout.space8) {
                ForEach(displayTags, id: \.self) { tag in
                    NavigationLink(value: KeywordRoute(keyword: tag)) {
                        Text(tag)
                            .font(SabqType.tag.font)
                            .foregroundStyle(SabqTheme.textPrimary)
                            .padding(.horizontal, SabqLayout.space12)
                            .frame(minHeight: 32)
                            .background(
                                RoundedRectangle(cornerRadius: SabqRadius.small, style: .continuous)
                                    .fill(SabqTheme.surfaceMuted)
                            )
                            .frame(minHeight: SabqLayout.touchTarget)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: - More Opinions

    // الحاوية الموحدة للبلوكات الجانبية كما في الويب (#1610): سطح أزرق فاتح،
    // عنوان واحد، وصفوف بشكل بطاقة الخبر المضغوطة. مقال الرأي بلا صورة يعرض
    // صورة الكاتب داخل الإطار نفسه.
    private var moreOpinionsSection: some View {
        ArticleSidebarModule(
            title: "مقالات أخرى",
            description: "مقالات رأي قد ترغب بقراءتها بعد هذا المقال",
            icon: "text.quote"
        ) {
            ForEach(Array(moreOpinions.enumerated()), id: \.element.id) { index, opinion in
                if index > 0 { SidebarRowDivider() }
                NavigationLink(value: opinion) {
                    SidebarArticleRow(
                        title: opinion.title,
                        imageURL: opinion.imageURL.flatMap { $0.isEmpty ? nil : $0 } ?? opinion.authorImageURL,
                        byline: opinion.authorName,
                        bylineAvatarURL: opinion.authorImageURL,
                        date: opinion.relativeDate,
                        placeholderIcon: "text.quote",
                        placeholderTint: SabqTheme.textTertiary
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Share / Copy

    private var fallbackShareURL: URL {
        if let urlString = displayOpinion.articleURL, let url = URL(string: urlString) {
            return url
        }
        return URL(string: URLConstants.webOrigin)!
    }

    private func shareOpinion() {
        let url = fallbackShareURL
        SabqAnalytics.shareIntent(articleId: opinion.id)
        let id = opinion.id
        SabqShareHelper.presentShareSheet(with: url) { completed in
            if completed { SabqAnalytics.shareCompleted(articleId: id, stage: "ios_completion") }
        }
    }

    private func copyShareLink() {
        let url = fallbackShareURL
        UIPasteboard.general.string = url.absoluteString
        showCopyFeedback()
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
}
