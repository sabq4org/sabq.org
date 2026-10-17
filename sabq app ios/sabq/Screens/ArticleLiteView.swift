import SwiftUI

/// Stripped-down article reader for "سبق Lite" — Phase 2 of #81.
///
/// Renders ONLY the essentials:
///   - Title + meta line (category + date)
///   - Hero image (single load, no carousel)
///   - Article body text
///   - Share button + back chevron in the toolbar
///
/// NOT rendered (vs. `ArticleDetailView`):
///   - Related articles, comments, author follow, social reactions
///   - "Read also" / inline carousels, weekly photos grid
///   - Behavior tracking (no `BehaviorTracker.startSession`)
///   - AI insights / sentiment pill
///   - Audio summary, font controls, reader settings sheet
///
/// `SabqAnalytics.articleView` STILL fires once the canonical id lands —
/// editorial metrics shouldn't drop just because the reader chose a
/// lighter UI.
struct ArticleLiteView: View {
    let article: Article

    @Environment(BookmarksStore.self) private var bookmarksStore

    @State private var fullArticle: Article?
    @State private var isLoading = false
    @State private var isAnalyticsVisible = false

    /// Same fall-back pattern as `ArticleDetailView`: prefer the
    /// freshly-fetched detail (canonical id, full body) and fall back
    /// to the placeholder/list-row Article while we wait.
    private var displayArticle: Article { fullArticle ?? article }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: SabqLayout.space16) {
                titleBlock
                heroImage
                bodyText
                    .analyticsReadingBody()
            }
            .padding(.horizontal, SabqLayout.pageMargin)
            .padding(.top, SabqLayout.space12)
            .padding(.bottom, SabqLayout.space40)
            .frame(maxWidth: SabqLayout.readingWidth + SabqLayout.pageMargin * 2, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(SabqTheme.background.ignoresSafeArea())
        .analyticsReadingProgress { progress in
            SabqAnalytics.updateReading(articleId: displayArticle.id, percent: Int(progress * 100))
        }
        .sabqScreen("ArticleDetail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { liteToolbar }
        .task(id: displayArticle.id) {
            // Skip the placeholder phase so we don't ship the slug
            // to anything that expects a canonical id (mirrors the
            // ArticleDetailView guard added in #72).
            guard displayArticle.id != displayArticle.slug else { return }
            isAnalyticsVisible = true
            SabqAnalytics.articleView(
                id: displayArticle.id,
                title: displayArticle.title,
                category: displayArticle.categoryTitle
            )
            SabqAnalytics.beginReading(articleId: displayArticle.id)
        }
        .task {
            // Hydrate the body content. Lite mode doesn't pull related
            // / audio / AI insights — just the article bundle.
            if let slug = article.slug, fullArticle == nil {
                isLoading = true
                let bundle = await NewsService.fetchArticleDetail(slug: slug)
                if let bundle { fullArticle = bundle.article }
                isLoading = false
            }
        }
        .onDisappear {
            isAnalyticsVisible = false
            SabqAnalytics.endReading(articleId: displayArticle.id)
        }
        .onReceive(NotificationCenter.default.publisher(for: SabqAnalytics.collectionDidChange)) { _ in
            guard isAnalyticsVisible, SabqAnalytics.analyticsCollectionEnabled else { return }
            SabqAnalytics.beginReading(articleId: displayArticle.id)
        }
    }

    // MARK: - Sub-views

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: SabqLayout.space8) {
            // شارة التصنيف حُذفت من سبق لايت كما في الويب (#1614) — يبقى الوقت.
            HStack(spacing: 8) {
                Text(SabqFormatters.relativeArabic.localizedString(for: displayArticle.publishDate, relativeTo: Date()))
                    .font(SabqType.meta.font)
                    .foregroundStyle(SabqTheme.textTertiary)
            }
            SabqRTLText(
                displayArticle.title,
                uiFont: SabqType.articleTitle.uiFont,
                color: SabqTheme.textPrimary,
                lineLimit: 0,
                lineSpacing: SabqType.articleTitle.lineSpacing,
                textStyle: SabqType.articleTitle.uiTextStyle
            )
        }
    }

    @ViewBuilder
    private var heroImage: some View {
        if let urlString = displayArticle.imageURL, let url = URL(string: urlString) {
            // Single fetch, no carousel — Lite stays light. Re-uses
            // the existing FocalCachedAsyncImage so cached bytes from
            // the home list aren't refetched.
            FocalCachedAsyncImage(url: url, focalPoint: displayArticle.imageFocalPoint) {
                SabqImagePlaceholder()
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: SabqRadius.medium, style: .continuous))
        }
    }

    @ViewBuilder
    private var bodyText: some View {
        if isLoading && fullArticle == nil {
            HStack {
                Spacer()
                ProgressView().tint(SabqTheme.primary)
                Spacer()
            }
            .padding(.vertical, SabqLayout.space32)
        } else {
            Text(displayArticle.body.isEmpty ? displayArticle.excerpt : displayArticle.body)
                .sabqText(SabqType.articleBody)
                .foregroundStyle(SabqTheme.textPrimary)
                .multilineTextAlignment(.leading)
        }
    }

    @ToolbarContentBuilder
    private var liteToolbar: some ToolbarContent {

        ToolbarItemGroup(placement: .topBarTrailing) {
            Button {
                SabqHaptics.medium()
                bookmarksStore.toggle(displayArticle.id, article: displayArticle)
            } label: {
                Image(systemName: bookmarksStore.isBookmarked(displayArticle.id) ? "bookmark.fill" : "bookmark")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(
                        bookmarksStore.isBookmarked(displayArticle.id)
                            ? SabqTheme.primary
                            : SabqTheme.textSecondary
                    )

            }
            .accessibilityLabel(bookmarksStore.isBookmarked(displayArticle.id) ? "إزالة من المحفوظات" : "حفظ الخبر")
            Button {
                SabqHaptics.light()
                share()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(SabqFonts.app(size: 16, weight: .semibold))
                    .foregroundStyle(SabqTheme.textSecondary)

            }
            .accessibilityLabel("مشاركة")

        }
    }

    // MARK: - Share

    private func share() {
        guard let urlString = displayArticle.articleURL ?? displayArticle.slug.map({ "https://sabq.org/article/\($0)" }),
              let url = URL(string: urlString) else { return }
        SabqAnalytics.shareIntent(articleId: displayArticle.id)
        let articleId = displayArticle.id
        // الموضع الوحيد الذي كان يقدّم UIActivityViewController مباشرة بلا
        // مرساة popover؛ على iPad/Duo مفتوحًا ذلك انهيار. المساعد يوحّد
        // المرساة والتقديم فوق أعلى متحكم معروض.
        SabqShareHelper.presentShareSheet(with: url, title: displayArticle.title) { completed in
            if completed { SabqAnalytics.shareCompleted(articleId: articleId, stage: "ios_lite_completion") }
        }
    }
}
