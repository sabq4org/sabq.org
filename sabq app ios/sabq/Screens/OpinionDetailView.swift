import SwiftUI
import AVFoundation

struct OpinionDetailView: View {
    let opinion: OpinionArticle
    @Environment(\.dismiss) private var dismiss
    @Environment(BookmarksStore.self) private var bookmarksStore

    @State private var fullOpinion: OpinionArticle?
    @State private var moreOpinions: [OpinionArticle] = []
    @State private var isSummaryExpanded = false
    @State private var isCopyFeedbackVisible = false
    @State private var copyFeedbackTask: Task<Void, Never>?
    @State private var scrollProgress: CGFloat = 0
    @State private var showReaderControls = false
    @State private var isFocusMode = false
    /// Drives the hero `ImageLightbox` fullScreenCover when the reader
    /// taps the cover photo. Inline body images on opinion pages are
    /// rare today but if they ever land in opinion bodies they'll wire
    /// through the same `inlineLightboxURL` binding.
    @State private var isHeroLightboxPresented = false
    @State private var inlineLightboxURL: URL?
    @State private var isLiked: Bool = false
    @State private var likesCount: Int = 0
    @State private var isLikeBusy: Bool = false
    @State private var audioPlayer: AVPlayer?
    @State private var isPlayingAudio = false

    @AppStorage("articleFontSize") private var fontSize: Double = 17
    @AppStorage("articleLineSpacing") private var lineSpacing: Double = 6
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
                    // zoom/parallax) so the editor-picked focal point
                    // remains honoured.
                    heroImage
                        .frame(width: proxy.size.width, height: 300)
                        .clipped()
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

                    VStack(alignment: .leading, spacing: 18) {
                        if !isFocusMode {
                            labelsRow
                        }

                        opinionTitle
                        opinionMeta

                        if !isFocusMode {
                            smartSummaryCard
                        }

                        Divider().foregroundStyle(SabqTheme.outline.opacity(0.6))
                        opinionBody

                        // Mirrors ArticleDetailView's spacing pass —
                        // the lower share / keywords / more-opinions
                        // sections used to inherit the parent VStack's
                        // 18 pt spacing and felt squashed together.
                        // Explicit top-padding gives each its own
                        // breathing room.
                        actionBar
                            .padding(.top, 16)

                        if !isFocusMode, !displayTags.isEmpty {
                            tagsSection
                                .padding(.top, 20)
                        }

                        if !isFocusMode, !moreOpinions.isEmpty {
                            moreOpinionsSection
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
            .sabqScrollProgressTracker { progress in
                scrollProgress = progress
                BehaviorTracker.shared.updateScroll(percent: Double(progress))
            }
            .sabqAutoHideTabBar()
            .overlay(alignment: .top) {
                readingProgressBar
            }
        }
        .background(focusBackground)
        .sabqRTL()
        .sabqScreen("OpinionDetail")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .fullScreenCover(isPresented: $isHeroLightboxPresented) {
            ImageLightbox(
                url: displayOpinion.imageURL.flatMap(URL.init(string:)),
                placeholderImage: displayOpinion.imageURL
                    .flatMap(URL.init(string:))
                    .flatMap { ImageCache.shared.object(forKey: $0 as NSURL) }
            )
        }
        .fullScreenCover(item: Binding(
            get: { inlineLightboxURL.map(IdentifiableURL.init) },
            set: { inlineLightboxURL = $0?.url }
        )) { holder in
            ImageLightbox(
                url: holder.url,
                placeholderImage: ImageCache.shared.object(forKey: holder.url as NSURL)
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
        }
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    SabqHaptics.light()
                    dismiss()
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(SabqTheme.ink)
                        .padding(8)
                        .background(Circle().fill(.ultraThinMaterial))
                }
            }
            ToolbarItem(placement: .primaryAction) {
                HStack(spacing: 8) {
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
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(
                                bookmarksStore.isBookmarked(opinion.id) ? SabqTheme.primaryEnd : SabqTheme.secondaryInk
                            )
                            .padding(8)
                            .background(Circle().fill(.ultraThinMaterial))
                    }
                    .buttonStyle(.plain)

                    Button {
                        SabqHaptics.light()
                        shareOpinion()
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(SabqTheme.secondaryInk)
                            .padding(8)
                            .background(Circle().fill(.ultraThinMaterial))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .task {
            await loadOpinion()
            await refreshLikeStatus()
        }
        .onDisappear {
            copyFeedbackTask?.cancel()
            BehaviorTracker.shared.endSession()
            audioPlayer?.pause()
            audioPlayer = nil
            isPlayingAudio = false
        }
        .navigationDestination(for: OpinionArticle.self) { opinion in
            OpinionDetailView(opinion: opinion)
        }
    }

    // MARK: - Loading

    @MainActor
    private func loadOpinion() async {
        if let fetched = await NewsService.fetchOpinionDetail(opinion) {
            fullOpinion = fetched
        }

        let opinions = await NewsService.fetchOpinions()
        moreOpinions = opinions
            .filter { $0.id != displayOpinion.id }
            .prefix(4)
            .map { $0 }
    }

    // MARK: - Like

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
            let status = try await BehaviorTracker.shared.fetchLikeStatus(articleId: opinion.id)
            isLiked = status.liked
            likesCount = status.count
        } catch {
            // Silent — defaults to unliked.
        }
    }

    // MARK: - Audio Summary

    /// Compact play/pause pill that drives ElevenLabs TTS for the
    /// "الموجز الذكي" card. Mirrors ArticleDetailView's listenButton.
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

    private func toggleAudio() {
        if isPlayingAudio {
            audioPlayer?.pause()
            isPlayingAudio = false
            SabqAudioSession.deactivate()
            return
        }
        // Same TTS endpoint as articles — backend's
        // /api/articles/:slug/summary-audio streams ElevenLabs MP3
        // bytes. Opinions live in the same `articles` table, so the
        // slug works for both kinds.
        guard let slug = displayOpinion.slug, !slug.isEmpty,
              let url = URL(string: "\(URLConstants.publicAPI)/articles/\(slug)/summary-audio")
        else { return }
        SabqHaptics.medium()
        SabqAudioSession.activate()
        audioPlayer = AVPlayer(url: url)
        audioPlayer?.play()
        isPlayingAudio = true
    }

    private func toggleLike() {
        guard !isLikeBusy else { return }
        isLikeBusy = true
        let articleId = opinion.id
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
                isLiked.toggle()
                likesCount += isLiked ? 1 : -1
                if likesCount < 0 { likesCount = 0 }
            }
        }
    }

    // MARK: - Hero (clean, no overlay text — matches ArticleDetailView)

    private var heroImage: some View {
        Group {
            if let urlString = displayOpinion.imageURL, let url = URL(string: urlString) {
                FocalCachedAsyncImage(url: url, focalPoint: displayOpinion.imageFocalPoint) {
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
    }

    private var heroPlaceholder: some View {
        LinearGradient(
            colors: [SabqTheme.primaryEnd.opacity(0.20), SabqTheme.primaryStart.opacity(0.05)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .frame(maxWidth: .infinity)
        .frame(height: 300)
        .overlay {
            Image(systemName: "text.quote")
                .font(.system(size: 100, weight: .ultraLight))
                .foregroundStyle(SabqTheme.primaryEnd.opacity(0.18))
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

    // MARK: - Labels (opinion marker pill)

    /// Labels row directly under the hero. Contains the "مقال رأي" pill —
    /// the visual differentiator from a news detail. Same FlowLayout footprint
    /// as the article labelsRow so future additions (sentiment, breaking, etc.)
    /// drop in cleanly.
    private var labelsRow: some View {
        FlowLayout(spacing: 8) {
            HStack(spacing: 5) {
                Image(systemName: "text.quote")
                    .font(.system(size: 11, weight: .heavy))
                Text("مقال رأي")
                    .font(.system(size: 11, weight: .heavy, design: .rounded))
                    .tracking(0.5)
            }
            .foregroundStyle(SabqTheme.primaryEnd)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                Capsule(style: .continuous).fill(SabqTheme.primaryEnd.opacity(0.10))
            )
            .overlay(
                Capsule(style: .continuous).stroke(SabqTheme.primaryEnd.opacity(0.25), lineWidth: 0.5)
            )
        }
    }

    // MARK: - Title

    private var opinionTitle: some View {
        Text(displayOpinion.title)
            .font(SabqFonts.headline(size: CGFloat(fontSize + 8)))
            .foregroundStyle(SabqTheme.ink)
            .multilineTextAlignment(.leading)
            .lineSpacing(3)
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
    }

    // MARK: - Meta (gendered byline + reading time + date)

    private var opinionMeta: some View {
        HStack(spacing: 8) {
            NavigationLink(value: AuthorRoute(name: displayOpinion.authorName)) {
                // Split into icon + label + name as three separate views so
                // the RTL HStack orders them correctly (icon first on the
                // RIGHT, then "بقلم:", then the name). Stuffing the whole
                // byline into one Text confuses the bidi engine at the
                // colon boundary and flips the order visually.
                HStack(spacing: 5) {
                    Image(systemName: "applepencil")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text("\(displayOpinion.bylineLabel):")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                    Text(displayOpinion.authorName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(SabqTheme.primaryEnd)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .buttonStyle(.plain)
            .layoutPriority(2)

            Text("·")
                .font(.system(size: 11))
                .foregroundStyle(SabqTheme.tertiaryInk.opacity(0.6))

            Text(displayOpinion.readingTime)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .monospacedDigit()
                .lineLimit(1)
                .layoutPriority(1)

            Text("·")
                .font(.system(size: 11))
                .foregroundStyle(SabqTheme.tertiaryInk.opacity(0.6))

            Text(displayOpinion.dateFormatted)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(SabqTheme.tertiaryInk)
                .lineLimit(1)
                .minimumScaleFactor(0.85)
                .layoutPriority(3)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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

                Text(body)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(SabqTheme.secondaryInk)
                    .multilineTextAlignment(.leading)
                    .lineSpacing(4)
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
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: isSummaryExpanded ? "chevron.up" : "chevron.down")
                                .font(.system(size: 10, weight: .bold))
                        }
                        .foregroundStyle(SabqTheme.primaryEnd)
                    }
                    .buttonStyle(.plain)
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

    // MARK: - Body

    private var opinionBody: some View {
        Group {
            let body = displayOpinion.body
            if body.isEmpty {
                EmptyStateView(
                    icon: "doc.text.magnifyingglass",
                    tint: SabqTheme.secondaryInk,
                    title: "لا يتوفر نص المقال بعد",
                    subtitle: "سنُظهر محتوى المقال الكامل فور وصوله من الخدمة"
                )
            } else {
                let paragraphs = Article.displayParagraphs(for: body)

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

    // MARK: - More Opinions

    private var moreOpinionsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            Divider().foregroundStyle(SabqTheme.outline)

            SectionHeader(
                title: "مقالات أخرى",
                subtitle: "مقالات رأي قد ترغب بقراءتها بعد هذا المقال",
                icon: "text.quote",
                tint: SabqTheme.primaryEnd
            )

            ForEach(moreOpinions) { opinion in
                NavigationLink(value: opinion) {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(opinion.title)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(SabqTheme.ink)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)

                            HStack(spacing: 5) {
                                Image(systemName: "applepencil")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                Text("\(opinion.bylineLabel):")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                Text(opinion.authorName)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(SabqTheme.secondaryInk)
                                    .lineLimit(1)
                            }

                            Text(opinion.relativeDate)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(SabqTheme.tertiaryInk)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        OpinionAuthorAvatar(
                            name: opinion.authorName,
                            imageURL: opinion.authorImageURL,
                            size: 48
                        )
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)

                if opinion.id != moreOpinions.last?.id {
                    Divider().foregroundStyle(SabqTheme.outline.opacity(0.5))
                }
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
        SabqShareHelper.presentShareSheet(with: url)
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
